import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertInstanceOf,
  assertSame,
  assertThrows,
  assertTrue,
  createSqlite,
  Name,
  sql,
  testCreateRun,
} from "@evolu/common";
import BetterSQLite from "better-sqlite3";
import { existsSync, rmSync } from "fs";
import { afterEach, describe, it } from "node:test";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { createBetterSqliteDriver } from "../../../../packages/nodejs/src/Sqlite.ts";
import { describeSqliteDriverIterate } from "./_iterate.ts";
import {
  describeSqliteDriverPrepare,
  setupSqliteAndDriver,
} from "./_prepare.ts";

const testName = Name.orThrow("Test");

const setupBetterSqlite = async () => {
  await using disposer = new AsyncDisposableStack();
  const run = disposer.use(
    testCreateRun({ createSqliteDriver: createBetterSqliteDriver }),
  );
  const sqlite = disposer.use(
    await run.ok(createSqlite(testName, { mode: "memory" })),
  );
  const disposables = disposer.move();

  return {
    sqlite,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

describe("createBetterSqliteDriver", () => {
  it("creates in-memory database", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table t (data text);`);
    sqlite.exec(sql`insert into t (data) values (${"hello"});`);
    const rows = sqlite.exec(sql`select * from t;`);
    assertEqual(rows.rows, [{ data: "hello" }]);
  });

  it("exec returns rows for reader queries", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table t (id integer primary key, name text);`);
    sqlite.exec(sql`insert into t (name) values (${"Alice"});`);
    sqlite.exec(sql`insert into t (name) values (${"Bob"});`);

    const rows = sqlite.exec(sql`select name from t order by id;`);
    assertEqual(rows.rows, [{ name: "Alice" }, { name: "Bob" }]);
    assertEqual(rows.changes, 0);
  });

  it("exec returns changes for writer queries", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table t (id integer primary key, name text);`);
    sqlite.exec(sql`insert into t (name) values (${"Alice"});`);
    sqlite.exec(sql`insert into t (name) values (${"Bob"});`);

    const deleteResult = sqlite.exec(sql`delete from t;`);
    assertEqual(deleteResult.rows, []);
    assertEqual(deleteResult.changes, 2);
  });

  it("exec returns rows and changes for writer queries with returning", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table t (id integer primary key, name text);`);

    const insert = sql`
      insert into t (id, name)
      values (${1}, ${"Alice"})
      on conflict do nothing
      returning id;
    `;
    assertEqual(sqlite.exec(insert), { rows: [{ id: 1 }], changes: 1 });
    assertEqual(sqlite.exec(insert), { rows: [], changes: 0 });

    sqlite.exec(sql`insert into t (id, name) values (${2}, ${"Bob"});`);
    const update = sqlite.exec(sql`
      update t
      set name = upper(name)
      returning name;
    `);
    assertEqual(update.changes, 2);
  });

  it("export returns serialized database bytes", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table t (data text);`);
    sqlite.exec(sql`insert into t (data) values (${"foo"});`);

    const exported = sqlite.export();
    assertInstanceOf(exported, Uint8Array);
    assertTrue(exported.length > 0);
  });

  it("export copies bytes when serialize is not backed by ArrayBuffer", async (t) => {
    const serialized = new Uint8Array(new SharedArrayBuffer(3));
    serialized.set([1, 2, 3]);

    t.mock.method(
      BetterSQLite.prototype,
      "serialize",
      () => serialized as Buffer,
    );

    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    const exported = sqlite.export();

    assertEqualBytes(exported, [1, 2, 3]);
    assertInstanceOf(exported.buffer, ArrayBuffer);
  });

  it("dispose is idempotent", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    await sqlite[Symbol.asyncDispose]();
    await sqlite[Symbol.asyncDispose]();
  });

  it("runs a statement that prepare returns many times, also one that returns rows", async (t) => {
    const prepare = t.mock.method(BetterSQLite.prototype, "prepare");
    await using run = testCreateRun();
    using driver = await run.ok(
      createBetterSqliteDriver(testName, { mode: "memory" }),
    );
    driver.exec(sql`create table t (id integer primary key, name text);`);
    const insert = sql`insert into t (name) values (${"A"}) returning id;`;

    {
      using statement = driver.prepare(insert.sql);
      const prepares = prepare.mock.callCount();
      assertEqual(statement.exec(["A"]), { rows: [{ id: 1 }], changes: 1 });
      assertEqual(statement.exec(["B"]), { rows: [{ id: 2 }], changes: 1 });
      assertEqual(prepare.mock.callCount(), prepares);
    }

    assertEqual(driver.exec(sql`select name from t order by id;`), {
      rows: [{ name: "A" }, { name: "B" }],
      changes: 0,
    });
  });

  it("a disposed statement that prepare returned keeps no native statement, also while it is held", async (t) => {
    // node:test runs each file in its own process, so the flag affects only this file.
    setFlagsFromString("--expose-gc");
    const gc = runInNewContext("gc") as () => void;
    const prepare = t.mock.method(BetterSQLite.prototype, "prepare");
    await using run = testCreateRun();
    using driver = await run.ok(
      createBetterSqliteDriver(testName, { mode: "memory" }),
    );
    const select = sql`select 1 as a;`;
    const statement = driver.prepare(select.sql);
    const nativeStatement = (() => {
      const nativeStatement = prepare.mock.calls.at(-1)?.result;
      assert(nativeStatement, "Expected the statement prepare returned.");
      return new WeakRef(nativeStatement);
    })();
    // The spy keeps what prepare returned.
    prepare.mock.resetCalls();

    statement[Symbol.dispose]();
    // A WeakRef keeps its target until the current job ends.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    gc();

    assertSame(nativeStatement.deref(), undefined);
    assertThrows(
      () => statement.exec(select.parameters),
      (error) => {
        assertInstanceOf(error, Error);
        assertEqual(error.message, "Cannot use a disposed object.");
      },
    );
  });

  it("driver dispose is idempotent", async () => {
    await using run = testCreateRun();
    const driver = await run.ok(
      createBetterSqliteDriver(testName, { mode: "memory" }),
    );

    driver[Symbol.dispose]();
    driver[Symbol.dispose]();
  });

  it("better-sqlite3 serialize returns Buffer backed by ArrayBuffer", () => {
    const db = new BetterSQLite(":memory:");
    db.exec("create table t (data text);");
    db.exec("insert into t (data) values ('x');");

    const serialized = db.serialize();

    assertInstanceOf(serialized, Uint8Array);
    assertTrue(Buffer.isBuffer(serialized));
    assertInstanceOf(serialized.buffer, ArrayBuffer);

    db.close();
  });

  describe("file-based database", () => {
    const dbPath = `${testName}.db`;
    const dbPaths = [
      dbPath,
      `${dbPath}-shm`,
      `${dbPath}-wal`,
      `${dbPath}-journal`,
    ];

    afterEach(() => {
      for (const path of dbPaths) rmSync(path, { force: true });
    });

    it("creates database file on disk", async () => {
      await using run = testCreateRun();
      using _driver = await run.ok(createBetterSqliteDriver(testName));

      assertTrue(existsSync(dbPath));
    });

    it("dispose preserves database file on disk", async () => {
      await using run = testCreateRun();
      const driver = await run.ok(createBetterSqliteDriver(testName));

      driver.exec(sql`create table t (data text);`);
      driver[Symbol.dispose]();

      assertTrue(existsSync(dbPath));
    });

    it("deleteDatabase finalizes the statements a Sqlite keeps, which the Sqlite then disposes", async () => {
      const { run, sqlite, driver } = await setupSqliteAndDriver(
        createBetterSqliteDriver,
        testName,
      );
      await using _run = run;
      sqlite.prepared`select 1;`;

      driver.deleteDatabase();
      await sqlite[Symbol.asyncDispose]();

      assertTrue(dbPaths.every((path) => !existsSync(path)));
    });

    it("deleteDatabase removes database file from disk", async () => {
      await using run = testCreateRun();
      const driver = await run.ok(createBetterSqliteDriver(testName));

      driver.exec(sql`create table t (data text);`);
      driver.exec(sql`insert into t (data) values (${"deleted"});`);
      driver.deleteDatabase();

      assertTrue(dbPaths.every((path) => !existsSync(path)));

      using newDriver = await run.ok(createBetterSqliteDriver(testName));
      const result = newDriver.exec(sql`
        select name
        from sqlite_master
        where type = 'table' and name = 't';
      `);

      assertEqual(result.rows, []);
    });
  });
});

describeSqliteDriverIterate(() =>
  testCreateRun().ok(createBetterSqliteDriver(testName, { mode: "memory" })),
);

describeSqliteDriverPrepare(() =>
  testCreateRun().ok(createBetterSqliteDriver(testName, { mode: "memory" })),
);
