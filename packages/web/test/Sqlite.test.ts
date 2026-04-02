import { createSqlite, Name, sql, testCreateRun } from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import { describe, expect, test } from "vitest";
import { createWasmSqliteDriver } from "../src/Sqlite.js";

installPolyfills();

const testName = Name.orThrow("Test");

const isWebKit =
  navigator.userAgent.includes("WebKit") &&
  !navigator.userAgent.includes("Chrome");

const setupWasmSqlite = async () => {
  await using stack = new AsyncDisposableStack();
  const run = stack.use(
    testCreateRun({ createSqliteDriver: createWasmSqliteDriver }),
  );
  const sqlite = stack.use(
    await run.orThrow(createSqlite(testName, { mode: "memory" })),
  );
  const moved = stack.move();

  return {
    sqlite,
    [Symbol.asyncDispose]: () => moved.disposeAsync(),
  };
};

// Helper to communicate with the sqlite-worker for OPFS tests.
const createWorkerDriver = () => {
  const w = new Worker(new URL("./sqlite-worker.ts", import.meta.url), {
    type: "module",
  });

  type Response =
    | { readonly ok: true; readonly data?: Record<string, unknown> }
    | { readonly ok: false; readonly error: string };

  const send = (cmd: Record<string, unknown>): Promise<Response> =>
    new Promise((resolve) => {
      w.addEventListener(
        "message",
        (e: MessageEvent<Response>) => {
          resolve(e.data);
        },
        { once: true },
      );
      w.postMessage(cmd);
    });

  return {
    create: (name: string, encryptionKey?: Uint8Array) =>
      send({ type: "create", name, encryptionKey }),
    exec: (
      sqlStr: string,
      parameters: ReadonlyArray<unknown> = [],
      prepare = false,
    ) => send({ type: "exec", sql: sqlStr, parameters, prepare }),
    export: () => send({ type: "export" }),
    dispose: () => send({ type: "dispose" }),
    terminate: () => {
      w.terminate();
    },
  };
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

  // TODO: Investigate WebKit OPFS failure ("unknown transient reason").
  describe.skipIf(isWebKit)("opfs", () => {
    const timeout = 30_000;

    test(
      "creates plain OPFS database and executes queries",
      async () => {
        const driver = createWorkerDriver();
        try {
          const createResult = await driver.create(`plain${Date.now()}`);
          if (!createResult.ok) throw new Error(createResult.error);

          await driver.exec(
            "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)",
          );
          await driver.exec("INSERT INTO t (name) VALUES (?)", ["Alice"]);

          const queryResult = await driver.exec("SELECT name FROM t");
          if (!queryResult.ok) throw new Error(queryResult.error);
          expect(queryResult.data?.rows).toEqual([{ name: "Alice" }]);

          await driver.dispose();
        } finally {
          driver.terminate();
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
          if (!createResult.ok) throw new Error(createResult.error);

          await driver.exec(
            "CREATE TABLE t (id INTEGER PRIMARY KEY, data TEXT)",
          );
          await driver.exec("INSERT INTO t (data) VALUES (?)", ["encrypted"]);

          const queryResult = await driver.exec("SELECT data FROM t");
          if (!queryResult.ok) throw new Error(queryResult.error);
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
