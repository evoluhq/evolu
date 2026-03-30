import { assert, describe, expect, expectTypeOf, test } from "vitest";
import { lazyVoid } from "../src/Function.js";
import { err, ok } from "../src/Result.js";
import {
  booleanToSqliteBoolean,
  createPreparedStatementsCache,
  createSqlite,
  eqSqliteIndex,
  eqSqliteValue,
  getSqliteSchema,
  getSqliteSnapshot,
  sql,
  sqliteBooleanToBoolean,
  sqliteFalse,
  sqliteQueryStringToSqliteQuery,
  sqliteQueryToSqliteQueryString,
  sqliteTrue,
  testCreateRunWithSqlite,
  type CreateSqliteDriver,
  type SafeSql,
  type SqliteDriver,
  type SqliteQuery,
  type SqliteQueryString,
  type SqliteValue,
} from "../src/Sqlite.js";
import { sleep } from "../src/Task.js";
import { testCreateRun } from "../src/Test.js";
import { testName } from "../src/Type.js";
import { testCreateSqliteDeps } from "./_deps.js";

describe("eqSqliteValue", () => {
  test("equal Uint8Arrays return true", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(eqSqliteValue(a, b)).toBe(true);
  });

  test("different Uint8Arrays return false", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5, 6]);
    expect(eqSqliteValue(a, b)).toBe(false);
  });

  test("equal primitives return true", () => {
    expect(eqSqliteValue(42, 42)).toBe(true);
    expect(eqSqliteValue("hello", "hello")).toBe(true);
    expect(eqSqliteValue(null, null)).toBe(true);
  });

  test("different primitives return false", () => {
    expect(eqSqliteValue(1, 2)).toBe(false);
    expect(eqSqliteValue("a", "b")).toBe(false);
    expect(eqSqliteValue(null, 0)).toBe(false);
  });

  test("SqliteValue type is null | string | number | Uint8Array", () => {
    expectTypeOf<SqliteValue>().toEqualTypeOf<
      null | string | number | Uint8Array
    >();
  });
});

describe("SqliteQueryString", () => {
  test("sqliteQueryToSqliteQueryString and sqliteQueryStringToSqliteQuery round-trip", () => {
    const binaryData = new Uint8Array([1, 3, 2]);
    const sqliteQuery: SqliteQuery = {
      sql: "a" as SafeSql,
      parameters: [null, "a", 1, binaryData],
    };

    expect(
      sqliteQueryStringToSqliteQuery(
        sqliteQueryToSqliteQueryString(sqliteQuery),
      ),
    ).toStrictEqual(sqliteQuery);
  });

  test("sqliteQueryToSqliteQueryString sorts options and restores them", () => {
    const sqliteQuery: SqliteQuery = {
      sql: "select 1" as SafeSql,
      parameters: [],
      options: {
        prepare: true,
        logQueryExecutionTime: true,
        logExplainQueryPlan: true,
      },
    };

    const sqliteQueryString = sqliteQueryToSqliteQueryString(sqliteQuery);
    const [, , optionsArr] = JSON.parse(sqliteQueryString) as [
      SafeSql,
      Array<unknown>,
      Array<readonly [string, unknown]>,
    ];

    expect(optionsArr.map(([key]) => key)).toEqual([
      "logExplainQueryPlan",
      "logQueryExecutionTime",
      "prepare",
    ]);
    expect(sqliteQueryStringToSqliteQuery(sqliteQueryString)).toStrictEqual(
      sqliteQuery,
    );
  });

  test("SqliteQueryString is a branded string", () => {
    expectTypeOf<SqliteQueryString>().toExtend<string>();
  });
});

test("basic DDL/DML works", async () => {
  await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
  const { sqlite } = run.deps;

  sqlite.exec(sql`create table a (data);`);
  sqlite.exec(sql`insert into a (data) values (${"foo"});`);
  const result = sqlite.exec(sql`select * from a;`);
  expect(result.rows).toEqual([{ data: "foo" }]);
});

describe("transactions", () => {
  test("transaction fails and rolls back on SQL error", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite, console } = run.deps;

    sqlite.exec(sql`create table a (data);`);

    const action = () =>
      sqlite.transaction(() =>
        ok(sqlite.exec(sql`insert into notexisting (data) values (${"foo"});`)),
      );

    expect(action).toThrow();

    const rows = sqlite.exec(sql`select * from a;`);
    expect(rows.rows).toEqual([]);

    const entries = console.getEntriesSnapshot();
    const debugLogs = entries.filter((e) => e.method === "debug");
    expect(debugLogs.map((e) => e.args[0])).toContain("rollback");
  });

  test("transaction fails and rolls back on callback error", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite, console } = run.deps;

    sqlite.exec(sql`create table a (data);`);

    const result = sqlite.transaction(() => {
      sqlite.exec(sql`insert into a (data) values (${"foo"});`);
      return err({ type: "CustomError" });
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("CustomError");
    }

    const rows = sqlite.exec(sql`select * from a;`);
    expect(rows.rows).toEqual([]);

    const entries = console.getEntriesSnapshot();
    const debugLogs = entries.filter((e) => e.method === "debug");
    expect(debugLogs.map((e) => e.args[0])).toContain("rollback");
  });

  test("transaction succeeds and commits", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    sqlite.exec(sql`create table a (data);`);

    const result = sqlite.transaction(() => {
      sqlite.exec(sql`insert into a (data) values (${"bar"});`);
      return ok();
    });

    expect(result.ok).toBe(true);

    const rows = sqlite.exec(sql`select * from a;`);
    expect(rows.rows).toEqual([{ data: "bar" }]);
  });

  test("transaction callback returns error", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    const result = sqlite.transaction(() => err({ type: "CustomError" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("CustomError");
    }
  });

  test("begin failure does not attempt rollback", async () => {
    let beginCalled = false;
    let rollbackCalled = false;

    const createFailingDriver: CreateSqliteDriver = () => () => {
      const driver: SqliteDriver = {
        exec: (query) => {
          if (query.sql === "begin;") {
            beginCalled = true;
            throw new Error("Begin failed");
          }
          if (query.sql === "rollback;") {
            rollbackCalled = true;
          }
          return { rows: [], changes: 0 };
        },
        export: () => new Uint8Array(),
        [Symbol.dispose]: () => {
          // No cleanup needed
        },
      };
      return ok(driver);
    };

    await using run = testCreateRun({
      createSqliteDriver: createFailingDriver,
    });
    const sqliteResult = await run(createSqlite(testName));
    assert(sqliteResult.ok);
    const sqlite = sqliteResult.value;

    expect(() => sqlite.transaction(() => ok("should not reach"))).toThrow();

    expect(beginCalled).toBe(true);
    expect(rollbackCalled).toBe(false);
  });

  test("transaction rolls back when callback throws", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    sqlite.exec(sql`create table a (data);`);

    const action = () =>
      sqlite.transaction(() => {
        sqlite.exec(sql`insert into a (data) values (${"boom"});`);
        throw new Error("Callback failed");
      });

    expect(action).toThrow();

    const rows = sqlite.exec(sql`select * from a;`);
    expect(rows.rows).toEqual([]);
  });

  test("rollback failure throws rollback error", async () => {
    let rollbackCalled = false;

    const createFailingDriver: CreateSqliteDriver = () => () => {
      const driver: SqliteDriver = {
        exec: (query) => {
          if (query.sql === "begin;") {
            return { rows: [], changes: 0 };
          }
          if (query.sql === "rollback;") {
            rollbackCalled = true;
            throw new Error("Rollback failed");
          }
          throw new Error("Query failed");
        },
        export: () => new Uint8Array(),
        [Symbol.dispose]: () => {
          // No cleanup needed
        },
      };
      return ok(driver);
    };

    await using run = testCreateRun({
      createSqliteDriver: createFailingDriver,
    });
    const sqliteResult = await run(createSqlite(testName));
    assert(sqliteResult.ok);
    const sqlite = sqliteResult.value;

    expect(() =>
      sqlite.transaction(() => ok(sqlite.exec(sql`select * from users;`))),
    ).toThrow();
    expect(rollbackCalled).toBe(true);
  });

  test("transaction commit failure triggers rollback", async () => {
    let commitCalled = false;
    let rollbackCalled = false;

    const createFailingDriver: CreateSqliteDriver = () => () => {
      const driver: SqliteDriver = {
        exec: (query) => {
          if (query.sql === "begin;") {
            return { rows: [], changes: 0 };
          }
          if (query.sql === "commit;") {
            commitCalled = true;
            throw new Error("Commit failed");
          }
          if (query.sql === "rollback;") {
            rollbackCalled = true;
            return { rows: [], changes: 0 };
          }
          return { rows: [], changes: 0 };
        },
        export: () => new Uint8Array(),
        [Symbol.dispose]: lazyVoid,
      };
      return ok(driver);
    };

    await using run = testCreateRun({
      createSqliteDriver: createFailingDriver,
    });
    const sqliteResult = await run(createSqlite(testName));
    assert(sqliteResult.ok);
    const sqlite = sqliteResult.value;

    expect(() => sqlite.transaction(() => ok("data"))).toThrow();
    expect(commitCalled).toBe(true);
    expect(rollbackCalled).toBe(true);
  });
});

describe("export", () => {
  test("export returns database bytes", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    sqlite.exec(sql`create table a (data);`);
    sqlite.exec(sql`insert into a (data) values (${"foo"});`);

    const result = sqlite.export();
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  test("export failure throws", async () => {
    const createFailingDriver: CreateSqliteDriver = () => () => {
      const driver: SqliteDriver = {
        exec: () => ({ rows: [], changes: 0 }),
        export: () => {
          throw new Error("Export failed");
        },
        [Symbol.dispose]: lazyVoid,
      };
      return ok(driver);
    };

    await using run = testCreateRun({
      createSqliteDriver: createFailingDriver,
    });
    const sqliteResult = await run(createSqlite(testName));
    assert(sqliteResult.ok);
    const sqlite = sqliteResult.value;

    expect(() => sqlite.export()).toThrow("Export failed");
  });
});

test("logQueryExecutionTime logs timing", async () => {
  await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
  const { sqlite, console } = run.deps;

  sqlite.exec(sql`create table a (data);`);

  const query = sql`select * from a;`;
  sqlite.exec({ ...query, options: { logQueryExecutionTime: true } });

  const entries = console.getEntriesSnapshot();
  const timeLogs = entries.filter((e) => e.method === "time");
  expect(timeLogs.length).toBeGreaterThan(0);
  const timeEndLogs = entries.filter((e) => e.method === "timeEnd");
  expect(timeEndLogs.length).toBeGreaterThan(0);
});

describe("logExplainQueryPlan", () => {
  test("logs query plan when option is set", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    sqlite.exec(sql`create table users (id text, name text);`);
    run.deps.console.clearEntries();

    const query: Parameters<typeof sqlite.exec>[0] = {
      ...sql`select * from users;`,
      options: { logExplainQueryPlan: true },
    };
    const result = sqlite.exec(query);

    expect(result.rows).toEqual([]);

    const entries = run.deps.console.getEntriesSnapshot();
    const logEntries = entries.filter(
      (e) => e.method === "log" && e.path.includes("sql"),
    );
    expect(logEntries.length).toBeGreaterThanOrEqual(2);
    expect(logEntries[0].args[0]).toBe("[logExplainQueryPlan]");
  });

  test("draws nested query plan with indentation", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    sqlite.exec(sql`create table t1 (id text primary key, data text);`);
    sqlite.exec(sql`create table t2 (id text primary key, ref text);`);
    run.deps.console.clearEntries();

    // UNION produces nested EQP output with parent references
    const query: Parameters<typeof sqlite.exec>[0] = {
      ...sql`
        select id from t1
        union
        select id from t2;
      `,
      options: { logExplainQueryPlan: true },
    };
    sqlite.exec(query);

    const entries = run.deps.console.getEntriesSnapshot();
    const planEntry = entries.find(
      (e) =>
        e.method === "log" &&
        e.args.some((arg) => typeof arg === "string" && arg.includes("SCAN")),
    );
    expect(planEntry).toBeDefined();
    // Nested rows produce leading spaces
    const planOutput = planEntry!.args.find(
      (arg) => typeof arg === "string" && arg.includes("SCAN"),
    ) as string;
    expect(planOutput).toMatch(/^ {2}/m);
  });
});

test("async dispose is idempotent", async () => {
  let driverDisposeCount = 0;
  await using run = testCreateRun({
    createSqliteDriver: () => () => {
      const driver: SqliteDriver = {
        exec: () => ({ rows: [], changes: 0 }),
        export: () => new Uint8Array(),
        [Symbol.dispose]: () => {
          driverDisposeCount++;
        },
      };
      return ok(driver);
    },
  });
  const sqliteResult = await run(createSqlite(testName));
  assert(sqliteResult.ok);
  const sqlite = sqliteResult.value;

  await sqlite[Symbol.asyncDispose]();
  await sqlite[Symbol.asyncDispose]();
  expect(driverDisposeCount).toBe(1);
});

test("sync methods throw after sqlite is disposed", async () => {
  let execCalls = 0;
  let exportCalls = 0;

  await using run = testCreateRun({
    createSqliteDriver: () => () => {
      const driver: SqliteDriver = {
        exec: () => {
          execCalls++;
          return { rows: [], changes: 0 };
        },
        export: () => {
          exportCalls++;
          return new Uint8Array();
        },
        [Symbol.dispose]: lazyVoid,
      };
      return ok(driver);
    },
  });

  const sqliteResult = await run(createSqlite(testName));
  assert(sqliteResult.ok);
  const sqlite = sqliteResult.value;

  await sqlite[Symbol.asyncDispose]();

  expect(() => sqlite.exec(sql`select 1;`)).toThrow(
    "Expected value to not be disposed.",
  );
  expect(() =>
    sqlite.transaction(() => {
      throw new Error("should not run");
    }),
  ).toThrow("Expected value to not be disposed.");
  expect(() => sqlite.export()).toThrow("Expected value to not be disposed.");

  expect(execCalls).toBe(0);
  expect(exportCalls).toBe(0);
});

test("createSqlite returns error when driver creation is aborted", async () => {
  const createSlowDriver: CreateSqliteDriver = () => async (run) => {
    await run(sleep("10ms"));
    return ok({
      exec: () => ({ rows: [], changes: 0 }),
      export: () => new Uint8Array(),
      [Symbol.dispose]: lazyVoid,
    });
  };

  await using run = testCreateRun({
    createSqliteDriver: createSlowDriver,
  });

  const fiber = run(createSqlite(testName));
  fiber.abort("test");
  const result = await fiber;

  expect(result).toEqual(err({ type: "AbortError", reason: "test" }));
});

describe("createPreparedStatementsCache", () => {
  test("returns null when prepare option is not set", () => {
    const cache = createPreparedStatementsCache(
      (s) => ({ prepared: s }),
      lazyVoid,
    );
    const query = { sql: "select 1;" as SafeSql, parameters: [] };
    expect(cache.get(query)).toBeNull();
  });

  test("creates and caches statement with prepare option", () => {
    let factoryCalls = 0;
    const cache = createPreparedStatementsCache((s) => {
      factoryCalls++;
      return { prepared: s };
    }, lazyVoid);
    const query = {
      sql: "select 1;" as SafeSql,
      parameters: [],
      options: { prepare: true },
    };

    const first = cache.get(query);
    const second = cache.get(query);

    expect(first).toEqual({ prepared: "select 1;" });
    expect(first).toBe(second);
    expect(factoryCalls).toBe(1);
  });

  test("creates statement when alwaysPrepare is true", () => {
    const cache = createPreparedStatementsCache(
      (s) => ({ prepared: s }),
      lazyVoid,
    );
    const query = { sql: "select 1;" as SafeSql, parameters: [] };

    const result = cache.get(query, true);
    expect(result).toEqual({ prepared: "select 1;" });
  });

  test("dispose calls disposeFn for each cached statement", () => {
    const disposed: Array<string> = [];
    const cache = createPreparedStatementsCache(
      (s) => s,
      (s) => disposed.push(s),
    );

    cache.get({
      sql: "a;" as SafeSql,
      parameters: [],
      options: { prepare: true },
    });
    cache.get({
      sql: "b;" as SafeSql,
      parameters: [],
      options: { prepare: true },
    });

    cache[Symbol.dispose]();
    expect(disposed).toEqual(["a;", "b;"]);
  });

  test("dispose is idempotent", () => {
    let disposeCount = 0;
    const cache = createPreparedStatementsCache(
      (s) => s,
      () => disposeCount++,
    );
    cache.get({
      sql: "a;" as SafeSql,
      parameters: [],
      options: { prepare: true },
    });

    cache[Symbol.dispose]();
    cache[Symbol.dispose]();
    expect(disposeCount).toBe(1);
  });
});

describe("sql", () => {
  test("sql template binds parameters", () => {
    expect(sql`select * from users where id = ${1};`).toEqual({
      sql: "select * from users where id = ?;",
      parameters: [1],
    });

    expect(sql`
      insert into users (name, age) values (${"Alice"}, ${30});
    `).toEqual({
      sql: "insert into users (name, age) values (?, ?);",
      parameters: ["Alice", 30],
    });
  });

  test("sql.identifier wraps in double quotes", () => {
    expect(sql.identifier("user_table")).toEqual({
      type: "SqlIdentifier",
      sql: '"user_table"',
    });
  });

  test("sql.identifier escapes embedded double quotes", () => {
    expect(sql.identifier('col"name')).toEqual({
      type: "SqlIdentifier",
      sql: '"col""name"',
    });
  });

  test("sql.identifier embeds in composed query", () => {
    expect(sql`select ${sql.identifier("columnName")} from users;`).toEqual({
      sql: 'select "columnName" from users;',
      parameters: [],
    });
  });

  test("sql.raw creates unescaped fragment", () => {
    expect(sql.raw("abc")).toEqual({
      type: "RawSql",
      sql: "abc",
    });
  });

  test("sql.raw is embedded verbatim in composed query", () => {
    const query = sql`
      select * from users order by ${sql.raw("created_at desc")};
    `;
    expect(query).toEqual({
      sql: "select * from users order by created_at desc;",
      parameters: [],
    });
  });

  test("sql.prepared marks query for preparation", () => {
    expect(sql.prepared`select * from users where id = ${2};`).toEqual({
      sql: "select * from users where id = ?;",
      parameters: [2],
      options: { prepare: true },
    });
  });

  test("sql.prepared with identifier", () => {
    const query = sql.prepared`
      select ${sql.identifier("name")} from users where id = ${1};
    `;
    expect(query).toEqual({
      sql: 'select "name" from users where id = ?;',
      parameters: [1],
      options: { prepare: true },
    });
  });

  test("sql trims leading and trailing whitespace", () => {
    const query = sql` select 1; `;
    expect(query.sql).toBe("select 1;");
  });
});

describe("SqliteBoolean", () => {
  test("sqliteTrue is 1", () => {
    expect(sqliteTrue).toBe(1);
  });

  test("sqliteFalse is 0", () => {
    expect(sqliteFalse).toBe(0);
  });

  test("booleanToSqliteBoolean converts true to 1", () => {
    expect(booleanToSqliteBoolean(true)).toBe(1);
  });

  test("booleanToSqliteBoolean converts false to 0", () => {
    expect(booleanToSqliteBoolean(false)).toBe(0);
  });

  test("sqliteBooleanToBoolean converts 1 to true", () => {
    expect(sqliteBooleanToBoolean(1)).toBe(true);
  });

  test("sqliteBooleanToBoolean converts 0 to false", () => {
    expect(sqliteBooleanToBoolean(0)).toBe(false);
  });
});

describe("eqSqliteIndex", () => {
  test("returns true for same name and sql", () => {
    const a = { name: "my_index", sql: "create index my_index on a (b)" };
    const b = { name: "my_index", sql: "create index my_index on a (b)" };
    expect(eqSqliteIndex(a, b)).toBe(true);
  });

  test("returns false for different name", () => {
    const a = { name: "my_index", sql: "create index my_index on a (b)" };
    const b = {
      name: "my_other_index",
      sql: "create index my_index on a (b)",
    };
    expect(eqSqliteIndex(a, b)).toBe(false);
  });

  test("returns false for different sql", () => {
    const a = { name: "my_index", sql: "create index my_index on a (b)" };
    const b = {
      name: "my_index",
      sql: "create unique index my_index on a (b)",
    };
    expect(eqSqliteIndex(a, b)).toBe(false);
  });
});

describe("getSqliteSchema", () => {
  const toSnapshot = (schema: ReturnType<ReturnType<typeof getSqliteSchema>>) =>
    JSON.parse(
      JSON.stringify({
        tables: Object.fromEntries(
          Object.entries(schema.tables)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([tableName, columns]) => [tableName, [...columns].sort()]),
        ),
        indexes: [...schema.indexes]
          .map(({ name, sql }) => ({ name, sql }))
          .sort(
            (a, b) =>
              a.name.localeCompare(b.name) || a.sql.localeCompare(b.sql),
          ),
      }),
    ) as {
      tables: Record<string, Array<string>>;
      indexes: Array<{ name: string; sql: string }>;
    };

  test("returns tables and user indexes by default", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    sqlite.exec(sql`create table todos (id text primary key, title text);`);
    sqlite.exec(sql`create index idx_todos_title on todos (title);`);

    const schema = getSqliteSchema(run.deps)();

    expect(toSnapshot(schema)).toMatchInlineSnapshot(`
      {
        "indexes": [
          {
            "name": "idx_todos_title",
            "sql": "create index idx_todos_title on todos (title)",
          },
        ],
        "tables": {
          "todos": [
            "id",
            "title",
          ],
        },
      }
    `);
  });

  test("normalizes CREATE INDEX and CREATE UNIQUE INDEX casing", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    sqlite.exec(sql`create table users (id text primary key, email text);`);
    sqlite.exec(sql`create index idx_users_email on users (email);`);
    sqlite.exec(sql`
      create unique index idx_users_email_unique on users (email);
    `);

    const schema = getSqliteSchema(run.deps)();

    expect(toSnapshot(schema)).toMatchInlineSnapshot(`
      {
        "indexes": [
          {
            "name": "idx_users_email",
            "sql": "create index idx_users_email on users (email)",
          },
          {
            "name": "idx_users_email_unique",
            "sql": "create unique index idx_users_email_unique on users (email)",
          },
        ],
        "tables": {
          "users": [
            "email",
            "id",
          ],
        },
      }
    `);
  });

  test("excludeIndexNamePrefix filters indexes in SQL query", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    sqlite.exec(sql`create table t (id text primary key, value text);`);
    sqlite.exec(sql`create index evolu_idx_value on t (value);`);
    sqlite.exec(sql`create index app_idx_value on t (value);`);

    const schema = getSqliteSchema(run.deps)({
      excludeIndexNamePrefix: "evolu_",
    });

    expect(toSnapshot(schema)).toMatchInlineSnapshot(`
      {
        "indexes": [
          {
            "name": "app_idx_value",
            "sql": "create index app_idx_value on t (value)",
          },
        ],
        "tables": {
          "t": [
            "id",
            "value",
          ],
        },
      }
    `);
  });

  test("excludeIndexNamePrefix escapes single quote safely", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    expect(sqlite).toBeDefined();

    const schema = getSqliteSchema(run.deps)({
      excludeIndexNamePrefix: "abc'xyz",
    });

    expect(toSnapshot(schema)).toMatchInlineSnapshot(`
      {
        "indexes": [],
        "tables": {},
      }
    `);
  });

  test("sqlite_master index query returns empty rows on empty database", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    const withoutInternalFilter = sqlite.exec<{
      name: string;
      sql: string | null;
    }>(sql`
      select name, sql
      from sqlite_master
      where type = 'index';
    `);

    const withInternalFilter = sqlite.exec<{
      name: string;
      sql: string | null;
    }>(sql`
      select name, sql
      from sqlite_master
      where type = 'index' and name not like 'sqlite_%';
    `);

    expect(withoutInternalFilter.rows).toEqual([]);
    expect(withInternalFilter.rows).toEqual([]);
  });
});

describe("getSqliteSnapshot", () => {
  test("returns schema and table rows", async () => {
    await using run = await testCreateRunWithSqlite(testCreateSqliteDeps);
    const { sqlite } = run.deps;

    sqlite.exec(sql`create table t (id text primary key, value text);`);
    sqlite.exec(sql`create index idx_t_value on t (value);`);
    sqlite.exec(sql`insert into t (id, value) values (${"a"}, ${"one"});`);

    const snapshot = getSqliteSnapshot(run.deps);

    expect([...snapshot.schema.tables.t]).toEqual(["id", "value"]);
    expect(snapshot.schema.indexes).toEqual([
      {
        name: "idx_t_value",
        sql: "create index idx_t_value on t (value)",
      },
    ]);
    expect(snapshot.tables).toEqual([
      {
        name: "t",
        rows: [{ id: "a", value: "one" }],
      },
    ]);
  });
});

// // Speedup: 6.44x
// test.skip("SQLite performance: individual queries vs CTE with concatenated blobs", () => {
//   const dbFile = "performance-test.db";

//   if (existsSync(dbFile)) unlinkSync(dbFile);
//   const db = new BetterSQLite(dbFile);

//   // Create test table with binary ID
//   db.exec(`
//     CREATE TABLE test_entities (
//       id BLOB PRIMARY KEY,
//       data TEXT
//     );
//   `);

//   // Generate test data - 1000 random binary IDs (16 bytes each)
//   const generateRandomId = (): Uint8Array => {
//     const id = new Uint8Array(16);
//     for (let i = 0; i < 16; i++) {
//       id[i] = Math.floor(Math.random() * 256);
//     }
//     return id;
//   };

//   const totalRows = 1000;
//   const testIds: Array<Uint8Array> = [];

//   // Insert test data
//   const insertStmt = db.prepare(
//     "INSERT INTO test_entities (id, data) VALUES (?, ?)",
//   );
//   for (let i = 0; i < totalRows; i++) {
//     const id = generateRandomId();
//     testIds.push(id);
//     insertStmt.run(id, `test_data_${i}`);
//   }

//   // Generate query set: mix of existing and non-existing IDs
//   const queryIds: Array<Uint8Array> = [];

//   // Add 500 existing IDs (randomly selected)
//   for (let i = 0; i < 500; i++) {
//     const randomIndex = Math.floor(Math.random() * testIds.length);
//     queryIds.push(testIds[randomIndex]);
//   }

//   // Add 500 non-existing IDs
//   for (let i = 0; i < 500; i++) {
//     queryIds.push(generateRandomId());
//   }

//   // Method 1: Individual queries
//   // eslint-disable-next-line no-console
//   console.log(
//     `Testing ${queryIds.length} ID lookups against ${totalRows} rows`,
//   );

//   const individualStart = performance.now();
//   const individualResults: Array<Uint8Array> = [];
//   const selectStmt = db.prepare(
//     "SELECT id FROM test_entities WHERE id = ? LIMIT 1",
//   );

//   for (const id of queryIds) {
//     const result = selectStmt.get(id) as { id: Uint8Array } | undefined;
//     if (result !== undefined) {
//       individualResults.push(result.id);
//     }
//   }

//   const individualTime = performance.now() - individualStart;

//   // Method 2: Single CTE query with concatenated blob parameter
//   const cteStart = performance.now();

//   // Concatenate all IDs into a single blob
//   const concatenatedIds = new Uint8Array(queryIds.length * 16);
//   for (let i = 0; i < queryIds.length; i++) {
//     concatenatedIds.set(queryIds[i], i * 16);
//   }

//   const cteStmt = db.prepare(`
//     WITH RECURSIVE split_ids(id_blob, pos) AS (
//       SELECT
//         substr(@concatenatedIds, 1, 16) as id_blob,
//         17 as pos
//       UNION ALL
//       SELECT
//         substr(@concatenatedIds, pos, 16) as id_blob,
//         pos + 16
//       FROM split_ids
//       WHERE pos <= length(@concatenatedIds)
//     )
//     SELECT s.id_blob
//     FROM split_ids s
//     JOIN test_entities t ON s.id_blob = t.id;
//   `);

//   const cteResults = cteStmt.all({
//     concatenatedIds: concatenatedIds,
//   }) as Array<{
//     id_blob: Uint8Array;
//   }>;

//   const cteTime = performance.now() - cteStart;

//   // Verify results match exactly
//   expect(cteResults.length).toBe(individualResults.length);

//   // Sort both arrays for proper comparison
//   const sortedIndividualResults = individualResults
//     .slice()
//     .sort((a, b) => a.toString().localeCompare(b.toString()));
//   const sortedCteResults = cteResults
//     .map((row) => row.id_blob)
//     .sort((a, b) => a.toString().localeCompare(b.toString()));

//   expect(sortedCteResults).toEqual(sortedIndividualResults);

//   // eslint-disable-next-line no-console
//   console.log(`Individual queries: ${individualTime.toFixed(2)}ms`);
//   // eslint-disable-next-line no-console
//   console.log(`CTE query: ${cteTime.toFixed(2)}ms`);
//   // eslint-disable-next-line no-console
//   console.log(`Speedup: ${(individualTime / cteTime).toFixed(2)}x`);

//   // eslint-disable-next-line no-console
//   console.log(
//     `CTE approach is ${cteTime < individualTime ? "faster" : "slower"} than individual queries`,
//   );

//   db.close();
//   unlinkSync(dbFile);
// });
