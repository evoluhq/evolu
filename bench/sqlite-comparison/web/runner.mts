/**
 * Runs the web targets: one engine after another, Chromium, Firefox and WebKit,
 * each in a fresh persistent context, which WebKit needs for OPFS sync access
 * handles, with every stack in a module worker started by a page of its own, in
 * a directory of its own on the engine's real OPFS. Vite serves the workers,
 * cross-origin isolated, so `performance.now()` steps by microseconds.
 *
 * @module
 */
import { mkdtemp, rm } from "node:fs/promises";
import { loadavg, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chromium,
  firefox,
  type JSHandle,
  type Page,
  webkit,
} from "playwright";
import { createViteServer } from "vitest/node";
import { TargetResult } from "../results.mts";
import {
  createStackRecorder,
  runRounds,
  type StackInfo,
  type StackRecorder,
  type StackSession,
} from "../rounds.mts";
import {
  describeMachine,
  type LoadedWorkloads,
  type Rounds,
} from "../setup.mts";
import type {
  WebOpenResult,
  WebRequest,
  WebResponse,
  WebStackOptions,
} from "./worker.mts";

export const webEngines = ["chromium", "firefox", "webkit"] as const;
export type WebEngine = (typeof webEngines)[number];

const browserTypesByEngine = { chromium, firefox, webkit } as const;
const engineLabels: Readonly<Record<WebEngine, string>> = {
  chromium: "Chromium",
  firefox: "Firefox",
  webkit: "WebKit",
};

interface WebStackDefinition extends StackInfo {
  /** The worker module, relative to this directory. */
  readonly worker: string;
  readonly options: WebStackOptions;
}

const readVersion = async (specifier: string): Promise<string> => {
  const { default: packageJson } = (await import(specifier, {
    with: { type: "json" },
  })) as { readonly default: { readonly version: string } };
  return packageJson.version;
};

const createWebStackDefinitions = async (
  waSqliteCommit: string,
): Promise<ReadonlyArray<WebStackDefinition>> => [
  {
    id: "evolu",
    label: "Evolu",
    library: "Evolu's SQLite (packages/sqlite-wasm)",
    binding: "Evolu's wasm layer, Evolu's pool",
    encrypted: false,
    worker: "stacks/evolu.worker.mts",
    options: { database: "Pool" },
  },
  {
    id: "evoluEncrypted",
    label: "Evolu, encrypted",
    library: "Evolu's SQLite (packages/sqlite-wasm)",
    binding: "Evolu's wasm layer, Evolu's pool and codec",
    encrypted: true,
    worker: "stacks/evolu.worker.mts",
    options: { database: "EncryptedPool" },
  },
  {
    id: "sqliteOrg",
    label: "@sqlite.org/sqlite-wasm",
    library: `@sqlite.org/sqlite-wasm ${await readVersion("@sqlite.org/sqlite-wasm/package.json")}`,
    binding: "oo1 API, opfs-sahpool",
    encrypted: false,
    worker: "stacks/sqlite-org.worker.mts",
    options: {},
  },
  {
    id: "waSqlite",
    label: "wa-sqlite",
    library: `wa-sqlite ${waSqliteCommit.slice(0, 9)}`,
    binding: "asynchronous API, AccessHandlePoolVFS",
    encrypted: false,
    worker: "stacks/wa-sqlite.worker.mts",
    options: {},
  },
];

// Next to bench/sqlite-wasm's server and the browser tests' Vitest servers.
const serverPort = 63322;
const origin = `http://127.0.0.1:${serverPort}`;
const runTimeoutMs = 10 * 60 * 1000;
const repositoryDirectory = fileURLToPath(
  new URL("../../../", import.meta.url),
);

/**
 * Runs the engines one after another and passes each engine's target to
 * `onTarget` as soon as the engine finishes.
 */
export const runWebTargets = async ({
  engines,
  workloads,
  rounds,
  waSqliteCommit,
  onTarget,
  log,
}: {
  engines: ReadonlyArray<WebEngine>;
  workloads: LoadedWorkloads;
  rounds: Rounds;
  waSqliteCommit: string;
  onTarget: (target: TargetResult) => void;
  log: (message: string) => void;
}): Promise<void> => {
  const definitions = await createWebStackDefinitions(waSqliteCommit);
  const cacheDirectory = await mkdtemp(
    join(tmpdir(), "evolu-sqlite-comparison-vite-"),
  );
  const server = await createViteServer({
    configFile: false,
    root: repositoryDirectory,
    cacheDir: cacheDirectory,
    appType: "custom",
    clearScreen: false,
    logLevel: "warn",
    // Target ES2025 so Vite lowers ES2026 `using` for WebKit.
    oxc: { target: "es2025" },
    optimizeDeps: {
      entries: [
        ...new Set(
          definitions.map(
            (definition) => `bench/sqlite-comparison/web/${definition.worker}`,
          ),
        ),
      ],
      // Its JavaScript finds sqlite3.wasm next to itself.
      exclude: ["@sqlite.org/sqlite-wasm"],
    },
    server: {
      host: "127.0.0.1",
      port: serverPort,
      strictPort: true,
      hmr: false,
      ws: false,
      watch: null,
      fs: { allow: [repositoryDirectory, workloads.directory] },
    },
    plugins: [
      {
        name: "evolu-bench-page",
        configureServer: (viteServer) => {
          viteServer.middlewares.use((request, response, next) => {
            // Cross-origin isolation makes performance.now() step by
            // microseconds rather than 0.1 or 1 ms.
            response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
            response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
            response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
            if (request.url !== "/") {
              next();
              return;
            }
            // A blank page on the origin, which starts a stack's worker.
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end("<!doctype html><title>SQLite comparison</title>");
          });
        },
      },
    ],
  });

  try {
    await server.listen();
    for (const engine of engines)
      onTarget(
        await runEngine({
          engine,
          definitions,
          workloads,
          rounds,
          log: (message) => {
            log(`[${engine}] ${message}`);
          },
        }),
      );
  } finally {
    await server.close();
    await rm(cacheDirectory, { force: true, recursive: true });
  }
};

const runEngine = async ({
  engine,
  definitions,
  workloads,
  rounds,
  log,
}: {
  engine: WebEngine;
  definitions: ReadonlyArray<WebStackDefinition>;
  workloads: LoadedWorkloads;
  rounds: Rounds;
  log: (message: string) => void;
}): Promise<TargetResult> => {
  const createdAt = new Date().toISOString();
  const browserType = browserTypesByEngine[engine];
  // A persistent context has no Browser to ask for its version.
  const versionBrowser = await browserType.launch({ headless: true });
  const browserVersion = versionBrowser.version();
  await versionBrowser.close();

  const userDataDirectory = await mkdtemp(
    join(tmpdir(), `evolu-sqlite-comparison-${engine}-`),
  );
  try {
    // WebKit's OPFS sync access handles fail in Playwright's ephemeral context.
    const context = await browserType.launchPersistentContext(
      userDataDirectory,
      { headless: true },
    );
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(`${origin}/`);
      // On macOS, Playwright's WebKit keeps OPFS outside the profile.
      await removeOpfsEntries(page);
      log(`${browserVersion}, ${definitions.length} stacks`);

      const waSqliteUrl = `/@fs${workloads.directory}/`;
      const stacks: Array<{
        readonly worker: WebWorker;
        readonly recorder: StackRecorder;
      }> = [];
      let openResult: WebOpenResult | null = null;
      let timerResolutionMs = 0;
      // Opened one after another, as wasm compiles faster alone.
      for (const definition of definitions) {
        const recorder = createStackRecorder(definition, workloads.reference);
        // A page of its own, because with the workers of every stack on one
        // page, WebKit 26.6 ran the CPU-bound workloads of the stacks opened
        // last 20% to 50% slower, whichever they were.
        const stackPage = await context.newPage();
        await stackPage.goto(`${origin}/`);
        const worker: WebWorker = {
          page: stackPage,
          handle: await stackPage.evaluateHandle(
            (url) => new Worker(url, { type: "module" }),
            `/bench/sqlite-comparison/web/${definition.worker}`,
          ),
        };
        stacks.push({ worker, recorder });
        try {
          const result = (await request(worker, {
            type: "Open",
            stack: {
              directory: `bench-${definition.id}`,
              options: definition.options,
              waSqliteUrl,
            },
            encrypted: definition.encrypted,
          })) as WebOpenResult;
          if (!result.crossOriginIsolated)
            throw new Error("The worker is not cross-origin isolated.");
          openResult ??= result;
          timerResolutionMs = Math.max(
            timerResolutionMs,
            result.timerResolutionMs,
          );
        } catch (error) {
          recorder.fail(error);
          log(`${definition.id} failed to open: ${String(error)}`);
        }
      }
      const sessions = stacks.map(({ worker, recorder }): StackSession => ({
        recorder,
        run: ({ name, verifyContent }) =>
          request(worker, { type: "Run", name, verifyContent }),
      }));

      const loadAveragesStart = loadavg();
      await runRounds({ sessions, ...rounds, log });
      const loadAveragesEnd = loadavg();

      for (const { worker, recorder } of stacks) {
        // A failed stack's worker may never answer, so it's only terminated.
        if (!recorder.hasFailed())
          await request(worker, { type: "Dispose" }).catch(() => undefined);
        // Closing its page terminates the worker.
        await worker.page.close();
      }
      await removeOpfsEntries(page);

      return TargetResult.orThrow({
        id: `web-${engine}`,
        label: `${engineLabels[engine]} ${browserVersion}, ${describeMachine().OS}`,
        createdAt,
        environment: {
          ...describeMachine(),
          Browser: `${engineLabels[engine]} ${browserVersion}`,
          "User agent": openResult?.userAgent ?? "unknown",
          "performance.now() step": `${(timerResolutionMs * 1000).toPrecision(2)} µs`,
          Playwright: await readVersion("playwright/package.json"),
        },
        loadAverages: { start: loadAveragesStart, end: loadAveragesEnd },
        notes: [],
        evoluStackId: "evolu",
        evoluEncryptedStackId: "evoluEncrypted",
        referenceStackId: "sqliteOrg",
        stacks: sessions.map((session) => session.recorder.toResult()),
      });
    } finally {
      await context.close();
    }
  } finally {
    await rm(userDataDirectory, { force: true, recursive: true });
  }
};

/** A stack's worker and the page that started it. */
interface WebWorker {
  readonly page: Page;
  readonly handle: JSHandle<Worker>;
}

/**
 * Sends a request to a stack's worker and returns its value, or throws its
 * error, or the error the worker failed to load with. When the request times
 * out, it closes the worker's page, which terminates the worker, so a run that
 * hangs doesn't keep running beside the next stack's.
 */
const request = async (
  { page, handle }: WebWorker,
  webRequest: WebRequest,
): Promise<unknown> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const response = await Promise.race([
    handle.evaluate(
      (worker, webRequest) =>
        new Promise<WebResponse>((resolve) => {
          const controller = new AbortController();
          worker.addEventListener(
            "message",
            (event: MessageEvent<WebResponse>) => {
              controller.abort();
              resolve(event.data);
            },
            { signal: controller.signal },
          );
          // A worker module that fails to load reports only an ErrorEvent.
          worker.addEventListener(
            "error",
            (event: Event) => {
              controller.abort();
              resolve({
                ok: false,
                error: `The worker failed: ${event instanceof ErrorEvent ? event.message : event.type}`,
              });
            },
            { signal: controller.signal },
          );
          worker.postMessage(webRequest);
        }),
      webRequest,
    ),
    new Promise<null>((resolve) => {
      timeout = setTimeout(() => {
        resolve(null);
      }, runTimeoutMs);
    }),
  ]).finally(() => {
    clearTimeout(timeout);
  });
  if (response == null) {
    await page.close();
    throw new Error(`${webRequest.type} timed out.`);
  }
  if (!response.ok) throw new Error(response.error);
  return response.value;
};

/**
 * Removes everything in the origin's OPFS, which only the benchmark uses,
 * retrying while a terminated worker still holds a file.
 */
const removeOpfsEntries = (page: Page): Promise<void> =>
  page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for (let attempt = 1; ; attempt++) {
      try {
        const names = await Array.fromAsync(root.keys());
        for (const name of names)
          await root.removeEntry(name, { recursive: true });
        return;
      } catch (error) {
        if (attempt === 100) throw error;
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
      }
    }
  });
