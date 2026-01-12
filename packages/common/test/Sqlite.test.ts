import BetterSQLite from "better-sqlite3";
import { existsSync, unlinkSync } from "fs";
import { assert, describe, expect, test } from "vitest";
import { constVoid } from "../src/Function.js";
import { err, getOrThrow } from "../src/Result.js";
import { createSqlite, isSqlMutation, sql } from "../src/Sqlite.js";
import type { SqliteDriver } from "../src/Sqlite.js";
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
        type: "UnknownError",
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
        type: "UnknownError",
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

// Speedup: 6.44x
test.skip("SQLite performance: individual queries vs CTE with concatenated blobs", () => {
  const dbFile = "performance-test.db";

  if (existsSync(dbFile)) unlinkSync(dbFile);
  const db = new BetterSQLite(dbFile);

  // Create test table with binary ID
  db.exec(`
    CREATE TABLE test_entities (
      id BLOB PRIMARY KEY,
      data TEXT
    );
  `);

  // Generate test data - 1000 random binary IDs (16 bytes each)
  const generateRandomId = (): Uint8Array => {
    const id = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      id[i] = Math.floor(Math.random() * 256);
    }
    return id;
  };

  const totalRows = 1000;
  const testIds: Array<Uint8Array> = [];

  // Insert test data
  const insertStmt = db.prepare(
    "INSERT INTO test_entities (id, data) VALUES (?, ?)",
  );
  for (let i = 0; i < totalRows; i++) {
    const id = generateRandomId();
    testIds.push(id);
    insertStmt.run(id, `test_data_${i}`);
  }

  // Generate query set: mix of existing and non-existing IDs
  const queryIds: Array<Uint8Array> = [];

  // Add 500 existing IDs (randomly selected)
  for (let i = 0; i < 500; i++) {
    const randomIndex = Math.floor(Math.random() * testIds.length);
    queryIds.push(testIds[randomIndex]);
  }

  // Add 500 non-existing IDs
  for (let i = 0; i < 500; i++) {
    queryIds.push(generateRandomId());
  }

  // Method 1: Individual queries
  // eslint-disable-next-line no-console
  console.log(
    `Testing ${queryIds.length} ID lookups against ${totalRows} rows`,
  );

  const individualStart = performance.now();
  const individualResults: Array<Uint8Array> = [];
  const selectStmt = db.prepare(
    "SELECT id FROM test_entities WHERE id = ? LIMIT 1",
  );

  for (const id of queryIds) {
    const result = selectStmt.get(id) as { id: Uint8Array } | undefined;
    if (result !== undefined) {
      individualResults.push(result.id);
    }
  }

  const individualTime = performance.now() - individualStart;

  // Method 2: Single CTE query with concatenated blob parameter
  const cteStart = performance.now();

  // Concatenate all IDs into a single blob
  const concatenatedIds = new Uint8Array(queryIds.length * 16);
  for (let i = 0; i < queryIds.length; i++) {
    concatenatedIds.set(queryIds[i], i * 16);
  }

  const cteStmt = db.prepare(`
    WITH RECURSIVE split_ids(id_blob, pos) AS (
      SELECT 
        substr(@concatenatedIds, 1, 16) as id_blob,
        17 as pos
      UNION ALL
      SELECT 
        substr(@concatenatedIds, pos, 16) as id_blob,
        pos + 16
      FROM split_ids 
      WHERE pos <= length(@concatenatedIds)
    )
    SELECT s.id_blob
    FROM split_ids s
    JOIN test_entities t ON s.id_blob = t.id;
  `);

  const cteResults = cteStmt.all({
    concatenatedIds: concatenatedIds,
  }) as Array<{
    id_blob: Uint8Array;
  }>;

  const cteTime = performance.now() - cteStart;

  // Verify results match exactly
  expect(cteResults.length).toBe(individualResults.length);

  // Sort both arrays for proper comparison
  const sortedIndividualResults = individualResults
    .slice()
    .sort((a, b) => a.toString().localeCompare(b.toString()));
  const sortedCteResults = cteResults
    .map((row) => row.id_blob)
    .sort((a, b) => a.toString().localeCompare(b.toString()));

  expect(sortedCteResults).toEqual(sortedIndividualResults);

  // eslint-disable-next-line no-console
  console.log(`Individual queries: ${individualTime.toFixed(2)}ms`);
  // eslint-disable-next-line no-console
  console.log(`CTE query: ${cteTime.toFixed(2)}ms`);
  // eslint-disable-next-line no-console
  console.log(`Speedup: ${(individualTime / cteTime).toFixed(2)}x`);

  // eslint-disable-next-line no-console
  console.log(
    `CTE approach is ${cteTime < individualTime ? "faster" : "slower"} than individual queries`,
  );

  db.close();
  unlinkSync(dbFile);
});

describe("isSqlMutation", () => {
  test("detects mutation statements", () => {
    expect(isSqlMutation("INSERT INTO users VALUES (1)")).toBe(true);
    expect(isSqlMutation("UPDATE users SET name = 'test'")).toBe(true);
    expect(isSqlMutation("DELETE FROM users")).toBe(true);
    expect(isSqlMutation("CREATE TABLE users (id INT)")).toBe(true);
    expect(isSqlMutation("DROP TABLE users")).toBe(true);
    expect(isSqlMutation("ALTER TABLE users ADD COLUMN name TEXT")).toBe(true);
    expect(isSqlMutation("REPLACE INTO users VALUES (1)")).toBe(true);
    expect(isSqlMutation("BEGIN TRANSACTION")).toBe(true);
    expect(isSqlMutation("COMMIT")).toBe(true);
    expect(isSqlMutation("ROLLBACK")).toBe(true);
    expect(isSqlMutation("PRAGMA journal_mode=WAL")).toBe(true);
    expect(isSqlMutation("VACUUM")).toBe(true);
  });

  test("detects mutations case-insensitively", () => {
    expect(isSqlMutation("insert into users values (1)")).toBe(true);
    expect(isSqlMutation("Insert Into users values (1)")).toBe(true);
    expect(isSqlMutation("INSERT into users values (1)")).toBe(true);
  });

  test("returns false for SELECT queries", () => {
    expect(isSqlMutation("SELECT * FROM users")).toBe(false);
    expect(isSqlMutation("SELECT id, name FROM users WHERE id = 1")).toBe(
      false,
    );
    expect(isSqlMutation("select * from users")).toBe(false);
  });

  test("ignores SQL comments when detecting mutations", () => {
    expect(isSqlMutation("-- INSERT INTO users\nSELECT * FROM users")).toBe(
      false,
    );
    expect(isSqlMutation("SELECT * FROM users -- UPDATE users")).toBe(false);
    expect(isSqlMutation("-- DELETE FROM users")).toBe(false);
    expect(
      isSqlMutation("-- This is a comment\nINSERT INTO users VALUES (1)"),
    ).toBe(true);
  });

  test("ignores comments in multiline SQL", () => {
    const multilineSelect = `
      -- This is a comment
      SELECT *
      FROM users -- inline comment
      WHERE id = 1
      -- another comment
    `;
    expect(isSqlMutation(multilineSelect)).toBe(false);

    const multilineInsert = `
      -- This is a comment
      INSERT INTO users
      VALUES (1, 'test') -- inline comment
      -- another comment
    `;
    expect(isSqlMutation(multilineInsert)).toBe(true);

    const commentedOutMutation = `
      -- INSERT INTO users VALUES (1)
      -- UPDATE users SET name = 'test'
      SELECT * FROM users
    `;
    expect(isSqlMutation(commentedOutMutation)).toBe(false);
  });

  test("handles strings with many comment markers without performance issues", () => {
    const manyComments = "-- ".repeat(1000) + "SELECT * FROM users";
    expect(isSqlMutation(manyComments)).toBe(false);

    const manyCommentsWithMutation =
      "-- ".repeat(1000) + "\nINSERT INTO users VALUES (1)";
    expect(isSqlMutation(manyCommentsWithMutation)).toBe(true);
  });
});
