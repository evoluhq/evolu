import {
  assertEqual,
  assertInstanceOf,
  constVoid,
  createRun,
  createUnknownError,
  id,
  ok,
  testStubGlobal,
  testWaitForWorkerMessage,
  type CreateSqliteDriver,
  type EvoluDeps,
  type EvoluError,
  type SqliteRow,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  createOwnerWebSocketTransport,
  createQueryBuilder,
  testAppOwner,
} from "@evolu/common/local-first";
import { installPolyfills } from "@evolu/common/polyfills";
import { DatabaseSync } from "node:sqlite";
import { describe, it, mock } from "node:test";
import { createEvoluDeps } from "./shared.ts";

installPolyfills();

/**
 * Creates a SQLite driver for an in-memory node:sqlite database. `onExec` sees
 * each statement first and can throw to fail it.
 */
const setupNodeSqliteDriver =
  (onExec: (sql: string) => void = constVoid): CreateSqliteDriver =>
  () =>
  () => {
    const db = new DatabaseSync(":memory:");
    return ok({
      exec: ({ sql, parameters }) => {
        onExec(sql);
        const statement = db.prepare(sql);
        if (statement.columns().length === 0) {
          const { changes } = statement.run(...parameters);
          return { rows: [], changes: Number(changes) };
        }
        const rows = statement.all(...parameters) as Array<SqliteRow>;
        return { rows, changes: 0 };
      },
      export: () => new Uint8Array(),
      deleteDatabase: constVoid,
      [Symbol.dispose]: () => {
        db.close();
      },
    });
  };

/** Resolves with the deps' first EvoluError. */
const waitForEvoluError = (deps: EvoluDeps): Promise<EvoluError | null> =>
  new Promise((resolve) => {
    const unsubscribe = deps.evoluError.subscribe(() => {
      unsubscribe();
      resolve(deps.evoluError.get());
    });
  });

/** Resolves once the deps' worker has connected and published sync state. */
const waitForSyncState = (deps: EvoluDeps): Promise<void> =>
  new Promise((resolve) => {
    const unsubscribe = deps.syncState.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });

describe("createEvoluDeps", () => {
  it("connects deps created again to the running shared worker", async () => {
    const createDeps = () =>
      createEvoluDeps({
        reloadApp: constVoid,
        createSqliteDriver: () => {
          throw new Error("No database is opened.");
        },
      });

    const first = createDeps();
    await waitForSyncState(first);
    first[Symbol.dispose]();

    // A second in-process worker would wait for the build lock forever.
    using second = createDeps();
    await waitForSyncState(second);
  });

  it("starts another shared worker after the running one panics", async () => {
    const reported = Promise.withResolvers<unknown>();
    const reportError = mock.fn<NonNullable<typeof ErrorUtils>["reportError"]>(
      (error) => {
        reported.resolve(error);
      },
    );
    using _errorUtils = testStubGlobal("ErrorUtils", {
      getGlobalHandler: () => null,
      setGlobalHandler:
        mock.fn<NonNullable<typeof ErrorUtils>["setGlobalHandler"]>(),
      reportError,
    });
    const createDeps = () =>
      createEvoluDeps({
        reloadApp: constVoid,
        createSqliteDriver: setupNodeSqliteDriver(),
      });

    using first = createDeps();
    await using run = createRun(first);
    await using evolu = await run.ok(
      createEvolu(
        { todo: { id: id("Todo") } },
        {
          appName: AppName.orThrow("panic"),
          appOwner: testAppOwner,
          transports: [],
          memoryOnly: true,
        },
      ),
    );
    // The same transport twice in one claim is a defect that panics the
    // worker's root Run.
    const transport = createOwnerWebSocketTransport({
      url: "wss://panic.example",
      ownerId: testAppOwner.id,
    });
    evolu.useOwner(testAppOwner, [transport, transport]);
    const defect = await reported.promise;
    assertInstanceOf(defect, Error);
    assertEqual(
      defect.message,
      "resourceKeys must not contain lookup duplicates.",
    );
    // Each tab also sets the panic's defect as its evoluError.
    await testWaitForWorkerMessage();
    assertEqual(first.evoluError.get(), createUnknownError(defect));

    // The failed worker drops later messages, as a closed web SharedWorker
    // does, so creating another instance on the same deps does not run on its
    // disposed Run.
    await using _other = await run.ok(
      createEvolu(
        { todo: { id: id("Todo") } },
        {
          appName: AppName.orThrow("afterPanic"),
          appOwner: testAppOwner,
          transports: [],
          memoryOnly: true,
        },
      ),
    );
    await testWaitForWorkerMessage();

    // Deps connected to the failed worker would never get sync state.
    using second = createDeps();
    await waitForSyncState(second);

    // The worker's panic is still reported once.
    assertEqual(
      reportError.mock.calls.map((call) => call.arguments[0]),
      [defect],
    );
  });

  it("reports a database that fails to open as an UnknownError", async () => {
    const reportError =
      mock.fn<NonNullable<typeof ErrorUtils>["reportError"]>();
    using _errorUtils = testStubGlobal("ErrorUtils", {
      getGlobalHandler: () => null,
      setGlobalHandler:
        mock.fn<NonNullable<typeof ErrorUtils>["setGlobalHandler"]>(),
      reportError,
    });
    const error = new Error("No SQLCipher.");
    using deps = createEvoluDeps({
      reloadApp: constVoid,
      createSqliteDriver: () => () => {
        throw error;
      },
    });
    const evoluError = waitForEvoluError(deps);
    await using run = createRun(deps);
    await using _evolu = await run.ok(
      createEvolu(
        { todo: { id: id("Todo") } },
        {
          appName: AppName.orThrow("failed"),
          appOwner: testAppOwner,
          transports: [],
          memoryOnly: true,
        },
      ),
    );

    assertEqual(await evoluError, createUnknownError(error));
    // The worker's panic is still reported once.
    assertEqual(
      reportError.mock.calls.map((call) => call.arguments[0]),
      [error],
    );
  });

  it("reports a database whose query SQLite fails as an UnknownError", async () => {
    const reportError =
      mock.fn<NonNullable<typeof ErrorUtils>["reportError"]>();
    using _errorUtils = testStubGlobal("ErrorUtils", {
      getGlobalHandler: () => null,
      setGlobalHandler:
        mock.fn<NonNullable<typeof ErrorUtils>["setGlobalHandler"]>(),
      reportError,
    });
    const error = new Error("no such column: title");
    using deps = createEvoluDeps({
      reloadApp: constVoid,
      createSqliteDriver: setupNodeSqliteDriver((sql) => {
        if (sql.includes('from "todo"')) throw error;
      }),
    });
    const evoluError = waitForEvoluError(deps);
    const schema = { todo: { id: id("Todo") } };
    await using run = createRun(deps);
    await using evolu = await run.ok(
      createEvolu(schema, {
        appName: AppName.orThrow("query"),
        appOwner: testAppOwner,
        transports: [],
        memoryOnly: true,
      }),
    );

    void evolu.loadQuery(
      createQueryBuilder(schema)((db) => db.selectFrom("todo").select("id")),
    );

    assertEqual(await evoluError, createUnknownError(error));
    // The worker's panic is reported once.
    assertEqual(
      reportError.mock.calls.map((call) => call.arguments[0]),
      [error],
    );
  });
});
