import BetterSQLite from "better-sqlite3";
import { existsSync, unlinkSync } from "fs";
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
