import {
  AbortError,
  assert,
  assertEqual,
  assertEqualBytes,
  assertInstanceOf,
  assertSame,
  assertType,
  EncryptionKey,
  err,
  Name,
  ok,
  sql,
  testCreateRun,
  type Result,
} from "@evolu/common";
import { describe, it, mock } from "node:test";

/** The options of the databases the fake opens. */
interface FakeDatabaseOptions {
  readonly type: string;
  readonly path?: string;
  readonly vfs?: unknown;
  readonly key?: unknown;
}

/**
 * A fake of `@evolu/sqlite-wasm` that records what the driver does with it, in
 * order, in `events`. Each test resets it and sets the results it needs.
 */
const fake = (() => {
  const sqliteWasm = { label: "sqliteWasm" };
  // The values SqliteVfsPath validated, which the driver does once, on import.
  const sqliteVfsPaths: Array<string> = [];
  const pool = {
    unlink: (path: string) => {
      state.events.push(`unlink ${path}`);
      return state.unlinkResult;
    },
    [Symbol.dispose]: () => {
      state.events.push("dispose pool");
    },
  };

  const createDatabase = (options: { readonly type: string }) => ({
    prepare: (query: string) => {
      state.events.push(`prepare ${query}`);
      return ok({
        run: (parameters: ReadonlyArray<unknown>) => {
          state.events.push(`run statement ${JSON.stringify(parameters)}`);
          return state.statementRunResult;
        },
        [Symbol.dispose]: () => {
          state.events.push(`dispose statement ${query}`);
        },
      });
    },
    run: (query: string, parameters: ReadonlyArray<unknown>) => {
      state.events.push(`run ${query} ${JSON.stringify(parameters)}`);
      return state.runResult;
    },
    export: () => state.exportResult,
    [Symbol.dispose]: () => {
      state.events.push(`close ${options.type}`);
    },
  });

  const initialState = () => ({
    createSqliteWasmResult: ok(sqliteWasm) as Result<unknown, unknown>,
    createSqliteWasmSources: [] as Array<unknown>,
    databaseOptions: [] as Array<FakeDatabaseOptions>,
    databaseResult: null as Result<never, unknown> | null,
    events: [] as Array<string>,
    exportResult: ok(new Uint8Array([1, 2, 3])) as Result<Uint8Array, unknown>,
    poolDeps: [] as Array<Record<string, unknown>>,
    poolOptions: [] as Array<unknown>,
    poolResults: [] as Array<Result<never, unknown>>,
    runResult: ok({ rows: [{ value: "run" }], changes: 1 }) as Result<
      unknown,
      unknown
    >,
    statementRunResult: ok({
      rows: [{ value: "statement" }],
      changes: 2,
    }) as Result<unknown, unknown>,
    unlinkResult: ok(true) as Result<boolean, unknown>,
  });
  const state = initialState();

  return {
    state,
    pool,
    sqliteWasm,
    sqliteVfsPaths,
    reset: () => {
      Object.assign(state, initialState());
    },
    exports: {
      sqliteWasmUrl: new URL("https://example.test/sqlite3.wasm"),
      OpfsName: { orThrow: (value: string) => value },
      SqliteVfsPath: {
        orThrow: (value: string) => {
          sqliteVfsPaths.push(value);
          return value;
        },
      },
      createSqliteWasm: (source: unknown) => () => {
        state.createSqliteWasmSources.push(source);
        return state.createSqliteWasmResult;
      },
      openSahPool:
        (options: { readonly directory: ReadonlyArray<string> }) =>
        (run: { readonly deps: Record<string, unknown> }) => {
          state.events.push(`open pool ${options.directory.join("/")}`);
          state.poolDeps.push(run.deps);
          state.poolOptions.push(options);
          return Promise.resolve(state.poolResults.shift() ?? ok(pool));
        },
      createSqliteDatabase:
        (deps: { readonly sqliteWasm: unknown }) =>
        (options: FakeDatabaseOptions) => {
          assertSame(deps.sqliteWasm, sqliteWasm);
          state.events.push(`open ${options.type} ${options.path ?? ""}`);
          state.databaseOptions.push(options);
          return state.databaseResult ?? ok(createDatabase(options));
        },
      createEncryptedSqliteDatabase:
        (options: FakeDatabaseOptions) =>
        (run: { readonly deps: Record<string, unknown> }) => {
          assertSame(run.deps.sqliteWasm, sqliteWasm);
          assertSame(run.deps.subtleCrypto, testSubtleCrypto);
          state.events.push(`open ${options.type} ${options.path ?? ""}`);
          state.databaseOptions.push(options);
          return Promise.resolve(
            state.databaseResult ??
              ok({ database: createDatabase(options), keyDerivation: "Raw" }),
          );
        },
    },
  };
})();

mock.module("@evolu/sqlite-wasm", {
  // @ts-expect-error -- Node.js 24.20 replaces the deprecated defaultExport option with exports, which @types/node 24.13 does not declare yet.
  exports: fake.exports,
});

const { createWaitForDatabaseRelease, createWasmSqliteDriver, loadSqliteWasm } =
  await import("./Sqlite.ts");

const testOpfsRoot = { getDirectory: () => Promise.reject(new Error("Fake")) };
const testSubtleCrypto = { label: "subtleCrypto" } as unknown as SubtleCrypto;
const testKey = EncryptionKey.orThrow(new Uint8Array(32).fill(42));
const testName = Name.orThrow("Test");

const setupDriverDeps = (
  sqliteWasm: Result<unknown, unknown> = ok(fake.sqliteWasm),
) => ({
  opfsRoot: testOpfsRoot,
  sqliteWasmLoad: Promise.resolve(sqliteWasm) as never,
  subtleCrypto: testSubtleCrypto,
});

const setupDriver = async (
  options?: Parameters<ReturnType<typeof createWasmSqliteDriver>>[1],
) => {
  fake.reset();
  await using disposer = new AsyncDisposableStack();
  const run = disposer.use(testCreateRun());
  const driver = disposer.use(
    await run.ok(createWasmSqliteDriver(setupDriverDeps())(testName, options)),
  );
  const disposables = disposer.move();
  return {
    driver,
    run,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

// Lets resolved promises settle before test time advances.
const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const heldError = {
  type: "SahPoolHeldError",
  fileName: "slot",
  cause: new DOMException("Held", "NoModificationAllowedError"),
} as const;

/** The Error the driver threw, which the Run reports as its panic's defect. */
const getDefect = (result: Result<unknown, unknown>): Error => {
  assert(!result.ok, "Expected the driver to fail.");
  assertType(AbortError, result.error);
  assert(result.error.reason.type === "PanicAbortReason", "Expected a panic.");
  assertInstanceOf(result.error.reason.defect, Error);
  return result.error.reason.defect;
};

describe("createWasmSqliteDriver", () => {
  it("validates its path, /evolu1.db, as a SqliteVfsPath", () => {
    assertEqual(fake.sqliteVfsPaths, ["/evolu1.db"]);
  });

  it("opens /evolu1.db of the pool in .<name>, without waiting for held files", async () => {
    await using _setup = await setupDriver();

    assertEqual(fake.state.events, ["open pool .Test", "open File /evolu1.db"]);
    assertEqual(fake.state.poolOptions, [{ directory: [".Test"] }]);
    assertSame(fake.state.poolDeps[0]?.opfsRoot, testOpfsRoot);
    assertSame(fake.state.poolDeps[0]?.sqliteWasm, fake.sqliteWasm);
    assertSame(fake.state.databaseOptions[0]?.vfs, fake.pool);
  });

  it("opens /evolu1.db of the pool in .<name> encrypted with the key", async () => {
    await using _setup = await setupDriver({
      mode: "encrypted",
      encryptionKey: testKey,
    });

    assertEqual(fake.state.events, [
      "open pool .Test",
      "open EncryptedFile /evolu1.db",
    ]);
    assertSame(fake.state.databaseOptions[0]?.vfs, fake.pool);
    assertSame(fake.state.databaseOptions[0]?.key, testKey);
  });

  it("opens a memory database without a pool", async () => {
    await using _setup = await setupDriver({ mode: "memory" });

    assertEqual(fake.state.events, ["open Memory "]);
  });

  it("runs a query without the prepare option once", async () => {
    await using setup = await setupDriver();
    fake.state.events.length = 0;

    const result = setup.driver.exec(sql`select ${1};`);

    assertEqual(result, { rows: [{ value: "run" }], changes: 1 });
    assertEqual(fake.state.events, ["run select ?; [1]"]);
  });

  it("prepares a query with the prepare option once and runs the statement each time", async () => {
    await using setup = await setupDriver();
    fake.state.events.length = 0;
    const query = sql.prepared`select ${1};`;

    const result = setup.driver.exec(query);
    setup.driver.exec(query);

    assertEqual(result, { rows: [{ value: "statement" }], changes: 2 });
    assertEqual(fake.state.events, [
      "prepare select ?;",
      "run statement [1]",
      "run statement [1]",
    ]);
  });

  it("throws SQLite's error with the error as the cause", async () => {
    await using setup = await setupDriver();
    const sqliteError = {
      type: "SqliteError",
      message: "NOT NULL constraint failed: t.name",
    };
    fake.state.runResult = err(sqliteError);
    fake.state.statementRunResult = err(sqliteError);

    for (const query of [
      sql`insert into t (name) values (null);`,
      sql.prepared`insert into t (name) values (null);`,
    ]) {
      const thrown = (() => {
        try {
          setup.driver.exec(query);
        } catch (error) {
          return error;
        }
        return null;
      })();
      assertInstanceOf(thrown, Error);
      assertSame(thrown.message, "NOT NULL constraint failed: t.name");
      assertSame(thrown.cause, sqliteError);
    }
  });

  it("throws an error without a message with its type as the message", async () => {
    await using setup = await setupDriver();
    const parameterCountError = {
      type: "SqliteParameterCountError",
      expected: 1,
      actual: 0,
    };
    fake.state.runResult = err(parameterCountError);

    const thrown = (() => {
      try {
        setup.driver.exec(sql`select 1;`);
      } catch (error) {
        return error;
      }
      return null;
    })();

    assertInstanceOf(thrown, Error);
    assertSame(thrown.message, "SqliteParameterCountError");
    assertSame(thrown.cause, parameterCountError);
  });

  it("exports the database", async () => {
    await using setup = await setupDriver();

    assertEqualBytes(setup.driver.export(), [1, 2, 3]);
  });

  it("disposes the statements, then the database, then the pool", async () => {
    {
      await using setup = await setupDriver();
      setup.driver.exec(sql.prepared`select 1;`);
      fake.state.events.length = 0;
    }

    assertEqual(fake.state.events, [
      "dispose statement select 1;",
      "close File",
      "dispose pool",
    ]);
  });

  it("deletes /evolu1.db after closing the database and before disposing the pool", async () => {
    await using setup = await setupDriver({
      mode: "encrypted",
      encryptionKey: testKey,
    });
    fake.state.events.length = 0;

    setup.driver.deleteDatabase();
    setup.driver[Symbol.dispose]();

    assertEqual(fake.state.events, [
      "close EncryptedFile",
      "unlink /evolu1.db",
      "dispose pool",
    ]);
  });

  it("deletes a memory database by closing it", async () => {
    await using setup = await setupDriver({ mode: "memory" });
    fake.state.events.length = 0;

    setup.driver.deleteDatabase();

    assertEqual(fake.state.events, ["close Memory"]);
  });

  it("disposes the pool when deleting the file fails, and throws", async () => {
    await using setup = await setupDriver();
    fake.state.events.length = 0;
    const ioError = { type: "SqliteVfsIoError", cause: null };
    fake.state.unlinkResult = err(ioError);

    const thrown = (() => {
      try {
        setup.driver.deleteDatabase();
      } catch (error) {
        return error;
      }
      return null;
    })();

    assertInstanceOf(thrown, Error);
    assertSame(thrown.cause, ioError);
    assertEqual(fake.state.events, [
      "close File",
      "unlink /evolu1.db",
      "dispose pool",
    ]);
  });

  it("disposes the pool when the database fails to open, and throws", async () => {
    fake.reset();
    const sqliteError = {
      type: "SqliteError",
      message: "file is not a database",
    };
    fake.state.databaseResult = err(sqliteError);
    await using run = testCreateRun();

    const defect = getDefect(
      await run.abortable(
        createWasmSqliteDriver(setupDriverDeps())(testName, {
          mode: "encrypted",
          encryptionKey: testKey,
        }),
      ),
    );

    assertSame(defect.message, "file is not a database");
    assertSame(defect.cause, sqliteError);
    assertEqual(fake.state.events, [
      "open pool .Test",
      "open EncryptedFile /evolu1.db",
      "dispose pool",
    ]);
  });

  it("throws when SQLite failed to load, before opening anything", async () => {
    fake.reset();
    const compileError = { type: "SqliteWasmCompileError", cause: null };
    await using run = testCreateRun();

    const defect = getDefect(
      await run.abortable(
        createWasmSqliteDriver(setupDriverDeps(err(compileError)))(testName, {
          mode: "memory",
        }),
      ),
    );

    assertSame(defect.cause, compileError);
    assertEqual(fake.state.events, []);
  });

  for (const poolError of [
    { type: "SahPoolSetupError", cause: null },
    heldError,
  ])
    it(`throws without retrying when the pool fails with ${poolError.type}`, async () => {
      fake.reset();
      fake.state.poolResults.push(err(poolError));
      await using run = testCreateRun();

      const driver = run.abortable(
        createWasmSqliteDriver(setupDriverDeps())(testName),
      );
      await flushMicrotasks();
      // Longer than a retry would wait.
      run.deps.time.advance("1s");

      const defect = getDefect(await driver);
      assertSame(defect.message, poolError.type);
      assertSame(defect.cause, poolError);
      assertEqual(fake.state.events, ["open pool .Test"]);
    });
});

describe("createWaitForDatabaseRelease", () => {
  it("opens the pool in .<name>, waiting up to 10 seconds for held files, and disposes it once it opens", async () => {
    fake.reset();
    await using run = testCreateRun();

    const released = await run(
      createWaitForDatabaseRelease(setupDriverDeps())(testName),
    );

    assertEqual(released, ok());
    assertEqual(fake.state.events, ["open pool .Test", "dispose pool"]);
    assertEqual(fake.state.poolOptions, [
      { directory: [".Test"], heldTimeout: "10s" },
    ]);
    assertSame(fake.state.poolDeps[0]?.opfsRoot, testOpfsRoot);
    assertSame(fake.state.poolDeps[0]?.sqliteWasm, fake.sqliteWasm);
  });

  it("fails with DatabaseHeldError when the pool is still held, without retrying itself", async () => {
    fake.reset();
    fake.state.poolResults.push(err(heldError));
    await using run = testCreateRun();

    const released = run(
      createWaitForDatabaseRelease(setupDriverDeps())(testName),
    );
    await flushMicrotasks();
    // Longer than a retry would wait.
    run.deps.time.advance("1s");

    assertEqual(
      await released,
      err({ type: "DatabaseHeldError", name: testName }),
    );
    assertEqual(fake.state.events, ["open pool .Test"]);
  });

  it("throws without retrying when the pool fails otherwise than held", async () => {
    fake.reset();
    const setupError = { type: "SahPoolSetupError", cause: null };
    fake.state.poolResults.push(err(setupError));
    await using run = testCreateRun();

    const defect = getDefect(
      await run.abortable(
        createWaitForDatabaseRelease(setupDriverDeps())(testName),
      ),
    );

    assertSame(defect.cause, setupError);
    assertEqual(fake.state.events, ["open pool .Test"]);
  });

  it("throws when SQLite failed to load, before opening anything", async () => {
    fake.reset();
    const compileError = { type: "SqliteWasmCompileError", cause: null };
    await using run = testCreateRun();

    const defect = getDefect(
      await run.abortable(
        createWaitForDatabaseRelease(setupDriverDeps(err(compileError)))(
          testName,
        ),
      ),
    );

    assertSame(defect.cause, compileError);
    assertEqual(fake.state.events, []);
  });
});

describe("loadSqliteWasm", () => {
  const setupFetch = () => {
    fake.reset();
    const requests: Array<unknown> = [];
    const responses: Array<Promise<Response>> = [];
    const run = testCreateRun({
      nativeFetch: (input) => {
        requests.push(input);
        const response = Promise.resolve(new Response());
        responses.push(response);
        return response;
      },
    });
    return { requests, responses, run };
  };

  it("compiles the response of a fetch of sqliteWasmUrl, before it arrives, so it can compile while it downloads", async () => {
    const { requests, responses, run } = setupFetch();
    await using _run = run;

    const result = await run(loadSqliteWasm);

    assertEqual(result, ok(fake.sqliteWasm));
    assertEqual(requests, [fake.exports.sqliteWasmUrl]);
    assertEqual(fake.state.createSqliteWasmSources.length, 1);
    assertSame(fake.state.createSqliteWasmSources[0], responses[0]);
  });

  it("fails as createSqliteWasm fails, such as with SqliteWasmCompileError for a failed fetch", async () => {
    const { run } = setupFetch();
    await using _run = run;
    const compileError = { type: "SqliteWasmCompileError", cause: null };
    fake.state.createSqliteWasmResult = err(compileError);

    const result = await run(loadSqliteWasm);

    assertEqual(result, err(compileError));
  });
});
