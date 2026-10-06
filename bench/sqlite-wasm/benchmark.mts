import BetterSqlite from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { cpus, loadavg, release, totalmem, type } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  chromium,
  firefox,
  type JSHandle,
  type Page,
  webkit,
} from "playwright";
import { createViteServer } from "vitest/node";
import {
  array,
  getOrThrow,
  type InferType,
  JsonValue,
  Number,
  object,
  record,
  String,
} from "@evolu/common";
import { parseBenchmarkMode } from "../index.mts";
import {
  type BenchIo,
  BenchOpenResult,
  BenchRunResult,
  type BenchRequest,
  type BenchResponse,
  type BenchStackOptions,
} from "./worker.mts";
import {
  contentChecksumSql,
  preamble,
  recordedPragmas,
  workloads,
  workloadsPath,
} from "./workload.mts";

/**
 * A stack the benchmark measures. Its worker module, in `stacks/`, creates it
 * with `serveBenchStack`; the options tell the module which variant to open.
 */
interface StackDefinition {
  /** The key of the stack's results and baselines. */
  readonly id: string;
  /** The column header of the stack in the tables. */
  readonly label: string;
  /** The worker module, relative to this directory. */
  readonly worker: string;
  readonly options: BenchStackOptions;
  /**
   * SQL each database runs after opening, before the preamble and untimed, or
   * an empty string.
   */
  readonly connectionSql: string;
  /** Whether the database file must be ciphertext. */
  readonly encrypted: boolean;
  /** The SQLite build the stack runs. */
  readonly build: StackBuild;
  /**
   * Bumped when the stack's worker module changes what the stack measures, so
   * its baselines stop matching.
   */
  readonly revision: number;
}

interface StackBuild {
  readonly name: string;
  /** A hash, commit or version that identifies the build. */
  readonly version: string;
}

// To add a stack, write its worker module or give one new options, and add the
// stack here.
const createStackDefinitions = ({
  evolu,
  waSqlite,
  sqliteWasm224,
}: {
  evolu: StackBuild;
  waSqlite: StackBuild;
  sqliteWasm224: StackBuild;
}): ReadonlyArray<StackDefinition> => [
  {
    id: "evolu",
    label: "Evolu",
    worker: "stacks/evolu.worker.mts",
    options: { database: "Pool" },
    connectionSql: "",
    encrypted: false,
    build: evolu,
    revision: 1,
  },
  {
    id: "evoluSecureDelete",
    label: "Evolu, secure_delete",
    worker: "stacks/evolu.worker.mts",
    options: { database: "Pool" },
    connectionSql: "PRAGMA secure_delete=ON;",
    encrypted: false,
    build: evolu,
    revision: 1,
  },
  {
    id: "evoluEncryptedWasm",
    label: "Evolu, encrypted, wasm",
    worker: "stacks/evolu.worker.mts",
    options: { database: "EncryptedPool", cipher: "wasm" },
    connectionSql: "",
    encrypted: true,
    build: evolu,
    revision: 1,
  },
  {
    id: "evoluEncryptedNoble",
    label: "Evolu, encrypted, noble",
    worker: "stacks/evolu.worker.mts",
    options: { database: "EncryptedPool", cipher: "noble" },
    connectionSql: "",
    encrypted: true,
    build: evolu,
    revision: 1,
  },
  {
    id: "waSqliteAccessHandlePool",
    label: "wa-sqlite AHP",
    worker: "stacks/wa-sqlite.worker.mts",
    options: { vfs: "AccessHandlePoolVFS" },
    connectionSql: "",
    encrypted: false,
    build: waSqlite,
    revision: 1,
  },
  {
    id: "waSqliteCoopSync",
    label: "wa-sqlite CoopSync",
    worker: "stacks/wa-sqlite.worker.mts",
    options: { vfs: "OPFSCoopSyncVFS" },
    connectionSql: "",
    encrypted: false,
    build: waSqlite,
    revision: 1,
  },
  {
    id: "sqliteWasm224",
    label: "2.2.4",
    worker: "stacks/sqlite-wasm-2.2.4.worker.mts",
    options: { database: "Plain" },
    connectionSql: "",
    encrypted: false,
    build: sqliteWasm224,
    revision: 1,
  },
  {
    id: "sqliteWasm224Sqlite3mc",
    label: "2.2.4, SQLite3MC",
    worker: "stacks/sqlite-wasm-2.2.4.worker.mts",
    options: { database: "Encrypted" },
    connectionSql: "",
    encrypted: true,
    build: sqliteWasm224,
    revision: 1,
  },
];

/** The stack the relative table divides by. */
const referenceStackId = "evolu";

const engines = ["chromium", "firefox", "webkit"] as const;
type Engine = (typeof engines)[number];
const browserTypesByEngine = { chromium, firefox, webkit } as const;
const engineLabels = {
  chromium: "Chromium",
  firefox: "Firefox",
  webkit: "WebKit",
} satisfies Record<Engine, string>;

const warmupRunCount = 1;
const measuredRunCount = 5;
// A median regresses when it is both this much slower and this many
// milliseconds slower than its baseline. On a machine in use, medians of runs
// minutes apart differed by up to 25% for totals and 40% for single workloads.
const maxRegressionPercent = 30;
const minRegressionMs = 5;
// Ciphertext has about 1/256 zero bytes. A plaintext file after these
// workloads has several percent, and with secure_delete almost only zeros.
const maxEncryptedZeroByteShare = 0.01;
// The wa-sqlite commit the benchmark runs the workloads, build and VFSes of.
const waSqliteCommit = "7a4b4241ba7c61ee19121aacd6c93892234ce1a1";
// Next to the ports of the browser tests' Vitest servers.
const serverPort = 63321;
const origin = `http://127.0.0.1:${serverPort}`;
const runTimeoutMs = 10 * 60 * 1000;

const { tokens: argumentTokens, values: argumentValues } = parseArgs({
  args: process.argv.slice(2),
  options: {
    engine: { multiple: true, type: "string" },
    mode: { type: "string" },
    "wa-sqlite": { type: "string" },
  },
  strict: true,
  tokens: true,
});
const benchmarkMode = parseBenchmarkMode({
  args: argumentTokens
    .filter((token) => token.kind === "option" && token.name === "mode")
    .map((token) => `--mode=${token.value}`),
  benchmarkName: "SQLite Wasm",
});
const updateBaseline = benchmarkMode !== "default";
const engineFilters = argumentValues.engine ?? [];
const selectedEngines = engines.filter(
  (engine) => engineFilters.length === 0 || engineFilters.includes(engine),
);
for (const filter of engineFilters)
  if (!engines.some((engine) => engine === filter))
    throw new Error(`Unknown engine: ${filter}`);
if (engineFilters.length > 0 && updateBaseline)
  throw new Error("A filtered SQLite Wasm benchmark cannot update baselines.");

const waSqliteArgument = argumentValues["wa-sqlite"];
if (waSqliteArgument == null)
  throw new Error(
    `The SQLite Wasm benchmark needs a wa-sqlite clone at ${waSqliteCommit}: --wa-sqlite=<directory>. See bench/sqlite-wasm/README.md.`,
  );
const waSqliteDirectory = resolve(waSqliteArgument);
const waSqliteHead = execFileSync(
  "git",
  ["-C", waSqliteDirectory, "rev-parse", "HEAD"],
  { encoding: "utf8" },
).trim();
if (waSqliteHead !== waSqliteCommit)
  throw new Error(
    `The wa-sqlite clone is at ${waSqliteHead}, not ${waSqliteCommit}.`,
  );
const waSqliteUrl = `/@fs${waSqliteDirectory}/`;

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const resultsDirectoryUrl = new URL("./results/", import.meta.url);
const baselinesUrl = new URL("./baselines.json", import.meta.url);
const evoluWasmUrl = new URL(
  "../../packages/sqlite-wasm/wasm/sqlite3.wasm",
  import.meta.url,
);

const sha256 = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

const PackageJson = record(String, JsonValue);
const readPackageVersion = async (name: string): Promise<string> => {
  const packageJson = getOrThrow(
    PackageJson.fromUnknown(
      JSON.parse(
        await readFile(
          new URL(import.meta.resolve(`${name}/package.json`)),
          "utf8",
        ),
      ),
    ),
  );
  return getOrThrow(String.fromUnknown(packageJson.version));
};

const workloadSql = await Promise.all(
  workloads.map((workload) =>
    readFile(join(waSqliteDirectory, workloadsPath, workload.file), "utf8"),
  ),
);
const evoluWasm = await readFile(evoluWasmUrl).catch((error: unknown) => {
  throw new Error(
    "Get packages/sqlite-wasm/wasm/sqlite3.wasm first: download it with pnpm sqlite-wasm:download in the repository root, or build it from source as packages/sqlite-wasm/README.md#the-webassembly describes.",
    { cause: error },
  );
});

const stackDefinitions = createStackDefinitions({
  evolu: { name: "Evolu sqlite3.wasm", version: sha256(evoluWasm) },
  waSqlite: { name: "wa-sqlite", version: waSqliteCommit },
  sqliteWasm224: {
    name: "@evolu/sqlite-wasm",
    version: await readPackageVersion("@evolu/sqlite-wasm-2.2.4"),
  },
});

/**
 * What every stack must produce, from the same workload run by better-sqlite3
 * in memory: `total_changes()` after each workload, and the tables' checksum
 * before the last one drops them.
 */
const reference = (() => {
  const database = new BetterSqlite(":memory:");
  try {
    database.exec(preamble);
    const totalChanges: Array<number> = [];
    let contentChecksum = "";
    for (const [index, sql] of workloadSql.entries()) {
      if (index === workloadSql.length - 1)
        contentChecksum = globalThis.String(
          database.prepare(contentChecksumSql).pluck().get(),
        );
      database.exec(sql);
      totalChanges.push(
        globalThis.Number(
          database.prepare("SELECT total_changes()").pluck().get(),
        ),
      );
    }
    return { totalChanges, contentChecksum };
  } finally {
    database.close();
  }
})();

const machine = {
  platform: process.platform,
  arch: process.arch,
  cpu: cpus()[0]?.model ?? "unknown",
  cpuCount: cpus().length,
  memoryGiB: Math.round(totalmem() / 2 ** 30),
  os:
    process.platform === "darwin"
      ? `macOS ${execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim()}`
      : `${type()} ${release()}`,
  nodeVersion: process.versions.node,
  playwrightVersion: await readPackageVersion("playwright"),
};

const configuration = {
  warmupRunCount,
  measuredRunCount,
  preamble,
  workloadSha256: sha256(
    [preamble, ...workloadSql].join("\n-- evolu-bench-workload --\n"),
  ),
  waSqliteCommit,
};

/** Durations of the runs of a stack, in milliseconds. */
interface DurationStats {
  readonly medianMs: number;
  readonly minMs: number;
  readonly maxMs: number;
}

/** A stack's results in one engine. */
type StackResult = MeasuredStackResult | FailedStackResult;

interface MeasuredStackResult {
  readonly type: "Measured";
  readonly id: string;
  readonly label: string;
  readonly sqliteVersion: string;
  readonly compileOptions: ReadonlyArray<string>;
  readonly pragmas: BenchRunResult["pragmas"];
  readonly warmupDurationsMs: ReadonlyArray<ReadonlyArray<number>>;
  /** The durations of each measured run, by workload. */
  readonly runDurationsMs: ReadonlyArray<ReadonlyArray<number>>;
  /** What each workload of each measured run asked of OPFS. */
  readonly runIo: ReadonlyArray<ReadonlyArray<BenchIo>>;
  readonly workloadStats: ReadonlyArray<DurationStats>;
  readonly totalStats: DurationStats;
  /** Totals of workloads 2 to 16, as workload 1 dominates the total. */
  readonly totalWithoutFirstStats: DurationStats;
}

interface FailedStackResult {
  readonly type: "Failed";
  readonly id: string;
  readonly label: string;
  readonly error: string;
}

interface EngineResult {
  readonly engine: Engine;
  readonly browserVersion: string;
  readonly userAgent: string;
  /** The coarsest `performance.now()` step the stacks' workers observed. */
  readonly timerResolutionMs: number;
  /**
   * The machine's 1, 5 and 15 minute load averages before and after the engine
   * ran, because other load slows every stack.
   */
  readonly loadAverages: {
    readonly start: ReadonlyArray<number>;
    readonly end: ReadonlyArray<number>;
  };
  readonly stacks: ReadonlyArray<StackResult>;
}

/**
 * Serves the stacks' worker modules with Vite, runs every selected engine one
 * after another, writes the results and compares them with the baselines.
 */
const main = async (): Promise<void> => {
  const server = await createViteServer({
    configFile: false,
    root: repositoryDirectory,
    cacheDir: `${repositoryDirectory}node_modules/.vite/bench-sqlite-wasm`,
    appType: "custom",
    clearScreen: false,
    logLevel: "warn",
    // Target ES2025 so Vite lowers ES2026 `using` for WebKit.
    oxc: { target: "es2025" },
    optimizeDeps: {
      entries: [
        ...new Set(
          stackDefinitions.map((stack) => `bench/sqlite-wasm/${stack.worker}`),
        ),
      ],
      // Its JavaScript finds sqlite3.wasm next to itself.
      exclude: ["@evolu/sqlite-wasm-2.2.4"],
    },
    server: {
      host: "127.0.0.1",
      port: serverPort,
      strictPort: true,
      hmr: false,
      ws: false,
      watch: null,
      fs: { allow: [repositoryDirectory, waSqliteDirectory] },
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
            response.end("<!doctype html><title>SQLite Wasm benchmark</title>");
          });
        },
      },
    ],
  });

  const engineResults: Array<EngineResult> = [];
  try {
    await server.listen();
    for (const engine of selectedEngines)
      engineResults.push(await runEngine(engine));
  } finally {
    await server.close();
  }

  const results = {
    machine,
    configuration,
    stacks: stackDefinitions,
    workloads,
    reference,
    engines: engineResults,
  };
  await mkdir(resultsDirectoryUrl, { recursive: true });
  await writeFile(
    new URL("results.json", resultsDirectoryUrl),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  await writeFile(
    new URL("results.md", resultsDirectoryUrl),
    formatMarkdown(engineResults),
  );
  process.stderr.write(
    `\nWrote ${fileURLToPath(new URL("results.json", resultsDirectoryUrl))} and results.md.\n`,
  );

  await compareWithBaselines(engineResults);
};

/**
 * Runs every stack in one engine, in a persistent context of its own, and
 * closes the browser.
 */
const runEngine = async (engine: Engine): Promise<EngineResult> => {
  const log = (message: string) => {
    process.stderr.write(`[${engine}] ${message}\n`);
  };

  // A failed step records the stack's error and ends its worker, so the other
  // stacks go on.
  const step = async (
    session: StackSession,
    fn: () => Promise<void>,
  ): Promise<void> => {
    if (session.error != null) return;
    try {
      await fn();
    } catch (error) {
      session.error =
        error instanceof Error ? error.message : globalThis.String(error);
      log(`${session.stack.id} failed: ${session.error}`);
      await session.worker.evaluate((worker) => {
        worker.terminate();
      });
    }
  };

  const startLoadAverages = loadavg();
  const browserType = browserTypesByEngine[engine];
  // A persistent context has no Browser to ask for its version.
  const versionBrowser = await browserType.launch({ headless: true });
  const browserVersion = versionBrowser.version();
  await versionBrowser.close();

  const userDataDirectory = `${repositoryDirectory}node_modules/.cache/bench-sqlite-wasm-${engine}`;
  await rm(userDataDirectory, { force: true, recursive: true });
  // WebKit's OPFS sync access handles fail in Playwright's ephemeral context.
  const context = await browserType.launchPersistentContext(userDataDirectory, {
    headless: true,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${origin}/`);
    // On macOS, Playwright's WebKit keeps OPFS outside the profile.
    await removeOpfsEntries(page);

    log(`${browserVersion}, ${stackDefinitions.length} stacks`);

    const sessions = await Promise.all(
      stackDefinitions.map(async (stack): Promise<StackSession> => {
        // A page of its own, because with the workers of every stack on one
        // page, ten at the time, WebKit 26.6 ran the CPU-bound workloads of the
        // two stacks opened last, whichever they were, 20% to 50% slower.
        const stackPage = await context.newPage();
        await stackPage.goto(`${origin}/`);
        const worker = await stackPage.evaluateHandle(
          (url) => new Worker(url, { type: "module" }),
          `/bench/sqlite-wasm/${stack.worker}`,
        );
        return {
          stack,
          worker,
          openResult: null,
          warmups: [],
          runs: [],
          error: null,
        };
      }),
    );

    // Opened one after another, as wasm compiles faster alone.
    for (const session of sessions) {
      await step(session, async () => {
        const openResult = getOrThrow(
          BenchOpenResult.fromUnknown(
            await request(session.worker, {
              type: "Open",
              stack: {
                directory: `bench-${session.stack.id}`,
                options: session.stack.options,
                waSqliteUrl,
              },
              connectionSql: session.stack.connectionSql,
            }),
          ),
        );
        if (!openResult.crossOriginIsolated)
          throw new Error("The worker is not cross-origin isolated.");
        session.openResult = openResult;
      });
    }

    for (let index = 0; index < warmupRunCount; index++)
      for (const session of sessions) {
        await step(session, async () => {
          const result = await runOnce(session, `warmup-${index + 1}.db`, true);
          session.warmups.push(result);
          if (result.contentChecksum !== reference.contentChecksum)
            throw new Error(
              `The tables' checksum is ${result.contentChecksum}, not ${reference.contentChecksum}.`,
            );
          log(`${session.stack.id} warm-up: ${formatTotal(result)}`);
        });
      }

    for (let index = 0; index < measuredRunCount; index++) {
      // Rotated, so no stack always runs right after the same one.
      const rotation = index % sessions.length;
      for (const session of [
        ...sessions.slice(rotation),
        ...sessions.slice(0, rotation),
      ])
        await step(session, async () => {
          const result = await runOnce(session, `run-${index + 1}.db`, false);
          session.runs.push(result);
          log(
            `${session.stack.id} run ${index + 1}/${measuredRunCount}: ${formatTotal(result)}`,
          );
        });
    }

    for (const session of sessions) {
      await step(session, async () => {
        await request(session.worker, { type: "Dispose" });
      });
      await session.worker.evaluate((worker) => {
        worker.terminate();
      });
    }
    await removeOpfsEntries(page);

    const timerResolutions = sessions.flatMap((session) =>
      session.openResult == null ? [] : [session.openResult.timerResolutionMs],
    );
    return {
      engine,
      browserVersion,
      userAgent:
        sessions.find((session) => session.openResult != null)?.openResult
          ?.userAgent ?? "unknown",
      timerResolutionMs: Math.max(0, ...timerResolutions),
      loadAverages: { start: startLoadAverages, end: loadavg() },
      stacks: sessions.map((session) => toStackResult(session)),
    };
  } finally {
    await context.close();
  }
};

/** A stack's worker and what it returned so far in one engine. */
interface StackSession {
  readonly stack: StackDefinition;
  readonly worker: JSHandle<Worker>;
  openResult: BenchOpenResult | null;
  readonly warmups: Array<BenchRunResult>;
  readonly runs: Array<BenchRunResult>;
  error: string | null;
}

/** Runs the workload once on a fresh database and checks what it did. */
const runOnce = async (
  session: StackSession,
  name: string,
  verifyContent: boolean,
): Promise<BenchRunResult> => {
  const result = getOrThrow(
    BenchRunResult.fromUnknown(
      await request(session.worker, { type: "Run", name, verifyContent }),
    ),
  );
  if (result.durationsMs.length !== workloads.length)
    throw new Error(`The run timed ${result.durationsMs.length} workloads.`);
  if (
    result.totalChanges.some(
      (changes, index) => changes !== reference.totalChanges[index],
    )
  )
    throw new Error(
      `total_changes() after each workload is ${result.totalChanges.join(", ")}, not ${reference.totalChanges.join(", ")}.`,
    );
  if (result.schemaObjectsAfter !== 0)
    throw new Error(
      `The last workload left ${result.schemaObjectsAfter} schema objects.`,
    );

  const { file } = result;
  if (file?.byteLength === 0) throw new Error("The database file is empty.");
  if (session.stack.encrypted) {
    if (file == null)
      throw new Error("The encrypted stack cannot read its file.");
    if (file.sqliteHeaderOffsets.length > 0)
      throw new Error(
        `The encrypted file has SQLite's header at ${file.sqliteHeaderOffsets.join(", ")}.`,
      );
    if (file.zeroByteShare >= maxEncryptedZeroByteShare)
      throw new Error(
        `${(file.zeroByteShare * 100).toFixed(2)}% of the encrypted file's bytes are zeros.`,
      );
    if (file.containsPlaintextMarker)
      throw new Error("The encrypted file contains the workloads' text.");
  } else if (file != null && file.sqliteHeaderOffsets[0] !== 0)
    throw new Error("The plaintext file does not start with SQLite's header.");

  const first = session.warmups[0] ?? result;
  if (JSON.stringify(result.pragmas) !== JSON.stringify(first.pragmas))
    throw new Error("The pragmas differ between runs.");
  return result;
};

/**
 * Sends a request to a stack's worker and returns its value, or throws its
 * error, or the error the worker failed to load with.
 */
const request = async (
  worker: JSHandle<Worker>,
  benchRequest: BenchRequest,
): Promise<unknown> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const response = await Promise.race([
    worker.evaluate(
      (worker, benchRequest) =>
        new Promise<BenchResponse>((resolve) => {
          const controller = new AbortController();
          worker.addEventListener(
            "message",
            (event: MessageEvent<BenchResponse>) => {
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
          worker.postMessage(benchRequest);
        }),
      benchRequest,
    ),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`${benchRequest.type} timed out.`));
      }, runTimeoutMs);
    }),
  ]).finally(() => {
    clearTimeout(timeout);
  });
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

const toStackResult = (session: StackSession): StackResult => {
  const { id, label } = session.stack;
  const [firstRun] = session.runs;
  if (session.error != null || firstRun == null)
    return {
      type: "Failed",
      id,
      label,
      error: session.error ?? "No measured run.",
    };
  const runDurationsMs = session.runs.map((run) =>
    run.durationsMs.map(roundMs),
  );
  return {
    type: "Measured",
    id,
    label,
    sqliteVersion: firstRun.sqliteVersion,
    compileOptions: firstRun.compileOptions,
    pragmas: firstRun.pragmas,
    warmupDurationsMs: session.warmups.map((run) =>
      run.durationsMs.map(roundMs),
    ),
    runDurationsMs,
    runIo: session.runs.map((run) => run.io),
    workloadStats: workloads.map((_, index) =>
      toDurationStats(
        session.runs.map(
          (run) => run.durationsMs[index] ?? globalThis.Number.NaN,
        ),
      ),
    ),
    totalStats: toDurationStats(
      session.runs.map((run) => sumDurations(run.durationsMs)),
    ),
    totalWithoutFirstStats: toDurationStats(
      session.runs.map((run) => sumDurations(run.durationsMs.slice(1))),
    ),
  };
};

const sumDurations = (durationsMs: ReadonlyArray<number>): number =>
  durationsMs.reduce((sum, duration) => sum + duration, 0);

const median = (values: ReadonlyArray<number>): number => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? globalThis.Number.NaN)
    : ((sorted[middle - 1] ?? globalThis.Number.NaN) +
        (sorted[middle] ?? globalThis.Number.NaN)) /
        2;
};

const toDurationStats = (values: ReadonlyArray<number>): DurationStats => ({
  medianMs: roundMs(median(values)),
  minMs: roundMs(Math.min(...values)),
  maxMs: roundMs(Math.max(...values)),
});

const roundMs = (ms: number): number => Math.round(ms * 1000) / 1000;

const formatMs = (ms: number): string => ms.toFixed(1);

const formatTotal = (run: BenchRunResult): string =>
  `${formatMs(sumDurations(run.durationsMs))} ms`;

const formatStats = ({ medianMs, minMs, maxMs }: DurationStats): string =>
  `${formatMs(medianMs)} (${formatMs(minMs)}–${formatMs(maxMs)})`;

const formatLoadAverages = (loadAverages: ReadonlyArray<number>): string =>
  loadAverages.map((load) => load.toFixed(1)).join(", ");

const formatMarkdown = (engineResults: ReadonlyArray<EngineResult>): string => {
  const findStack = (result: EngineResult, id: string) => {
    const stack = result.stacks.find((candidate) => candidate.id === id);
    return stack?.type === "Measured" ? stack : null;
  };
  const engineHeader = (suffixes: ReadonlyArray<string>) => [
    `| Stack | ${engineResults
      .flatMap((result) =>
        suffixes.map((suffix) => `${engineLabels[result.engine]}${suffix}`),
      )
      .join(" | ")} |`,
    `| --- | ${engineResults
      .flatMap(() => suffixes.map(() => "---:"))
      .join(" | ")} |`,
  ];
  const stackRows = (
    cell: (stack: MeasuredStackResult, result: EngineResult) => string,
  ) =>
    stackDefinitions.map(
      (definition) =>
        `| ${definition.label} | ${engineResults
          .map((result) => {
            const stack = findStack(result, definition.id);
            return stack == null ? "failed" : cell(stack, result);
          })
          .join(" | ")} |`,
    );

  // The median over runs of a stack's total divided by the reference stack's
  // total in the same round, which cancels most load that slows both.
  const formatRelative = (
    stack: MeasuredStackResult,
    result: EngineResult,
    firstWorkload: number,
  ): string => {
    const referenceStack = findStack(result, referenceStackId);
    if (referenceStack == null) return "";
    const ratios = stack.runDurationsMs.map(
      (durationsMs, index) =>
        sumDurations(durationsMs.slice(firstWorkload)) /
        sumDurations(
          referenceStack.runDurationsMs[index]?.slice(firstWorkload) ?? [],
        ),
    );
    return median(ratios).toFixed(2);
  };
  const referenceLabel =
    stackDefinitions.find((stack) => stack.id === referenceStackId)?.label ??
    referenceStackId;

  const lines: Array<string> = [
    "# SQLite Wasm benchmark",
    "",
    `${machine.cpu}, ${machine.cpuCount} cores, ${machine.memoryGiB} GiB; ${machine.os}; Node.js ${machine.nodeVersion}; Playwright ${machine.playwrightVersion}.`,
    "",
    `Milliseconds: the median of ${measuredRunCount} runs after ${warmupRunCount} warm-up run, and the fastest and slowest run in parentheses. Every run is wa-sqlite's 16 workloads in order on a fresh database, after the preamble \`${preamble}\`.`,
    "",
    "## Totals",
    "",
    ...engineHeader([""]),
    ...stackRows((stack) => formatStats(stack.totalStats)),
    "",
    `## Workload 1: ${workloads[0]?.title ?? ""}`,
    "",
    "Each INSERT commits on its own, after the CREATE TABLE, so this workload mostly measures the flushes of 1001 commits, whose number differs between the VFSes and whose cost differs between the engines.",
    "",
    ...engineHeader([""]),
    ...stackRows((stack) =>
      stack.workloadStats[0] == null ? "" : formatStats(stack.workloadStats[0]),
    ),
    "",
    "## Totals without workload 1",
    "",
    ...engineHeader([""]),
    ...stackRows((stack) => formatStats(stack.totalWithoutFirstStats)),
    "",
    `## Relative to ${referenceLabel}`,
    "",
    `The median over runs of a stack's total divided by the total of ${referenceLabel} in the same round, with all workloads and without workload 1. Comparing within a run cancels most of the load that slows both.`,
    "",
    ...engineHeader(["", " without 1"]),
    ...stackDefinitions.map(
      (definition) =>
        `| ${definition.label} | ${engineResults
          .flatMap((result) => {
            const stack = findStack(result, definition.id);
            return stack == null
              ? ["failed", "failed"]
              : [
                  formatRelative(stack, result, 0),
                  formatRelative(stack, result, 1),
                ];
          })
          .join(" | ")} |`,
    ),
  ];

  for (const result of engineResults) {
    lines.push(
      "",
      `## ${engineLabels[result.engine]} ${result.browserVersion}`,
      "",
      `\`performance.now()\` steps by ${formatResolution(result.timerResolutionMs)}. The load averages were ${formatLoadAverages(result.loadAverages.start)} before and ${formatLoadAverages(result.loadAverages.end)} after.`,
      "",
      `| Workload | ${result.stacks.map((stack) => stack.label).join(" | ")} |`,
      `| --- | ${result.stacks.map(() => "---:").join(" | ")} |`,
      ...workloads.map(
        (workload, index) =>
          `| ${index + 1}. ${workload.title} | ${result.stacks
            .map((stack) => {
              const stats =
                stack.type === "Measured"
                  ? stack.workloadStats[index]
                  : undefined;
              return stats == null ? "failed" : formatStats(stats);
            })
            .join(" | ")} |`,
      ),
      `| Total | ${result.stacks
        .map((stack) =>
          stack.type === "Measured" ? formatStats(stack.totalStats) : "failed",
        )
        .join(" | ")} |`,
    );
    for (const stack of result.stacks)
      if (stack.type === "Failed")
        lines.push("", `${stack.label} failed: ${stack.error.split("\n")[0]}`);
  }

  const measured = engineResults.flatMap((result) =>
    result.stacks.flatMap((stack) =>
      stack.type === "Measured" ? [stack] : [],
    ),
  );
  const measuredDefinitions = stackDefinitions.filter((definition) =>
    measured.some((stack) => stack.id === definition.id),
  );

  // Flushes and bytes are deterministic, so a range shows that they were not.
  const formatRange = (
    values: ReadonlyArray<number>,
    format: (value: number) => string = globalThis.String,
  ) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? format(min) : `${format(min)}–${format(max)}`;
  };
  const formatMiB = (bytes: number) => (bytes / 2 ** 20).toFixed(1);
  lines.push(
    "",
    "## OPFS writes",
    "",
    "Flushes and MiB written per workload: what each stack's VFS asked of `FileSystemSyncAccessHandle` during the workload, in every measured run in every engine. A range means runs differed.",
    "",
    `| Workload | ${measuredDefinitions.map((definition) => definition.label).join(" | ")} |`,
    `| --- | ${measuredDefinitions.map(() => "---:").join(" | ")} |`,
    ...workloads.map((workload, index) => {
      const cells = measuredDefinitions.map((definition) => {
        const io = measured
          .filter((stack) => stack.id === definition.id)
          .flatMap((stack) => stack.runIo.map((runIo) => runIo[index]))
          .filter((workloadIo) => workloadIo != null);
        return `${formatRange(io.map((workloadIo) => workloadIo.flushes))}, ${formatRange(
          io.map((workloadIo) => workloadIo.writtenBytes),
          formatMiB,
        )}`;
      });
      return `| ${index + 1}. ${workload.title} | ${cells.join(" | ")} |`;
    }),
  );

  lines.push(
    "",
    "## Pragmas",
    "",
    "Each stack's settings after the preamble, the same in every engine unless noted. A `temp_store` of 0 means the build's `TEMP_STORE`, under build differences.",
    "",
    `| Stack | SQLite | ${recordedPragmas.join(" | ")} |`,
    `| --- | --- | ${recordedPragmas.map(() => "---").join(" | ")} |`,
  );
  for (const definition of measuredDefinitions) {
    const results = measured.filter((result) => result.id === definition.id);
    const [first] = results;
    if (first == null) continue;
    const differs = results.some(
      (result) =>
        JSON.stringify(result.pragmas) !== JSON.stringify(first.pragmas),
    );
    lines.push(
      `| ${definition.label}${differs ? " (differs by engine)" : ""} | ${first.sqliteVersion} | ${recordedPragmas
        .map((pragma) => formatPragma(pragma, first.pragmas[pragma]))
        .join(" | ")} |`,
    );
  }

  // The compile options that differ between the builds, from any stack of each.
  const builds = Map.groupBy(
    measuredDefinitions,
    (definition) => definition.build.name,
  );
  const compileOptionsByBuild = new Map(
    [...builds].map(([name, definitions]) => {
      const stack = measured.find((result) =>
        definitions.some((definition) => definition.id === result.id),
      );
      return [
        name,
        new Map(
          (stack?.compileOptions ?? []).map((option) => {
            const separator = option.indexOf("=");
            return separator === -1
              ? [option, "set"]
              : [option.slice(0, separator), option.slice(separator + 1)];
          }),
        ),
      ] as const;
    }),
  );
  const optionNames = [
    ...new Set(
      [...compileOptionsByBuild.values()].flatMap((options) => [
        ...options.keys(),
      ]),
    ),
  ].toSorted();
  const differingOptionNames = optionNames.filter(
    (name) =>
      new Set(
        [...compileOptionsByBuild.values()].map((options) => options.get(name)),
      ).size > 1,
  );
  lines.push(
    "",
    "## Build differences",
    "",
    "The `PRAGMA compile_options` that differ between the builds; an empty cell is an option the build does not report.",
    "",
    `| Option | ${[...builds]
      .map(
        ([name, definitions]) =>
          `${name} (${definitions.map((definition) => definition.label).join("; ")})`,
      )
      .join(" | ")} |`,
    `| --- | ${[...builds].map(() => "---").join(" | ")} |`,
    ...differingOptionNames.map(
      (name) =>
        `| ${name} | ${[...compileOptionsByBuild.values()]
          .map((options) => options.get(name)?.replaceAll("|", "\\|") ?? "")
          .join(" | ")} |`,
    ),
  );
  return `${lines.join("\n")}\n`;
};

const formatResolution = (ms: number): string =>
  ms < 0.1 ? `${(ms * 1000).toPrecision(2)} µs` : `${ms.toPrecision(2)} ms`;

const formatPragma = (pragma: string, value: string | undefined): string => {
  if (value == null) return "";
  const names =
    pragma === "synchronous"
      ? ["OFF", "NORMAL", "FULL", "EXTRA"]
      : pragma === "temp_store"
        ? ["DEFAULT", "FILE", "MEMORY"]
        : pragma === "auto_vacuum"
          ? ["NONE", "FULL", "INCREMENTAL"]
          : pragma === "secure_delete"
            ? ["OFF", "ON", "FAST"]
            : null;
  const name = names?.[globalThis.Number(value)];
  return name == null ? value : `${value} (${name})`;
};

const BenchmarkEnvironment = object({
  platform: String,
  arch: String,
  cpu: String,
  engine: String,
  browserVersion: String,
  warmupRunCount: Number,
  measuredRunCount: Number,
  workloadSha256: String,
});
interface BenchmarkEnvironment extends InferType<typeof BenchmarkEnvironment> {}

/**
 * What a stack's baseline was measured with, besides the environment: its build
 * and definition. Another stack's change does not affect it.
 */
const StackKey = object({
  worker: String,
  options: record(String, String),
  connectionSql: String,
  build: object({ name: String, version: String }),
  revision: Number,
});
interface StackKey extends InferType<typeof StackKey> {}

const StackBaseline = object({
  key: StackKey,
  workloadsMs: array(Number),
  totalMs: Number,
});
interface StackBaseline extends InferType<typeof StackBaseline> {}

const BenchmarkBaseline = object({
  environment: BenchmarkEnvironment,
  stacks: record(String, StackBaseline),
});
interface BenchmarkBaseline extends InferType<typeof BenchmarkBaseline> {}

const BenchmarkBaselines = object({ baselines: array(BenchmarkBaseline) });
interface BenchmarkBaselines extends InferType<typeof BenchmarkBaselines> {}

const toStackKey = (stack: StackDefinition): StackKey => ({
  worker: stack.worker,
  options: stack.options,
  connectionSql: stack.connectionSql,
  build: { name: stack.build.name, version: stack.build.version },
  revision: stack.revision,
});

/**
 * Compares each stack's medians with its baseline in the engine's entry, and
 * updates the baselines in an update mode.
 */
const compareWithBaselines = async (
  engineResults: ReadonlyArray<EngineResult>,
): Promise<void> => {
  const failed = engineResults.flatMap((result) =>
    result.stacks.flatMap((stack) =>
      stack.type === "Failed" ? [`${result.engine} ${stack.id}`] : [],
    ),
  );
  if (failed.length > 0) throw new Error(`Stacks failed: ${failed.join(", ")}`);

  const baselines = getOrThrow(
    BenchmarkBaselines.fromUnknown(
      JSON.parse(await readFile(baselinesUrl, "utf8")),
    ),
  );
  const nextBaselines = [...baselines.baselines];
  const regressions: Array<string> = [];
  const missing: Array<string> = [];

  for (const result of engineResults) {
    const environment: BenchmarkEnvironment = {
      platform: machine.platform,
      arch: machine.arch,
      cpu: machine.cpu,
      engine: result.engine,
      browserVersion: result.browserVersion,
      warmupRunCount,
      measuredRunCount,
      workloadSha256: configuration.workloadSha256,
    };
    const baselineIndex = nextBaselines.findIndex(
      (baseline) =>
        JSON.stringify(baseline.environment) === JSON.stringify(environment),
    );
    const baseline = nextBaselines[baselineIndex];
    const stackBaselines: Record<string, StackBaseline> = {};

    for (const stack of result.stacks) {
      if (stack.type !== "Measured") continue;
      const definition = stackDefinitions.find(({ id }) => id === stack.id);
      if (definition == null) continue;
      const stackBaseline: StackBaseline = {
        key: toStackKey(definition),
        workloadsMs: stack.workloadStats.map((stats) => stats.medianMs),
        totalMs: stack.totalStats.medianMs,
      };
      stackBaselines[stack.id] = stackBaseline;
      const previous = baseline?.stacks[stack.id];
      if (
        previous == null ||
        JSON.stringify(previous.key) !== JSON.stringify(stackBaseline.key)
      ) {
        missing.push(`${result.engine} ${stack.id}`);
        continue;
      }
      const compared = [
        ...stackBaseline.workloadsMs.map((medianMs, index) => ({
          name: `workload ${index + 1}`,
          medianMs,
          baselineMs: previous.workloadsMs[index],
        })),
        {
          name: "total",
          medianMs: stackBaseline.totalMs,
          baselineMs: previous.totalMs,
        },
      ];
      for (const { name, medianMs, baselineMs } of compared) {
        if (baselineMs == null) continue;
        if (
          medianMs > baselineMs * (1 + maxRegressionPercent / 100) &&
          medianMs - baselineMs > minRegressionMs
        )
          regressions.push(
            `${result.engine} ${stack.id} ${name}: ${formatMs(medianMs)} ms, baseline ${formatMs(baselineMs)} ms`,
          );
      }
    }

    const nextBaseline: BenchmarkBaseline = {
      environment,
      stacks: getOrThrow(
        record(String, StackBaseline).fromUnknown(stackBaselines),
      ),
    };
    if (baselineIndex === -1) nextBaselines.push(nextBaseline);
    else nextBaselines[baselineIndex] = nextBaseline;
  }

  if (regressions.length > 0) {
    const message = `SQLite Wasm medians regressed more than ${maxRegressionPercent}% and ${minRegressionMs} ms: ${regressions.join("; ")}`;
    if (benchmarkMode !== "force-update-baseline") throw new Error(message);
    process.stderr.write(`\nForcing the baseline update: ${message}\n`);
  }

  if (updateBaseline) {
    await writeFile(
      baselinesUrl,
      `${JSON.stringify({ baselines: nextBaselines } satisfies BenchmarkBaselines, null, 2)}\n`,
    );
    process.stderr.write("\nUpdated the SQLite Wasm baselines.\n");
    return;
  }
  if (missing.length > 0)
    throw new Error(
      `No SQLite Wasm baseline matches ${missing.join(", ")}. Review the results and run with --mode=update-baseline.`,
    );
  process.stderr.write(
    `\nSQLite Wasm benchmark passed (maximum regression ${maxRegressionPercent}% and ${minRegressionMs} ms).\n`,
  );
};

await main();
