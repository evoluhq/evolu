import { describe, it, test } from "node:test";
import {
  assertEqual,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertNonNullable,
  assertNotUndefined,
  assertOk,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
} from "../../../../packages/common/src/Assert.ts";
import { constVoid } from "../../../../packages/common/src/Function.ts";
import { err, ok } from "../../../../packages/common/src/Result.ts";
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
  testSetupSqlite,
  type CreateSqliteDriver,
  type SafeSql,
  type SqliteDriver,
  type SqliteQuery,
  SqliteQueryParameters,
  type SqliteQueryString,
  SqliteValue,
} from "../../../../packages/common/src/Sqlite.ts";
import {
  createAbortError,
  sleep,
  testCreateRun,
} from "../../../../packages/common/src/Task.ts";
import {
  assertType,
  FiniteNumber,
  testName,
} from "../../../../packages/common/src/Type.ts";
import { setupSqlite } from "../_deps.ts";

describe("eqSqliteValue", () => {
  it("equal Uint8Arrays return true", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    assertTrue(eqSqliteValue(a, b));
  });

  it("different Uint8Arrays return false", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5, 6]);
    assertFalse(eqSqliteValue(a, b));
  });

  it("equal primitives return true", () => {
    assertTrue(eqSqliteValue(42, 42));
    assertTrue(eqSqliteValue("hello", "hello"));
    assertTrue(eqSqliteValue(null, null));
  });

  it("different primitives return false", () => {
    assertFalse(eqSqliteValue(1, 2));
    assertFalse(eqSqliteValue("a", "b"));
    assertFalse(eqSqliteValue(null, 0));
  });

  it("SqliteValue contains only finite numbers", () => {
    assertType<SqliteValue, null | string | FiniteNumber | Uint8Array>();
    assertFalse(SqliteValue.is(Number.NaN));
    assertFalse(SqliteValue.is(Number.POSITIVE_INFINITY));
    assertFalse(SqliteValue.is(Number.NEGATIVE_INFINITY));
  });
});

describe("SqliteQueryString", () => {
  it("SqliteQueryParameters contains only SqliteValue", () => {
    assertType<SqliteQueryParameters, ReadonlyArray<SqliteValue>>();
    assertTrue(SqliteQueryParameters.is([null, "a", FiniteNumber.orThrow(1)]));
    assertFalse(SqliteQueryParameters.is([Number.POSITIVE_INFINITY]));
  });

  it("sqliteQueryToSqliteQueryString and sqliteQueryStringToSqliteQuery round-trip", () => {
    const binaryData = new Uint8Array([1, 3, 2]);
    const sqliteQuery: SqliteQuery = {
      sql: "a" as SafeSql,
      parameters: [null, "a", FiniteNumber.orThrow(1), binaryData],
    };

    assertEqual(
      sqliteQueryStringToSqliteQuery(
        sqliteQueryToSqliteQueryString(sqliteQuery),
      ),
      sqliteQuery,
    );
  });

  it("sqliteQueryToSqliteQueryString sorts options and restores them", () => {
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

    assertEqual(
      optionsArr.map(([key]) => key),
      ["logExplainQueryPlan", "logQueryExecutionTime", "prepare"],
    );
    assertEqual(sqliteQueryStringToSqliteQuery(sqliteQueryString), sqliteQuery);
  });

  it("SqliteQueryString is a branded string", () => {
    assertType<SqliteQueryString extends string ? true : false, true>();
  });
});

test("basic DDL/DML works", async () => {
  await using setup = await setupSqlite();
  const { sqlite } = setup;

  sqlite.exec(sql`create table a (data);`);
  sqlite.exec(sql`insert into a (data) values (${"foo"});`);
  const result = sqlite.exec(sql`select * from a;`);
  assertEqual(result.rows, [{ data: "foo" }]);
});

describe("transactions", () => {
  it("transaction fails and rolls back on SQL error", async () => {
    await using setup = await setupSqlite();
    const { run, sqlite } = setup;
    const { console } = run.deps;

    sqlite.exec(sql`create table a (data);`);

    const action = () =>
      sqlite.transaction(() =>
        ok(sqlite.exec(sql`insert into notexisting (data) values (${"foo"});`)),
      );

    assertThrowsInstanceOf(action, Error);

    const rows = sqlite.exec(sql`select * from a;`);
    assertEqual(rows.rows, []);

    const entries = console.getEntriesSnapshot();
    const debugLogs = entries.filter((e) => e.method === "debug");
    assertTrue(debugLogs.map((e) => e.args[0]).includes("rollback"));
  });

  it("transaction fails and rolls back on callback error", async () => {
    await using setup = await setupSqlite();
    const { run, sqlite } = setup;
    const { console } = run.deps;

    sqlite.exec(sql`create table a (data);`);

    const result = sqlite.transaction(() => {
      sqlite.exec(sql`insert into a (data) values (${"foo"});`);
      return err({ type: "CustomError" });
    });

    assertErr(result, { type: "CustomError" });

    const rows = sqlite.exec(sql`select * from a;`);
    assertEqual(rows.rows, []);

    const entries = console.getEntriesSnapshot();
    const debugLogs = entries.filter((e) => e.method === "debug");
    assertTrue(debugLogs.map((e) => e.args[0]).includes("rollback"));
  });

  it("transaction succeeds and commits", async () => {
    await using setup = await setupSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table a (data);`);

    const result = sqlite.transaction(() => {
      sqlite.exec(sql`insert into a (data) values (${"bar"});`);
      return ok();
    });

    assertOk(result, undefined);

    const rows = sqlite.exec(sql`select * from a;`);
    assertEqual(rows.rows, [{ data: "bar" }]);
  });

  it("transaction callback returns error", async () => {
    await using setup = await setupSqlite();
    const { sqlite } = setup;

    const result = sqlite.transaction(() => err({ type: "CustomError" }));

    assertErr(result, { type: "CustomError" });
  });

  it("begin failure does not attempt rollback", async () => {
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
        deleteDatabase: constVoid,
        [Symbol.dispose]: () => {
          // No cleanup needed
        },
      };
      return ok(driver);
    };

    await using setup = await testSetupSqlite({
      createSqliteDriver: createFailingDriver,
    });
    const { sqlite } = setup;

    assertThrowsInstanceOf(
      () => sqlite.transaction(() => ok("should not reach")),
      Error,
    );

    assertTrue(beginCalled);
    assertFalse(rollbackCalled);
  });

  it("transaction rolls back when callback throws", async () => {
    await using setup = await setupSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table a (data);`);

    const action = () =>
      sqlite.transaction(() => {
        sqlite.exec(sql`insert into a (data) values (${"boom"});`);
        throw new Error("Callback failed");
      });

    assertThrowsInstanceOf(action, Error);

    const rows = sqlite.exec(sql`select * from a;`);
    assertEqual(rows.rows, []);
  });

  it("rollback failure throws rollback error", async () => {
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
        deleteDatabase: constVoid,
        [Symbol.dispose]: () => {
          // No cleanup needed
        },
      };
      return ok(driver);
    };

    await using setup = await testSetupSqlite({
      createSqliteDriver: createFailingDriver,
    });
    const { sqlite } = setup;

    assertThrowsInstanceOf(
      () =>
        sqlite.transaction(() => ok(sqlite.exec(sql`select * from users;`))),
      Error,
    );
    assertTrue(rollbackCalled);
  });

  it("transaction commit failure triggers rollback", async () => {
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
        deleteDatabase: constVoid,
        [Symbol.dispose]: constVoid,
      };
      return ok(driver);
    };

    await using setup = await testSetupSqlite({
      createSqliteDriver: createFailingDriver,
    });
    const { sqlite } = setup;

    assertThrowsInstanceOf(() => sqlite.transaction(() => ok("data")), Error);
    assertTrue(commitCalled);
    assertTrue(rollbackCalled);
  });
});

describe("export", () => {
  it("export returns database bytes", async () => {
    await using setup = await setupSqlite();
    const { sqlite } = setup;

    sqlite.exec(sql`create table a (data);`);
    sqlite.exec(sql`insert into a (data) values (${"foo"});`);

    const result = sqlite.export();
    assertInstanceOf(result, Uint8Array);
    assertTrue(result.length > 0);
  });

  it("export failure throws", async () => {
    const createFailingDriver: CreateSqliteDriver = () => () => {
      const driver: SqliteDriver = {
        exec: () => ({ rows: [], changes: 0 }),
        export: () => {
          throw new Error("Export failed");
        },
        deleteDatabase: constVoid,
        [Symbol.dispose]: constVoid,
      };
      return ok(driver);
    };

    await using setup = await testSetupSqlite({
      createSqliteDriver: createFailingDriver,
    });
    const { sqlite } = setup;

    const error = assertThrowsInstanceOf(() => sqlite.export(), Error);
    assertEqual(error.message, "Export failed");
  });
});

test("logQueryExecutionTime logs timing", async () => {
  await using setup = await setupSqlite();
  const { run, sqlite } = setup;
  const { console } = run.deps;

  sqlite.exec(sql`create table a (data);`);

  const query = sql`select * from a;`;
  sqlite.exec({ ...query, options: { logQueryExecutionTime: true } });

  const entries = console.getEntriesSnapshot();
  const timeLogs = entries.filter((e) => e.method === "time");
  assertTrue(timeLogs.length > 0);
  const timeEndLogs = entries.filter((e) => e.method === "timeEnd");
  assertTrue(timeEndLogs.length > 0);
});

describe("logExplainQueryPlan", () => {
  it("logs query plan when option is set", async () => {
    await using setup = await setupSqlite();
    const { run, sqlite } = setup;

    sqlite.exec(sql`create table users (id text, name text);`);
    run.deps.console.clearEntries();

    const query: Parameters<typeof sqlite.exec>[0] = {
      ...sql`select * from users;`,
      options: { logExplainQueryPlan: true },
    };
    const result = sqlite.exec(query);

    assertEqual(result.rows, []);

    const entries = run.deps.console.getEntriesSnapshot();
    const logEntries = entries.filter(
      (e) => e.method === "log" && e.path.includes("sql"),
    );
    assertTrue(logEntries.length >= 2);
    assertEqual(logEntries[0].args[0], "[logExplainQueryPlan]");
  });

  it("draws nested query plan with indentation", async () => {
    await using setup = await setupSqlite();
    const { run, sqlite } = setup;

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
    assertNotUndefined(planEntry);
    // Nested rows produce leading spaces
    const planOutput = planEntry.args.find(
      (arg) => typeof arg === "string" && arg.includes("SCAN"),
    ) as string;
    assertTrue(/^ {2}/mu.test(planOutput));
  });
});

test("async dispose is idempotent", async () => {
  let driverDisposeCount = 0;
  await using setup = await testSetupSqlite({
    createSqliteDriver: () => () => {
      const driver: SqliteDriver = {
        exec: () => ({ rows: [], changes: 0 }),
        export: () => new Uint8Array(),
        deleteDatabase: constVoid,
        [Symbol.dispose]: () => {
          driverDisposeCount++;
        },
      };
      return ok(driver);
    },
  });
  const { sqlite } = setup;

  await sqlite[Symbol.asyncDispose]();
  await sqlite[Symbol.asyncDispose]();
  assertEqual(driverDisposeCount, 1);
});

test("sync methods throw after sqlite is disposed", async () => {
  let execCalls = 0;
  let exportCalls = 0;

  await using setup = await testSetupSqlite({
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
        deleteDatabase: constVoid,
        [Symbol.dispose]: constVoid,
      };
      return ok(driver);
    },
  });
  const { sqlite } = setup;

  await sqlite[Symbol.asyncDispose]();

  const execError = assertThrowsInstanceOf(
    () => sqlite.exec(sql`select 1;`),
    Error,
  );
  assertEqual(execError.message, "Cannot use a disposed object.");
  const transactionError = assertThrowsInstanceOf(
    () =>
      sqlite.transaction(() => {
        throw new Error("should not run");
      }),
    Error,
  );
  assertEqual(transactionError.message, "Cannot use a disposed object.");
  const exportError = assertThrowsInstanceOf(() => sqlite.export(), Error);
  assertEqual(exportError.message, "Cannot use a disposed object.");

  assertEqual(execCalls, 0);
  assertEqual(exportCalls, 0);
});

test("createSqlite returns error when driver creation is aborted", async () => {
  const createSlowDriver: CreateSqliteDriver = () => async (run) => {
    await run(sleep("10ms"));
    return ok({
      exec: () => ({ rows: [], changes: 0 }),
      export: () => new Uint8Array(),
      deleteDatabase: constVoid,
      [Symbol.dispose]: constVoid,
    });
  };

  await using run = testCreateRun({
    createSqliteDriver: createSlowDriver,
  });

  const fiber = run.abortable(createSqlite(testName));
  const reason = { type: "TestAbortReason" };
  fiber.abort(reason);
  const result = await fiber;

  assertErr(result, createAbortError(reason));
});

describe("createPreparedStatementsCache", () => {
  it("returns null when prepare option is not set", () => {
    const cache = createPreparedStatementsCache(
      (s) => ({ prepared: s }),
      constVoid,
    );
    const query = { sql: "select 1;" as SafeSql, parameters: [] };
    assertEqual(cache.get(query), null);
  });

  it("creates and caches statement with prepare option", () => {
    let factoryCalls = 0;
    const cache = createPreparedStatementsCache((s) => {
      factoryCalls++;
      return { prepared: s };
    }, constVoid);
    const query = {
      sql: "select 1;" as SafeSql,
      parameters: [],
      options: { prepare: true },
    };

    const first = cache.get(query);
    const second = cache.get(query);

    assertEqual(first, { prepared: "select 1;" });
    assertSame(first, second);
    assertEqual(factoryCalls, 1);
  });

  it("creates statement when alwaysPrepare is true", () => {
    const cache = createPreparedStatementsCache(
      (s) => ({ prepared: s }),
      constVoid,
    );
    const query = { sql: "select 1;" as SafeSql, parameters: [] };

    const result = cache.get(query, true);
    assertEqual(result, { prepared: "select 1;" });
  });

  it("dispose calls disposeFn for each cached statement", () => {
    const disposed: Array<string> = [];
    const cache = createPreparedStatementsCache(
      (s) => s,
      (s) => {
        disposed.push(s);
      },
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
    assertEqual(disposed, ["b;", "a;"]);
  });

  it("dispose is idempotent", () => {
    let disposeCount = 0;
    const cache = createPreparedStatementsCache(
      (s) => s,
      () => {
        disposeCount++;
      },
    );
    cache.get({
      sql: "a;" as SafeSql,
      parameters: [],
      options: { prepare: true },
    });

    cache[Symbol.dispose]();
    cache[Symbol.dispose]();
    assertEqual(disposeCount, 1);
  });

  it("get throws after dispose", () => {
    const cache = createPreparedStatementsCache(
      (s) => ({ prepared: s }),
      constVoid,
    );

    cache[Symbol.dispose]();

    const error = assertThrowsInstanceOf(() => {
      cache.get({
        sql: "select 1;" as SafeSql,
        parameters: [],
        options: { prepare: true },
      });
    }, Error);
    assertEqual(error.message, "Cannot use a disposed object.");
  });

  it("dispose still attempts later statements when one disposeFn throws", () => {
    const disposed: Array<string> = [];
    const cache = createPreparedStatementsCache(
      (s) => s,
      (s) => {
        disposed.push(s);
        if (s === ("b;" as SafeSql)) {
          throw new Error("dispose failed");
        }
      },
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

    const error = assertThrowsInstanceOf(() => {
      cache[Symbol.dispose]();
    }, Error);
    assertEqual(error.message, "dispose failed");

    assertEqual(disposed, ["b;", "a;"]);
  });
});

describe("sql", () => {
  it("sql template binds parameters", () => {
    assertEqual(sql`select * from users where id = ${1};`, {
      sql: "select * from users where id = ?;",
      parameters: [1],
    });

    // prettier-ignore
    assertEqual(
      sql`
        insert into users (name, age) values (${"Alice"}, ${30});
      `,
      {
        sql: "insert into users (name, age) values (?, ?);",
        parameters: ["Alice", 30],
      },
    );
  });

  for (const value of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    it(`sql rejects non-finite parameter ${value}`, () => {
      assertThrowsInstanceOf(() => sql`select ${value};`, Error);
    });
  }

  it("sql.identifier wraps in double quotes", () => {
    assertEqual(sql.identifier("user_table"), {
      type: "SqlIdentifier",
      sql: '"user_table"',
    });
  });

  it("sql.identifier escapes embedded double quotes", () => {
    assertEqual(sql.identifier('col"name'), {
      type: "SqlIdentifier",
      sql: '"col""name"',
    });
  });

  it("sql.identifier embeds in composed query", () => {
    assertEqual(sql`select ${sql.identifier("columnName")} from users;`, {
      sql: 'select "columnName" from users;',
      parameters: [],
    });
  });

  it("sql.raw creates unescaped fragment", () => {
    assertEqual(sql.raw("abc"), {
      type: "RawSql",
      sql: "abc",
    });
  });

  it("sql.raw is embedded verbatim in composed query", () => {
    const query = sql`
      select * from users order by ${sql.raw("created_at desc")};
    `;
    assertEqual(query, {
      sql: "select * from users order by created_at desc;",
      parameters: [],
    });
  });

  it("sql.prepared marks query for preparation", () => {
    assertEqual(sql.prepared`select * from users where id = ${2};`, {
      sql: "select * from users where id = ?;",
      parameters: [2],
      options: { prepare: true },
    });
  });

  it("sql.prepared with identifier", () => {
    const query = sql.prepared`
      select ${sql.identifier("name")} from users where id = ${1};
    `;
    assertEqual(query, {
      sql: 'select "name" from users where id = ?;',
      parameters: [1],
      options: { prepare: true },
    });
  });

  it("sql trims leading and trailing whitespace", () => {
    const query = sql` select 1; `;
    assertEqual(query.sql, "select 1;");
  });
});

describe("SqliteBoolean", () => {
  it("sqliteTrue is 1", () => {
    assertEqual(sqliteTrue, 1);
  });

  it("sqliteFalse is 0", () => {
    assertEqual(sqliteFalse, 0);
  });

  it("booleanToSqliteBoolean converts true to 1", () => {
    assertEqual(booleanToSqliteBoolean(true), 1);
  });

  it("booleanToSqliteBoolean converts false to 0", () => {
    assertEqual(booleanToSqliteBoolean(false), 0);
  });

  it("sqliteBooleanToBoolean converts 1 to true", () => {
    assertTrue(sqliteBooleanToBoolean(1));
  });

  it("sqliteBooleanToBoolean converts 0 to false", () => {
    assertFalse(sqliteBooleanToBoolean(0));
  });
});

describe("eqSqliteIndex", () => {
  it("returns true for same name and sql", () => {
    const a = { name: "my_index", sql: "create index my_index on a (b)" };
    const b = { name: "my_index", sql: "create index my_index on a (b)" };
    assertTrue(eqSqliteIndex(a, b));
  });

  it("returns false for different name", () => {
    const a = { name: "my_index", sql: "create index my_index on a (b)" };
    const b = {
      name: "my_other_index",
      sql: "create index my_index on a (b)",
    };
    assertFalse(eqSqliteIndex(a, b));
  });

  it("returns false for different sql", () => {
    const a = { name: "my_index", sql: "create index my_index on a (b)" };
    const b = {
      name: "my_index",
      sql: "create unique index my_index on a (b)",
    };
    assertFalse(eqSqliteIndex(a, b));
  });
});

describe("getSqliteSchema", () => {
  const toSnapshot = (schema: ReturnType<ReturnType<typeof getSqliteSchema>>) =>
    JSON.parse(
      JSON.stringify({
        tables: Object.fromEntries(
          Object.entries(schema.tables)
            .toSorted(([a], [b]) => a.localeCompare(b))
            .map(([tableName, columns]) => {
              assertNonNullable(columns);
              return [tableName, [...columns].toSorted()];
            }),
        ),
        indexes: [...schema.indexes]
          .map(({ name, sql }) => ({ name, sql }))
          .toSorted(
            (a, b) =>
              a.name.localeCompare(b.name) || a.sql.localeCompare(b.sql),
          ),
      }),
    ) as {
      tables: Record<string, Array<string>>;
      indexes: Array<{ name: string; sql: string }>;
    };

  it("returns tables and user indexes by default", async () => {
    await using deps = await setupSqlite();
    const { sqlite } = deps;

    sqlite.exec(sql`create table todos (id text primary key, title text);`);
    sqlite.exec(sql`create index idx_todos_title on todos (title);`);

    const schema = getSqliteSchema(deps)();

    assertEqual(toSnapshot(schema), {
      indexes: [
        {
          name: "idx_todos_title",
          sql: "create index idx_todos_title on todos (title)",
        },
      ],
      tables: {
        todos: ["id", "title"],
      },
    });
  });

  it("normalizes CREATE INDEX and CREATE UNIQUE INDEX casing", async () => {
    await using deps = await setupSqlite();
    const { sqlite } = deps;

    sqlite.exec(sql`create table users (id text primary key, email text);`);
    sqlite.exec(sql`create index idx_users_email on users (email);`);
    sqlite.exec(sql`
      create unique index idx_users_email_unique on users (email);
    `);

    const schema = getSqliteSchema(deps)();

    assertEqual(toSnapshot(schema), {
      indexes: [
        {
          name: "idx_users_email",
          sql: "create index idx_users_email on users (email)",
        },
        {
          name: "idx_users_email_unique",
          sql: "create unique index idx_users_email_unique on users (email)",
        },
      ],
      tables: {
        users: ["email", "id"],
      },
    });
  });

  it("excludeIndexNamePrefix filters indexes in SQL query", async () => {
    await using deps = await setupSqlite();
    const { sqlite } = deps;

    sqlite.exec(sql`create table t (id text primary key, value text);`);
    sqlite.exec(sql`create index evolu_idx_value on t (value);`);
    sqlite.exec(sql`create index app_idx_value on t (value);`);

    const schema = getSqliteSchema(deps)({
      excludeIndexNamePrefix: "evolu_",
    });

    assertEqual(toSnapshot(schema), {
      indexes: [
        {
          name: "app_idx_value",
          sql: "create index app_idx_value on t (value)",
        },
      ],
      tables: {
        t: ["id", "value"],
      },
    });
  });

  it("excludeIndexNamePrefix escapes single quote safely", async () => {
    await using deps = await setupSqlite();
    const { sqlite } = deps;

    assertNotUndefined(sqlite);

    const schema = getSqliteSchema(deps)({
      excludeIndexNamePrefix: "abc'xyz",
    });

    assertEqual(toSnapshot(schema), {
      indexes: [],
      tables: {},
    });
  });

  it("sqlite_master index query returns empty rows on empty database", async () => {
    await using deps = await setupSqlite();
    const { sqlite } = deps;

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

    assertEqual(withoutInternalFilter.rows, []);
    assertEqual(withInternalFilter.rows, []);
  });
});

describe("getSqliteSnapshot", () => {
  it("returns schema and table rows", async () => {
    await using deps = await setupSqlite();
    const { sqlite } = deps;

    sqlite.exec(sql`create table t (id text primary key, value text);`);
    sqlite.exec(sql`create index idx_t_value on t (value);`);
    sqlite.exec(sql`insert into t (id, value) values (${"a"}, ${"one"});`);

    const snapshot = getSqliteSnapshot(deps);

    const columns = snapshot.schema.tables.t;
    assertNonNullable(columns);
    assertEqual([...columns], ["id", "value"]);
    assertEqual(snapshot.schema.indexes, [
      {
        name: "idx_t_value",
        sql: "create index idx_t_value on t (value)",
      },
    ]);
    assertEqual(snapshot.tables, [
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
//   assertEqual(cteResults.length, individualResults.length);

//   // Sort both arrays for proper comparison
//   const sortedIndividualResults = individualResults
//     .slice()
//     .sort((a, b) => a.toString().localeCompare(b.toString()));
//   const sortedCteResults = cteResults
//     .map((row) => row.id_blob)
//     .sort((a, b) => a.toString().localeCompare(b.toString()));

//   assertEqual(sortedCteResults, sortedIndividualResults);

//   console.log(`Individual queries: ${individualTime.toFixed(2)}ms`);
//   console.log(`CTE query: ${cteTime.toFixed(2)}ms`);
//   console.log(`Speedup: ${(individualTime / cteTime).toFixed(2)}x`);

//   console.log(
//     `CTE approach is ${cteTime < individualTime ? "faster" : "slower"} than individual queries`,
//   );

//   db.close();
//   unlinkSync(dbFile);
// });
