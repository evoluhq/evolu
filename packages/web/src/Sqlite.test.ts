import {
  AbortError,
  assert,
  assertEqual,
  assertEqualBytes,
  assertSame,
  assertTrue,
  assertType,
  EncryptionKey,
  Name,
  sql,
  testCreateRun,
} from "@evolu/common";
import { describe, it, mock } from "node:test";

// OPFS with an optional pool directory. Each pool file lists the error names
// its next openings reject with, in order.
const opfsMock = (() => {
  const state = {
    closedAccessHandleCount: 0,
    directoryNames: [] as Array<string>,
    getDirectoryCount: 0,
    hasOpaqueDirectory: true,
    openedAccessHandleCount: 0,
    poolFiles: null as Array<Array<string>> | null,
  };

  const opaqueDirectory = {
    // for await also iterates a sync iterable.
    values: function* () {
      yield { kind: "directory" };
      for (const errorNames of state.poolFiles ?? [])
        yield {
          kind: "file",
          createSyncAccessHandle: () => {
            const errorName = errorNames.shift();
            if (errorName !== undefined)
              return Promise.reject(new DOMException("Held", errorName));
            state.openedAccessHandleCount += 1;
            return Promise.resolve({
              close: () => {
                state.closedAccessHandleCount += 1;
              },
            });
          },
        };
    },
  };

  const poolDirectory = {
    getDirectoryHandle: (name: string) => {
      state.directoryNames.push(name);
      return state.hasOpaqueDirectory
        ? Promise.resolve(opaqueDirectory)
        : Promise.reject(new DOMException("Missing", "NotFoundError"));
    },
  };

  const root = {
    getDirectoryHandle: (name: string) => {
      state.directoryNames.push(name);
      return state.poolFiles
        ? Promise.resolve(poolDirectory)
        : Promise.reject(new DOMException("Missing", "NotFoundError"));
    },
  };

  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: {
      getDirectory: () => {
        state.getDirectoryCount += 1;
        return Promise.resolve(root);
      },
    },
  });

  return {
    reset: (
      poolFiles: Array<Array<string>> | null = null,
      { hasOpaqueDirectory = true } = {},
    ) => {
      state.closedAccessHandleCount = 0;
      state.directoryNames.length = 0;
      state.getDirectoryCount = 0;
      state.hasOpaqueDirectory = hasOpaqueDirectory;
      state.openedAccessHandleCount = 0;
      state.poolFiles = poolFiles;
    },
    state,
  };
})();

// Lets resolved mocks settle before test time advances.
const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const sqliteMock = (() => {
  class PreparedStatement {
    finalized = false;
    resetCount = 0;
    stepCount = 0;
    readonly bound: Array<ReadonlyArray<unknown>> = [];

    bind(parameters: ReadonlyArray<unknown>): void {
      this.bound.push(parameters);
    }

    step(): boolean {
      this.stepCount += 1;
      return this.stepCount === 1;
    }

    get(): Record<string, unknown> {
      return { data: "prepared" };
    }

    reset(): void {
      this.resetCount += 1;
    }

    finalize(): void {
      this.finalized = true;
    }
  }

  class Database {
    readonly execSql: Array<string> = [];
    readonly filename: string;

    constructor(filename: string) {
      this.filename = filename;
      state.createdDatabases.push(this);
    }

    prepare(): PreparedStatement {
      const statement = new PreparedStatement();
      state.preparedStatements.push(statement);
      return statement;
    }

    exec(sql: string): ReadonlyArray<Record<string, unknown>> {
      this.execSql.push(sql);
      return [{ data: "row" }];
    }

    changes(): number {
      return 1;
    }

    close(): void {
      state.closedDatabases.push(this.filename);
      state.events.push(`close:${this.filename}`);
    }
  }

  const state = {
    closedDatabases: [] as Array<string>,
    createdDatabases: [] as Array<Database>,
    deletedFilenames: [] as Array<string>,
    events: [] as Array<string>,
    pausedVfsNames: [] as Array<string>,
    preparedStatements: [] as Array<PreparedStatement>,
    unpausedVfsNames: [] as Array<string>,
  };

  let poolPaused = false;
  const pool = {
    isPaused: mock.fn(() => poolPaused),
    OpfsSAHPoolDb: Database,
    pauseVfs: mock.fn(() => {
      poolPaused = true;
      state.pausedVfsNames.push(pool.vfsName);
      state.events.push(`pause:${pool.vfsName}`);
      return pool;
    }),
    unpauseVfs: mock.fn(() => {
      poolPaused = false;
      state.unpausedVfsNames.push(pool.vfsName);
      state.events.push(`unpause:${pool.vfsName}`);
      return Promise.resolve(pool);
    }),
    unlink: mock.fn((filename: string) => {
      state.deletedFilenames.push(filename);
      state.events.push(`unlink:${filename}`);
      return true;
    }),
    vfsName: "mock-sahpool",
  };

  const sqlite3 = {
    capi: {
      sqlite3_js_db_export: mock.fn(() => new Uint8Array([1, 2, 3])),
      sqlite3mc_vfs_create: mock.fn(),
    },
    installOpfsSAHPoolVfs: mock.fn(() => Promise.resolve(pool)),
    oo1: { DB: Database },
  };

  return {
    consoleWarn: mock.fn<typeof console.warn>(),
    pool,
    reset: () => {
      opfsMock.reset();
      state.closedDatabases.length = 0;
      state.createdDatabases.length = 0;
      state.deletedFilenames.length = 0;
      state.events.length = 0;
      state.pausedVfsNames.length = 0;
      state.preparedStatements.length = 0;
      state.unpausedVfsNames.length = 0;
      poolPaused = false;
      pool.isPaused.mock.resetCalls();
      pool.pauseVfs.mock.resetCalls();
      pool.unpauseVfs.mock.resetCalls();
      pool.unlink.mock.resetCalls();
      sqlite3.capi.sqlite3_js_db_export.mock.resetCalls();
      sqlite3.capi.sqlite3mc_vfs_create.mock.resetCalls();
      sqlite3.installOpfsSAHPoolVfs.mock.resetCalls();
    },
    sqlite3,
    state,
  };
})();

mock.module("@evolu/sqlite-wasm", {
  // @ts-expect-error -- Node.js 24.20 replaces the deprecated defaultExport option with exports, which @types/node 24.13 does not declare yet.
  exports: {
    default: mock.fn(() => {
      const config = Reflect.get(globalThis, "sqlite3ApiConfig") as
        | {
            readonly warn?: (arg: unknown) => void;
          }
        | undefined;
      config?.warn?.("Ignoring inability to install OPFS sqlite3_vfs");
      config?.warn?.("kept warning");
      return Promise.resolve(sqliteMock.sqlite3);
    }),
  },
});

mock.method(console, "warn", sqliteMock.consoleWarn);
const { createWasmSqliteDriver } = await import("./Sqlite.ts");

describe("createWasmSqliteDriver coverage helpers", () => {
  it("filters sqlite init warnings", () => {
    assertEqual(
      sqliteMock.consoleWarn.mock.calls.map(({ arguments: args }) => args),
      [["kept warning"]],
    );
  });

  it("opens plain OPFS SAH-pool database", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using _driver = await run.ok(
      createWasmSqliteDriver(Name.orThrow("MockPlain")),
    );

    assertEqual(
      sqliteMock.sqlite3.installOpfsSAHPoolVfs.mock.calls.map(
        ({ arguments: args }) => args,
      ),
      [[{ name: "MockPlain" }]],
    );
    assertEqual(
      sqliteMock.state.createdDatabases[0]?.filename,
      "file:evolu1.db",
    );
  });

  it("opens memory database", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using _driver = await run.ok(
      createWasmSqliteDriver(Name.orThrow("MockMemory"), { mode: "memory" }),
    );

    assertEqual(sqliteMock.sqlite3.installOpfsSAHPoolVfs.mock.callCount(), 0);
    assertEqual(sqliteMock.state.createdDatabases[0]?.filename, ":memory:");
    assertEqual(opfsMock.state.getDirectoryCount, 0);
  });

  it("executes non-prepared query and exports database", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using driver = await run.ok(
      createWasmSqliteDriver(Name.orThrow("MockPlain")),
    );

    const result = driver.exec(sql`select ${"row"};`);
    const exported = driver.export();

    assertEqual(result, { rows: [{ data: "row" }], changes: 1 });
    assertEqualBytes(exported, [1, 2, 3]);
  });

  it("executes prepared query and finalizes statement on dispose", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    {
      using driver = await run.ok(
        createWasmSqliteDriver(Name.orThrow("MockPlain")),
      );

      const result = driver.exec({
        ...sql`select ${"prepared"};`,
        options: { prepare: true },
      });

      assertEqual(result, { rows: [{ data: "prepared" }], changes: 1 });

      driver.exec({ ...sql`select 1;`, options: { prepare: true } });
    }

    assertEqual(sqliteMock.state.preparedStatements[0]?.bound, [["prepared"]]);
    assertEqual(sqliteMock.state.preparedStatements[0]?.resetCount, 1);
    assertEqual(sqliteMock.state.preparedStatements[0]?.finalized, true);
    assertEqual(sqliteMock.state.preparedStatements[1]?.bound, []);
    assertEqual(sqliteMock.state.preparedStatements[1]?.finalized, true);
  });

  it("closes OPFS database on dispose", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    {
      using _driver = await run.ok(
        createWasmSqliteDriver(Name.orThrow("MockPlain")),
      );
    }

    assertEqual(sqliteMock.state.closedDatabases, ["file:evolu1.db"]);
    assertEqual(sqliteMock.state.pausedVfsNames, ["mock-sahpool"]);
    assertEqual(sqliteMock.pool.unlink.mock.callCount(), 0);
  });

  it("unpauses OPFS SAH-pool database on reopen", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    {
      using _driver = await run.ok(
        createWasmSqliteDriver(Name.orThrow("MockPlain")),
      );
    }

    using _driver = await run.ok(
      createWasmSqliteDriver(Name.orThrow("MockPlain")),
    );

    assertEqual(sqliteMock.state.unpausedVfsNames, ["mock-sahpool"]);
  });

  it("deletes plain OPFS database file", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using driver = await run.ok(
      createWasmSqliteDriver(Name.orThrow("MockPlain")),
    );

    driver.deleteDatabase();

    assertEqual(sqliteMock.state.closedDatabases, ["file:evolu1.db"]);
    assertEqual(sqliteMock.state.deletedFilenames, ["/evolu1.db"]);
    assertEqual(sqliteMock.state.events, [
      "close:file:evolu1.db",
      "unlink:/evolu1.db",
      "pause:mock-sahpool",
    ]);
  });

  it("deletes memory database", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using driver = await run.ok(
      createWasmSqliteDriver(Name.orThrow("MockMemory"), { mode: "memory" }),
    );

    driver.deleteDatabase();

    assertEqual(sqliteMock.state.events, ["close::memory:"]);
    assertEqual(sqliteMock.pool.unlink.mock.callCount(), 0);
    assertEqual(sqliteMock.pool.pauseVfs.mock.callCount(), 0);
  });

  it("deletes encrypted OPFS database file", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using driver = await run.ok(
      createWasmSqliteDriver(Name.orThrow("MockEncrypted"), {
        mode: "encrypted",
        encryptionKey: EncryptionKey.orThrow(new Uint8Array(32).fill(42)),
      }),
    );

    driver.deleteDatabase();

    assertEqual(sqliteMock.state.closedDatabases, [
      "file:evolu1.db?vfs=multipleciphers-opfs-sahpool",
    ]);
    assertEqual(sqliteMock.state.deletedFilenames, ["/evolu1.db"]);
    assertEqual(sqliteMock.state.events, [
      "close:file:evolu1.db?vfs=multipleciphers-opfs-sahpool",
      "unlink:/evolu1.db",
      "pause:mock-sahpool",
    ]);
  });

  it("configures encrypted OPFS database", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using _driver = await run.ok(
      createWasmSqliteDriver(Name.orThrow("MockEncrypted"), {
        mode: "encrypted",
        encryptionKey: EncryptionKey.orThrow(new Uint8Array(32).fill(42)),
      }),
    );

    assertEqual(
      sqliteMock.sqlite3.installOpfsSAHPoolVfs.mock.calls.map(
        ({ arguments: args }) => args,
      ),
      [[{ directory: ".MockEncrypted" }]],
    );
    assertEqual(
      sqliteMock.state.createdDatabases[0]?.filename,
      "file:evolu1.db?vfs=multipleciphers-opfs-sahpool",
    );
    assertTrue(
      sqliteMock.state.createdDatabases[0]?.execSql[0]?.includes(
        "PRAGMA cipher = 'sqlcipher';",
      ),
    );
  });
});

describe("createWasmSqliteDriver held pool files", () => {
  for (const errorName of ["InvalidStateError", "NoModificationAllowedError"])
    it(`sets up the pool once a file held with ${errorName} is released`, async () => {
      sqliteMock.reset();
      opfsMock.reset([[], [errorName, errorName]]);

      await using run = testCreateRun();
      const driver = run.ok(createWasmSqliteDriver(Name.orThrow("MockPlain")));
      await flushMicrotasks();

      assertEqual(opfsMock.state.directoryNames, [".MockPlain", ".opaque"]);
      run.deps.time.advance("49ms");
      await flushMicrotasks();
      assertEqual(sqliteMock.sqlite3.installOpfsSAHPoolVfs.mock.callCount(), 0);

      // The retry delay doubles after each held pass.
      run.deps.time.advance("1ms");
      await flushMicrotasks();
      run.deps.time.advance("99ms");
      await flushMicrotasks();
      assertEqual(sqliteMock.sqlite3.installOpfsSAHPoolVfs.mock.callCount(), 0);

      run.deps.time.advance("1ms");
      using _driver = await driver;

      // The free file opens on each of the three passes, the held one once.
      assertEqual(sqliteMock.sqlite3.installOpfsSAHPoolVfs.mock.callCount(), 1);
      assertEqual(opfsMock.state.openedAccessHandleCount, 4);
      assertEqual(opfsMock.state.closedAccessHandleCount, 4);
    });

  it("sets up the pool at once when its directory has no files yet", async () => {
    sqliteMock.reset();
    opfsMock.reset([], { hasOpaqueDirectory: false });

    await using run = testCreateRun();
    using _driver = await run.ok(
      createWasmSqliteDriver(Name.orThrow("MockPlain")),
    );

    assertEqual(opfsMock.state.directoryNames, [".MockPlain", ".opaque"]);
    assertEqual(opfsMock.state.openedAccessHandleCount, 0);
    assertEqual(sqliteMock.sqlite3.installOpfsSAHPoolVfs.mock.callCount(), 1);
  });

  it("warns once when pool files stay held for five seconds", async () => {
    sqliteMock.reset();
    opfsMock.reset([Array.from({ length: 12 }, () => "InvalidStateError")]);

    await using run = testCreateRun();
    const driver = run.ok(createWasmSqliteDriver(Name.orThrow("MockPlain")));
    for (let second = 0; second < 12; second += 1) {
      await flushMicrotasks();
      run.deps.time.advance("1s");
    }
    using _driver = await driver;

    const warnings = run.deps.console
      .getEntriesSnapshot()
      .filter((entry) => entry.method === "warn");
    assertEqual(
      warnings.map((entry) => entry.args),
      [
        [
          "Waiting for an ended DbWorker to release the files of database MockPlain.",
        ],
      ],
    );
  });

  it("fails before setting up the pool when a file cannot be opened", async () => {
    sqliteMock.reset();
    opfsMock.reset([["UnknownError"]]);

    await using run = testCreateRun();
    const result = await run.abortable(
      createWasmSqliteDriver(Name.orThrow("MockPlain")),
    );

    assert(!result.ok, "Expected the driver to fail.");
    assertType(AbortError, result.error);
    assertSame(result.error.reason.type, "PanicAbortReason");
    assertEqual(sqliteMock.sqlite3.installOpfsSAHPoolVfs.mock.callCount(), 0);
  });
});
