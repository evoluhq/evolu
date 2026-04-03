import { createSqlite, Name, sql, testCreateRun } from "@evolu/common";
import BetterSQLite from "better-sqlite3";
import { existsSync, unlinkSync } from "fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createBetterSqliteDriver } from "../src/Sqlite.js";

const testName = Name.orThrow("Test");

const setupBetterSqlite = async () => {
  await using stack = new AsyncDisposableStack();
  const run = stack.use(
    testCreateRun({ createSqliteDriver: createBetterSqliteDriver }),
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

describe("createBetterSqliteDriver", () => {
  test("creates in-memory database", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table t (data text);`);
    sqlite.exec(sql`insert into t (data) values (${"hello"});`);
    const rows = sqlite.exec(sql`select * from t;`);
    expect(rows.rows).toEqual([{ data: "hello" }]);
  });

  test("exec returns rows for reader queries", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table t (id integer primary key, name text);`);
    sqlite.exec(sql`insert into t (name) values (${"Alice"});`);
    sqlite.exec(sql`insert into t (name) values (${"Bob"});`);

    const rows = sqlite.exec(sql`select name from t order by id;`);
    expect(rows.rows).toEqual([{ name: "Alice" }, { name: "Bob" }]);
    expect(rows.changes).toBe(0);
  });

  test("exec returns changes for writer queries", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table t (id integer primary key, name text);`);
    sqlite.exec(sql`insert into t (name) values (${"Alice"});`);
    sqlite.exec(sql`insert into t (name) values (${"Bob"});`);

    const deleteResult = sqlite.exec(sql`delete from t;`);
    expect(deleteResult.rows).toEqual([]);
    expect(deleteResult.changes).toBe(2);
  });

  test("export returns serialized database bytes", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table t (data text);`);
    sqlite.exec(sql`insert into t (data) values (${"foo"});`);

    const exported = sqlite.export();
    expect(exported).toBeInstanceOf(Uint8Array);
    expect(exported.length).toBeGreaterThan(0);
  });

  test("export copies bytes when serialize is not backed by ArrayBuffer", async () => {
    const serialized = new Uint8Array(new SharedArrayBuffer(3));
    serialized.set([1, 2, 3]);

    using _serializeSpy = vi
      .spyOn(BetterSQLite.prototype, "serialize")
      .mockImplementation(() => serialized as Buffer);

    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    const exported = sqlite.export();

    expect(exported).toEqual(new Uint8Array([1, 2, 3]));
    expect(exported.buffer).toBeInstanceOf(ArrayBuffer);
  });

  test("dispose is idempotent", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    await sqlite[Symbol.asyncDispose]();
    await sqlite[Symbol.asyncDispose]();
  });

  test("prepared statements are cached and reused", async () => {
    await using setup = await setupBetterSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table t (id integer primary key, name text);`);

    // Execute the same query twice — both should succeed via cached statement
    const insert1 = sqlite.exec(sql`insert into t (name) values (${"A"});`);
    const insert2 = sqlite.exec(sql`insert into t (name) values (${"B"});`);
    expect(insert1.changes).toBe(1);
    expect(insert2.changes).toBe(1);

    const rows = sqlite.exec(sql`select name from t order by id;`);
    expect(rows.rows).toEqual([{ name: "A" }, { name: "B" }]);
  });

  test("driver dispose is idempotent", async () => {
    await using run = testCreateRun();
    const driver = await run.orThrow(
      createBetterSqliteDriver(testName, { mode: "memory" }),
    );

    driver[Symbol.dispose]();
    driver[Symbol.dispose]();
  });

  test("better-sqlite3 serialize returns Buffer backed by ArrayBuffer", () => {
    const db = new BetterSQLite(":memory:");
    db.exec("create table t (data text);");
    db.exec("insert into t (data) values ('x');");

    const serialized = db.serialize();

    expect(serialized).toBeInstanceOf(Uint8Array);
    expect(Buffer.isBuffer(serialized)).toBe(true);
    expect(serialized.buffer).toBeInstanceOf(ArrayBuffer);

    db.close();
  });

  describe("file-based database", () => {
    const dbPath = `${testName}.db`;

    afterEach(() => {
      if (existsSync(dbPath)) unlinkSync(dbPath);
    });

    test("creates database file on disk", async () => {
      await using run = testCreateRun();
      using _driver = await run.orThrow(createBetterSqliteDriver(testName));

      expect(existsSync(dbPath)).toBe(true);
    });
  });
});
