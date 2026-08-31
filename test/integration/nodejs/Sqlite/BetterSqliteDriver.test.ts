import {
  assertEqual,
  assertEqualBytes,
  assertInstanceOf,
  assertTrue,
  createSqlite,
  Name,
  sql,
  testCreateRun,
} from "@evolu/common";
import BetterSQLite from "better-sqlite3";
import { existsSync, rmSync } from "fs";
import { afterEach, describe, it } from "node:test";
import { createBetterSqliteDriver } from "../../../../packages/nodejs/src/Sqlite.ts";

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

  it("prepared statements are cached and reused", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table t (id integer primary key, name text);`);

    // Execute the same query twice — both should succeed via cached statement
    const insert1 = sqlite.exec(sql`insert into t (name) values (${"A"});`);
    const insert2 = sqlite.exec(sql`insert into t (name) values (${"B"});`);
    assertEqual(insert1.changes, 1);
    assertEqual(insert2.changes, 1);

    const rows = sqlite.exec(sql`select name from t order by id;`);
    assertEqual(rows.rows, [{ name: "A" }, { name: "B" }]);
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
