import { EncryptionKey, Name, sql, testCreateRun } from "@evolu/common";
import { beforeAll, describe, expect, test, vi } from "vitest";

const sqliteMock = vi.hoisted(() => {
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
    isPaused: vi.fn(() => poolPaused),
    OpfsSAHPoolDb: Database,
    pauseVfs: vi.fn(() => {
      poolPaused = true;
      state.pausedVfsNames.push(pool.vfsName);
      state.events.push(`pause:${pool.vfsName}`);
      return pool;
    }),
    unpauseVfs: vi.fn(() => {
      poolPaused = false;
      state.unpausedVfsNames.push(pool.vfsName);
      state.events.push(`unpause:${pool.vfsName}`);
      return Promise.resolve(pool);
    }),
    unlink: vi.fn((filename: string) => {
      state.deletedFilenames.push(filename);
      state.events.push(`unlink:${filename}`);
      return true;
    }),
    vfsName: "mock-sahpool",
  };

  const sqlite3 = {
    capi: {
      sqlite3_js_db_export: vi.fn(() => new Uint8Array([1, 2, 3])),
      sqlite3mc_vfs_create: vi.fn(),
    },
    installOpfsSAHPoolVfs: vi.fn(() => Promise.resolve(pool)),
    oo1: { DB: Database },
  };

  return {
    consoleWarn: vi.fn(),
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
      pool.isPaused.mockClear();
      pool.pauseVfs.mockClear();
      pool.unpauseVfs.mockClear();
      pool.unlink.mockClear();
      sqlite3.capi.sqlite3_js_db_export.mockClear();
      sqlite3.capi.sqlite3mc_vfs_create.mockClear();
      sqlite3.installOpfsSAHPoolVfs.mockClear();
    },
    sqlite3,
    state,
  };
});

vi.mock("@evolu/sqlite-wasm", () => ({
  default: vi.fn(() => {
    const config = (
      globalThis as {
        readonly sqlite3ApiConfig?: { readonly warn?: (arg: unknown) => void };
      }
    ).sqlite3ApiConfig;
    config?.warn?.("Ignoring inability to install OPFS sqlite3_vfs");
    config?.warn?.("kept warning");
    return Promise.resolve(sqliteMock.sqlite3);
  }),
}));

let createWasmSqliteDriver: typeof import("../src/Sqlite.js").createWasmSqliteDriver;

beforeAll(async () => {
  vi.spyOn(console, "warn").mockImplementation(sqliteMock.consoleWarn);
  ({ createWasmSqliteDriver } = await import("../src/Sqlite.js"));
});

describe("createWasmSqliteDriver coverage helpers", () => {
  test("filters sqlite init warnings", () => {
    expect(sqliteMock.consoleWarn).toHaveBeenCalledExactlyOnceWith(
      "kept warning",
    );
  });

  test("opens plain OPFS SAH-pool database", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using _driver = await run.orThrow(
      createWasmSqliteDriver(Name.orThrow("MockPlain")),
    );

    expect(sqliteMock.sqlite3.installOpfsSAHPoolVfs).toHaveBeenCalledWith({
      name: "MockPlain",
    });
    expect(sqliteMock.state.createdDatabases[0]?.filename).toBe(
      "file:evolu1.db",
    );
  });

  test("opens memory database", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using _driver = await run.orThrow(
      createWasmSqliteDriver(Name.orThrow("MockMemory"), { mode: "memory" }),
    );

    expect(sqliteMock.sqlite3.installOpfsSAHPoolVfs).not.toHaveBeenCalled();
    expect(sqliteMock.state.createdDatabases[0]?.filename).toBe(":memory:");
  });

  test("executes non-prepared query and exports database", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using driver = await run.orThrow(
      createWasmSqliteDriver(Name.orThrow("MockPlain")),
    );

    const result = driver.exec(sql`select ${"row"};`);
    const exported = driver.export();

    expect(result).toEqual({ rows: [{ data: "row" }], changes: 1 });
    expect(exported).toEqual(new Uint8Array([1, 2, 3]));
  });

  test("executes prepared query and finalizes statement on dispose", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    {
      using driver = await run.orThrow(
        createWasmSqliteDriver(Name.orThrow("MockPlain")),
      );

      const result = driver.exec({
        ...sql`select ${"prepared"};`,
        options: { prepare: true },
      });

      expect(result).toEqual({ rows: [{ data: "prepared" }], changes: 1 });

      driver.exec({ ...sql`select 1;`, options: { prepare: true } });
    }

    expect(sqliteMock.state.preparedStatements[0]?.bound).toEqual([
      ["prepared"],
    ]);
    expect(sqliteMock.state.preparedStatements[0]?.resetCount).toBe(1);
    expect(sqliteMock.state.preparedStatements[0]?.finalized).toBe(true);
    expect(sqliteMock.state.preparedStatements[1]?.bound).toEqual([]);
    expect(sqliteMock.state.preparedStatements[1]?.finalized).toBe(true);
  });

  test("closes OPFS database on dispose", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    {
      using _driver = await run.orThrow(
        createWasmSqliteDriver(Name.orThrow("MockPlain")),
      );
    }

    expect(sqliteMock.state.closedDatabases).toEqual(["file:evolu1.db"]);
    expect(sqliteMock.state.pausedVfsNames).toEqual(["mock-sahpool"]);
    expect(sqliteMock.pool.unlink).not.toHaveBeenCalled();
  });

  test("unpauses OPFS SAH-pool database on reopen", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    {
      using _driver = await run.orThrow(
        createWasmSqliteDriver(Name.orThrow("MockPlain")),
      );
    }

    using _driver = await run.orThrow(
      createWasmSqliteDriver(Name.orThrow("MockPlain")),
    );

    expect(sqliteMock.state.unpausedVfsNames).toEqual(["mock-sahpool"]);
  });

  test("deletes plain OPFS database file", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using driver = await run.orThrow(
      createWasmSqliteDriver(Name.orThrow("MockPlain")),
    );

    driver.deleteDatabase();

    expect(sqliteMock.state.closedDatabases).toEqual(["file:evolu1.db"]);
    expect(sqliteMock.state.deletedFilenames).toEqual(["/evolu1.db"]);
    expect(sqliteMock.state.events).toEqual([
      "close:file:evolu1.db",
      "unlink:/evolu1.db",
      "pause:mock-sahpool",
    ]);
  });

  test("deletes memory database", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using driver = await run.orThrow(
      createWasmSqliteDriver(Name.orThrow("MockMemory"), { mode: "memory" }),
    );

    driver.deleteDatabase();

    expect(sqliteMock.state.events).toEqual(["close::memory:"]);
    expect(sqliteMock.pool.unlink).not.toHaveBeenCalled();
    expect(sqliteMock.pool.pauseVfs).not.toHaveBeenCalled();
  });

  test("deletes encrypted OPFS database file", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using driver = await run.orThrow(
      createWasmSqliteDriver(Name.orThrow("MockEncrypted"), {
        mode: "encrypted",
        encryptionKey: EncryptionKey.orThrow(new Uint8Array(32).fill(42)),
      }),
    );

    driver.deleteDatabase();

    expect(sqliteMock.state.closedDatabases).toEqual([
      "file:evolu1.db?vfs=multipleciphers-opfs-sahpool",
    ]);
    expect(sqliteMock.state.deletedFilenames).toEqual(["/evolu1.db"]);
    expect(sqliteMock.state.events).toEqual([
      "close:file:evolu1.db?vfs=multipleciphers-opfs-sahpool",
      "unlink:/evolu1.db",
      "pause:mock-sahpool",
    ]);
  });

  test("configures encrypted OPFS database", async () => {
    sqliteMock.reset();

    await using run = testCreateRun();
    using _driver = await run.orThrow(
      createWasmSqliteDriver(Name.orThrow("MockEncrypted"), {
        mode: "encrypted",
        encryptionKey: EncryptionKey.orThrow(new Uint8Array(32).fill(42)),
      }),
    );

    expect(sqliteMock.sqlite3.installOpfsSAHPoolVfs).toHaveBeenCalledWith({
      directory: ".MockEncrypted",
    });
    expect(sqliteMock.state.createdDatabases[0]?.filename).toBe(
      "file:evolu1.db?vfs=multipleciphers-opfs-sahpool",
    );
    expect(sqliteMock.state.createdDatabases[0]?.execSql[0]).toContain(
      "PRAGMA cipher = 'sqlcipher';",
    );
  });
});
