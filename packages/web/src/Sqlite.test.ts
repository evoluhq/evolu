import {
  assertEqual,
  assertEqualBytes,
  assertTrue,
  EncryptionKey,
  Name,
  sql,
  testCreateRun,
} from "@evolu/common";
import { describe, it, mock } from "node:test";

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
