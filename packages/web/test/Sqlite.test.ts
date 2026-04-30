import {
  createSqlite,
  Name,
  sql,
  testCreateRun,
  type UnknownError,
} from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import { describe, expect, test } from "vitest";
import { createWasmSqliteDriver } from "../src/Sqlite.js";

installPolyfills();

const testName = Name.orThrow("Test");

type WorkerResponse =
  | { readonly ok: true; readonly data?: Record<string, unknown> }
  | { readonly ok: false; readonly error: UnknownError };

type WorkerOkResponse = Extract<WorkerResponse, { readonly ok: true }>;

const assertWorkerOk: (
  response: WorkerResponse,
) => asserts response is WorkerOkResponse = (response) => {
  if (!response.ok) throw new Error(JSON.stringify(response.error));
};

const setupWasmSqlite = async () => {
  await using disposer = new AsyncDisposableStack();
  const run = disposer.use(
    testCreateRun({ createSqliteDriver: createWasmSqliteDriver }),
  );
  const sqlite = disposer.use(
    await run.orThrow(createSqlite(testName, { mode: "memory" })),
  );
  const disposables = disposer.move();

  return {
    sqlite,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

// Helper to communicate with the sqlite-worker for OPFS tests.
const createWorkerDriver = () => {
  const w = new Worker(new URL("./sqlite-worker.ts", import.meta.url), {
    type: "module",
  });

  const send = (cmd: Record<string, unknown>): Promise<WorkerResponse> =>
    new Promise((resolve) => {
      w.addEventListener(
        "message",
        (e: MessageEvent<WorkerResponse>) => {
          resolve(e.data);
        },
        { once: true },
      );
      w.postMessage(cmd);
    });

  return {
    create: (name: string, encryptionKey?: Uint8Array) =>
      send({ type: "create", name, encryptionKey }),
    createWithLock: (
      name: string,
      lockName: string,
      encryptionKey?: Uint8Array,
    ) => send({ type: "create", name, encryptionKey, lockName }),
    exec: (
      sqlStr: string,
      parameters: ReadonlyArray<unknown> = [],
      prepare = false,
    ) => send({ type: "exec", sql: sqlStr, parameters, prepare }),
    export: () => send({ type: "export" }),
    dispose: () => send({ type: "dispose" }),
    deleteDatabase: () => send({ type: "deleteDatabase" }),
    disposeAndClose: () => send({ type: "disposeAndClose" }),
    terminate: () => {
      w.terminate();
    },
  };
};

const createSqliteWasmWorker = () => {
  const w = new Worker(new URL("./sqlite-wasm-worker.ts", import.meta.url), {
    type: "module",
  });

  const send = (cmd: Record<string, unknown>): Promise<WorkerResponse> =>
    new Promise((resolve) => {
      w.addEventListener(
        "message",
        (e: MessageEvent<WorkerResponse>) => {
          resolve(e.data);
        },
        { once: true },
      );
      w.postMessage(cmd);
    });

  return {
    deleteSahPoolFile: (vfsName: string, filename: string) =>
      send({ type: "deleteSahPoolFile", filename, vfsName }),
    deleteSahPoolUriFile: (
      vfsName: string,
      databaseFilename: string,
      sahPoolFilename: string,
    ) =>
      send({
        type: "deleteSahPoolUriFile",
        databaseFilename,
        sahPoolFilename,
        vfsName,
      }),
    terminate: () => {
      w.terminate();
    },
  };
};

const waitForLock = async (name: string): Promise<void> => {
  await navigator.locks.request(name, () => undefined);
};

describe("createWasmSqliteDriver", () => {
  describe("memory", () => {
    test("creates in-memory database and executes queries", async () => {
      await using setup = await setupWasmSqlite();
      const { sqlite } = setup;

      sqlite.exec(sql`create table t (data text);`);
      sqlite.exec(sql`insert into t (data) values (${"hello"});`);
      const rows = sqlite.exec(sql`select * from t;`);
      expect(rows.rows).toEqual([{ data: "hello" }]);
    });

    test("exec returns changes for writer queries", async () => {
      await using setup = await setupWasmSqlite();
      const { sqlite } = setup;

      sqlite.exec(sql`create table t (id integer primary key, name text);`);
      sqlite.exec(sql`insert into t (name) values (${"Alice"});`);
      sqlite.exec(sql`insert into t (name) values (${"Bob"});`);

      const deleteResult = sqlite.exec(sql`delete from t;`);
      expect(deleteResult.rows).toEqual([]);
      expect(deleteResult.changes).toBe(2);
    });

    test("prepared statements are cached and reused", async () => {
      await using setup = await setupWasmSqlite();
      const { sqlite } = setup;

      sqlite.exec(sql`create table t (id integer primary key, name text);`);

      sqlite.exec(sql.prepared`insert into t (name) values (${"A"});`);
      sqlite.exec(sql.prepared`insert into t (name) values (${"B"});`);

      const rows = sqlite.exec(sql.prepared`select name from t order by id;`);
      expect(rows.rows).toEqual([{ name: "A" }, { name: "B" }]);
    });

    test("export returns database bytes", async () => {
      await using setup = await setupWasmSqlite();
      const { sqlite } = setup;

      sqlite.exec(sql`create table t (data text);`);
      sqlite.exec(sql`insert into t (data) values (${"foo"});`);

      const exported = sqlite.export();
      expect(exported).toBeInstanceOf(Uint8Array);
      expect(exported.length).toBeGreaterThan(0);
    });

    test("dispose is idempotent", async () => {
      await using setup = await setupWasmSqlite();
      const { sqlite } = setup;

      await sqlite[Symbol.asyncDispose]();
      await sqlite[Symbol.asyncDispose]();
    });
  });

  describe("opfs", () => {
    const timeout = 30_000;

    describe("worker lifecycle", () => {
      test(
        "reinitializes OPFS database after SQLite worker termination",
        async () => {
          const name = `terminate${Date.now()}`;
          const lockName = `${name}-lock`;
          const firstDriver = createWorkerDriver();

          const createFirstResult = await firstDriver.createWithLock(
            name,
            lockName,
          );
          assertWorkerOk(createFirstResult);

          await firstDriver.exec("CREATE TABLE t (data TEXT)");
          await firstDriver.exec("INSERT INTO t (data) VALUES (?)", ["first"]);

          firstDriver.terminate();
          await waitForLock(lockName);

          const secondDriver = createWorkerDriver();
          try {
            const createSecondResult = await secondDriver.createWithLock(
              name,
              `${lockName}-second`,
            );
            assertWorkerOk(createSecondResult);

            const queryResult = await secondDriver.exec("SELECT data FROM t");
            assertWorkerOk(queryResult);
            expect(queryResult.data?.rows).toEqual([{ data: "first" }]);
          } finally {
            secondDriver.terminate();
            await waitForLock(`${lockName}-second`);
          }
        },
        timeout,
      );

      test(
        "reinitializes OPFS database after SQLite worker self close",
        async () => {
          const name = `selfClose${Date.now()}`;
          const lockName = `${name}-lock`;
          const firstDriver = createWorkerDriver();

          const createFirstResult = await firstDriver.createWithLock(
            name,
            lockName,
          );
          assertWorkerOk(createFirstResult);

          await firstDriver.exec("CREATE TABLE t (data TEXT)");
          await firstDriver.exec("INSERT INTO t (data) VALUES (?)", [
            "self-close",
          ]);

          const closeResult = await firstDriver.disposeAndClose();
          assertWorkerOk(closeResult);
          await waitForLock(lockName);

          const secondDriver = createWorkerDriver();
          try {
            const createSecondResult = await secondDriver.createWithLock(
              name,
              `${lockName}-second`,
            );
            assertWorkerOk(createSecondResult);

            const queryResult = await secondDriver.exec("SELECT data FROM t");
            assertWorkerOk(queryResult);
            expect(queryResult.data?.rows).toEqual([{ data: "self-close" }]);
          } finally {
            secondDriver.terminate();
            await waitForLock(`${lockName}-second`);
          }
        },
        timeout,
      );

      test(
        "reinitializes OPFS database in the same worker after dispose",
        async () => {
          const name = `sameWorker${Date.now()}`;
          const driver = createWorkerDriver();

          try {
            const createFirstResult = await driver.create(name);
            assertWorkerOk(createFirstResult);

            await driver.exec("CREATE TABLE t (data TEXT)");
            await driver.exec("INSERT INTO t (data) VALUES (?)", [
              "same-worker",
            ]);

            const disposeResult = await driver.dispose();
            assertWorkerOk(disposeResult);

            const createSecondResult = await driver.create(name);
            assertWorkerOk(createSecondResult);

            const queryResult = await driver.exec("SELECT data FROM t");
            assertWorkerOk(queryResult);
            expect(queryResult.data?.rows).toEqual([{ data: "same-worker" }]);
          } finally {
            driver.terminate();
          }
        },
        timeout,
      );
    });

    test(
      "creates plain OPFS database and executes queries",
      async () => {
        const driver = createWorkerDriver();
        try {
          const createResult = await driver.create(`plain${Date.now()}`);
          assertWorkerOk(createResult);

          await driver.exec(
            "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)",
          );
          await driver.exec("INSERT INTO t (name) VALUES (?)", ["Alice"]);

          const queryResult = await driver.exec("SELECT name FROM t");
          assertWorkerOk(queryResult);
          expect(queryResult.data?.rows).toEqual([{ name: "Alice" }]);

          await driver.dispose();
        } finally {
          driver.terminate();
        }
      },
      timeout,
    );

    test(
      "deletes plain OPFS database file",
      async () => {
        const name = `deleteDatabase${Date.now()}`;
        const driver = createWorkerDriver();

        try {
          const createFirstResult = await driver.create(name);
          assertWorkerOk(createFirstResult);

          await driver.exec("CREATE TABLE t (data TEXT)");
          await driver.exec("INSERT INTO t (data) VALUES (?)", ["deleted"]);

          const deleteResult = await driver.deleteDatabase();
          assertWorkerOk(deleteResult);

          const createSecondResult = await driver.create(name);
          assertWorkerOk(createSecondResult);

          const queryResult = await driver.exec(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 't'",
          );
          assertWorkerOk(queryResult);
          expect(queryResult.data?.rows).toEqual([]);
        } finally {
          driver.terminate();
        }
      },
      timeout,
    );

    test(
      "deletes encrypted OPFS database file",
      async () => {
        const name = `deleteEncrypted${Date.now()}`;
        const key = new Uint8Array(32).fill(42);
        const driver = createWorkerDriver();

        try {
          const createFirstResult = await driver.create(name, key);
          assertWorkerOk(createFirstResult);

          await driver.exec("CREATE TABLE t (data TEXT)");
          await driver.exec("INSERT INTO t (data) VALUES (?)", ["deleted"]);

          const deleteResult = await driver.deleteDatabase();
          assertWorkerOk(deleteResult);

          const createSecondResult = await driver.create(name, key);
          assertWorkerOk(createSecondResult);

          const queryResult = await driver.exec(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 't'",
          );
          assertWorkerOk(queryResult);
          expect(queryResult.data?.rows).toEqual([]);
        } finally {
          driver.terminate();
        }
      },
      timeout,
    );

    test(
      "plain sqlite-wasm deletes SAH-pool virtual database file",
      async () => {
        const worker = createSqliteWasmWorker();
        try {
          const filename = "/delete-me.db";
          const result = await worker.deleteSahPoolFile(
            `delete${Date.now()}`,
            filename,
          );
          assertWorkerOk(result);

          expect(result.data?.beforeDeleteFileNames).toContain(filename);
          expect(result.data?.deleted).toBe(true);
          expect(result.data?.afterDeleteFileNames).not.toContain(filename);
          expect(result.data?.selectAfterDeleteSucceeded).toBe(false);
        } finally {
          worker.terminate();
        }
      },
      timeout,
    );

    test(
      "plain sqlite-wasm URI filename maps to absolute SAH-pool file",
      async () => {
        const worker = createSqliteWasmWorker();
        try {
          const databaseFilename = "file:evolu1.db";
          const sahPoolFilename = "/evolu1.db";
          const result = await worker.deleteSahPoolUriFile(
            `uri${Date.now()}`,
            databaseFilename,
            sahPoolFilename,
          );
          assertWorkerOk(result);

          expect(result.data?.beforeDeleteFileNames).toContain(sahPoolFilename);
          expect(result.data?.beforeDeleteFileNames).not.toContain(
            databaseFilename,
          );
          expect(result.data?.deletedWithDatabaseFilename).toBe(false);
          expect(result.data?.afterDatabaseFilenameDeleteFileNames).toContain(
            sahPoolFilename,
          );
          expect(result.data?.deletedWithSahPoolFilename).toBe(true);
          expect(result.data?.afterDeleteFileNames).not.toContain(
            sahPoolFilename,
          );
          expect(result.data?.selectAfterDeleteSucceeded).toBe(false);
        } finally {
          worker.terminate();
        }
      },
      timeout,
    );

    test(
      "creates encrypted database and executes queries",
      async () => {
        const driver = createWorkerDriver();
        try {
          const key = new Uint8Array(32).fill(42);
          const createResult = await driver.create(
            `encrypted${Date.now()}`,
            key,
          );
          assertWorkerOk(createResult);

          await driver.exec(
            "CREATE TABLE t (id INTEGER PRIMARY KEY, data TEXT)",
          );
          await driver.exec("INSERT INTO t (data) VALUES (?)", ["encrypted"]);

          const queryResult = await driver.exec("SELECT data FROM t");
          assertWorkerOk(queryResult);
          expect(queryResult.data?.rows).toEqual([{ data: "encrypted" }]);

          await driver.dispose();
        } finally {
          driver.terminate();
        }
      },
      timeout,
    );
  });
});
