import { assert, expect, expectTypeOf, test } from "vitest";
import { constVoid } from "../src/Function.js";
import { err, getOrThrow, ok } from "../src/Result.js";
import {
  createSqlite,
  sql,
  SqliteBoolean,
  SqliteDriver,
} from "../src/Sqlite.js";
import { BooleanError } from "../src/Type.js";
import { testCreateSqliteDriver, testSimpleName } from "./_deps.js";

const createTestSqlite = async (consoleArgs?: Array<any>) => {
  const sqlite = await createSqlite({
    createSqliteDriver: testCreateSqliteDriver,
    console: {
      log: (...args) => consoleArgs?.push(args),
    } as Console,
  })(testSimpleName, { memory: true });
  return getOrThrow(sqlite);
};

test("basic DDL/DML works", async () => {
  const sqlite = await createTestSqlite();
  expect(sqlite.exec(sql`create table a (data);`).ok).toBe(true);
  expect(sqlite.exec(sql`insert into a (data) values (${"foo"});`).ok).toBe(
    true,
  );
  const result = sqlite.exec(sql`select * from a;`);
  assert(result.ok);
  expect(result.value.rows).toEqual([{ data: "foo" }]);
});

test("transaction fails and rolls back on SQL error", async () => {
  const consoleArgs: Array<any> = [];
  const sqlite = await createTestSqlite(consoleArgs);
  sqlite.exec(sql`create table a (data);`);
  const result = sqlite.transaction(() =>
    sqlite.exec(sql`insert into notexisting (data) values (${"foo"});`),
  );
  expect(result).toMatchObject(
    err({
      type: "SqliteError",
      error: {
        type: "TransferableError",
        error: {
          code: "SQLITE_ERROR",
          message: "no such table: notexisting",
        },
      },
    }),
  );
  expect(consoleArgs).toMatchInlineSnapshot(`
    [
      [
        "[sql]",
        {
          "query": {
            "parameters": [],
            "sql": "create table a (data);",
          },
        },
      ],
      [
        "[sql]",
        {
          "result": {
            "changes": 0,
            "rows": [],
          },
        },
      ],
      [
        "[sql] begin",
      ],
      [
        "[sql]",
        {
          "query": {
            "parameters": [
              "foo",
            ],
            "sql": "insert into notexisting (data) values (?);",
          },
        },
      ],
      [
        "[sql] rollback",
      ],
    ]
  `);
});

test("transaction fails and rolls back on callback error", async () => {
  const consoleArgs: Array<any> = [];
  const sqlite = await createTestSqlite(consoleArgs);
  sqlite.exec(sql`create table a (data);`);
  const result = sqlite.transaction(() =>
    err({ type: "CallbackError", message: "Something went wrong" }),
  );
  expect(result).toEqual(
    err({ type: "CallbackError", message: "Something went wrong" }),
  );
  expect(consoleArgs).toMatchInlineSnapshot(`
    [
      [
        "[sql]",
        {
          "query": {
            "parameters": [],
            "sql": "create table a (data);",
          },
        },
      ],
      [
        "[sql]",
        {
          "result": {
            "changes": 0,
            "rows": [],
          },
        },
      ],
      [
        "[sql] begin",
      ],
      [
        "[sql] rollback",
      ],
    ]
  `);
});

test("transaction succeeds and commits", async () => {
  const sqlite = await createTestSqlite();
  sqlite.exec(sql`create table a (data);`);
  const result = sqlite.transaction(() =>
    sqlite.exec(sql`insert into a (data) values (${"bar"});`),
  );
  expect(result.ok).toBe(true);
  expect(sqlite.exec(sql`select * from a;`)).toMatchInlineSnapshot(`
    {
      "ok": true,
      "value": {
        "changes": 0,
        "rows": [
          {
            "data": "bar",
          },
        ],
      },
    }
  `);
});

test("transaction callback returns error", async () => {
  const sqlite = await createTestSqlite();
  const result = sqlite.transaction(() => err({ type: "CustomError" }));
  expect(result).toEqual(err({ type: "CustomError" }));
});

test("transaction callback error and rollback fails", async () => {
  let rollbackCalled = false;

  // Custom driver that fails on rollback
  const driver: SqliteDriver = {
    exec: (query) => {
      if (query.sql === "rollback;") {
        rollbackCalled = true;
        throw new Error("Rollback failed");
      }
      const emptyResult = { rows: [], changes: 0 };
      if (query.sql === "begin;") return emptyResult;
      if (query.sql === "commit;") return emptyResult;
      return emptyResult;
    },
    export: () => new Uint8Array(),
    [Symbol.dispose]: constVoid,
  };
  const sqlite = getOrThrow(
    await createSqlite({
      createSqliteDriver: () => Promise.resolve(driver),
    })(testSimpleName),
  );

  const result = sqlite.transaction(() => err({ type: "CallbackError" }));

  expect(rollbackCalled).toBe(true);
  expect(result).toMatchObject(
    err({
      type: "SqliteError",
      error: {
        type: "TransferableError",
        error: { type: "CallbackError" },
      },
      rollbackError: { error: { message: "Rollback failed" } },
    }),
  );
});

test("sql", () => {
  expect(sql`select * from users where id = ${1};`).toEqual({
    sql: "select * from users where id = ?;",
    parameters: [1],
  });

  expect(sql`
    insert into users (name, age) values (${"Alice"}, ${30});
  `).toEqual({
    sql: `
    insert into users (name, age) values (?, ?);
  `,
    parameters: ["Alice", 30],
  });

  expect(sql.identifier("user_table")).toEqual({
    type: "SqlIdentifier",
    sql: '"user_table"',
  });

  expect(sql.raw("abc")).toEqual({
    type: "RawSql",
    sql: "abc",
  });

  expect(sql`select ${sql.identifier("columnName")} from users;`).toEqual({
    sql: 'select "columnName" from users;',
    parameters: [],
  });

  expect(sql.prepared`select * from users where id = ${2};`).toEqual({
    sql: "select * from users where id = ?;",
    parameters: [2],
    options: { prepare: true },
  });
});

test("SqliteBoolean", () => {
  expect(SqliteBoolean.from(false)).toStrictEqual(ok(0));
  expect(SqliteBoolean.from(true)).toStrictEqual(ok(1));

  expectTypeOf<SqliteBoolean>().toEqualTypeOf<0 | 1>();
  expectTypeOf<typeof SqliteBoolean.Error>().toEqualTypeOf<never>();
  expectTypeOf<
    typeof SqliteBoolean.ParentError
  >().toEqualTypeOf<BooleanError>();
});
