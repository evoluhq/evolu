import {
  createSqlite,
  SimpleName,
  sql,
  testCreateRun,
  type CreateSqliteDriverDep,
} from "@evolu/common";
import { existsSync, unlinkSync } from "fs";
import { afterEach, assert, describe, expect, test } from "vitest";
import { createBetterSqliteDriver } from "../src/Sqlite.js";

const testName = SimpleName.orThrow("Test");

describe("createBetterSqliteDriver", () => {
  test("creates in-memory database", async () => {
    await using run = testCreateRun<CreateSqliteDriverDep>({
      createSqliteDriver: createBetterSqliteDriver,
    });
    const result = await run(createSqlite(testName, { mode: "memory" }));
    assert(result.ok);
    const sqlite = result.value;

    sqlite.exec(sql`create table t (data text);`);
    sqlite.exec(sql`insert into t (data) values (${"hello"});`);
    const rows = sqlite.exec(sql`select * from t;`);
    assert(rows.ok);
    expect(rows.value.rows).toEqual([{ data: "hello" }]);

    sqlite[Symbol.dispose]();
  });

  test("exec returns rows for reader queries", async () => {
    await using run = testCreateRun<CreateSqliteDriverDep>({
      createSqliteDriver: createBetterSqliteDriver,
    });
    const result = await run(createSqlite(testName, { mode: "memory" }));
    assert(result.ok);
    const sqlite = result.value;

    sqlite.exec(sql`create table t (id integer primary key, name text);`);
    sqlite.exec(sql`insert into t (name) values (${"Alice"});`);
    sqlite.exec(sql`insert into t (name) values (${"Bob"});`);

    const rows = sqlite.exec(sql`select name from t order by id;`);
    assert(rows.ok);
    expect(rows.value.rows).toEqual([{ name: "Alice" }, { name: "Bob" }]);
    expect(rows.value.changes).toBe(0);

    sqlite[Symbol.dispose]();
  });

  test("exec returns changes for writer queries", async () => {
    await using run = testCreateRun<CreateSqliteDriverDep>({
      createSqliteDriver: createBetterSqliteDriver,
    });
    const result = await run(createSqlite(testName, { mode: "memory" }));
    assert(result.ok);
    const sqlite = result.value;

    sqlite.exec(sql`create table t (id integer primary key, name text);`);
    sqlite.exec(sql`insert into t (name) values (${"Alice"});`);
    sqlite.exec(sql`insert into t (name) values (${"Bob"});`);

    const deleteResult = sqlite.exec(sql`delete from t;`);
    assert(deleteResult.ok);
    expect(deleteResult.value.rows).toEqual([]);
    expect(deleteResult.value.changes).toBe(2);

    sqlite[Symbol.dispose]();
  });

  test("export returns serialized database bytes", async () => {
    await using run = testCreateRun<CreateSqliteDriverDep>({
      createSqliteDriver: createBetterSqliteDriver,
    });
    const result = await run(createSqlite(testName, { mode: "memory" }));
    assert(result.ok);
    const sqlite = result.value;

    sqlite.exec(sql`create table t (data text);`);
    sqlite.exec(sql`insert into t (data) values (${"foo"});`);

    const exported = sqlite.export();
    assert(exported.ok);
    expect(exported.value).toBeInstanceOf(Uint8Array);
    expect(exported.value.length).toBeGreaterThan(0);

    sqlite[Symbol.dispose]();
  });

  test("dispose is idempotent", async () => {
    await using run = testCreateRun<CreateSqliteDriverDep>({
      createSqliteDriver: createBetterSqliteDriver,
    });
    const result = await run(createSqlite(testName, { mode: "memory" }));
    assert(result.ok);
    const sqlite = result.value;

    sqlite[Symbol.dispose]();
    sqlite[Symbol.dispose]();
  });

  test("prepared statements are cached and reused", async () => {
    await using run = testCreateRun<CreateSqliteDriverDep>({
      createSqliteDriver: createBetterSqliteDriver,
    });
    const result = await run(createSqlite(testName, { mode: "memory" }));
    assert(result.ok);
    const sqlite = result.value;

    sqlite.exec(sql`create table t (id integer primary key, name text);`);

    // Execute the same query twice — both should succeed via cached statement
    const insert1 = sqlite.exec(sql`insert into t (name) values (${"A"});`);
    const insert2 = sqlite.exec(sql`insert into t (name) values (${"B"});`);
    assert(insert1.ok);
    assert(insert2.ok);

    const rows = sqlite.exec(sql`select name from t order by id;`);
    assert(rows.ok);
    expect(rows.value.rows).toEqual([{ name: "A" }, { name: "B" }]);

    sqlite[Symbol.dispose]();
  });

  test("driver dispose is idempotent", async () => {
    await using run = testCreateRun();
    const task = createBetterSqliteDriver(testName, { mode: "memory" });
    const result = await run(task);
    assert(result.ok);
    const driver = result.value;

    driver[Symbol.dispose]();
    driver[Symbol.dispose]();
  });

  describe("file-based database", () => {
    const dbPath = `${testName}.db`;

    afterEach(() => {
      if (existsSync(dbPath)) unlinkSync(dbPath);
    });

    test("creates database file on disk", async () => {
      await using run = testCreateRun();
      const task = createBetterSqliteDriver(testName);
      const result = await run(task);
      assert(result.ok);
      const driver = result.value;

      expect(existsSync(dbPath)).toBe(true);
      driver[Symbol.dispose]();
    });
  });
});
