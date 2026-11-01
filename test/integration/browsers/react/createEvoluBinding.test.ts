import {
  act,
  Component,
  createElement,
  StrictMode,
  Suspense,
  useLayoutEffect,
  type FC,
  type ReactNode,
} from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeAll, test } from "vitest";
import {
  assertEqual,
  assertNonNullable,
  assertSame,
} from "../../../../packages/common/src/Assert.ts";
import { emptyArray } from "../../../../packages/common/src/Array.ts";
import { createUnknownError } from "../../../../packages/common/src/Error.ts";
import { constVoid } from "../../../../packages/common/src/Function.ts";
import { testCreateLockManager } from "../../../../packages/common/src/LockManager.ts";
import {
  createEvolu,
  testAppName,
  type Evolu,
  type EvoluPlatformDeps,
} from "../../../../packages/common/src/local-first/Evolu.ts";
import {
  createOwnerWebSocketTransport,
  RelayUrl,
  deriveShardOwner,
  testAppOwner,
  type Owner,
  type OwnerId,
  type ReadonlyOwner,
} from "../../../../packages/common/src/local-first/Owner.ts";
import { createQueryBuilder } from "../../../../packages/common/src/local-first/Schema.ts";
import type {
  CompleteSyncRoute,
  EvoluOutput,
  OwnerSyncStatus,
  PendingSyncRoute,
  SharedWorkerInput,
  SharedWorkerOutput,
  SyncConnection,
  SyncRoute,
  SyncState,
} from "../../../../packages/common/src/local-first/Shared.ts";
import type {
  Query,
  QueryRows,
} from "../../../../packages/common/src/local-first/Query.ts";
import { testGlobalUnhandledRejections } from "../../../../packages/common/src/Platform.ts";
import { ok } from "../../../../packages/common/src/Result.ts";
import { createStore } from "../../../../packages/common/src/Store.ts";
import {
  testCreateDeps,
  testCreateRun,
} from "../../../../packages/common/src/Task.ts";
import { Millis } from "../../../../packages/common/src/Time.ts";
import {
  createId,
  id,
  Name,
  testName,
} from "../../../../packages/common/src/Type.ts";
import {
  testCreateBroadcastChannel,
  testCreateMessageChannel,
  testCreateSharedWorker,
  testCreateWorker,
} from "../../../../packages/common/src/Worker.ts";
import { createEvoluBinding } from "../../../../packages/react/src/local-first/createEvoluBinding.ts";

beforeAll(() => {
  // Tells React that updates are wrapped in act.
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

const { EvoluContext, useOwner, useOwnerSyncStatus, useQueries, useQuery } =
  createEvoluBinding();

/** An Evolu stub that records each owner registration and its release. */
const createEvoluStub = (calls: Array<string>): Evolu =>
  // Only useOwner is used by these components.
  ({
    useOwner: (owner, transports) => {
      const label = `${"writeKey" in owner ? "writable" : "readonly"} ${transports?.map(({ url }) => url.split("?")[0]).join(",")}`;
      calls.push(`use ${label}`);
      return () => {
        calls.push(`unuse ${label}`);
      };
    },
  }) as Pick<Evolu, "useOwner"> as Evolu;

/** Renders components that call `useOwner` under an Evolu stub. */
const setupUseOwner = () => {
  const calls: Array<string> = [];
  const evolu = createEvoluStub(calls);
  const root = createRoot(document.createElement("div"));

  const render = (
    element: ReturnType<typeof createElement>,
    value: Evolu = evolu,
  ): void => {
    act(() => {
      root.render(createElement(EvoluContext, { value }, element));
    });
  };

  return {
    calls,
    render,
    [Symbol.dispose]: () => {
      act(() => {
        root.unmount();
      });
    },
  };
};

const relayA = RelayUrl.orThrow("wss://a.example/");
const relayB = RelayUrl.orThrow("wss://b.example/");

// Recreates the owner and transports on every render, as callers usually do.
const Registration: FC<{
  owner: ReadonlyOwner | Owner | null;
  url: RelayUrl;
}> = ({ owner, url }) => {
  useOwner(owner && { ...owner }, [
    createOwnerWebSocketTransport({ url, ownerId: testAppOwner.id }),
  ]);
  return null;
};

/** Records the error it catches; React has no function error boundaries. */
class ErrorBoundary extends Component<
  { readonly children?: ReactNode; readonly onError: (error: unknown) => void },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

test("useQueries throws a query SQLite failed to the error boundary without an unhandled rejection", async () => {
  using unhandledRejections = testGlobalUnhandledRejections();
  const queries = ["a" as Query, "b" as Query] as const;
  // Pending loads as Evolu creates them, with React's status preset.
  const loads = queries.map(() => {
    const load = Promise.withResolvers<QueryRows>();
    void Object.assign(load.promise, { status: "pending" });
    return load;
  });
  const evolu = {
    loadQueries: (loaded: ReadonlyArray<Query>) =>
      loaded.map((query) => loads[queries.indexOf(query)].promise),
    subscribeQuery: () => () => constVoid,
    getQueryRows: () => emptyArray,
  } as unknown as Evolu;
  const caught: Array<unknown> = [];
  const Rows: FC = () => {
    useQueries([...queries]);
    return null;
  };
  // React would log the error the boundary catches on purpose.
  const root = createRoot(document.createElement("div"), {
    onCaughtError: constVoid,
  });
  const error = createUnknownError(new Error("incomplete input"));

  // oxlint-disable-next-line typescript/require-await -- An async act waits for the render that suspends.
  await act(async () => {
    root.render(
      createElement(
        EvoluContext,
        { value: evolu },
        createElement(
          ErrorBoundary,
          {
            onError: (error) => {
              caught.push(error);
            },
          },
          createElement(Suspense, { fallback: null }, createElement(Rows)),
        ),
      ),
    );
  });
  // As Evolu settles one answer for both queries. React suspended on the
  // first load, so it has not read the second one yet.
  // oxlint-disable-next-line typescript/require-await -- An async act flushes the render that retries after the ping.
  await act(async () => {
    loads[0].resolve(emptyArray);
    void Object.assign(loads[0].promise, {
      status: "fulfilled",
      value: emptyArray,
    });
    loads[1].reject(error);
    void Object.assign(loads[1].promise, { status: "rejected", reason: error });
  });

  assertEqual(caught, [error]);
  assertEqual(await unhandledRejections.settle(), []);
  act(() => {
    root.unmount();
  });
});

test("useQuery and useQueries handle the loads they start while server rendering", async () => {
  using unhandledRejections = testGlobalUnhandledRejections();
  const loads: Array<PromiseWithResolvers<QueryRows>> = [];
  const loadQuery = (): Promise<QueryRows> => {
    const load = Promise.withResolvers<QueryRows>();
    void Object.assign(load.promise, { status: "pending" });
    loads.push(load);
    return load.promise;
  };
  const evolu = {
    loadQuery,
    loadQueries: (queries: ReadonlyArray<Query>) =>
      queries.map(() => loadQuery()),
    subscribeQuery: () => () => constVoid,
    getQueryRows: () => emptyArray,
  } as unknown as Evolu;
  const OneQuery: FC = () => {
    useQuery("a" as Query);
    return null;
  };
  const TwoQueries: FC = () => {
    useQueries(["b" as Query, "c" as Query]);
    return null;
  };

  renderToString(
    createElement(
      EvoluContext,
      { value: evolu },
      createElement(OneQuery),
      createElement(TwoQueries),
    ),
  );
  assertEqual(loads.length, 3);

  // The loads fail after the render, which never reads them, as when
  // hydration yields before the render that does.
  const error = createUnknownError(new Error("incomplete input"));
  for (const load of loads) load.reject(error);
  assertEqual(await unhandledRejections.settle(), []);
});

const deletionSchema = { todo: { id: id("Todo") } };
const deletionBinding = createEvoluBinding<typeof deletionSchema>();
const createDeletionQuery = createQueryBuilder(deletionSchema);
const todosQuery = createDeletionQuery((db) =>
  db.selectFrom("todo").selectAll(),
);
const todoIdsQuery = createDeletionQuery((db) =>
  db.selectFrom("todo").select("id"),
);

/**
 * Creates an Evolu instance whose SharedWorker messages the test delivers
 * synchronously, so it controls when a deletion lands during a React commit.
 */
const setupEvolu = async (disposer: AsyncDisposableStack) => {
  const channels: Array<{
    readonly port1: {
      onMessage: ((output: EvoluOutput) => void) | null;
    };
  }> = [];
  let reloadCount = 0;
  const evoluDeps: EvoluPlatformDeps = {
    createDbWorker: testCreateWorker,
    createBroadcastChannel: testCreateBroadcastChannel,
    createMessageChannel: <Input, Output = never>() => {
      const channel = testCreateMessageChannel<Input, Output>();
      channels.push(channel as never);
      return channel;
    },
    getDevicePersistence: () => Promise.resolve("Unknown"),
    lockManager: testCreateLockManager(),
    reloadApp: () => {
      reloadCount += 1;
    },
    sharedWorker: disposer.use(
      testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
    ),
  };
  const run = disposer.use(testCreateRun(evoluDeps));
  const evolu = await run.ok(
    createEvolu(deletionSchema, {
      appName: testAppName,
      appOwner: testAppOwner,
      transports: [],
    }),
  );
  return {
    evolu,
    getReloadCount: () => reloadCount,
    deliver: (output: EvoluOutput): void => {
      const channel = channels.find(({ port1 }) => port1.onMessage);
      assertNonNullable(channel?.port1.onMessage);
      channel.port1.onMessage(output);
    },
  };
};

/** Renders the element under the instance, a boundary, and a fallback. */
const setupDeletionRoot = (
  disposer: AsyncDisposableStack,
  evolu: Evolu<typeof deletionSchema>,
) => {
  const caught: Array<unknown> = [];
  const container = document.createElement("div");
  // React would log an error the boundary catches.
  const root = createRoot(container, { onCaughtError: constVoid });
  disposer.defer(() => {
    act(() => {
      root.unmount();
    });
  });
  // Each call creates new elements, so the components render again.
  const render = (
    element: ReturnType<typeof createElement>,
    value: Evolu<typeof deletionSchema> = evolu,
  ): void => {
    root.render(
      createElement(
        deletionBinding.EvoluContext,
        { value },
        createElement(
          ErrorBoundary,
          {
            onError: (error) => {
              caught.push(error);
            },
          },
          createElement(
            Suspense,
            { fallback: createElement("span", null, "Suspended") },
            element,
          ),
        ),
      ),
    );
  };
  return {
    caught,
    render,
    getFallback: () => container.querySelector("span")?.textContent,
    getText: () => container.textContent,
  };
};

const Todos: FC = () => {
  const todos = deletionBinding.useQuery(todosQuery);
  return createElement("p", null, `${todos.length} todos`);
};

test("suspends a component whose instance's database was deleted instead of using the disposed instance", async () => {
  await using disposer = new AsyncDisposableStack();
  const { evolu, deliver, getReloadCount } = await setupEvolu(disposer);
  const { caught, render, getFallback, getText } = setupDeletionRoot(
    disposer,
    evolu,
  );

  // oxlint-disable-next-line typescript/require-await -- An async act waits for the render that suspends.
  await act(async () => {
    render(createElement(Todos));
  });
  // oxlint-disable-next-line typescript/require-await -- An async act flushes the render that retries after the load.
  await act(async () => {
    deliver({
      type: "OnPatchesByQuery",
      patchesByQuery: new Map([
        [todosQuery, ok([{ op: "replaceAll", value: [{ id: "a" }] }])],
      ]),
      onCompleteIds: [],
    });
  });
  assertEqual(getText(), "1 todos");

  // The deletion renders the component again, before the reload replaces the
  // page, so it does not keep showing the deleted rows.
  act(() => {
    deliver({ type: "OnDatabaseDeleted" });
  });

  assertEqual(getReloadCount(), 1);
  assertEqual(caught, []);
  assertEqual(getFallback(), "Suspended");
});

test("renders another instance the app provides after a deletion", async () => {
  await using disposer = new AsyncDisposableStack();
  const deleted = await setupEvolu(disposer);
  const provided = await setupEvolu(disposer);
  const { caught, render, getFallback, getText } = setupDeletionRoot(
    disposer,
    deleted.evolu,
  );
  for (const [{ evolu, deliver }, id] of [
    [deleted, "deleted"],
    [provided, "provided"],
  ] as const) {
    void evolu.loadQuery(todosQuery);
    deliver({
      type: "OnPatchesByQuery",
      patchesByQuery: new Map([
        [todosQuery, ok([{ op: "replaceAll", value: [{ id }] }])],
      ]),
      onCompleteIds: [],
    });
  }
  act(() => {
    render(createElement(Todos));
  });
  act(() => {
    deleted.deliver({ type: "OnDatabaseDeleted" });
  });
  assertEqual(getFallback(), "Suspended");

  // As an onDatabaseDeleted that replaces the instance does.
  // oxlint-disable-next-line typescript/require-await -- An async act flushes the revealed content.
  await act(async () => {
    render(createElement(Todos), provided.evolu);
  });

  assertEqual(caught, []);
  assertEqual(getText(), "1 todos");
});

test("waits instead of throwing when a deletion disposes the instance before React subscribes", async () => {
  await using disposer = new AsyncDisposableStack();
  const { evolu, deliver } = await setupEvolu(disposer);
  const { caught, render, getFallback } = setupDeletionRoot(disposer, evolu);
  void evolu.loadQuery(todosQuery);
  void evolu.loadQuery(todoIdsQuery);
  deliver({
    type: "OnPatchesByQuery",
    patchesByQuery: new Map([
      [todosQuery, ok([{ op: "replaceAll", value: [{ id: "a" }] }])],
      [todoIdsQuery, ok([{ op: "replaceAll", value: [{ id: "a" }] }])],
    ]),
    onCompleteIds: [],
  });

  // Each hook subscribes or registers in an effect after the commit.
  const Subscriber: FC = () => {
    deletionBinding.useQuery(todoIdsQuery, { once: true });
    deletionBinding.useOwner(testAppOwner, [
      createOwnerWebSocketTransport({ url: relayA, ownerId: testAppOwner.id }),
    ]);
    return createElement(Todos);
  };
  // Layout effects run before those effects, so the deletion lands between
  // the render and the subscriptions.
  const DeleteOnCommit: FC = () => {
    useLayoutEffect(() => {
      deliver({ type: "OnDatabaseDeleted" });
    }, []);
    return createElement(Subscriber);
  };

  act(() => {
    render(createElement(DeleteOnCommit));
  });

  assertEqual(caught, []);
  assertEqual(getFallback(), "Suspended");
});

test("registers an equal owner once and releases it on change and unmount", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;

  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: relayA,
    }),
  );
  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: relayA,
    }),
  );
  assertEqual(calls, ["use writable wss://a.example/"]);

  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: relayB,
    }),
  );
  assertEqual(calls.splice(0), [
    "use writable wss://a.example/",
    "unuse writable wss://a.example/",
    "use writable wss://b.example/",
  ]);

  // A readonly owner with the same ID is a different registration.
  const { id, encryptionKey } = testAppOwner;
  render(
    createElement(Registration, {
      owner: { id, encryptionKey },
      url: relayB,
    }),
  );
  assertEqual(calls.splice(0), [
    "unuse writable wss://b.example/",
    "use readonly wss://b.example/",
  ]);

  render(createElement("div"));
  assertEqual(calls, ["unuse readonly wss://b.example/"]);
});

test("moves the registration to another Evolu instance", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;
  const otherCalls: Array<string> = [];
  const element = createElement(Registration, {
    owner: testAppOwner,
    url: relayA,
  });

  render(element);
  render(element, createEvoluStub(otherCalls));
  assertEqual(calls, [
    "use writable wss://a.example/",
    "unuse writable wss://a.example/",
  ]);
  assertEqual(otherCalls, ["use writable wss://a.example/"]);
});

test("uses no owner while it is null", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;

  render(createElement(Registration, { owner: null, url: relayA }));
  assertEqual(calls, []);

  render(
    createElement(Registration, {
      owner: testAppOwner,
      url: relayA,
    }),
  );
  render(createElement(Registration, { owner: null, url: relayA }));
  assertEqual(calls, [
    "use writable wss://a.example/",
    "unuse writable wss://a.example/",
  ]);
});

test("keeps one registration in StrictMode", () => {
  using setup = setupUseOwner();
  const { calls, render } = setup;

  render(
    createElement(
      StrictMode,
      null,
      createElement(Registration, {
        owner: testAppOwner,
        url: relayA,
      }),
    ),
  );
  // StrictMode renders twice, and React may also run the effect twice with a
  // cleanup in between. Either way, one registration remains.
  const useCount = calls.filter((call) => call.startsWith("use ")).length;
  assertEqual(useCount - (calls.length - useCount), 1);
});

/** An Evolu stub of the database a component shows the sync status of. */
const createEvoluSyncStub = (name: Name): Evolu =>
  // Only name and appOwner are used by useOwnerSyncStatus.
  ({ name, appOwner: testAppOwner }) as Pick<
    Evolu,
    "name" | "appOwner"
  > as Evolu;

const transportId = createId<"SyncTransport">(testCreateDeps());
const shardOwner = deriveShardOwner(testAppOwner, ["shard", 1]);
const otherName = Name.orThrow("Other");

const openConnection: SyncConnection = {
  type: "Open",
  openedAt: Millis.orThrow(1000),
  error: null,
};

const pendingRoute: PendingSyncRoute = {
  type: "Pending",
  transportId,
  failure: null,
  skippedError: null,
  completeAt: null,
  lastSentAt: null,
  lastReceivedAt: null,
};

const completeRoute: CompleteSyncRoute = {
  type: "Complete",
  transportId,
  completeAt: Millis.orThrow(2000),
  lastSentAt: Millis.orThrow(1500),
  lastReceivedAt: Millis.orThrow(2000),
};

/** A snapshot of one relay and one writable owner in each database. */
const createSyncState = (
  connection: SyncConnection,
  owners: ReadonlyArray<{ name: Name; ownerId: OwnerId; route: SyncRoute }>,
): SyncState => ({
  transports: [
    {
      type: "WebSocket",
      id: transportId,
      label: RelayUrl.orThrow("wss://relay.example/"),
      connection,
    },
  ],
  tenants: owners.map(({ name, ownerId, route }) => ({
    type: "Active",
    name,
    owners: [{ type: "Writable", ownerId, routes: [route] }],
  })),
});

/** A snapshot of one relay and the app owner in the tested database. */
const createAppOwnerSyncState = (
  connection: SyncConnection,
  route: SyncRoute,
): SyncState =>
  createSyncState(connection, [
    { name: testName, ownerId: testAppOwner.id, route },
  ]);

/**
 * Renders a component that records each status `useOwnerSyncStatus` returns,
 * for the app owner when rendered without an owner.
 */
const setupUseOwnerSyncStatus = () => {
  const syncState = createStore<SyncState | null>(null);
  const statuses: Array<OwnerSyncStatus> = [];
  const root = createRoot(document.createElement("div"));

  const AppOwnerSyncStatus: FC = () => {
    statuses.push(useOwnerSyncStatus(syncState));
    return null;
  };

  const SyncStatus: FC<{ owner: ReadonlyOwner | Owner | null }> = ({
    owner,
  }) => {
    statuses.push(useOwnerSyncStatus(syncState, owner));
    return null;
  };

  const render = (
    owner?: ReadonlyOwner | Owner | null,
    name: Name = testName,
  ): void => {
    act(() => {
      root.render(
        createElement(
          EvoluContext,
          { value: createEvoluSyncStub(name) },
          owner === undefined
            ? createElement(AppOwnerSyncStatus)
            : createElement(SyncStatus, { owner }),
        ),
      );
    });
  };

  const setSyncState = (state: SyncState): void => {
    act(() => {
      syncState.set(state);
    });
  };

  return {
    statuses,
    render,
    setSyncState,
    [Symbol.dispose]: () => {
      act(() => {
        root.unmount();
      });
      syncState[Symbol.dispose]();
    },
  };
};

test("returns NoRelays before the first snapshot and follows the store", () => {
  using setup = setupUseOwnerSyncStatus();
  const { statuses, render, setSyncState } = setup;

  render();
  setSyncState(createAppOwnerSyncState({ type: "Connecting" }, pendingRoute));
  setSyncState(createAppOwnerSyncState(openConnection, completeRoute));
  setSyncState(
    createAppOwnerSyncState(
      {
        type: "Disconnected",
        disconnectedAt: Millis.orThrow(3000),
        openedAt: Millis.orThrow(1000),
        error: null,
      },
      pendingRoute,
    ),
  );

  assertEqual(statuses, [
    { type: "NoRelays" },
    { type: "Syncing" },
    { type: "Synced" },
    { type: "Offline" },
  ]);
});

test("uses the given owner and ignores the same owner in another database", () => {
  using setup = setupUseOwnerSyncStatus();
  const { statuses, render, setSyncState } = setup;

  setSyncState(
    createSyncState(openConnection, [
      { name: testName, ownerId: shardOwner.id, route: pendingRoute },
      { name: otherName, ownerId: testAppOwner.id, route: completeRoute },
    ]),
  );
  render(shardOwner);
  render();
  // The same component under another database's Evolu instance.
  render(undefined, otherName);

  assertEqual(statuses, [
    { type: "Syncing" },
    { type: "NoRelays" },
    { type: "Synced" },
  ]);
});

test("returns NoRelays for a null owner, as for one still loading", () => {
  using setup = setupUseOwnerSyncStatus();
  const { statuses, render, setSyncState } = setup;

  setSyncState(createAppOwnerSyncState(openConnection, completeRoute));
  render(null);
  render(shardOwner);
  setSyncState(
    createSyncState(openConnection, [
      { name: testName, ownerId: shardOwner.id, route: completeRoute },
    ]),
  );

  assertEqual(statuses, [
    { type: "NoRelays" },
    { type: "NoRelays" },
    { type: "Synced" },
  ]);
});

test("rejects an owner that may be undefined", () => {
  using syncState = createStore<SyncState | null>(
    createAppOwnerSyncState(openConnection, completeRoute),
  );
  const statuses: Array<OwnerSyncStatus> = [];
  const SyncStatus: FC<{ owner: Owner | undefined }> = ({ owner }) => {
    // @ts-expect-error No overload takes an owner that may be undefined, which would mean the app owner; pass null while there is none.
    statuses.push(useOwnerSyncStatus(syncState, owner));
    return null;
  };
  const root = createRoot(document.createElement("div"));
  act(() => {
    root.render(
      createElement(
        EvoluContext,
        { value: createEvoluSyncStub(testName) },
        createElement(SyncStatus, { owner: undefined }),
      ),
    );
  });
  act(() => {
    root.unmount();
  });

  // The app owner's status, which the type keeps a loading owner from getting.
  assertEqual(statuses, [{ type: "Synced" }]);
});

test("re-renders only when the status changes", () => {
  using setup = setupUseOwnerSyncStatus();
  const { statuses, render, setSyncState } = setup;

  render();
  setSyncState(createAppOwnerSyncState(openConnection, completeRoute));
  // The worker publishes a new snapshot for every frame, each a new object.
  setSyncState(
    createAppOwnerSyncState(openConnection, {
      ...completeRoute,
      lastSentAt: Millis.orThrow(2500),
    }),
  );
  assertEqual(statuses, [{ type: "NoRelays" }, { type: "Synced" }]);

  const quotaError = {
    type: "ProtocolQuotaError",
    ownerId: testAppOwner.id,
    at: Millis.orThrow(3000),
  } as const;
  setSyncState(
    createAppOwnerSyncState(openConnection, {
      ...pendingRoute,
      failure: quotaError,
    }),
  );
  const errorStatus = statuses.at(-1);
  assertEqual(errorStatus, { type: "Error", error: quotaError });

  // The store keeps an unchanged error's object between snapshots.
  setSyncState(
    createAppOwnerSyncState(openConnection, {
      ...pendingRoute,
      failure: quotaError,
      lastSentAt: Millis.orThrow(3500),
    }),
  );
  assertEqual(statuses.length, 3);

  // A render for another reason returns the same Error object.
  render();
  assertEqual(statuses.length, 4);
  assertSame(statuses.at(-1), errorStatus);
});

/**
 * Hydrates a component that renders the app owner's status type over what
 * server rendering produced, where the store has no snapshot.
 */
const setupHydratedSyncStatus = (initialState: SyncState | null) => {
  const syncState = createStore<SyncState | null>(initialState);
  const statuses: Array<OwnerSyncStatus["type"]> = [];
  const SyncStatus: FC = () => {
    const { type } = useOwnerSyncStatus(syncState);
    statuses.push(type);
    return type;
  };
  const container = document.createElement("div");
  container.textContent = "NoRelays";

  let root: Root | undefined;
  act(() => {
    root = hydrateRoot(
      container,
      createElement(
        EvoluContext,
        { value: createEvoluSyncStub(testName) },
        createElement(SyncStatus),
      ),
    );
  });

  return {
    statuses,
    container,
    [Symbol.dispose]: () => {
      act(() => {
        root?.unmount();
      });
      syncState[Symbol.dispose]();
    },
  };
};

test("returns NoRelays while hydrating, then the store's status", () => {
  using setup = setupHydratedSyncStatus(
    createAppOwnerSyncState(openConnection, completeRoute),
  );

  assertEqual(setup.statuses, ["NoRelays", "Synced"]);
  assertEqual(setup.container.textContent, "Synced");
});

test("hydrates before the first snapshot without rendering again", () => {
  using setup = setupHydratedSyncStatus(null);

  // The client starts from the same NoRelays object as the server.
  assertEqual(setup.statuses, ["NoRelays"]);
  assertEqual(setup.container.textContent, "NoRelays");
});
