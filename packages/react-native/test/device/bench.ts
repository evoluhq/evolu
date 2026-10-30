/**
 * The benchmark the Expo example runs at its `native-bench` URL, for
 * `scripts/device-bench.mts`, which summarizes what it logs: what Evolu's
 * SQLite costs on a device, against the expo-sqlite build it replaced, which
 * runs a byte-identical copy of this file.
 *
 * - A timing session logs `meta` and the `option` lines, runs its setup step, six
 *   runs of every case in a fixed order, its cleanup, and logs `done`. Run 0 is
 *   a warm-up.
 * - A memory launch logs `meta`, sets up only its point, logs `holding`, and
 *   resolves with what it holds, which the route never disposes, so the app
 *   idles until it's killed and its memory can be read from outside.
 *
 * Each line is the tag, a keyword and JSON, under 1,000 bytes, since os_log and
 * logcat truncate longer ones. A case logs its six `run` lines only once all
 * its runs passed their checks, and otherwise one `failed` line, and a failure
 * outside any case logs the runner's.
 *
 * Disposing an Evolu doesn't wait for its DbWorker, which closes the database
 * once its tenant, idle for 3 s, is disposed. expo-sqlite would hand that
 * connection back to another open of the file, or refuse to delete it, so the
 * bench waits for releases, taking and releasing each database's leader lock,
 * which the DbWorker holds until the database closes. It waits only at the end
 * of its setup step and in its cleanup: each run's databases have names of
 * their own, and nothing is deleted before the cleanup.
 *
 * A new tab leader of the SharedWorker would make every live tenant start
 * another DbWorker, which opens the database once the old one closes, and so
 * possibly after the bench's wait. So a session creates deps of its own, the
 * session deps, before its setup step and disposes them after its cleanup. As
 * the session's first tab, they lead throughout, and the runs' own deps never
 * do. The waits take their `lockManager`.
 *
 * It imports only `@evolu/common`, never the package's `src`, so the
 * expo-sqlite build runs it unchanged, and uses no `using` declarations, which
 * an app's Babel may not transform.
 *
 * @module
 */
import {
  acquireLeaderLock,
  assert,
  bytesToHex,
  createIdFromString,
  createRandom,
  createRandomBytes,
  createRun,
  createSqlite,
  EncryptionKey,
  id,
  Name,
  NonEmptyTrimmedString100,
  ok,
  sql,
  trySync,
  type CreateSqliteDriver,
  type CreateSqliteDriverDep,
  type RandomBytes,
  type SqliteDriver,
  type SqliteDriverOptions,
  type Task,
  type TimingSafeEqual,
  WebSocketUrl,
} from "@evolu/common";
import {
  AppName,
  applyProtocolMessageAsRelay,
  createAppOwner,
  createBaseSqliteStorageTables,
  createEvolu,
  createOwnerSecret,
  createQueryBuilder,
  createRelaySqliteStorage,
  createRelayStorageTables,
  ownerIdToOwnerIdBytes,
  type AppOwner,
  type Evolu,
  type EvoluDeps,
  type OwnerId,
  type OwnerTransport,
} from "@evolu/common/local-first";

/** What starts each line the bench logs. */
export const deviceBenchTag = "EvoluNativeBench";

/** The build a session ran: Evolu's SQLite, or the expo-sqlite it replaced. */
export type DeviceBenchBuild = "evolu" | "expo-sqlite";

/** How much each case works on. */
export interface DeviceBenchSizes {
  /** The rows of the existing databases and the export. */
  readonly rows: number;
  /** The rows of each of the page files' four tables. */
  readonly pageRows: number;
  /** The inserts of each mutation case. */
  readonly mutations: ReadonlyArray<number>;
  /** The rows each sync case receives. */
  readonly syncMessages: ReadonlyArray<number>;
  /** The `setTimeout(0)` calls of a `timer-hop` run. */
  readonly timerHops: number;
}

export const defaultDeviceBenchSizes: DeviceBenchSizes = {
  rows: 10_000,
  pageRows: 480,
  mutations: [1, 100, 1000],
  syncMessages: [1000, 10_000],
  timerHops: 100,
};

/** The runs of every case, run 0 a warm-up. */
export const deviceBenchRunsPerCase = 6;

/** What every run measures. */
export interface DeviceBenchMeasured {
  readonly ms: number;
  /** The JS thread's longest stall, as {@link gapsToStallMs} gives it. */
  readonly stallMs: number;
  /** Hermes's allocated bytes, or null when the runtime reports none. */
  readonly heapBytes: number | null;
}

/** What a run logs besides its case and number. */
export type DeviceBenchRunFields =
  | DeviceBenchMeasured
  | (DeviceBenchMeasured & { readonly pages: number })
  | (DeviceBenchMeasured & {
      readonly relayMs: number;
      readonly relayMaxMs: number;
    });

/** A case, whose `run` does one run of it and throws when its check fails. */
export interface DeviceBenchCase {
  readonly name: string;
  readonly run: (index: number) => Promise<DeviceBenchRunFields>;
}

/** What the cases run on, which {@link runDeviceBench} creates. */
export interface DeviceBenchContext {
  readonly sizes: DeviceBenchSizes;
  readonly random: RandomBytes;
  readonly openDriver: (file: BenchFile) => Promise<SqliteDriver>;
  readonly createEvoluRun: () => BenchEvoluRun;
  /** Remembers a database for the cleanup. */
  readonly track: (file: BenchFile) => void;
  readonly relay: () => BenchRelay;
  /** The setup's database for run `index` of an existing-file case. */
  readonly existing: (
    name: "open-existing" | "evolu-start-existing",
    index: number,
  ) => BenchEvoluDatabase;
  /** The owner of the setup's sync writer of `count` rows. */
  readonly writer: (count: number) => AppOwner;
}

/**
 * Registers the cases in their order without running them, so
 * `scripts/device-bench.mts` counts them with a context that's never used.
 */
export const registerDeviceBenchCases = ({
  sizes,
  context,
  benchCase,
}: {
  sizes: DeviceBenchSizes;
  context: DeviceBenchContext;
  benchCase: (benchCase: DeviceBenchCase) => void;
}): void => {
  benchCase({
    name: "timer-hop",
    run: async () => {
      const [measured] = await measure(async () => {
        for (let hop = 0; hop < sizes.timerHops; hop++)
          await new Promise((resolve) => {
            setTimeout(resolve, 0);
          });
      });
      return measured;
    },
  });

  for (const name of ["open-new", "open-existing"] as const)
    benchCase({
      name,
      run: async (index) => {
        const file =
          name === "open-new"
            ? encryptedFile(context, benchName(context.random, name, index))
            : evoluFile(context.existing(name, index));
        if (name === "open-new") context.track(file);
        const drivers = new DisposableStack();
        try {
          const [measured, driver] = await measure(async () => {
            const opened = drivers.use(await context.openDriver(file));
            opened.exec(sql`select name from sqlite_schema;`);
            return opened;
          });
          const { rows } = driver.exec(sql`select name from sqlite_schema;`);
          if (name === "open-new")
            assert(rows.length === 0, `A new file has ${rows.length} tables.`);
          else
            assertCount(
              driver.exec(sql`select count(*) as count from item;`).rows,
              sizes.rows,
            );
          return measured;
        } finally {
          drivers.dispose();
        }
      },
    });

  for (const [name, mode] of [
    ["page-write-plain", "plain"],
    ["page-write-encrypted", "encrypted"],
  ] as const)
    benchCase({
      name,
      run: async (index) => {
        const file = pageFile(
          context,
          benchName(context.random, name, index),
          mode,
        );
        context.track(file);
        const driver = await context.openDriver(file);
        try {
          createPageTables(driver);
          const [measured] = await measure(() => {
            insertPageRows(driver, sizes.pageRows);
          });
          const [{ count }] = driver.exec(sql`
            select (select count(*) from p1) + (select count(*) from p2) +
              (select count(*) from p3) + (select count(*) from p4) as count;
          `).rows;
          assert(
            count === 4 * sizes.pageRows,
            `The page file holds ${String(count)} rows.`,
          );
          return { ...measured, pages: pageCount(driver) };
        } finally {
          driver[Symbol.dispose]();
        }
      },
    });

  for (const [name, mode] of [
    ["page-read-plain", "plain"],
    ["page-read-encrypted", "encrypted"],
  ] as const)
    benchCase({
      name,
      run: async (index) => {
        const file = pageFile(
          context,
          benchName(context.random, name, index),
          mode,
        );
        context.track(file);
        const writer = await context.openDriver(file);
        try {
          createPageTables(writer);
          insertPageRows(writer, sizes.pageRows);
        } finally {
          writer[Symbol.dispose]();
        }
        const driver = await context.openDriver(file);
        try {
          driver.exec(sql`pragma secure_delete = on;`);
          driver.exec(sql`select name from sqlite_schema;`);
          const [measured, bytes] = await measure(
            () =>
              driver.exec(sql`
                select (select sum(length(v)) from p1) +
                  (select sum(length(v)) from p2) +
                  (select sum(length(v)) from p3) +
                  (select sum(length(v)) from p4) as bytes;
              `).rows[0]?.bytes,
          );
          assert(
            bytes === 4 * sizes.pageRows * pageRowBytes,
            `The page file read ${String(bytes)} bytes.`,
          );
          return { ...measured, pages: pageCount(driver) };
        } finally {
          driver[Symbol.dispose]();
        }
      },
    });

  for (const name of ["evolu-start-new", "evolu-start-existing"] as const)
    benchCase({
      name,
      run: async (index) => {
        const database =
          name === "evolu-start-new"
            ? createEvoluDatabase(
                context,
                benchName(context.random, name, index),
              )
            : context.existing(name, index);
        if (name === "evolu-start-new") context.track(evoluFile(database));
        const evoluRun = context.createEvoluRun();
        try {
          const [measured, rows] = await measure(async () => {
            const evolu = await evoluRun.start(database, []);
            return evoluRun.race(evolu.loadQuery(countQuery));
          });
          assertCount(rows, name === "evolu-start-new" ? 0 : sizes.rows);
          return measured;
        } finally {
          await evoluRun[Symbol.asyncDispose]();
        }
      },
    });

  for (const count of sizes.mutations)
    benchCase({
      name: `mutation-${count}`,
      run: async (index) => {
        const database = createEvoluDatabase(
          context,
          benchName(context.random, `mutation-${count}`, index),
        );
        context.track(evoluFile(database));
        const evoluRun = context.createEvoluRun();
        try {
          const evolu = await evoluRun.start(database, []);
          await evoluRun.race(evolu.loadQuery(countQuery));
          const titles = createTitles(count);
          const [measured] = await measure(() =>
            evoluRun.race(insertTitles(evolu, titles)),
          );
          await checkTitles(evoluRun, evolu, count);
          return measured;
        } finally {
          await evoluRun[Symbol.asyncDispose]();
        }
      },
    });

  for (const count of sizes.syncMessages)
    benchCase({
      name: `sync-receive-${count}`,
      run: async (index) => {
        const database = createEvoluDatabase(
          context,
          benchName(context.random, `sync-receive-${count}`, index),
          context.writer(count),
        );
        context.track(evoluFile(database));
        const transport = relayTransport(database);
        const evoluRun = context.createEvoluRun();
        try {
          const evolu = await evoluRun.start(database, [transport]);
          const measured = await receiveRows(
            context.relay(),
            evoluRun,
            evolu,
            transport.url,
            count,
          );
          await checkTitles(evoluRun, evolu, count);
          return { ...measured, ...context.relay().timesOf(transport.url) };
        } finally {
          await evoluRun[Symbol.asyncDispose]();
        }
      },
    });

  benchCase({
    name: "export",
    run: async (index) => {
      const database = createEvoluDatabase(
        context,
        benchName(context.random, "export", index),
      );
      context.track(evoluFile(database));
      const evoluRun = context.createEvoluRun();
      try {
        const evolu = await evoluRun.start(database, []);
        await evoluRun.race(insertTitles(evolu, createTitles(sizes.rows)));
        const [measured, { length }] = await measure(() =>
          evoluRun.race(evolu.exportDatabase()),
        );
        assert(
          length > 0 && length % 4096 === 0,
          `The export has ${length} bytes, not a positive multiple of 4,096.`,
        );
        return measured;
      } finally {
        await evoluRun[Symbol.asyncDispose]();
      }
    },
  });
};

/**
 * Runs one timing session, or one memory launch when `memory` names a point, as
 * the module documentation describes, and resolves with what a memory launch
 * holds. A failure outside any case logs the runner's `failed` line.
 */
export const runDeviceBench = async ({
  build,
  platform,
  os,
  dev,
  nodeEnv,
  createEvoluDeps,
  createSqliteDriver,
  memory,
  sizes = defaultDeviceBenchSizes,
  log = (line) => {
    // oxlint-disable-next-line eslint/no-console -- The summarizer reads the app's log.
    console.log(line);
  },
}: {
  build: DeviceBenchBuild;
  platform: string;
  os: string;
  dev: boolean;
  nodeEnv: string | undefined;
  /** The build's `createEvoluDeps`, which the app imports as any app does. */
  createEvoluDeps: () => EvoluDeps;
  createSqliteDriver: CreateSqliteDriver;
  /** The point a memory launch holds, or none for a timing session. */
  memory?: string | undefined;
  sizes?: DeviceBenchSizes;
  log?: (line: string) => void;
}): Promise<AsyncDisposable> => {
  const write = (keyword: string, json: object): void => {
    const line = `${deviceBenchTag} ${keyword} ${JSON.stringify(json)}`;
    assert(
      isShortLine(line),
      `A bench line has 1,000 bytes or more: ${line.slice(0, 200)}`,
    );
    log(line);
  };
  /** Logs a failure, its message shortened until its line fits. */
  const writeFailed = (name: string, error: unknown): void => {
    let message = describeFailure(error);
    while (
      !isShortLine(
        `${deviceBenchTag} failed ${JSON.stringify({ case: name, message })}`,
      )
    )
      message = message.slice(0, -20);
    write("failed", { case: name, message });
  };

  // A failure rejects, so the Run reports no defect, which an app would show
  // as a crash.
  const run = createRun({ createSqliteDriver, reportDefect: () => undefined });
  // What the session holds besides its Run: Evolus and the relay.
  const stack = new AsyncDisposableStack();
  const random = createRandomBytes();
  const files: Array<BenchFile> = [];
  let sessionDeps: EvoluDeps | null = null;
  let relay: BenchRelay | null = null;
  const existingByName = new Map<string, ReadonlyArray<BenchEvoluDatabase>>();
  const writersByCount = new Map<number, AppOwner>();
  const context: DeviceBenchContext = {
    sizes,
    random,
    openDriver: (file) => run.ok(createSqliteDriver(file.name, file.options)),
    createEvoluRun: () => createBenchEvoluRun(createEvoluDeps),
    track: (file) => {
      files.push(file);
    },
    relay: () => {
      assert(relay != null, "The relay runs.");
      return relay;
    },
    existing: (name, index) => {
      const database = existingByName.get(name)?.[index];
      assert(database != null, `The setup created ${name} ${index}.`);
      return database;
    },
    writer: (count) => {
      const owner = writersByCount.get(count);
      assert(owner != null, `The setup wrote ${count} rows.`);
      return owner;
    },
  };

  const startRelay = async (): Promise<void> => {
    relay = stack.use(await run.ok(createBenchRelay()));
  };

  /** Starts a writer, uploads `count` rows and disposes it. */
  const writeRows = async (
    database: BenchEvoluDatabase,
    count: number,
  ): Promise<void> => {
    context.track(evoluFile(database));
    const transport = relayTransport(database);
    const evoluRun = context.createEvoluRun();
    try {
      const evolu = await evoluRun.start(database, [transport]);
      await evoluRun.race(context.relay().waitForSocket(transport.url));
      context.relay().open(transport.url);
      await evoluRun.race(insertTitles(evolu, createTitles(count)));
      await evoluRun.race(
        context.relay().waitForMessages(database.owner.id, count),
      );
    } finally {
      await evoluRun[Symbol.asyncDispose]();
    }
  };

  /** Waits for the release of every database the session created so far. */
  const waitForReleases = async (): Promise<void> => {
    assert(sessionDeps != null, "The session deps lead.");
    const waitRun = createRun({
      lockManager: sessionDeps.lockManager,
      reportDefect: () => undefined,
    });
    try {
      for (const { name } of files) {
        const lock = await waitRun.ok(acquireLeaderLock(name));
        await lock[Symbol.asyncDispose]();
      }
    } finally {
      await waitRun[Symbol.asyncDispose]();
    }
  };

  /** Disposes the Evolus and the relay, the session deps, then the Run. */
  const disposeSession = async (): Promise<void> => {
    await stack.disposeAsync();
    sessionDeps?.[Symbol.dispose]();
    await run[Symbol.asyncDispose]();
  };

  /** Waits for every release once, then deletes every database. */
  const cleanUp = async (): Promise<void> => {
    await waitForReleases();
    for (const file of files) (await context.openDriver(file)).deleteDatabase();
    files.length = 0;
  };

  try {
    const { options, ...meta } = await readMeta(context);
    write("meta", {
      build,
      platform,
      os,
      dev,
      nodeEnv: nodeEnv ?? null,
      startedAt: Date.now(),
      memory: memory ?? null,
      sizes,
      ...meta,
    });
    sessionDeps = createEvoluDeps();

    if (memory != null) {
      const points = [
        "idle",
        "evolu-existing",
        ...sizes.syncMessages.map((count) => `sync-received-${count}`),
      ];
      if (!points.includes(memory))
        throw new Error(
          `The memory point ${memory} is none of ${points.join(", ")}.`,
        );
      if (memory === "evolu-existing") {
        const database = createEvoluDatabase(
          context,
          benchName(random, memory),
        );
        await writeExisting(context, database);
        await waitForReleases();
        const evoluRun = stack.use(context.createEvoluRun());
        const evolu = await evoluRun.start(database, []);
        assertCount(
          await evoluRun.race(evolu.loadQuery(countQuery)),
          sizes.rows,
        );
      } else if (memory !== "idle") {
        const count = Number(memory.slice("sync-received-".length));
        await startRelay();
        const writer = createEvoluDatabase(
          context,
          benchName(random, `${memory}-w`),
        );
        await writeRows(writer, count);
        await waitForReleases();
        const reader = createEvoluDatabase(
          context,
          benchName(random, memory),
          writer.owner,
        );
        context.track(evoluFile(reader));
        const transport = relayTransport(reader);
        const evoluRun = stack.use(context.createEvoluRun());
        const evolu = await evoluRun.start(reader, [transport]);
        await receiveRows(
          context.relay(),
          evoluRun,
          evolu,
          transport.url,
          count,
        );
      }
      write("holding", { memory });
      // Disposed in reverse: the point's Evolu and relay, then its databases,
      // then the session deps and the Run.
      const held = new AsyncDisposableStack();
      held.defer(disposeSession);
      held.defer(cleanUp);
      held.use(stack.move());
      return held;
    }

    for (const option of options) write("option", { option });
    await startRelay();

    // The setup step: the existing-file cases' databases, and a sync writer
    // per size.
    for (const name of ["open-existing", "evolu-start-existing"] as const) {
      const databases = Array.from(
        { length: deviceBenchRunsPerCase },
        (_, index) =>
          createEvoluDatabase(context, benchName(random, name, index)),
      );
      for (const database of databases) await writeExisting(context, database);
      existingByName.set(name, databases);
    }
    for (const count of sizes.syncMessages) {
      const writer = createEvoluDatabase(
        context,
        benchName(random, `sync-receive-${count}`, "w"),
      );
      await writeRows(writer, count);
      writersByCount.set(count, writer.owner);
    }
    await waitForReleases();

    const cases: Array<DeviceBenchCase> = [];
    registerDeviceBenchCases({
      sizes,
      context,
      benchCase: (benchCase) => {
        cases.push(benchCase);
      },
    });
    let runs = 0;
    let failed = 0;
    for (const { name, run: runCase } of cases) {
      const lines: Array<object> = [];
      try {
        for (let index = 0; index < deviceBenchRunsPerCase; index++)
          lines.push({
            case: name,
            run: index,
            ...(await withTimeout(runCase(index))),
          });
      } catch (error) {
        failed++;
        writeFailed(name, error);
        continue;
      }
      for (const line of lines) write("run", line);
      runs += lines.length;
    }

    await cleanUp();
    await disposeSession();
    write("done", { runs, failed });
  } catch (error) {
    writeFailed("runner", error);
    await disposeSession();
  }
  return { [Symbol.asyncDispose]: () => Promise.resolve() };
};

/** A database file the bench opens with its build's driver. */
export interface BenchFile {
  readonly name: Name;
  readonly options: SqliteDriverOptions | undefined;
}

/** A database an Evolu creates, `<appName>-<the owner's Id hash>`. */
export interface BenchEvoluDatabase {
  readonly appName: AppName;
  readonly owner: AppOwner;
}

const benchSchema = {
  item: { id: id("BenchItem"), title: NonEmptyTrimmedString100 },
};

type BenchEvolu = Evolu<typeof benchSchema>;

const createBenchQuery = createQueryBuilder(benchSchema);

const countQuery = createBenchQuery((db) =>
  db.selectFrom("item").select((eb) => eb.fn.countAll<number>().as("count")),
);

const titlesQuery = createBenchQuery((db) =>
  db.selectFrom("item").select("title"),
);

/** `bench-<case>-<run>-<8 hex>`, or `bench-<point>-<8 hex>`. */
const benchName = (
  random: RandomBytes,
  name: string,
  run?: number | "w",
): string =>
  `bench-${name}${run == null ? "" : `-${run}`}-${bytesToHex(random.create(4))}`;

const encryptedFile = (
  { random }: Pick<DeviceBenchContext, "random">,
  name: string,
): BenchFile => ({
  name: Name.orThrow(name),
  options: {
    mode: "encrypted",
    encryptionKey: EncryptionKey.orThrow(random.create(32)),
  },
});

const pageFile = (
  context: Pick<DeviceBenchContext, "random">,
  name: string,
  mode: "plain" | "encrypted",
): BenchFile =>
  mode === "plain"
    ? { name: Name.orThrow(name), options: undefined }
    : encryptedFile(context, name);

/** A database of a fresh owner, or of `owner`. */
const createEvoluDatabase = (
  { random }: Pick<DeviceBenchContext, "random">,
  appName: string,
  owner: AppOwner = createAppOwner(createOwnerSecret({ randomBytes: random })),
): BenchEvoluDatabase => ({ appName: AppName.orThrow(appName), owner });

/** The file of an Evolu's database, as `createEvolu` names and keys it. */
const evoluFile = ({ appName, owner }: BenchEvoluDatabase): BenchFile => ({
  name: Name.orThrow(`${appName}-${createIdFromString(owner.id)}`),
  options: { mode: "encrypted", encryptionKey: owner.encryptionKey },
});

/** Each syncing Evolu's own URL, which the fake WebSocket takes to the relay. */
const relayTransport = ({ appName }: BenchEvoluDatabase): OwnerTransport => ({
  type: "WebSocket",
  url: WebSocketUrl.orThrow(`ws://bench.invalid/${appName}`),
});

/** An Evolu of the existing-file cases: `rows` rows, then disposed. */
const writeExisting = async (
  context: DeviceBenchContext,
  database: BenchEvoluDatabase,
): Promise<void> => {
  context.track(evoluFile(database));
  const evoluRun = context.createEvoluRun();
  try {
    const evolu = await evoluRun.start(database, []);
    await evoluRun.race(insertTitles(evolu, createTitles(context.sizes.rows)));
  } finally {
    await evoluRun[Symbol.asyncDispose]();
  }
};

/**
 * Opens a reader's socket once its subscribed count query loaded 0, and
 * measures from that open until the query shows `count` rows.
 */
const receiveRows = async (
  relay: BenchRelay,
  evoluRun: BenchEvoluRun,
  evolu: BenchEvolu,
  url: string,
  count: number,
): Promise<DeviceBenchMeasured> => {
  const shown = Promise.withResolvers<void>();
  const unsubscribe = evolu.subscribeQuery(countQuery)(() => {
    if (evolu.getQueryRows(countQuery)[0]?.count === count) shown.resolve();
  });
  try {
    assertCount(await evoluRun.race(evolu.loadQuery(countQuery)), 0);
    await evoluRun.race(relay.waitForSocket(url));
    const [measured] = await measure(async () => {
      relay.open(url);
      await evoluRun.race(shown.promise);
    });
    return measured;
  } finally {
    unsubscribe();
  }
};

const createTitles = (count: number): ReadonlyArray<NonEmptyTrimmedString100> =>
  Array.from({ length: count }, (_, index) =>
    NonEmptyTrimmedString100.orThrow(`t${index}`),
  );

/** Inserts the titles in one tick, and resolves at the last `onComplete`. */
const insertTitles = (
  evolu: BenchEvolu,
  titles: ReadonlyArray<NonEmptyTrimmedString100>,
): Promise<void> => {
  const completed = Promise.withResolvers<void>();
  if (titles.length === 0) completed.resolve();
  titles.forEach((title, index) => {
    evolu.insert(
      "item",
      { title },
      index === titles.length - 1
        ? { onComplete: completed.resolve }
        : undefined,
    );
  });
  return completed.promise;
};

/** Checks the count, and that the titles are exactly `t0` to `t<count − 1>`. */
const checkTitles = async (
  evoluRun: BenchEvoluRun,
  evolu: BenchEvolu,
  count: number,
): Promise<void> => {
  assertCount(await evoluRun.race(evolu.loadQuery(countQuery)), count);
  const titles = new Set<unknown>(
    (await evoluRun.race(evolu.loadQuery(titlesQuery))).map((row) => row.title),
  );
  assert(
    titles.size === count &&
      Array.from({ length: count }, (_, index) => `t${index}`).every((title) =>
        titles.has(title),
      ),
    `Expected the titles t0 to t${count - 1}.`,
  );
};

const assertCount = (rows: ReadonlyArray<unknown>, count: number): void => {
  const counted = (rows[0] as { readonly count?: unknown } | undefined)?.count;
  assert(counted === count, `Expected ${count} rows, not ${String(counted)}.`);
};

/** The bytes of each page file row, one leaf's worth in either layout. */
const pageRowBytes = 3000;

const pageTables = ["p1", "p2", "p3", "p4"];

const createPageTables = (driver: SqliteDriver): void => {
  driver.exec(sql`pragma secure_delete = on;`);
  for (const table of pageTables)
    driver.exec(sql`create table ${sql.identifier(table)} (v blob);`);
};

/** Inserts the rows in one transaction, one recursive CTE per table. */
const insertPageRows = (driver: SqliteDriver, rows: number): void => {
  driver.exec(sql`begin;`);
  for (const table of pageTables)
    driver.exec(sql`
      insert into ${sql.identifier(table)} (v)
      with recursive
        r(n) as (
          select 1
          union all
          select n + 1 from r where n < ${rows}
        )
      select randomblob(${pageRowBytes})
      from r;
    `);
  driver.exec(sql`commit;`);
};

const pageCount = (driver: SqliteDriver): number => {
  const [{ page_count }] = driver.exec(sql`pragma page_count;`).rows;
  assert(typeof page_count === "number", "pragma page_count gives a number.");
  return page_count;
};

/** Reads what `meta` records besides the session's, and the compile options. */
const readMeta = async (
  context: DeviceBenchContext,
): Promise<{
  readonly options: ReadonlyArray<string>;
  readonly sqliteVersion: string;
  readonly cipherVersion: string | null;
  readonly cipherProvider: string | null;
  readonly pageSize: number;
  readonly journalMode: string;
  readonly synchronous: number;
  readonly cacheSize: number;
  readonly secureDelete: number;
  readonly idleMedianGapMs: number;
  readonly idleLongestGapMs: number;
}> => {
  const memory = await context.openDriver({
    name: Name.orThrow("bench-meta"),
    options: { mode: "memory" },
  });
  const first = (driver: SqliteDriver, query: string): unknown => {
    const [row] = driver.exec(sql`${sql.raw(query)};`).rows;
    return row == null ? null : Object.values(row)[0];
  };
  const string = (value: unknown): string => {
    assert(typeof value === "string", `${String(value)} isn't a string.`);
    return value;
  };
  // SQLCipher answers page_size on a keyed connection itself, with text.
  const number = (value: unknown): number => {
    const parsed = typeof value === "string" ? Number(value) : value;
    assert(
      typeof parsed === "number" && Number.isFinite(parsed),
      `${String(value)} isn't a number.`,
    );
    return parsed;
  };
  let sqliteVersion: string;
  let cipherVersion: string | null;
  let options: ReadonlyArray<string>;
  try {
    sqliteVersion = string(first(memory, "select sqlite_version()"));
    // SQLCipher answers on any connection, and plain SQLite returns no row.
    const version = first(memory, "pragma cipher_version");
    cipherVersion = version == null ? null : string(version);
    options = memory
      .exec(sql`pragma compile_options;`)
      .rows.map((row) => string(row.compile_options));
  } finally {
    memory[Symbol.dispose]();
  }
  // Evolu's codec turns secure_delete on only for an encrypted file.
  const file = await context.openDriver(
    encryptedFile(context, benchName(context.random, "meta")),
  );
  try {
    const pragmas = {
      cipherProvider:
        cipherVersion == null
          ? null
          : string(first(file, "pragma cipher_provider")),
      pageSize: number(first(file, "pragma page_size")),
      journalMode: string(first(file, "pragma journal_mode")),
      synchronous: number(first(file, "pragma synchronous")),
      cacheSize: number(first(file, "pragma cache_size")),
      secureDelete: number(first(file, "pragma secure_delete")),
    };
    // React Native's timer granularity is unknown.
    const meter = createStallMeter();
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
    const gaps = meter.stop().toSorted((a, b) => a - b);
    return {
      options,
      sqliteVersion,
      cipherVersion,
      ...pragmas,
      idleMedianGapMs: round(gaps[Math.floor(gaps.length / 2)]),
      idleLongestGapMs: round(gaps[gaps.length - 1]),
    };
  } finally {
    file.deleteDatabase();
  }
};

/**
 * Measures `fn` with `performance.now()`, with the stall meter around it, reads
 * the heap afterwards, and returns that with what `fn` returned.
 */
const measure = async <T>(
  fn: () => Promise<T> | T,
): Promise<readonly [DeviceBenchMeasured, T]> => {
  const meter = createStallMeter();
  let gaps: ReadonlyArray<number> = [];
  let value: T;
  let ms: number;
  try {
    const start = performance.now();
    value = await fn();
    ms = performance.now() - start;
  } finally {
    gaps = meter.stop();
  }
  const { memory } = performance as {
    readonly memory?: { readonly usedJSHeapSize?: number | null };
  };
  return [
    {
      ms: round(ms),
      stallMs: round(gapsToStallMs(gaps)),
      heapBytes: memory?.usedJSHeapSize ?? null,
    },
    value,
  ];
};

const round = (ms: number): number => Math.round(ms * 1000) / 1000;

/** Rejects after 60 s, so a run that hangs fails instead. */
const withTimeout = <T>(promise: Promise<T>): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error("The run didn't finish within 60 s."));
      }, 60_000);
    }),
  ]).finally(() => {
    clearTimeout(timeout);
  });
};

/** An Error's message, or a Run's panic's defect's, or the value as JSON. */
const describeFailure = (error: unknown): string => {
  const defect = (error as { readonly reason?: { readonly defect?: unknown } })
    ?.reason?.defect;
  if (defect !== undefined) return describeFailure(defect);
  if (error instanceof Error) return error.message;
  // A function or undefined has no JSON.
  const json: string | undefined = JSON.stringify(error);
  return json ?? "undefined";
};

/** Whether os_log and logcat keep the line whole (assumed limits). */
const isShortLine = (line: string): boolean =>
  new TextEncoder().encode(line).length < 1000;

/** What the stall meter's clock and timers are. */
export interface StallMeterDeps {
  readonly now: () => number;
  readonly setInterval: (callback: () => void, delay: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
}

export interface StallMeter {
  /**
   * Stops the meter and returns the gaps between its ticks, the one from the
   * last tick to the stop included.
   */
  readonly stop: () => ReadonlyArray<number>;
}

/** The JS thread's clock and timers. */
const jsThreadStallMeterDeps: StallMeterDeps = {
  now: () => performance.now(),
  setInterval: (callback, delay) => setInterval(callback, delay),
  clearInterval: (handle) => {
    clearInterval(handle as ReturnType<typeof setInterval>);
  },
};

/** The interval of the stall meter's ticks. */
export const stallMeterIntervalMs = 16;

/**
 * Creates a meter that ticks every 16 ms on the JS thread, whose gaps show how
 * long the thread was blocked.
 */
export const createStallMeter = (
  deps: StallMeterDeps = jsThreadStallMeterDeps,
): StallMeter => {
  const gaps: Array<number> = [];
  let last = deps.now();
  const handle = deps.setInterval(() => {
    const now = deps.now();
    gaps.push(now - last);
    last = now;
  }, stallMeterIntervalMs);
  return {
    stop: () => {
      deps.clearInterval(handle);
      gaps.push(deps.now() - last);
      return gaps;
    },
  };
};

/** A run's stall: its longest gap minus the meter's interval. */
export const gapsToStallMs = (gaps: ReadonlyArray<number>): number =>
  Math.max(0, Math.max(...gaps) - stallMeterIntervalMs);

/** Evolu's deps for one run, whose steps race `evoluError`. */
export interface BenchEvoluRun extends AsyncDisposable {
  /** Creates the run's one Evolu, which disposing the run disposes. */
  readonly start: (
    database: BenchEvoluDatabase,
    transports: ReadonlyArray<OwnerTransport>,
  ) => Promise<BenchEvolu>;
  /** Rejects at once when `evoluError` is set, before or during `promise`. */
  readonly race: <T>(promise: Promise<T>) => Promise<T>;
}

const createBenchEvoluRun = (
  createEvoluDeps: () => EvoluDeps,
): BenchEvoluRun => {
  const evoluDeps = createEvoluDeps();
  // A failure rejects, so the Run reports no defect, which an app would show
  // as a crash.
  const run = createRun({ ...evoluDeps, reportDefect: () => undefined });
  let evolu: BenchEvolu | null = null;
  let unsubscribe = (): void => undefined;
  // A failure in Evolu's workers sets evoluError and completes nothing.
  const failed = new Promise<never>((_, reject) => {
    unsubscribe = evoluDeps.evoluError.subscribe(() => {
      const error = evoluDeps.evoluError.get();
      // An UnknownError may hold what JSON can't encode, such as a cycle.
      const text = trySync(() =>
        JSON.stringify(error, (_key, value: unknown) =>
          value instanceof Error
            ? value.message
            : typeof value === "bigint"
              ? `${value}n`
              : value,
        ),
      );
      reject(
        new Error(`evoluError: ${text.ok ? text.value : String(error?.type)}`),
      );
    });
  });
  // No step may be racing it when it rejects.
  failed.catch(() => undefined);
  const race = <T>(promise: Promise<T>): Promise<T> =>
    Promise.race([promise, failed]);

  return {
    start: async ({ appName, owner }, transports) => {
      assert(evolu == null, "A run starts one Evolu.");
      evolu = await race(
        run.ok(
          createEvolu(benchSchema, {
            appName,
            appOwner: owner,
            transports: [...transports],
          }),
        ),
      );
      return evolu;
    },
    race,
    [Symbol.asyncDispose]: async () => {
      unsubscribe();
      await evolu?.[Symbol.asyncDispose]();
      await run[Symbol.asyncDispose]();
      evoluDeps[Symbol.dispose]();
    },
  };
};

/** The relay the syncing Evolus reach through a fake WebSocket. */
export interface BenchRelay extends AsyncDisposable {
  /** The sockets the Evolus created, by URL, in order. */
  readonly socketsByUrl: ReadonlyMap<string, ReadonlyArray<BenchSocket>>;
  /** Resolves once the latest socket for `url` is connecting. */
  readonly waitForSocket: (url: string) => Promise<void>;
  /** Opens the connecting socket for `url`. */
  readonly open: (url: string) => void;
  /** Resolves once the relay stores `count` messages of the owner. */
  readonly waitForMessages: (ownerId: OwnerId, count: number) => Promise<void>;
  /** The relay's total and longest time on the requests of `url`. */
  readonly timesOf: (url: string) => {
    readonly relayMs: number;
    readonly relayMaxMs: number;
  };
}

/** What the relay's fake WebSocket shows of a socket. */
export interface BenchSocket {
  readonly url: string;
  readonly readyState: number;
}

/**
 * Creates the relay, with its storage in a memory database of the build's own
 * driver, as `@evolu/nodejs`'s relay wires it, and installs a fake WebSocket
 * that reaches it until the relay is disposed.
 *
 * Every URL reaches the one relay. A socket opens only when the bench opens it,
 * and the relay answers each request after a `setTimeout(0)`, in order, and
 * broadcasts nothing.
 */
export const createBenchRelay =
  (): Task<BenchRelay, never, CreateSqliteDriverDep> => async (run) => {
    const sqlite = await run.ok(
      createSqlite(Name.orThrow("bench-relay"), { mode: "memory" }),
    );
    const deps = { sqlite, random: createRandom(), timingSafeEqual };
    createBaseSqliteStorageTables(deps);
    createRelayStorageTables(deps);
    const storage = createRelaySqliteStorage(deps)({
      isOwnerWithinQuota: () => true,
    });
    const relayRun = run.create({ storage });
    const socketsByUrl = new Map<string, Array<BenchWebSocket>>();
    const timesByUrl = new Map<
      string,
      { relayMs: number; relayMaxMs: number }
    >();
    const waiters = new Set<() => void>();
    let disposed = false;
    const notify = (): void => {
      for (const waiter of waiters) waiter();
    };
    const latest = (url: string): BenchWebSocket | undefined =>
      socketsByUrl.get(url)?.at(-1);

    // The one class: common constructs the socket with new.
    class BenchWebSocket implements BenchSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readyState = 0;
      binaryType = "blob";
      onopen: ((event: unknown) => void) | null = null;
      onclose: ((event: unknown) => void) | null = null;
      onmessage: ((event: { readonly data: ArrayBuffer }) => void) | null =
        null;
      onerror: ((event: unknown) => void) | null = null;
      queue = Promise.resolve();

      readonly url: string;

      constructor(url: string) {
        this.url = url;
        const sockets = socketsByUrl.get(url) ?? [];
        sockets.push(this);
        socketsByUrl.set(url, sockets);
        notify();
      }

      send(data: ArrayBufferView | ArrayBuffer): void {
        const request =
          data instanceof ArrayBuffer
            ? new Uint8Array(data.slice(0))
            : new Uint8Array(
                data.buffer,
                data.byteOffset,
                data.byteLength,
              ).slice();
        this.queue = this.queue
          .then(
            () =>
              new Promise((resolve) => {
                setTimeout(resolve, 0);
              }),
          )
          .then(async () => {
            if (disposed || this.readyState !== this.OPEN) return;
            const start = performance.now();
            const response = await relayRun(
              applyProtocolMessageAsRelay(request),
            );
            const ms = performance.now() - start;
            const times = timesByUrl.get(this.url) ?? {
              relayMs: 0,
              relayMaxMs: 0,
            };
            times.relayMs += ms;
            times.relayMaxMs = Math.max(times.relayMaxMs, ms);
            timesByUrl.set(this.url, times);
            if (response.ok && this.readyState === this.OPEN)
              this.onmessage?.({ data: response.value.message.slice().buffer });
            notify();
          });
      }

      close(): void {
        // Common clears its handlers first, so no close event is due.
        this.readyState = this.CLOSED;
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: BenchWebSocket,
    });

    return ok({
      socketsByUrl,
      waitForSocket: (url) =>
        new Promise<void>((resolve) => {
          const waiter = (): void => {
            if (latest(url)?.readyState !== BenchWebSocket.CONNECTING) return;
            waiters.delete(waiter);
            resolve();
          };
          waiters.add(waiter);
          waiter();
        }),
      open: (url) => {
        const socket = latest(url);
        assert(
          socket?.readyState === BenchWebSocket.CONNECTING,
          `No socket of ${url} is connecting.`,
        );
        socket.readyState = BenchWebSocket.OPEN;
        socket.onopen?.({ type: "open" });
      },
      waitForMessages: (ownerId, count) =>
        new Promise<void>((resolve) => {
          const ownerIdBytes = ownerIdToOwnerIdBytes(ownerId);
          const waiter = (): void => {
            const [row] = sqlite.exec(sql`
              select count(*) as count
              from evolu_message
              where ownerId = ${ownerIdBytes};
            `).rows;
            if ((row.count as number) < count) return;
            waiters.delete(waiter);
            resolve();
          };
          waiters.add(waiter);
          waiter();
        }),
      timesOf: (url) => {
        const { relayMs, relayMaxMs } = timesByUrl.get(url) ?? {
          relayMs: 0,
          relayMaxMs: 0,
        };
        return { relayMs: round(relayMs), relayMaxMs: round(relayMaxMs) };
      },
      [Symbol.asyncDispose]: async () => {
        disposed = true;
        waiters.clear();
        if (descriptor)
          Object.defineProperty(globalThis, "WebSocket", descriptor);
        else Reflect.deleteProperty(globalThis, "WebSocket");
        await relayRun[Symbol.asyncDispose]();
        await sqlite[Symbol.asyncDispose]();
      },
    });
  };

/** Compares in time independent of where the bytes differ. */
const timingSafeEqual: TimingSafeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++)
    difference |= a[index] ^ b[index];
  return difference === 0;
};
