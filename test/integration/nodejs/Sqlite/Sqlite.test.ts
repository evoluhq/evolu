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
  type CreateSqliteDriverDep,
  type SafeSql,
  type Sqlite,
  type SqliteDriver,
  type SqliteQuery,
  type SqlTemplateParam,
  SqliteQueryParameters,
  type SqliteRow,
  type SqliteQueryString,
  SqliteValue,
} from "../../../../packages/common/src/Sqlite.ts";
import {
  createAbortError,
  sleep,
  testCreateRun,
  type Task,
} from "../../../../packages/common/src/Task.ts";
import {
  assertType,
  FiniteNumber,
  testName,
} from "../../../../packages/common/src/Type.ts";
import { testCreateTime } from "../../../../packages/common/src/Time.ts";
import { setupSqlite, testCreateSqliteDep } from "../_deps.ts";

/** A prepare for a fake driver that runs each statement with its exec. */
const prepareWithExec =
  (exec: SqliteDriver["exec"]): SqliteDriver["prepare"] =>
  (sql) => ({
    exec: (parameters) => exec({ sql, parameters }),
    [Symbol.dispose]: constVoid,
  });

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
    const traceLogs = entries.filter((e) => e.method === "trace");
    assertTrue(traceLogs.map((e) => e.args[0]).includes("rollback"));
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
    const traceLogs = entries.filter((e) => e.method === "trace");
    assertTrue(traceLogs.map((e) => e.args[0]).includes("rollback"));
  });

  it("transaction succeeds and commits", async () => {
    await using setup = await setupSqlite();
    const { run, sqlite } = setup;
    const { console } = run.deps;

    sqlite.exec(sql`create table a (data);`);
    console.clearEntries();

    const result = sqlite.transaction(() => {
      sqlite.exec(sql`insert into a (data) values (${"bar"});`);
      return ok();
    });

    assertOk(result, undefined);
    assertEqual(
      console
        .getEntriesSnapshot()
        .map(({ method, args }) => [
          method,
          typeof args[0] === "object" && args[0] !== null
            ? Object.keys(args[0])
            : args[0],
        ]),
      [
        ["trace", "begin"],
        ["trace", ["query"]],
        ["trace", ["result"]],
        ["trace", "commit"],
      ],
    );

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
        prepare: prepareWithExec((query) => driver.exec(query)),
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
        iterate: constVoid,
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
        prepare: prepareWithExec((query) => driver.exec(query)),
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
        iterate: constVoid,
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
        prepare: prepareWithExec((query) => driver.exec(query)),
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
        iterate: constVoid,
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
        prepare: prepareWithExec((query) => driver.exec(query)),
        exec: () => ({ rows: [], changes: 0 }),
        export: () => {
          throw new Error("Export failed");
        },
        iterate: constVoid,
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

test("logQueryExecutionTime logs the query and its duration", async () => {
  // Each clock reading advances the clock by 1ms.
  await using run = testCreateRun({
    ...testCreateSqliteDep,
    time: testCreateTime({ autoIncrement: "sync" }),
  });
  await using sqlite = await run.ok(createSqlite(testName, { mode: "memory" }));
  const query = {
    ...sql`select 1;`,
    options: { logQueryExecutionTime: true },
  };

  sqlite.exec(query);

  assertEqual(
    run.deps.console
      .getEntriesSnapshot()
      .filter(({ method }) => method === "log"),
    [
      {
        method: "log",
        path: ["sql"],
        args: ["[logQueryExecutionTime]", { query, duration: "1.000ms" }],
      },
    ],
  );
});

test("iterate traces its query and logs its duration and query plan when its options ask for them", async () => {
  // Each clock reading advances the clock by 1ms.
  await using run = testCreateRun({
    ...testCreateSqliteDep,
    time: testCreateTime({ autoIncrement: "sync" }),
  });
  await using sqlite = await run.ok(createSqlite(testName, { mode: "memory" }));
  const query = {
    ...sql`select 1 as a;`,
    options: { logQueryExecutionTime: true, logExplainQueryPlan: true },
  };
  run.deps.console.clearEntries();

  const rows: Array<SqliteRow> = [];
  sqlite.iterate(query, (row) => {
    rows.push(row);
    return true;
  });

  assertEqual(rows, [{ a: 1 }]);
  const entries = run.deps.console.getEntriesSnapshot();
  assertEqual(
    entries.filter(({ method }) => method === "trace"),
    [{ method: "trace", path: ["sql"], args: [{ query }] }],
  );
  const logs = entries.filter(({ method }) => method === "log");
  assertEqual(
    logs.slice(0, 2).map(({ args }) => args),
    [
      ["[logQueryExecutionTime]", { query, duration: "1.000ms" }],
      ["[logExplainQueryPlan]", query],
    ],
  );
  assertEqual(logs.length, 3);
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
        prepare: prepareWithExec((query) => driver.exec(query)),
        exec: () => ({ rows: [], changes: 0 }),
        export: () => new Uint8Array(),
        iterate: constVoid,
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
  let iterateCalls = 0;
  let exportCalls = 0;

  await using setup = await testSetupSqlite({
    createSqliteDriver: () => () => {
      const driver: SqliteDriver = {
        prepare: prepareWithExec((query) => driver.exec(query)),
        exec: () => {
          execCalls++;
          return { rows: [], changes: 0 };
        },
        iterate: () => {
          iterateCalls++;
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
  const preparedError = assertThrowsInstanceOf(
    () => sqlite.prepared`select 1;`,
    Error,
  );
  assertEqual(preparedError.message, "Cannot use a disposed object.");
  const iterateError = assertThrowsInstanceOf(() => {
    sqlite.iterate(sql`select 1;`, () => true);
  }, Error);
  assertEqual(iterateError.message, "Cannot use a disposed object.");
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
  assertEqual(iterateCalls, 0);
  assertEqual(exportCalls, 0);
});

test("createSqlite returns error when driver creation is aborted", async () => {
  const createSlowDriver: CreateSqliteDriver = () => async (run) => {
    await run(sleep("10ms"));
    return ok({
      exec: () => ({ rows: [], changes: 0 }),
      prepare: prepareWithExec(() => ({ rows: [], changes: 0 })),
      export: () => new Uint8Array(),
      iterate: constVoid,
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

test("createSqlite and a CreateSqliteDriver cannot fail", () => {
  assertType<
    ReturnType<typeof createSqlite>,
    Task<Sqlite, never, CreateSqliteDriverDep>
  >();
  assertType<ReturnType<CreateSqliteDriver>, Task<SqliteDriver>>();
});

/**
 * Creates a {@link Sqlite} on an in-memory driver of Evolu's SQLite that records
 * in `events` what the database asks the driver to do.
 */
const setupRecordingSqlite = async () => {
  const events: Array<string> = [];
  const setup = await testSetupSqlite({
    createSqliteDriver: (name, options) => async (run) => {
      const driver = await run.ok(
        testCreateSqliteDep.createSqliteDriver(name, options),
      );
      return ok({
        exec: (query) => {
          events.push(`exec ${query.sql}`);
          return driver.exec(query);
        },
        prepare: (sql) => {
          events.push(`prepare ${sql}`);
          const statement = driver.prepare(sql);
          return {
            exec: (parameters) => statement.exec(parameters),
            [Symbol.dispose]: () => {
              events.push(`finalize ${sql}`);
              statement[Symbol.dispose]();
            },
          };
        },
        iterate: (query, onRow) => {
          driver.iterate(query, onRow);
        },
        export: () => driver.export(),
        deleteDatabase: () => {
          driver.deleteDatabase();
        },
        [Symbol.dispose]: () => {
          events.push("close");
          driver[Symbol.dispose]();
        },
      });
    },
  });
  return { ...setup, events };
};

describe("Sqlite.prepared", () => {
  it("prepares a template once and runs its statement with each call's values", async () => {
    await using setup = await setupRecordingSqlite();
    const { sqlite, events } = setup;
    sqlite.exec(sql`create table t (a integer);`);
    events.length = 0;
    const insert = (a: number) => sqlite.prepared`
      insert into t (a) values (${a});
    `;

    assertEqual(insert(1), { rows: [], changes: 1 });
    insert(2);

    assertEqual(sqlite.prepared<{ a: number }>`select a from t order by a;`, {
      rows: [{ a: 1 }, { a: 2 }],
      changes: 0,
    });
    assertEqual(events, [
      "prepare insert into t (a) values (?);",
      "prepare select a from t order by a;",
    ]);
  });

  it("builds no SQL text when it finds the statement of a template", async () => {
    await using setup = await setupRecordingSqlite();
    const { sqlite } = setup;
    sqlite.exec(sql`create table users (id integer, name text, age integer);`);
    let reads = 0;
    const parts = ["select ", " from users where id = ", ";"];
    const strings = new Proxy(Object.assign([...parts], { raw: parts }), {
      get: (target, key, receiver) => {
        if (key === "0") reads++;
        return Reflect.get(target, key, receiver) as unknown;
      },
    }) as unknown as TemplateStringsArray;
    const readsAfterCalls: Array<number> = [];

    for (const [column, id] of [
      ["name", 1],
      ["name", 2],
      ["age", 3],
      ["name", 4],
    ] as const) {
      sqlite.prepared(strings, sql.identifier(column), id);
      readsAfterCalls.push(reads);
    }

    assertEqual(readsAfterCalls, [1, 1, 2, 2]);
  });

  it("prepares a statement for each position and text of the fragments of a template", async () => {
    const prepares: Array<string> = [];
    await using setup = await testSetupSqlite({
      createSqliteDriver: () => () => {
        const driver: SqliteDriver = {
          exec: () => ({ rows: [], changes: 0 }),
          prepare: (sql) => {
            prepares.push(sql);
            return prepareWithExec(driver.exec)(sql);
          },
          export: () => new Uint8Array(),
          iterate: constVoid,
          deleteDatabase: constVoid,
          [Symbol.dispose]: constVoid,
        };
        return ok(driver);
      },
    });
    const query = (a: SqlTemplateParam, b: SqlTemplateParam) => setup.sqlite
      .prepared`select ${a}, ${b};`;

    query(sql.raw("a"), 1);
    query(1, sql.raw("a"));
    query(sql.raw("a1:b"), 1);
    query(sql.raw("a"), sql.raw("b"));
    query(sql.raw("a"), 2);
    query(sql.identifier("a"), 1);

    assertEqual(prepares, [
      "select a, ?;",
      "select ?, a;",
      "select a1:b, ?;",
      "select a, b;",
      'select "a", ?;',
    ]);
  });

  it("keeps nothing for SQL that SQLite rejects", async () => {
    await using setup = await setupRecordingSqlite();
    const { sqlite, events } = setup;
    sqlite.exec(sql`create table t (a integer);`);
    events.length = 0;
    const select = (column: string) => sqlite.prepared`
      select ${sql.identifier(column)} from t;
    `;

    assertThrowsInstanceOf(() => select("b"), Error);
    assertThrowsInstanceOf(() => select("b"), Error);
    assertEqual(select("a").rows, []);

    assertEqual(events, [
      'prepare select "b" from t;',
      'prepare select "b" from t;',
      'prepare select "a" from t;',
    ]);
  });

  it("rejects a number that is not finite, also once it has the statement", async () => {
    const parameters: Array<SqliteQueryParameters> = [];
    await using setup = await testSetupSqlite({
      createSqliteDriver: () => () => {
        const driver: SqliteDriver = {
          exec: (query) => {
            parameters.push(query.parameters);
            return { rows: [], changes: 0 };
          },
          prepare: prepareWithExec((query) => driver.exec(query)),
          export: () => new Uint8Array(),
          iterate: constVoid,
          deleteDatabase: constVoid,
          [Symbol.dispose]: constVoid,
        };
        return ok(driver);
      },
    });
    const select = (value: number) => setup.sqlite.prepared`
      select ${value} as v;
    `;

    select(1);
    assertThrowsInstanceOf(() => select(Number.NaN), Error);
    assertEqual(parameters, [[1]]);
  });

  it("finalizes its statements when the database is disposed, before the driver", async () => {
    let events: Array<string> = [];
    {
      await using setup = await setupRecordingSqlite();
      events = setup.events;
      setup.sqlite.prepared`select 1;`;
      setup.sqlite.exec({ ...sql`select 2;`, options: { prepare: true } });
      events.length = 0;
    }

    assertEqual(events, ["finalize select 1;", "finalize select 2;", "close"]);
  });

  it("finalizes the other statements and closes the driver when finalizing one throws", async () => {
    const events: Array<string> = [];
    const failure = new Error("finalize failed");
    const setup = await testSetupSqlite({
      createSqliteDriver: () => () => {
        const driver: SqliteDriver = {
          exec: () => ({ rows: [], changes: 0 }),
          prepare: (sql) => ({
            exec: () => ({ rows: [], changes: 0 }),
            [Symbol.dispose]: () => {
              events.push(`finalize ${sql}`);
              if (sql === "select 1;") throw failure;
            },
          }),
          export: () => new Uint8Array(),
          iterate: constVoid,
          deleteDatabase: constVoid,
          [Symbol.dispose]: () => {
            events.push("close");
          },
        };
        return ok(driver);
      },
    });
    setup.sqlite.prepared`select 1;`;
    setup.sqlite.prepared`select 2;`;

    const thrown = await setup[Symbol.asyncDispose]().then(
      () => null,
      (error: unknown) => error,
    );

    assertSame(thrown, failure);
    assertEqual(events, ["finalize select 2;", "finalize select 1;", "close"]);
  });

  it("shares no statements between databases", async () => {
    await using first = await setupRecordingSqlite();
    await using second = await setupRecordingSqlite();
    const selectOne = (sqlite: Sqlite) => sqlite.prepared`select 1 as one;`;

    selectOne(first.sqlite);
    selectOne(second.sqlite);
    selectOne(first.sqlite);

    assertEqual(first.events, ["prepare select 1 as one;"]);
    assertEqual(second.events, ["prepare select 1 as one;"]);
  });
});

describe("Sqlite.exec", () => {
  it("runs a query with the prepare option on a statement prepared once for its SQL, and other queries on statements of their own", async () => {
    await using setup = await setupRecordingSqlite();
    const { sqlite, events } = setup;
    const query = sql`select ${1} as a;`;
    const preparedQuery = { ...query, options: { prepare: true } };

    assertEqual(sqlite.exec(preparedQuery).rows, [{ a: 1 }]);
    sqlite.exec(preparedQuery);
    sqlite.exec(query);
    sqlite.exec(query);

    assertEqual(events, [
      "prepare select ? as a;",
      "exec select ? as a;",
      "exec select ? as a;",
    ]);
  });

  it("runs the statements of transactions on statements prepared once", async () => {
    await using setup = await setupRecordingSqlite();
    const { sqlite, events } = setup;

    sqlite.transaction(constVoid);
    sqlite.transaction(() => err({ type: "Rollback" }));
    sqlite.transaction(constVoid);

    assertEqual(events, [
      "prepare begin;",
      "prepare commit;",
      "prepare rollback;",
    ]);
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

  it("matches the internal sqlite_ prefix literally", async () => {
    await using deps = await setupSqlite();
    const { sqlite } = deps;

    sqlite.exec(sql`create table t (id text primary key, value text);`);
    sqlite.exec(sql`create index sqlitesByValue on t (value);`);

    const schema = getSqliteSchema(deps)();

    assertEqual(toSnapshot(schema).indexes, [
      {
        name: "sqlitesByValue",
        sql: "create index sqlitesByValue on t (value)",
      },
    ]);
  });

  it("excludeIndexNamePrefix matches its prefix literally", async () => {
    await using deps = await setupSqlite();
    const { sqlite } = deps;

    sqlite.exec(sql`create table t (id text primary key, value text);`);
    sqlite.exec(sql`create index evolu_idx_value on t (value);`);
    sqlite.exec(sql`create index evolutionByValue on t (value);`);

    const schema = getSqliteSchema(deps)({
      excludeIndexNamePrefix: "evolu_",
    });

    assertEqual(toSnapshot(schema).indexes, [
      {
        name: "evolutionByValue",
        sql: "create index evolutionByValue on t (value)",
      },
    ]);
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
