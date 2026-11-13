import {
  assertEqual,
  assertNonNullable,
  assertNotUndefined,
  assertRejectsSame,
  assertSame,
  assertThrows,
  assertTrue,
  constVoid,
  createQueryBuilder,
  createUnknownError,
  emptyArray,
  err,
  ok,
  testCreateBroadcastChannel,
  testCreateLockManager,
  testCreateMessageChannel,
  testCreateRun,
  testCreateSharedWorker,
  testCreateWorker,
  testEvoluSchema,
  testGlobalUnhandledRejections,
} from "@evolu/common";
import {
  createEvolu,
  isDatabaseDeleted,
  testAppName,
  testAppOwner,
  type Evolu,
  type EvoluApp,
  type EvoluOutput,
  type Query,
  type QueryRows,
  type SharedWorkerInput,
  type SharedWorkerOutput,
} from "@evolu/common/local-first";
import { installPolyfills } from "@evolu/common/polyfills";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createApp, createSSRApp, effectScope, h, shallowRef } from "vue";
import { renderToString } from "vue/server-renderer";
import { EvoluAppContext } from "./EvoluAppProvider.ts";
import { EvoluContext } from "./provideEvolu.ts";
import { useDeviceQueries, useQueries } from "./useQueries.ts";
import { useDeviceQuery, useQuery, waitForRows } from "./useQuery.ts";

// Evolu instances need them.
installPolyfills();

const createQuery = createQueryBuilder(testEvoluSchema);
const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());
const rows = [{ id: "todo" }] as unknown as QueryRows<typeof allTodos.Row>;

/** An Evolu stub whose loads and subscriptions are counted. */
const setupEvolu = () => {
  let loadCount = 0;
  let listenerCount = 0;
  // Only loadQuery, subscribeQuery, and getQueryRows are used by the composable.
  const evolu = {
    loadQuery: () => {
      loadCount++;
      return Promise.resolve(rows);
    },
    subscribeQuery: () => () => {
      listenerCount++;
      return () => {
        listenerCount--;
      };
    },
    getQueryRows: () => rows,
  } as unknown as Evolu;

  return {
    evolu,
    loadCount: () => loadCount,
    listenerCount: () => listenerCount,
  };
};

test("loads the query and subscribes until its scope is disposed", async () => {
  const { evolu, listenerCount } = setupEvolu();
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const scope = effectScope();

  const result = app.runWithContext(() => scope.run(() => useQuery(allTodos)));
  assertNotUndefined(result);
  assertSame(result.value, emptyArray);
  assertSame(listenerCount(), 1);
  await Promise.resolve();
  assertSame(result.value, rows);

  scope.stop();
  assertSame(listenerCount(), 0);
});

test("only loads the query during server rendering", async () => {
  const { evolu, loadCount, listenerCount } = setupEvolu();
  const app = createSSRApp({
    setup: () => {
      // oxlint-disable-next-line react/rules-of-hooks -- A Vue composable runs in setup.
      const result = useQuery(allTodos);
      return () => h("p", result.value.length);
    },
  });
  app.provide(EvoluContext, evolu);

  assertEqual(await renderToString(app), "<p>0</p>");
  assertSame(loadCount(), 1);
  assertSame(listenerCount(), 0);
});

test("useDeviceQuery loads and subscribes to a query of the device instance", async () => {
  const { evolu: device, loadCount, listenerCount } = setupEvolu();
  const app = createApp({});
  // Only device is used by the composable.
  app.provide(EvoluAppContext, { device } as unknown as EvoluApp<any, any>);
  const scope = effectScope();

  const result = app.runWithContext(() =>
    scope.run(() => useDeviceQuery(allTodos)),
  );
  assertNotUndefined(result);
  assertEqual([loadCount(), listenerCount()], [1, 1]);
  await Promise.resolve();
  assertSame(result.value, rows);

  scope.stop();
  assertSame(listenerCount(), 0);
});

/**
 * Creates an Evolu instance whose worker messages the test delivers, such as
 * the one that tells it a tab deleted its database.
 */
const setupDeletableEvolu = async () => {
  const disposer = new AsyncDisposableStack();
  const ports: Array<{
    readonly onMessage: ((output: EvoluOutput) => void) | null;
  }> = [];
  const run = disposer.use(
    testCreateRun({
      createDbWorker: testCreateWorker,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessageChannel: <Input, Output = never>() => {
        const channel = testCreateMessageChannel<Input, Output>();
        ports.push(channel.port1 as never);
        return channel;
      },
      getDevicePersistence: () => Promise.resolve("Unknown" as const),
      lockManager: testCreateLockManager(),
      reloadApp: constVoid,
      storedWorker: Promise.resolve(
        disposer.use(
          testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
        ),
      ),
    }),
  );
  const evolu = await run.ok(
    createEvolu(testEvoluSchema, {
      appName: testAppName,
      appOwner: testAppOwner,
      transports: [],
    }),
  );
  const deliver = (output: EvoluOutput): void => {
    const onMessage = ports.find((port) => port.onMessage)?.onMessage;
    assertNonNullable(onMessage);
    onMessage(output);
  };
  return {
    evolu,
    deliver,
    deleteDatabase: (): void => {
      deliver({ type: "OnDatabaseDeleted", removed: false });
    },
    [Symbol.asyncDispose]: () => disposer.disposeAsync(),
  };
};

test("shows no rows instead of using an instance whose database was deleted", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu, deliver, deleteDatabase } = setup;
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  // A device instance's database is never deleted, so the deleted instance
  // stands in for the device, to prove that the device composables check too.
  app.provide(EvoluAppContext, { device: evolu } as unknown as EvoluApp<
    any,
    any
  >);
  const before = effectScope();
  const shown = app.runWithContext(() => before.run(() => useQuery(allTodos)));
  assertNotUndefined(shown);
  deliver({
    type: "OnPatchesByQuery",
    patchesByQuery: new Map([
      [allTodos, ok([{ op: "replaceAll", value: [{ id: "todo" }] }])],
    ]),
    callbackIds: [],
  });
  await Promise.resolve();
  assertEqual(shown.value, [{ id: "todo" }]);

  deleteDatabase();
  await Promise.resolve();
  assertTrue(isDatabaseDeleted(evolu));
  assertSame(shown.value, emptyArray);

  // A component the app hasn't replaced yet, such as one that shows when the
  // rows are empty, sets up after the deletion.
  const after = effectScope();
  const results = app.runWithContext(() =>
    after.run(() => [
      useQuery(allTodos),
      useQuery(allTodos, { once: true }),
      useDeviceQuery(allTodos),
      ...useQueries([allTodos], { once: [allTodos] }),
      ...useDeviceQueries([allTodos]),
    ]),
  );
  assertNotUndefined(results);
  await Promise.resolve();
  assertEqual(
    results.map((rows) => rows.value),
    results.map(() => emptyArray),
  );

  // Each subscription ends once.
  after.stop();
  before.stop();
});

/** An Evolu stub whose loads the test settles, one per query. */
const setupLoadingEvolu = () => {
  const loadsByQuery = new Map<
    Query<any, any>,
    PromiseWithResolvers<QueryRows<any>>
  >();
  // Only loadQuery, subscribeQuery, and getQueryRows are used by the composables.
  const evolu = {
    loadQuery: (query: Query<any, any>) => {
      let load = loadsByQuery.get(query);
      if (!load) {
        load = Promise.withResolvers();
        loadsByQuery.set(query, load);
      }
      return load.promise;
    },
    subscribeQuery: () => () => constVoid,
    getQueryRows: () => emptyArray,
  } as unknown as Evolu;
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  // Only device is used by the device composables.
  app.provide(EvoluAppContext, { device: evolu } as unknown as EvoluApp<
    any,
    any
  >);
  const scope = effectScope();
  const loadOf = (query: Query<any, any>) => {
    const load = loadsByQuery.get(query);
    assertNonNullable(load);
    return load;
  };
  const runInScope = <T>(fn: () => T): T => {
    const result = app.runWithContext(() => scope.run(fn));
    assertNotUndefined(result);
    return result;
  };
  return { loadOf, runInScope, scope };
};

const allProjects = createQuery((db) => db.selectFrom("project").selectAll());

/** Whether the promise settles within a few event loop turns. */
const settledWithin = (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(
      () => "resolved",
      () => "rejected",
    ),
    setImmediate().then(() => "pending"),
  ]);

test("waitForRows waits for the first load of each query", async () => {
  const { loadOf, runInScope, scope } = setupLoadingEvolu();
  const [todos, projects] = runInScope(() => [
    useQuery(allTodos),
    ...useQueries([allProjects]),
  ]);
  const waited = waitForRows(todos, projects);

  loadOf(allTodos).resolve(rows);
  assertSame(await settledWithin(waited), "pending");
  const projectRows = [{ id: "project" }] as unknown as QueryRows<
    typeof allProjects.Row
  >;
  loadOf(allProjects).resolve(projectRows);
  await waited;
  assertEqual([todos.value, projects.value], [rows, projectRows]);
  scope.stop();
});

// Node's test runner fails a test on an unhandled rejection, so these tests
// prove that none is reported, and the browser tests that one is.
test("waitForRows rejects with the first failure, which it doesn't also report as an unhandled rejection", async () => {
  using unhandledRejections = testGlobalUnhandledRejections();
  const { loadOf, runInScope, scope } = setupLoadingEvolu();
  const [todos, projects] = runInScope(() => [
    useQuery(allTodos),
    useDeviceQuery(allProjects),
  ]);
  const error = createUnknownError("SQLite failed the query.");

  const waited = waitForRows(todos, projects);
  loadOf(allTodos).reject(error);
  loadOf(allProjects).reject(createUnknownError("Another failure."));

  await assertRejectsSame(waited, error);
  await setImmediate();
  assertEqual(unhandledRejections.errors, []);
  scope.stop();
});

test("waitForRows throws for rows that no query composable returned", () => {
  assertThrows(
    () => waitForRows(shallowRef(rows)),
    (thrown) => {
      assertTrue(thrown instanceof Error);
      assertTrue(thrown.message.startsWith("waitForRows takes only rows"));
    },
  );
});

test("waitForRows stays pending for rows of an instance whose database was deleted", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu, deleteDatabase } = setup;
  deleteDatabase();
  await Promise.resolve();
  assertTrue(isDatabaseDeleted(evolu));
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const scope = effectScope();

  const todos = app.runWithContext(() => scope.run(() => useQuery(allTodos)));
  assertNotUndefined(todos);

  assertSame(await settledWithin(waitForRows(todos)), "pending");
  scope.stop();
});

test("waitForRows stays pending while a refused database answers no load, and resolves at the instance's disposal", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu } = setup;
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const scope = effectScope();
  // Nothing answers the instance's loads, as for a refused database.
  const todos = app.runWithContext(() => scope.run(() => useQuery(allTodos)));
  assertNotUndefined(todos);
  const waited = waitForRows(todos);
  assertSame(await settledWithin(waited), "pending");

  await evolu[Symbol.asyncDispose]();
  await waited;
  assertSame(todos.value, emptyArray);
  scope.stop();
});

test("waitForRows keeps the first load when a later refresh fails", async () => {
  using unhandledRejections = testGlobalUnhandledRejections();
  await using setup = await setupDeletableEvolu();
  const { evolu, deliver } = setup;
  const app = createApp({});
  app.provide(EvoluContext, evolu);
  const scope = effectScope();
  const todos = app.runWithContext(() => scope.run(() => useQuery(allTodos)));
  assertNotUndefined(todos);
  deliver({
    type: "OnPatchesByQuery",
    patchesByQuery: new Map([
      [allTodos, ok([{ op: "replaceAll", value: [{ id: "todo" }] }])],
    ]),
    callbackIds: [],
  });
  await waitForRows(todos);

  deliver({
    type: "OnPatchesByQuery",
    patchesByQuery: new Map([
      [allTodos, err(createUnknownError("SQLite failed the refresh."))],
    ]),
    callbackIds: [],
  });
  await setImmediate();

  await waitForRows(todos);
  assertEqual(todos.value, [{ id: "todo" }]);
  assertEqual(unhandledRejections.errors, []);
  scope.stop();
});
