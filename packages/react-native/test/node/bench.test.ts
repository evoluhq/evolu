/**
 * The benchmark route's runner on the N-API mirror of the binding, with both
 * specs mocked, since Node.js can't load React Native. Its lines go through the
 * summarizer, so the runner logs what `scripts/device-bench.mts` reads.
 */
// Declares React Native's ErrorUtils global as src/Task.ts reads it, before
// React Native's own types, which the specs bring, declare it as a const.
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers -- Includes global declarations during type-checking without emitting a runtime import.
import type {} from "../../src/ErrorUtils.d.ts";

import {
  acquireLeaderLock,
  assert,
  assertEqual,
  assertFalse,
  assertTrue,
  createConsole,
  createRandomBytes,
  createRun,
  createStore,
  createUnknownError,
  id,
  NonEmptyTrimmedString100,
  ok,
  type CreateSqliteDriver,
  type NativeSqlite,
  type SqliteDriver,
  WebSocketUrl,
} from "@evolu/common";
import {
  AppName,
  createAppOwner,
  createEvolu,
  createOwnerSecret,
  createQueryBuilder,
  type EvoluDeps,
  type EvoluError,
} from "@evolu/common/local-first";
import { installPolyfills } from "@evolu/common/polyfills";
import { setupAddon } from "@evolu/sqlite-core/test/setup-addon.mts";
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

installPolyfills();

const root = mkdtempSync(join(tmpdir(), "evolu-react-native-bench-"));
after(() => {
  rmSync(root, { recursive: true, force: true });
});
const binding = (await setupAddon()).createBinding() as NativeSqlite;

/** The directory the mocked EvoluApp gives, which each test sets. */
let directory = root;

mock.module(
  new URL("../../src/specs/NativeEvoluSqlite.ts", import.meta.url).href,
  { exports: { default: { createBinding: () => binding } } },
);
mock.module(
  new URL("../../src/specs/NativeEvoluApp.ts", import.meta.url).href,
  {
    exports: {
      default: {
        getDatabaseDirectory: () => directory,
        reloadApp: () => undefined,
      },
    },
  },
);

const { createEvoluDeps: createMainEvoluDeps } =
  await import("../../src/createEvoluDeps.ts");
const { createEvoluDeps: createSharedEvoluDeps } =
  await import("../../src/shared.ts");
const { createReactNativeSqliteDriver } =
  await import("../../src/sqlite/Driver.ts");
const {
  createBenchRelay,
  createStallMeter,
  defaultDeviceBenchSizes,
  gapsToStallMs,
  runDeviceBench,
} = await import("../device/bench.ts");
const { countDeviceBenchRuns, parseDeviceBenchLine, summarizeDeviceBench } =
  await import("../../scripts/device-bench.mts");

const tinySizes = {
  rows: 3,
  pageRows: 2,
  mutations: [1, 2],
  syncMessages: [3],
  timerHops: 2,
};

/** A fresh database directory for a test, the mocked EvoluApp's too. */
const setupDirectory = (name: string): string => {
  directory = join(root, name);
  mkdirSync(directory);
  return directory;
};

/** The driver the route passes, on the N-API mirror. */
const createDriver = (databaseDirectory: string): CreateSqliteDriver =>
  createReactNativeSqliteDriver({ nativeSqlite: binding, databaseDirectory });

/**
 * A driver that throws, instead of retrying, when it opens a file another
 * connection holds, and whose delete throws for such a file, as the binding's
 * does. With deps that don't wait for a database's release either, it stands in
 * for expo-sqlite, which shares an open connection or refuses the delete.
 */
const createStrictDriver =
  (databaseDirectory: string): CreateSqliteDriver =>
  (name, options) =>
  async (run) => {
    if (
      options?.mode !== "memory" &&
      binding.isFileOpen(`${databaseDirectory}/evolu1-${name}.db`)
    )
      throw new Error(`${name} is still open.`);
    return ok(await run.ok(createDriver(databaseDirectory)(name, options)));
  };

/** Records each open of a file, as `<label> open <name>`, into `events`. */
const recordOpens =
  (
    events: Array<string>,
    label: string,
    createSqliteDriver: CreateSqliteDriver,
  ): CreateSqliteDriver =>
  (name, options) => {
    if (options?.mode !== "memory") events.push(`${label} open ${name}`);
    return createSqliteDriver(name, options);
  };

const warnConsole = (): ReturnType<typeof createConsole> =>
  createConsole({ level: "warn" });

/** Runs a timing session, and returns its lines. */
const setupSession = async ({
  createEvoluDeps = () => createMainEvoluDeps({ console: warnConsole() }),
  createSqliteDriver,
  sizes = tinySizes,
  onLine = () => undefined,
}: {
  createEvoluDeps?: () => EvoluDeps;
  createSqliteDriver: CreateSqliteDriver;
  sizes?: typeof tinySizes;
  onLine?: (line: string) => void;
}): Promise<ReadonlyArray<string>> => {
  const lines: Array<string> = [];
  await using _ = await runDeviceBench({
    build: "evolu",
    platform: "ios",
    os: "26.5",
    dev: false,
    nodeEnv: "production",
    createEvoluDeps,
    createSqliteDriver,
    sizes,
    log: (line) => {
      lines.push(line);
      onLine(line);
    },
  });
  return lines;
};

test("a timing session logs meta, the options, six runs per case in order and done, waits for releases only after its setup and in its cleanup, no DbWorker opening a database after that wait, and leaves no file", async () => {
  const databaseDirectory = setupDirectory("timing");
  // The lines, the bench's lock requests and the drivers' opens, in the order
  // they happened.
  const events: Array<string> = [];
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");

  const lines = await setupSession({
    createEvoluDeps: () => {
      const deps = createSharedEvoluDeps({
        createSqliteDriver: recordOpens(
          events,
          "worker",
          createStrictDriver(databaseDirectory),
        ),
        // The session deletes no database through Evolu.
        deleteDatabaseFiles: () => () => ok(),
        reloadApp: () => undefined,
        console: warnConsole(),
      });
      const { lockManager } = deps;
      return {
        ...deps,
        lockManager: {
          query: () => lockManager.query(),
          request: ((
            name: string,
            options: LockOptions,
            callback: LockGrantedCallback<unknown>,
          ) => {
            events.push(`lock ${name}`);
            return lockManager.request(name, options, callback);
          }) as typeof lockManager.request,
        },
      };
    },
    createSqliteDriver: recordOpens(
      events,
      "bench",
      createStrictDriver(databaseDirectory),
    ),
    onLine: (line) => {
      events.push(line);
    },
  });

  const parsed = lines.map(parseDeviceBenchLine);
  const [meta, ...rest] = parsed;
  assert(meta?.type === "Meta", "The session starts with meta.");
  assertEqual(meta.meta.sizes, tinySizes);
  assertEqual(meta.meta.cipherVersion, null);
  assertEqual(meta.meta.memory, null);
  const options = rest.filter((line) => line?.type === "Option");
  assertTrue(options.length > 0);
  assertTrue(options.some((line) => line.option.startsWith("THREADSAFE=")));
  const runs = rest.flatMap((line) =>
    line?.type === "Run" ? [`${line.run.case} ${line.run.run}`] : [],
  );
  assertEqual(
    runs,
    [
      "timer-hop",
      "open-new",
      "open-existing",
      "page-write-plain",
      "page-write-encrypted",
      "page-read-plain",
      "page-read-encrypted",
      "evolu-start-new",
      "evolu-start-existing",
      "mutation-1",
      "mutation-2",
      "sync-receive-3",
      "export",
    ].flatMap((name) => [0, 1, 2, 3, 4, 5].map((run) => `${name} ${run}`)),
  );
  assertEqual(parsed.at(-1), {
    type: "Done",
    runs: countDeviceBenchRuns(tinySizes),
    failed: 0,
  });
  assertEqual(
    parsed.map((line) => line?.type),
    ["Meta", ...options.map(() => "Option"), ...runs.map(() => "Run"), "Done"],
  );
  // The summarizer accepts it.
  assertEqual(summarizeDeviceBench([{ device: "Node", lines }]).Node.order, [
    "evolu",
  ]);
  for (const line of lines)
    assert(new TextEncoder().encode(line).length < 1000, line);

  // Each window holds one wait for every database: after the setup, those of
  // the existing-file cases and the sync writer, and in the cleanup, all.
  const isRun = (event: string) => event.includes(" run {");
  const firstRun = events.findIndex(isRun);
  const lastRun = events.findLastIndex(isRun);
  const waits = events.flatMap((event, index) =>
    event.startsWith("lock evolu-leaderlock-bench-") ? [index] : [],
  );
  const setupWaits = waits.filter((index) => index < firstRun);
  const cleanupWaits = waits.filter((index) => index > lastRun);
  assertEqual(setupWaits.length, 6 + 6 + 1);
  // None between runs.
  assertEqual(setupWaits.length + cleanupWaits.length, waits.length);
  assertTrue(
    setupWaits[0] >
      events.findLastIndex((event) => event.includes(" option {")),
  );
  // The setup's 13, then six of each case that creates databases of its own:
  // open-new, the four page cases, evolu-start-new, the two mutations, the
  // sync reader and export.
  assertEqual(cleanupWaits.length, 13 + 6 * 10);
  assertEqual(
    new Set(cleanupWaits.map((index) => events[index])).size,
    cleanupWaits.length,
  );

  // A DbWorker started after the bench's wait would open its database again,
  // before the runs that follow the wait, which can start an Evolu on it.
  const lateOpens = waits.flatMap((index) => {
    const name = events[index].slice("lock evolu-leaderlock-".length);
    const next = events.slice(index).findIndex(isRun);
    return events
      .slice(index, next === -1 ? undefined : index + next)
      .includes(`worker open ${name}`)
      ? [name]
      : [];
  });
  assertEqual(lateOpens, []);
  assertTrue(events.some((event) => event.startsWith("worker open bench-")));
  assertTrue(events.some((event) => event.startsWith("bench open bench-")));

  assertEqual(readdirSync(databaseDirectory), []);
  assertEqual(
    Object.getOwnPropertyDescriptor(globalThis, "WebSocket"),
    descriptor,
  );
});

test("a run whose check fails logs one failed line and no run line for its case, and the next case still runs", async () => {
  const databaseDirectory = setupDirectory("check");
  const createSqliteDriver: CreateSqliteDriver = (name, options) => (run) =>
    run(createDriver(databaseDirectory)(name, options)).then((opened) => {
      if (!opened.ok || options?.mode === "encrypted") return opened;
      const driver = opened.value;
      return ok<SqliteDriver>({
        ...driver,
        // The plaintext page file reads fewer bytes than it holds.
        exec: (query) =>
          query.sql.includes("length(v)")
            ? { rows: [{ bytes: 1 }], changes: 0 }
            : driver.exec(query),
      });
    });

  const parsed = (await setupSession({ createSqliteDriver })).map(
    parseDeviceBenchLine,
  );

  const failed = parsed.filter((line) => line?.type === "Failed");
  assertEqual(failed.length, 1);
  assertEqual(failed[0].case, "page-read-plain");
  const cases = new Set(
    parsed.flatMap((line) => (line?.type === "Run" ? [line.run.case] : [])),
  );
  assertFalse(cases.has("page-read-plain"));
  assertTrue(cases.has("page-read-encrypted"));
  assertTrue(cases.has("export"));
  assertEqual(parsed.at(-1), {
    type: "Done",
    runs: countDeviceBenchRuns(tinySizes) - 6,
    failed: 1,
  });
  assertEqual(readdirSync(databaseDirectory), []);
});

test("an evoluError fails the run at once, and no defect is reported", async () => {
  const databaseDirectory = setupDirectory("evolu-error");
  // Only once the setup is done, which logs no line.
  let fails = false;

  const parsed = (
    await setupSession({
      createEvoluDeps: () => {
        const deps = createMainEvoluDeps({ console: warnConsole() });
        if (!fails) return deps;
        const evoluError = createStore<EvoluError | null>(null);
        globalThis.setTimeout(() => {
          evoluError.set(createUnknownError({ rowid: 1n }));
        }, 0);
        return { ...deps, evoluError };
      },
      createSqliteDriver: createDriver(databaseDirectory),
      onLine: (line) => {
        if (line.includes(" run {")) fails = true;
      },
    })
  ).map(parseDeviceBenchLine);
  // A reported defect would throw after a microtask.
  await setTimeout(10);

  assertEqual(
    parsed.find((line) => line?.type === "Failed"),
    {
      type: "Failed",
      case: "evolu-start-new",
      message: 'evoluError: {"type":"UnknownError","error":{"rowid":"1n"}}',
    },
  );
  assertEqual(parsed.at(-1)?.type, "Done");
  assertEqual(readdirSync(databaseDirectory), []);
});

test("meta reads a page size SQLCipher answers as text, as it does on a keyed connection", async () => {
  const databaseDirectory = setupDirectory("text-pragma");
  const lines: Array<string> = [];
  const createSqliteDriver: CreateSqliteDriver = (name, options) => (run) =>
    run(createDriver(databaseDirectory)(name, options)).then((opened) => {
      if (!opened.ok) return opened;
      const driver = opened.value;
      return ok<SqliteDriver>({
        ...driver,
        exec: (query) =>
          query.sql.startsWith("pragma page_size")
            ? { rows: [{ cipher_page_size: "4096" }], changes: 0 }
            : driver.exec(query),
      });
    });

  await using _ = await runDeviceBench({
    build: "evolu",
    platform: "ios",
    os: "26.5",
    dev: false,
    nodeEnv: "production",
    createEvoluDeps: () => createMainEvoluDeps({ console: warnConsole() }),
    createSqliteDriver,
    memory: "idle",
    sizes: tinySizes,
    log: (line) => {
      lines.push(line);
    },
  });

  const [meta] = lines.map(parseDeviceBenchLine);
  assertEqual(meta?.type === "Meta" && meta.meta.pageSize, 4096);
});

test("a failure outside any case logs the runner's failed line and nothing after it", async () => {
  setupDirectory("runner");

  const lines = await setupSession({
    createSqliteDriver: () => () => {
      throw new Error("No SQLite.");
    },
  });

  assertEqual(lines, [
    'EvoluNativeBench failed {"case":"runner","message":"No SQLite."}',
  ]);
});

test("with the default page sizes, the plaintext and encrypted page files both have 1,925 pages", async () => {
  const databaseDirectory = setupDirectory("pages");

  const parsed = (
    await setupSession({
      createSqliteDriver: createDriver(databaseDirectory),
      sizes: { ...tinySizes, pageRows: defaultDeviceBenchSizes.pageRows },
    })
  ).map(parseDeviceBenchLine);

  const pages = parsed.flatMap((line) =>
    line?.type === "Run" && "pages" in line.run
      ? [`${line.run.case} ${line.run.pages}`]
      : [],
  );
  assertEqual(
    pages,
    [
      "page-write-plain",
      "page-write-encrypted",
      "page-read-plain",
      "page-read-encrypted",
    ].flatMap((name) => Array.from({ length: 6 }, () => `${name} 1925`)),
  );
});

test("a memory launch logs meta, then holding once its point is set up, and keeps what it holds open until disposed", async () => {
  const databaseDirectory = setupDirectory("memory");
  const isAnyFileOpen = () =>
    readdirSync(databaseDirectory).some((file) =>
      binding.isFileOpen(join(databaseDirectory, file)),
    );

  for (const memory of ["idle", "evolu-existing", "sync-received-3"]) {
    const lines: Array<string> = [];
    const held = await runDeviceBench({
      build: "evolu",
      platform: "android",
      os: "37",
      dev: false,
      nodeEnv: "production",
      createEvoluDeps: () => createMainEvoluDeps({ console: warnConsole() }),
      createSqliteDriver: createDriver(databaseDirectory),
      memory,
      sizes: tinySizes,
      log: (line) => {
        lines.push(line);
      },
    });
    const parsed = lines.map(parseDeviceBenchLine);
    assertEqual(
      parsed.map((line) => line?.type),
      ["Meta", "Holding"],
    );
    assertEqual(parsed[0]?.type === "Meta" && parsed[0].meta.memory, memory);
    assertEqual(parsed[1], { type: "Holding", memory });
    // An Evolu holds its database while it lives.
    assertEqual(isAnyFileOpen(), memory !== "idle");

    await held[Symbol.asyncDispose]();
    assertEqual(readdirSync(databaseDirectory), []);
  }

  const lines: Array<string> = [];
  await runDeviceBench({
    build: "evolu",
    platform: "android",
    os: "37",
    dev: false,
    nodeEnv: "production",
    createEvoluDeps: () => createMainEvoluDeps({ console: warnConsole() }),
    createSqliteDriver: createDriver(databaseDirectory),
    memory: "sync-received-4",
    sizes: tinySizes,
    log: (line) => {
      lines.push(line);
    },
  });
  assertEqual(lines.length, 2);
  assertEqual(parseDeviceBenchLine(lines[1]), {
    type: "Failed",
    case: "runner",
    message:
      "The memory point sync-received-4 is none of idle, evolu-existing, sync-received-3.",
  });
});

test("the relay takes a writer's rows, and a fresh reader of the same owner receives them through the fake WebSocket, each syncing Evolu on a socket of its own", async () => {
  const databaseDirectory = setupDirectory("relay");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  const schema = { item: { id: id("Item"), title: NonEmptyTrimmedString100 } };
  const createQuery = createQueryBuilder(schema);
  const countQuery = createQuery((db) =>
    db.selectFrom("item").select((eb) => eb.fn.countAll<number>().as("count")),
  );
  const owner = createAppOwner(
    createOwnerSecret({ randomBytes: createRandomBytes() }),
  );
  const count = 5;
  const run = createRun({
    createSqliteDriver: createDriver(databaseDirectory),
    reportDefect: () => undefined,
  });
  const relay = await run.ok(createBenchRelay());
  assertTrue(
    Object.getOwnPropertyDescriptor(globalThis, "WebSocket") !== descriptor,
  );
  // Leads throughout, as the bench's session deps do, so no DbWorker restarts
  // after the release wait below.
  const sessionDeps = createMainEvoluDeps({ console: warnConsole() });
  const names: Array<string> = [];

  const startEvolu = async (name: string) => {
    const deps = createMainEvoluDeps({ console: warnConsole() });
    const evoluRun = createRun({ ...deps, reportDefect: () => undefined });
    const url = WebSocketUrl.orThrow(`ws://bench.invalid/${name}`);
    const evolu = await evoluRun.ok(
      createEvolu(schema, {
        appName: AppName.orThrow(name),
        appOwner: owner,
        transports: [{ type: "WebSocket", url }],
      }),
    );
    names.push(evolu.name);
    return {
      evolu,
      url,
      [Symbol.asyncDispose]: async () => {
        await evolu[Symbol.asyncDispose]();
        await evoluRun[Symbol.asyncDispose]();
        deps[Symbol.dispose]();
      },
    };
  };

  {
    await using writer = await startEvolu("bench-relay-w-00000000");
    await relay.waitForSocket(writer.url);
    relay.open(writer.url);
    for (let index = 0; index < count; index++)
      writer.evolu.insert("item", {
        title: NonEmptyTrimmedString100.orThrow(`t${index}`),
      });
    await relay.waitForMessages(owner.id, count);
  }
  {
    await using reader = await startEvolu("bench-relay-00000000");
    const shown = Promise.withResolvers<void>();
    const unsubscribe = reader.evolu.subscribeQuery(countQuery)(() => {
      if (reader.evolu.getQueryRows(countQuery)[0]?.count === count)
        shown.resolve();
    });
    assertEqual(await reader.evolu.loadQuery(countQuery), [{ count: 0 }]);
    await relay.waitForSocket(reader.url);
    assertEqual(
      relay.socketsByUrl.get(reader.url)?.map((socket) => socket.readyState),
      [0],
    );

    relay.open(reader.url);
    await shown.promise;
    unsubscribe();

    assertEqual(
      [...relay.socketsByUrl].map(([url, sockets]) => [url, sockets.length]),
      [
        ["ws://bench.invalid/bench-relay-w-00000000", 1],
        ["ws://bench.invalid/bench-relay-00000000", 1],
      ],
    );
    const { relayMs, relayMaxMs } = relay.timesOf(reader.url);
    assertTrue(relayMs > 0 && relayMaxMs > 0 && relayMaxMs <= relayMs);
  }

  await relay[Symbol.asyncDispose]();
  await run[Symbol.asyncDispose]();
  assertEqual(
    Object.getOwnPropertyDescriptor(globalThis, "WebSocket"),
    descriptor,
  );

  const waitRun = createRun({
    lockManager: sessionDeps.lockManager,
    reportDefect: () => undefined,
  });
  for (const name of names) {
    const lock = await waitRun.ok(acquireLeaderLock(name));
    await lock[Symbol.asyncDispose]();
    binding.deleteFile(`${databaseDirectory}/evolu1-${name}.db`);
  }
  await waitRun[Symbol.asyncDispose]();
  sessionDeps[Symbol.dispose]();
  assertEqual(readdirSync(databaseDirectory), []);
});

test("the stall meter's stall is its longest gap minus 16 ms, the gap after its last tick included", () => {
  /** A clock and timers the test advances by hand. */
  const setupClock = () => {
    let now = 0;
    let tick: (() => void) | null = null;
    return {
      deps: {
        now: () => now,
        setInterval: (callback: () => void, delay: number) => {
          assertEqual(delay, 16);
          tick = callback;
          return 1;
        },
        clearInterval: (handle: unknown) => {
          assertEqual(handle, 1);
          tick = null;
        },
      },
      advance: (ms: number) => {
        now += ms;
        tick?.();
      },
      isTicking: () => tick != null,
      wait: (ms: number) => {
        now += ms;
      },
    };
  };

  const blocked = setupClock();
  const meter = createStallMeter(blocked.deps);
  blocked.advance(16);
  blocked.advance(16);
  // A 100 ms block.
  blocked.advance(100);
  blocked.advance(16);
  blocked.wait(8);
  const gaps = meter.stop();

  assertEqual(gaps, [16, 16, 100, 16, 8]);
  assertEqual(gapsToStallMs(gaps), 84);
  assertFalse(blocked.isTicking());

  const last = setupClock();
  const lastMeter = createStallMeter(last.deps);
  last.advance(16);
  last.wait(100);
  assertEqual(gapsToStallMs(lastMeter.stop()), 84);

  const none = setupClock();
  const noneMeter = createStallMeter(none.deps);
  none.wait(3);
  assertEqual(gapsToStallMs(noneMeter.stop()), 0);
});

test("bench.ts bundles with @evolu/* external from itself alone, so the expo-sqlite build runs it unchanged", async () => {
  const entry = fileURLToPath(new URL("../device/bench.ts", import.meta.url));
  const absWorkingDir = fileURLToPath(new URL("../..", import.meta.url));

  const result = await build({
    entryPoints: [entry],
    absWorkingDir,
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "neutral",
    external: ["@evolu/*"],
    logLevel: "silent",
  });

  assertEqual(Object.keys(result.metafile.inputs), ["test/device/bench.ts"]);
});
