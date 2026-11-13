import {
  assert,
  assertEqual,
  assertType,
  assertNonNullable,
  assertSame,
  assertTrue,
  constVoid,
  createId,
  createQueryBuilder,
  createStore,
  createUnknownError,
  emptyArray,
  err,
  Millis,
  Name,
  ok,
  testCreateDeps,
  testName,
  testCreateBroadcastChannel,
  testCreateLockManager,
  testCreateMessageChannel,
  testCreateRun,
  testCreateSharedWorker,
  testCreateWorker,
  testEvoluSchema,
  testGlobalUnhandledRejections,
  type ReadonlyStore,
} from "@evolu/common";
import {
  createEvolu,
  createOwnerWebSocketTransport,
  deriveShardOwner,
  isDatabaseDeleted,
  RelayUrl,
  testAppName,
  testAppOwner,
  type AppOwnerEntry,
  type AppOwnerEvolu,
  type AppOwnerState,
  type CurrentAppOwner,
  type DeviceEvolu,
  type EvoluApp,
  type EvoluOutput,
  type Owner,
  type OwnerId,
  type OwnerSyncStatus,
  type PendingSyncRoute,
  type QueryRows,
  type SharedWorkerInput,
  type SharedWorkerOutput,
  type SyncRoute,
  type SyncState,
} from "@evolu/common/local-first";
import { installPolyfills } from "@evolu/common/polyfills";
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { after, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { compileModule } from "svelte/compiler";
// A type-only import, which loads nothing before the mocks below.
import type { EvoluAppState, QueryState } from "./index.svelte.ts";

// Runes work only in compiled modules, so .svelte.ts modules are compiled as
// they load. The Svelte compiler parses JavaScript, so types are stripped first.
// Svelte resolves as in a browser: its entry for Node.js is the server's, whose
// `untrack` only calls its function.
const svelteHooks = registerHooks({
  resolve: (specifier, context, nextResolve) =>
    nextResolve(
      specifier,
      specifier === "svelte"
        ? { ...context, conditions: [...context.conditions, "browser"] }
        : context,
    ),
  load: (url, context, nextLoad) => {
    if (!url.endsWith(".svelte.ts")) return nextLoad(url, context);
    const filename = fileURLToPath(url);
    const { js } = compileModule(
      stripTypeScriptTypes(readFileSync(filename, "utf8")),
      { filename, generate: "client" },
    );
    return { format: "module", shortCircuit: true, source: js.code };
  },
});

// The module creates web dependencies on import, which need browser APIs.
mock.module("@evolu/web", {
  exports: { createEvoluDeps: () => ({}) },
});

after(() => {
  svelteHooks.deregister();
});

// Evolu instances need them.
installPolyfills();

const {
  evoluAppState,
  ownerSync,
  ownerSyncStatusState,
  queryState,
  storeState,
} = await import("./index.svelte.ts");
// Runes compile to these. queryState's `$effect` needs a parent effect, as in
// a component, which `$effect.root` creates, and `$state` makes a query
// reactive.
const {
  effect_root: effectRoot,
  get,
  set,
  state,
  user_effect: userEffect,
} = (await import(
  // @ts-expect-error -- Svelte's internal client runtime has no type declarations.
  "svelte/internal/client"
)) as {
  readonly effect_root: (fn: () => void) => () => void;
  readonly state: <T>(value: T) => Signal<T>;
  readonly get: <T>(signal: Signal<T>) => T;
  readonly set: <T>(signal: Signal<T>, value: T) => void;
  readonly user_effect: (fn: () => void) => void;
};

/** The part of Svelte's internal signal that types its value. */
interface Signal<T> {
  readonly v: T;
}

const createQuery = createQueryBuilder(testEvoluSchema);
const allTodos = createQuery((db) =>
  db.selectFrom("todo").select(["id", "title"]),
);
const firstTodo = createQuery((db) =>
  db.selectFrom("todo").select(["id", "title"]).limit(1),
);
type TodoQuery = typeof allTodos;
type TodoRows = QueryRows<TodoQuery["Row"]>;

const allTodosRows = [
  { id: "todo", title: "Buy milk" },
  { id: "other", title: "Walk the dog" },
] as unknown as TodoRows;
const firstTodoRows = [
  { id: "todo", title: "Buy milk" },
] as unknown as TodoRows;

/**
 * Stubs the query API of Evolu, which caches one load per query. Resolving a
 * load stores its rows and notifies subscribers before awaiters of the load
 * run.
 */
const setupEvolu = () => {
  const loadsByQuery = new Map<
    TodoQuery,
    {
      readonly promise: Promise<TodoRows>;
      readonly resolve: (rows: TodoRows) => void;
      readonly reject: (error: unknown) => void;
    }
  >();
  const rowsByQuery = new Map<TodoQuery, TodoRows>();
  const listenersByQuery = new Map<TodoQuery, Set<() => void>>();

  // Only loadQuery, subscribeQuery, and getQueryRows are used by queryState.
  const evolu = {
    loadQuery: (query: TodoQuery) => {
      let load = loadsByQuery.get(query);
      if (!load) {
        // The package targets ES2017, which has no Promise.withResolvers.
        let resolve!: (rows: TodoRows) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<TodoRows>(
          (resolvePromise, rejectPromise) => {
            resolve = resolvePromise;
            reject = rejectPromise;
          },
        );
        load = { promise, resolve, reject };
        loadsByQuery.set(query, load);
      }
      return load.promise;
    },
    subscribeQuery: (query: TodoQuery) => (listener: () => void) => {
      const listeners = listenersByQuery.get(query) ?? new Set();
      listenersByQuery.set(query, listeners.add(listener));
      return () => {
        listeners.delete(listener);
      };
    },
    getQueryRows: (query: TodoQuery) => rowsByQuery.get(query) ?? emptyArray,
    // The narrowest instance queryState takes, so these tests also prove it
    // takes an AppOwnerEvolu and the device database's instance.
  } as unknown as DeviceEvolu<typeof testEvoluSchema>;

  const resolveLoad = (query: TodoQuery, rows: TodoRows): void => {
    const load = loadsByQuery.get(query);
    // Evolu reads only queries that loadQuery requested.
    assert(load, "The query was not loaded.");
    load.resolve(rows);
    rowsByQuery.set(query, rows);
    for (const listener of listenersByQuery.get(query) ?? []) listener();
  };

  const loadOf = (query: TodoQuery) => {
    const load = loadsByQuery.get(query);
    assert(load, "The query was not loaded.");
    return load;
  };

  return { evolu, resolveLoad, loadOf };
};

/** Runs queryState over a reactive query, as a component would, and loads it. */
const setupQueryState = async () => {
  const { evolu, resolveLoad } = setupEvolu();
  const query = state<TodoQuery | undefined>(allTodos);
  let todos!: { readonly rows: TodoRows };
  const dispose = effectRoot(() => {
    todos = queryState(evolu, () => get(query));
  });
  await setImmediate();
  resolveLoad(allTodos, allTodosRows);
  await setImmediate();

  return { query, resolveLoad, todos, dispose };
};

test("returns loaded rows", async () => {
  const { todos, dispose } = await setupQueryState();

  assertSame(todos.rows, allTodosRows);
  dispose();
});

test("has no rows while a new query loads", async () => {
  const { query, todos, dispose } = await setupQueryState();
  set(query, firstTodo);
  await setImmediate();

  assertSame(todos.rows, emptyArray);
  dispose();
});

test("keeps rows of the current query when a previous query loads", async () => {
  const { query, resolveLoad, todos, dispose } = await setupQueryState();

  // Switching back before firstTodo loads reuses the resolved load of
  // allTodos, so the load of firstTodo resolves last.
  set(query, firstTodo);
  await setImmediate();
  set(query, allTodos);
  await setImmediate();
  resolveLoad(firstTodo, firstTodoRows);
  await setImmediate();

  assertSame(todos.rows, allTodosRows);
  dispose();
});

test("has no rows without a query", async () => {
  const { query, todos, dispose } = await setupQueryState();
  set(query, undefined);
  await setImmediate();

  assertSame(todos.rows, emptyArray);
  dispose();
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
  let todos!: { readonly rows: TodoRows };
  let dependent!: { readonly rows: TodoRows };
  const dispose = effectRoot(() => {
    todos = queryState(evolu, () => allTodos);
    // A query that depends on other rows, so its effect runs again when the
    // deletion empties them.
    let hasLoaded = false;
    dependent = queryState(evolu, () => {
      if (todos.rows.length > 0) hasLoaded = true;
      return hasLoaded && todos.rows.length === 0 ? firstTodo : allTodos;
    });
  });
  await setImmediate();
  deliver({
    type: "OnPatchesByQuery",
    patchesByQuery: new Map([
      [allTodos, ok([{ op: "replaceAll", value: allTodosRows }])],
    ]),
    callbackIds: [],
  });
  await setImmediate();
  assertEqual(dependent.rows, allTodosRows);

  deleteDatabase();
  await setImmediate();
  assertTrue(isDatabaseDeleted(evolu));
  assertEqual([todos.rows, dependent.rows], [emptyArray, emptyArray]);

  // A component the app hasn't replaced yet initializes after the deletion.
  let created!: { readonly rows: TodoRows };
  const disposeCreated = effectRoot(() => {
    created = queryState(evolu, () => allTodos);
  });
  await setImmediate();
  assertSame(created.rows, emptyArray);

  // Each subscription ends once.
  disposeCreated();
  dispose();
});

/** A store that counts its listeners. */
const createCountingStore = <T>(initialValue: T) => {
  const store = createStore(initialValue);
  let listenerCount = 0;
  const counted: ReadonlyStore<T> = {
    ...store,
    subscribe: (listener) => {
      listenerCount++;
      const unsubscribe = store.subscribe(listener);
      return () => {
        listenerCount--;
        unsubscribe();
      };
    },
  };
  return { store, counted, listenerCount: () => listenerCount };
};

type TestSchema = typeof testEvoluSchema;

// Only the name tells the instances apart in these tests.
const createInstance = (name: string) =>
  ({ name }) as unknown as AppOwnerEvolu<TestSchema>;

const appOwnerEntries: ReadonlyArray<AppOwnerEntry> = [
  { id: testAppOwner.id, name: null, lastOpenedAt: null },
];

/** The package targets ES2017, which has no Promise.withResolvers. */
const createOpening = () => {
  let resolve!: (instance: AppOwnerEvolu<TestSchema>) => void;
  const promise = new Promise<AppOwnerEvolu<TestSchema>>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const currentOf = (
  evolu: Promise<AppOwnerEvolu<TestSchema>>,
): CurrentAppOwner<TestSchema> => ({ appOwner: testAppOwner, evolu });

/** Runs evoluAppState over an EvoluApp stub, as a component would. */
const setupEvoluAppState = async (
  initialCurrent: CurrentAppOwner<TestSchema> | null,
) => {
  const current = createCountingStore(initialCurrent);
  const appOwners = createCountingStore(appOwnerEntries);
  // Only current and appOwners are used by evoluAppState.
  const app = {
    current: current.counted,
    appOwners: appOwners.counted,
  } as unknown as EvoluApp<TestSchema>;
  let appState!: EvoluAppState<TestSchema>;
  // Every instance an `Open` state has, as a component keyed by it sees them.
  const evolus: Array<AppOwnerEvolu<TestSchema> | null> = [];
  const dispose = effectRoot(() => {
    appState = evoluAppState(app);
    userEffect(() => {
      evolus.push(openEvolu(appState.state));
    });
  });
  await setImmediate();

  return {
    appState,
    evolus,
    setCurrent: (value: CurrentAppOwner<TestSchema> | null) => {
      current.store.set(value);
    },
    setAppOwners: (value: ReadonlyArray<AppOwnerEntry>) => {
      appOwners.store.set(value);
    },
    listenerCounts: () => [current.listenerCount(), appOwners.listenerCount()],
    dispose,
  };
};

const openEvolu = (state: AppOwnerState<TestSchema>) =>
  state.type === "Open" ? state.evolu : null;

// Each read of `state` narrows anew: TypeScript would keep a narrowing of the
// getter across the awaits that change it.
const openingOf = (state: AppOwnerState<TestSchema>) => {
  assert(state.type === "Opening", `Expected Opening, got ${state.type}`);
  return state;
};

const openOf = (state: AppOwnerState<TestSchema>) => {
  assert(state.type === "Open", `Expected Open, got ${state.type}`);
  return state;
};

test("evoluAppState types an app without device tables by default", () => {
  assertType<
    Parameters<typeof evoluAppState<TestSchema>>[0],
    // EvoluApp's device schema defaults to EmptyEvoluSchema too.
    EvoluApp<TestSchema>
  >();
});

test("evoluAppState is Opening with the current AppOwner, then Open with its instance", async () => {
  const opening = createOpening();
  const opened = currentOf(opening.promise);
  const { appState, dispose } = await setupEvoluAppState(opened);

  assertSame(openingOf(appState.state).current, opened);
  const instance = createInstance("a");
  opening.resolve(instance);
  await setImmediate();
  assertSame(openOf(appState.state).current, opened);
  assertSame(openOf(appState.state).evolu, instance);
  dispose();
});

test("evoluAppState follows the app's current AppOwner and AppOwners", async () => {
  const { appState, evolus, setCurrent, setAppOwners, dispose } =
    await setupEvoluAppState(null);
  assertEqual(appState.state, { type: "None" });
  assertSame(appState.appOwners, appOwnerEntries);

  const instance = createInstance("a");
  const opened = currentOf(Promise.resolve(instance));
  setCurrent(opened);
  await setImmediate();
  assertSame(openOf(appState.state).current, opened);
  assertSame(openOf(appState.state).evolu, instance);

  // Another CurrentAppOwner with the same instance keeps it, also while the
  // effects run again, so children keyed by it don't remount.
  const sameInstance = currentOf(opened.evolu);
  setCurrent(sameInstance);
  await setImmediate();
  assertSame(openOf(appState.state).current, sameInstance);
  assertSame(openOf(appState.state).evolu, instance);
  // The effect runs on every change of the state, so compare its changes.
  assertEqual(
    evolus.filter((evolu, index) => index === 0 || evolu !== evolus[index - 1]),
    [null, instance],
  );

  setCurrent(null);
  assertEqual(appState.state, { type: "None" });

  const next = [
    ...appOwnerEntries,
    { id: "other" as OwnerId, name: null, lastOpenedAt: null },
  ];
  setAppOwners(next);
  assertSame(appState.appOwners, next);
  dispose();
});

test("evoluAppState is Opening while another instance opens, and ignores one that opens after the tab moved on", async () => {
  const openingA = createOpening();
  const openingB = createOpening();
  const { appState, setCurrent, dispose } = await setupEvoluAppState(
    currentOf(Promise.resolve(createInstance("first"))),
  );
  assertSame(openEvolu(appState.state)?.name, "first");

  const currentA = currentOf(openingA.promise);
  setCurrent(currentA);
  assertSame(openingOf(appState.state).current, currentA);
  await setImmediate();
  const currentB = currentOf(openingB.promise);
  setCurrent(currentB);
  await setImmediate();
  assertSame(openingOf(appState.state).current, currentB);
  const instance = createInstance("b");
  openingB.resolve(instance);
  await setImmediate();
  assertSame(openEvolu(appState.state), instance);

  openingA.resolve(createInstance("a"));
  await setImmediate();
  assertSame(openOf(appState.state).current, currentB);
  assertSame(openOf(appState.state).evolu, instance);
  dispose();
});

test("evoluAppState is Opening with the current AppOwner before its effect runs", () => {
  const opened = currentOf(createOpening().promise);
  // Only current and appOwners are used by evoluAppState.
  const app = {
    current: createStore<CurrentAppOwner<TestSchema> | null>(opened),
    appOwners: createStore(appOwnerEntries),
  } as unknown as EvoluApp<TestSchema>;
  let appState!: EvoluAppState<TestSchema>;
  const dispose = effectRoot(() => {
    appState = evoluAppState(app);
  });

  // A component's first render, before its effects run, shows no choice.
  assertSame(openingOf(appState.state).current, opened);
  dispose();
});

test("evoluAppState reads a change made before its effect ran", async () => {
  const current = createStore<CurrentAppOwner<TestSchema> | null>(null);
  const appOwners = createStore(appOwnerEntries);
  // Only current and appOwners are used by evoluAppState.
  const app = { current, appOwners } as unknown as EvoluApp<TestSchema>;
  let appState!: EvoluAppState<TestSchema>;
  const dispose = effectRoot(() => {
    appState = evoluAppState(app);
  });
  // Effects run after initialization, as a component's run after it mounts.
  const instance = createInstance("a");
  const opened = currentOf(Promise.resolve(instance));
  current.set(opened);
  const next: ReadonlyArray<AppOwnerEntry> = [];
  appOwners.set(next);
  await setImmediate();

  assertSame(openOf(appState.state).current, opened);
  assertSame(openOf(appState.state).evolu, instance);
  assertSame(appState.appOwners, next);
  dispose();
});

test("evoluAppState isn't tracked by an effect that opens an AppOwner", async () => {
  const current = createStore<CurrentAppOwner<TestSchema> | null>(null);
  const opening = createOpening();
  const opened = currentOf(opening.promise);
  // Only current, appOwners, and open are used here. An open sets current
  // synchronously, as the app's does.
  const app = {
    current,
    appOwners: createStore(appOwnerEntries),
    open: () => {
      current.set(opened);
    },
  } as unknown as EvoluApp<TestSchema>;
  let appState!: EvoluAppState<TestSchema>;
  let opens = 0;
  const dispose = effectRoot(() => {
    appState = evoluAppState(app);
    userEffect(() => {
      opens++;
      app.open(testAppOwner.id);
    });
  });
  await setImmediate();

  opening.resolve(createInstance("a"));
  await setImmediate();
  assertSame(openOf(appState.state).current, opened);
  assertSame(opens, 1);
  dispose();
});

test("evoluAppState stops following the app when its root is destroyed while an instance opens", async () => {
  const opening = createOpening();
  const opened = currentOf(opening.promise);
  const { appState, listenerCounts, dispose } =
    await setupEvoluAppState(opened);

  assertEqual(listenerCounts(), [1, 1]);
  dispose();
  assertEqual(listenerCounts(), [0, 0]);
  // An instance that opens later changes nothing.
  opening.resolve(createInstance("a"));
  await setImmediate();
  assertSame(openingOf(appState.state).current, opened);
});

test("evoluAppState waits for no open when its root is destroyed before its effect runs", async () => {
  const opening = createOpening();
  const opened = currentOf(opening.promise);
  // Only current and appOwners are used by evoluAppState.
  const app = {
    current: createStore(opened),
    appOwners: createStore(appOwnerEntries),
  } as unknown as EvoluApp<TestSchema>;
  let appState!: EvoluAppState<TestSchema>;
  const dispose = effectRoot(() => {
    appState = evoluAppState(app);
  });

  dispose();
  opening.resolve(createInstance("a"));
  await setImmediate();
  assertSame(openingOf(appState.state).current, opened);
});

/** An instance stub that records each owner registration and its release. */
const setupOwnerSync = () => {
  const calls: Array<string> = [];
  // Only useOwner is used by ownerSync.
  const evolu = {
    useOwner: (
      owner: { readonly id: OwnerId },
      transports?: ReadonlyArray<unknown>,
    ) => {
      const name = `${owner.id === testAppOwner.id ? "app" : "other"}${transports ? ` ${transports.length}` : ""}`;
      calls.push(`use ${name}`);
      return () => {
        calls.push(`unuse ${name}`);
      };
    },
  } as unknown as AppOwnerEvolu<TestSchema>;
  return { calls, evolu };
};

const relayTransport = (url: string) =>
  createOwnerWebSocketTransport({
    url: RelayUrl.orThrow(url),
    ownerId: testAppOwner.id,
  });

test("ownerSync uses the owner until its root is destroyed", async () => {
  const { calls, evolu } = setupOwnerSync();
  const dispose = effectRoot(() => {
    ownerSync(evolu, () => testAppOwner);
  });
  await setImmediate();
  assertEqual(calls, ["use app"]);

  dispose();
  assertEqual(calls, ["use app", "unuse app"]);
});

test("ownerSync keeps the registration for an owner and transports recreated with the same content", async () => {
  const { calls, evolu } = setupOwnerSync();
  const owner = state<Owner | null>(testAppOwner);
  const transports = state([relayTransport("wss://relay.example/")] as const);
  const dispose = effectRoot(() => {
    ownerSync(
      evolu,
      () => get(owner),
      () => get(transports),
    );
  });
  await setImmediate();

  set(owner, { ...testAppOwner });
  set(transports, [relayTransport("wss://relay.example/")] as const);
  await setImmediate();
  assertEqual(calls, ["use app 1"]);
  dispose();
});

test("ownerSync uses another registration when the owner or transports change", async () => {
  const { calls, evolu } = setupOwnerSync();
  const owner = state<Owner | null>(testAppOwner);
  const transports = state<
    ReadonlyArray<ReturnType<typeof relayTransport>> | undefined
  >(undefined);
  const dispose = effectRoot(() => {
    ownerSync(
      evolu,
      () => get(owner),
      () =>
        get(transports) as
          readonly [ReturnType<typeof relayTransport>] | undefined,
    );
  });
  await setImmediate();

  set(transports, [relayTransport("wss://relay.example/")]);
  await setImmediate();
  set(owner, deriveShardOwner(testAppOwner, ["shard", 1]));
  await setImmediate();
  assertEqual(calls, [
    "use app",
    "unuse app",
    "use app 1",
    "unuse app 1",
    "use other 1",
  ]);
  dispose();
});

test("ownerSync uses no owner while it is null", async () => {
  const { calls, evolu } = setupOwnerSync();
  const owner = state<Owner | null>(null);
  const dispose = effectRoot(() => {
    ownerSync(evolu, () => get(owner));
  });
  await setImmediate();
  assertEqual(calls, []);

  set(owner, testAppOwner);
  await setImmediate();
  set(owner, null);
  await setImmediate();
  assertEqual(calls, ["use app", "unuse app"]);
  dispose();
});

test("ownerSync uses no owner of an instance whose database was deleted", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu, deleteDatabase } = setup;
  deleteDatabase();
  await setImmediate();
  assertTrue(isDatabaseDeleted(evolu));

  // A component the app hasn't replaced yet initializes after the deletion.
  // The instance's useOwner would throw.
  const dispose = effectRoot(() => {
    ownerSync(evolu, () => testAppOwner);
  });
  await setImmediate();
  dispose();
});

/** A sync state store that counts its listeners. */
const setupSyncState = (initialState: SyncState | null) => {
  const { store, counted, listenerCount } =
    createCountingStore<SyncState | null>(initialState);
  return { store, syncState: counted, listenerCount };
};

// Only name and appOwner are used by ownerSyncStatusState.
const syncedEvolu = {
  name: testName,
  appOwner: testAppOwner,
} as unknown as AppOwnerEvolu<TestSchema>;

const transportId = createId<"SyncTransport">(testCreateDeps());

/** A snapshot of one owner of one database with one route. */
const stateOf = (
  route: SyncRoute,
  {
    name = testName,
    ownerId = testAppOwner.id,
  }: { name?: Name; ownerId?: OwnerId } = {},
): SyncState => ({
  transports: [
    {
      type: "WebSocket",
      id: transportId,
      label: RelayUrl.orThrow("wss://relay.example/"),
      connection: { type: "Open", openedAt: Millis.orThrow(1000), error: null },
    },
  ],
  tenants: [
    {
      type: "Active",
      name,
      owners: [{ type: "Writable", ownerId, routes: [route] }],
    },
  ],
});

const pendingRoute: PendingSyncRoute = {
  type: "Pending",
  transportId,
  failure: null,
  skippedError: null,
  completeAt: null,
  lastSentAt: null,
  lastReceivedAt: null,
};

const completeRoute: SyncRoute = {
  type: "Complete",
  transportId,
  completeAt: Millis.orThrow(2000),
  lastSentAt: Millis.orThrow(1500),
  lastReceivedAt: Millis.orThrow(2000),
};

const quotaError = {
  type: "ProtocolQuotaError",
  ownerId: testAppOwner.id,
  at: Millis.orThrow(3000),
} as const;

/** Runs ownerSyncStatusState, by default for the app owner, in a root. */
const setupOwnerSyncStatusState = async ({
  initialState = null,
  follow = (syncState) => ownerSyncStatusState(syncedEvolu, syncState),
}: {
  initialState?: SyncState | null;
  follow?: (syncState: ReadonlyStore<SyncState | null>) => {
    readonly status: OwnerSyncStatus;
  };
} = {}) => {
  const { store, syncState, listenerCount } = setupSyncState(initialState);
  let sync!: { readonly status: OwnerSyncStatus };
  // Every status the effect below sees, as a component rendering it does.
  const statuses: Array<OwnerSyncStatus> = [];
  let initialStatus!: OwnerSyncStatus;
  const dispose = effectRoot(() => {
    sync = follow(syncState);
    initialStatus = sync.status;
    userEffect(() => {
      statuses.push(sync.status);
    });
  });
  await setImmediate();
  return { sync, statuses, initialStatus, store, listenerCount, dispose };
};

test("ownerSyncStatusState is NoRelays until its effect runs, then the current snapshot's status", async () => {
  const { sync, initialStatus, dispose } = await setupOwnerSyncStatusState({
    initialState: stateOf(completeRoute),
  });

  assertEqual(initialStatus, { type: "NoRelays" });
  assertEqual(sync.status, { type: "Synced" });
  dispose();
});

test("ownerSyncStatusState is NoRelays before the first snapshot and follows the store", async () => {
  const { sync, statuses, store, dispose } = await setupOwnerSyncStatusState();
  assertEqual(sync.status, { type: "NoRelays" });
  // Without a snapshot, the effect keeps the object the first render showed.
  assertSame(statuses.length, 1);

  store.set(stateOf(pendingRoute));
  assertEqual(sync.status, { type: "Syncing" });
  store.set(stateOf({ ...pendingRoute, failure: quotaError }));
  assertEqual(sync.status, { type: "Error", error: quotaError });
  store.set(stateOf(completeRoute));
  assertEqual(sync.status, { type: "Synced" });
  dispose();
});

test("ownerSyncStatusState keeps its object while the status is unchanged", async () => {
  const { sync, statuses, store, dispose } = await setupOwnerSyncStatusState();
  store.set(stateOf({ ...pendingRoute, failure: quotaError }));
  await setImmediate();
  const error = sync.status;
  const count = statuses.length;

  // A new snapshot with the same error object, which the store keeps between
  // snapshots while the error is unchanged, changes nothing.
  store.set(
    stateOf({
      ...pendingRoute,
      failure: quotaError,
      lastSentAt: Millis.orThrow(3500),
    }),
  );
  await setImmediate();
  assertSame(sync.status, error);
  assertSame(statuses.length, count);
  dispose();
});

test("ownerSyncStatusState follows the observed owner and ignores it in another database", async () => {
  const shardOwner = deriveShardOwner(testAppOwner, ["shard", 1]);
  const owner = state<Owner | null>(shardOwner);
  const { sync, store, dispose } = await setupOwnerSyncStatusState({
    initialState: stateOf(completeRoute),
    follow: (syncState) =>
      ownerSyncStatusState(syncedEvolu, syncState, () => get(owner)),
  });
  assertEqual(sync.status, { type: "NoRelays" });

  store.set(
    stateOf(completeRoute, {
      name: Name.orThrow("Other"),
      ownerId: shardOwner.id,
    }),
  );
  assertEqual(sync.status, { type: "NoRelays" });
  store.set(stateOf(pendingRoute, { ownerId: shardOwner.id }));
  assertEqual(sync.status, { type: "Syncing" });

  // Another owner follows anew.
  store.set(stateOf(completeRoute));
  set(owner, testAppOwner);
  await setImmediate();
  assertEqual(sync.status, { type: "Synced" });
  dispose();
});

test("ownerSyncStatusState is NoRelays for a null owner without following the store", async () => {
  const owner = state<Owner | null>(null);
  const { sync, listenerCount, dispose } = await setupOwnerSyncStatusState({
    initialState: stateOf(completeRoute),
    follow: (syncState) =>
      ownerSyncStatusState(syncedEvolu, syncState, () => get(owner)),
  });

  assertEqual(sync.status, { type: "NoRelays" });
  assertSame(listenerCount(), 0);

  set(owner, testAppOwner);
  await setImmediate();
  assertEqual(sync.status, { type: "Synced" });
  set(owner, null);
  await setImmediate();
  assertEqual(sync.status, { type: "NoRelays" });
  assertSame(listenerCount(), 0);
  dispose();
});

test("ownerSyncStatusState rejects an owner that may be undefined", () => {
  const owner = undefined as Owner | undefined;
  const { syncState } = setupSyncState(null);
  const dispose = effectRoot(() => {
    // @ts-expect-error No overload takes an owner that may be undefined, which would mean the app owner; return null while there is none.
    ownerSyncStatusState(syncedEvolu, syncState, () => owner);
  });
  dispose();
});

test("ownerSyncStatusState stops following the store when its root is destroyed", async () => {
  const { listenerCount, dispose } = await setupOwnerSyncStatusState();
  assertSame(listenerCount(), 1);

  dispose();
  assertSame(listenerCount(), 0);
});

/** Whether the promise settles within a few event loop turns. */
const settledWithin = (promise: Promise<unknown>) =>
  Promise.race([
    promise.then(
      () => "resolved",
      () => "rejected",
    ),
    setImmediate().then(() => "pending"),
  ]);

test("queryState's loaded is pending until its effect loads the query, then the load", async () => {
  const { evolu, resolveLoad, loadOf } = setupEvolu();
  let todos!: QueryState<TodoQuery["Row"]>;
  const dispose = effectRoot(() => {
    todos = queryState(evolu, () => allTodos);
  });
  // A component's first render, before its effects run.
  const beforeEffect = todos.loaded;
  await setImmediate();

  assertSame(await settledWithin(beforeEffect), "pending");
  assertSame(todos.loaded, loadOf(allTodos).promise);
  resolveLoad(allTodos, allTodosRows);
  assertSame(await todos.loaded, allTodosRows);
  dispose();
});

// Node's test runner fails a test on an unhandled rejection, so these tests
// prove that none is reported.
test("queryState's loaded rejects with the query's failure, which the app awaiting it handles", async () => {
  using unhandledRejections = testGlobalUnhandledRejections();
  const { evolu, loadOf } = setupEvolu();
  let todos!: QueryState<TodoQuery["Row"]>;
  const dispose = effectRoot(() => {
    todos = queryState(evolu, () => allTodos);
  });
  await setImmediate();
  // As `{#await}` does when it renders.
  const awaited = todos.loaded.then(
    () => null,
    (error: unknown) => error,
  );
  const error = createUnknownError("SQLite failed the query.");

  loadOf(allTodos).reject(error);

  assertSame(await awaited, error);
  await setImmediate();
  assertEqual(unhandledRejections.errors, []);
  dispose();
});

test("queryState handles no failure itself, so the platform reports one that nothing awaits", async () => {
  const stub = setupEvolu();
  // Counts each handler attached to a load, also with catch or finally.
  const thenCounts: Array<() => number> = [];
  const evolu = {
    ...stub.evolu,
    loadQuery: (query: TodoQuery) => {
      const promise = stub.evolu.loadQuery(query);
      const thens = mock.method(promise, "then");
      thenCounts.push(() => thens.mock.callCount());
      return promise;
    },
  } as typeof stub.evolu;
  const dispose = effectRoot(() => {
    queryState(evolu, () => allTodos);
  });
  await setImmediate();

  assertEqual(
    thenCounts.map((count) => count()),
    [0],
  );
  dispose();
});

test("queryState's loaded follows the query, also before the previous load settles", async () => {
  using unhandledRejections = testGlobalUnhandledRejections();
  const { evolu, resolveLoad, loadOf } = setupEvolu();
  const query = state<TodoQuery>(allTodos);
  let todos!: QueryState<TodoQuery["Row"]>;
  // Every loaded a component renders, which `{#await}` awaits.
  const awaited: Array<Promise<unknown>> = [];
  const dispose = effectRoot(() => {
    todos = queryState(evolu, () => get(query));
    userEffect(() => {
      awaited.push(todos.loaded.then(constVoid, constVoid));
    });
  });
  await setImmediate();

  set(query, firstTodo);
  await setImmediate();
  assertSame(todos.loaded, loadOf(firstTodo).promise);
  loadOf(allTodos).reject(createUnknownError("A query no longer shown."));
  resolveLoad(firstTodo, firstTodoRows);
  await Promise.all(awaited);

  assertSame(await todos.loaded, firstTodoRows);
  assertEqual(unhandledRejections.errors, []);
  dispose();
});

test("queryState's loaded has resolved with no rows without a query", async () => {
  const { evolu } = setupEvolu();
  let todos!: QueryState<TodoQuery["Row"]>;
  const dispose = effectRoot(() => {
    todos = queryState(evolu, () => undefined);
  });
  await setImmediate();

  assertSame(await settledWithin(todos.loaded), "resolved");
  assertSame(await todos.loaded, emptyArray);
  dispose();
});

test("queryState's loaded stays pending for an instance whose database was deleted", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu, deleteDatabase } = setup;
  deleteDatabase();
  await setImmediate();
  let todos!: QueryState<TodoQuery["Row"]>;
  const dispose = effectRoot(() => {
    todos = queryState(evolu, () => allTodos);
  });
  await setImmediate();

  assertSame(await settledWithin(todos.loaded), "pending");
  dispose();
});

test("queryState's loaded stays pending while a refused database answers no load, and resolves with no rows at the instance's disposal", async () => {
  await using setup = await setupDeletableEvolu();
  const { evolu } = setup;
  let todos!: QueryState<TodoQuery["Row"]>;
  // Nothing answers the instance's loads, as for a refused database.
  const dispose = effectRoot(() => {
    todos = queryState(evolu, () => allTodos);
  });
  await setImmediate();
  const { loaded } = todos;
  assertSame(await settledWithin(loaded), "pending");

  await evolu[Symbol.asyncDispose]();
  assertSame(await loaded, emptyArray);
  dispose();
});

test("queryState's loaded stays as it is when a later refresh fails", async () => {
  using unhandledRejections = testGlobalUnhandledRejections();
  await using setup = await setupDeletableEvolu();
  const { evolu, deliver } = setup;
  let todos!: QueryState<TodoQuery["Row"]>;
  const dispose = effectRoot(() => {
    todos = queryState(evolu, () => allTodos);
  });
  await setImmediate();
  deliver({
    type: "OnPatchesByQuery",
    patchesByQuery: new Map([
      [allTodos, ok([{ op: "replaceAll", value: allTodosRows }])],
    ]),
    callbackIds: [],
  });
  const { loaded } = todos;
  assertEqual(await loaded, allTodosRows);

  deliver({
    type: "OnPatchesByQuery",
    patchesByQuery: new Map([
      [allTodos, err(createUnknownError("SQLite failed the refresh."))],
    ]),
    callbackIds: [],
  });
  await setImmediate();

  assertSame(todos.loaded, loaded);
  assertEqual(todos.rows, allTodosRows);
  assertEqual(unhandledRejections.errors, []);
  dispose();
});

test("storeState is the store's value on the first render, then follows the store until its root is destroyed", async () => {
  const { store, counted, listenerCount } = createCountingStore("first");
  let followed!: { readonly current: string };
  const dispose = effectRoot(() => {
    followed = storeState(counted);
  });
  // A component's first render, before its effects run.
  assertSame(followed.current, "first");
  await setImmediate();
  assertSame(listenerCount(), 1);

  store.set("second");
  assertSame(followed.current, "second");

  dispose();
  assertSame(listenerCount(), 0);
});

test("storeState shows a change made before its effect ran", async () => {
  const store = createStore("first");
  let followed!: { readonly current: string };
  const dispose = effectRoot(() => {
    followed = storeState(store);
  });
  store.set("changed");
  await setImmediate();

  assertSame(followed.current, "changed");
  dispose();
});

test("storeState shows a change made while it subscribes", async () => {
  const store = createStore("first");
  // The value changes while it subscribes, so the listener misses it.
  const changing: ReadonlyStore<string> = {
    ...store,
    subscribe: (listener) => {
      store.set("changed");
      return store.subscribe(listener);
    },
  };
  let followed!: { readonly current: string };
  const dispose = effectRoot(() => {
    followed = storeState(changing);
  });
  await setImmediate();

  assertSame(followed.current, "changed");
  dispose();
});

test("storeState keeps its value while the store gives the same one", async () => {
  const value = { count: 1 };
  // A store that notifies on every set, as a ReadonlyStore may.
  const store = createStore(value, () => false);
  let reads = 0;
  const dispose = effectRoot(() => {
    const followed = storeState(store);
    userEffect(() => {
      void followed.current;
      reads++;
    });
  });
  await setImmediate();
  const readsBefore = reads;

  store.set(value);
  await setImmediate();

  assertSame(reads, readsBefore);
  dispose();
});
