import {
  assertEqual,
  assertNotUndefined,
  assertSame,
  createId,
  createStore,
  Millis,
  Name,
  testCreateDeps,
  testName,
  type ReadonlyStore,
} from "@evolu/common";
import {
  deriveShardOwner,
  testAppOwner,
  type Evolu,
  type Owner,
  type OwnerId,
  type OwnerSyncStatus,
  type PendingSyncRoute,
  type SyncRoute,
  type SyncState,
} from "@evolu/common/local-first";
import { test } from "node:test";
import { createApp, createSSRApp, effectScope, h, type Ref, watch } from "vue";
import { renderToString } from "vue/server-renderer";
import { EvoluContext } from "./provideEvolu.ts";
import { useOwnerSyncStatus } from "./useOwnerSyncStatus.ts";

// Only name and appOwner are used by the composable.
const evolu = {
  name: testName,
  appOwner: testAppOwner,
} as Pick<Evolu, "name" | "appOwner"> as Evolu;

/** A sync state store that counts its listeners. */
const setupSyncState = (initialState: SyncState | null) => {
  const store = createStore<SyncState | null>(initialState);
  let listenerCount = 0;
  const syncState: ReadonlyStore<SyncState | null> = {
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

  return { store, syncState, listenerCount: () => listenerCount };
};

/**
 * Runs the composable, by default for the app owner, in an effect scope of an
 * app providing an Evolu stub of the test database and app owner. Its sync
 * state store counts its listeners.
 */
const setupUseOwnerSyncStatus = ({
  initialState = null,
  use = (syncState) => useOwnerSyncStatus(syncState),
}: {
  initialState?: SyncState | null;
  use?: (
    syncState: ReadonlyStore<SyncState | null>,
  ) => Readonly<Ref<OwnerSyncStatus>>;
} = {}) => {
  const { store, syncState, listenerCount } = setupSyncState(initialState);
  const app = createApp({});
  app.provide(EvoluContext, evolu);

  const scope = effectScope();
  const status = app.runWithContext(() => scope.run(() => use(syncState)));
  assertNotUndefined(status);

  return { status, scope, store, listenerCount };
};

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
      label: "wss://relay.example",
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

test("starts from the current snapshot", () => {
  const { status } = setupUseOwnerSyncStatus({
    initialState: stateOf(completeRoute),
  });

  assertEqual(status.value, { type: "Synced" });
});

test("returns NoRelays before the first snapshot and follows the store", () => {
  const { status, store } = setupUseOwnerSyncStatus();
  assertEqual(status.value, { type: "NoRelays" });

  store.set(stateOf(pendingRoute));
  assertEqual(status.value, { type: "Syncing" });

  store.set(stateOf({ ...pendingRoute, failure: quotaError }));
  assertEqual(status.value, { type: "Error", error: quotaError });

  store.set(stateOf(completeRoute));
  assertEqual(status.value, { type: "Synced" });
});

test("keeps its value while the status is unchanged", () => {
  const { status, store } = setupUseOwnerSyncStatus();
  store.set(stateOf({ ...pendingRoute, failure: quotaError }));
  const error = status.value;
  let changeCount = 0;
  watch(
    status,
    () => {
      changeCount++;
    },
    { flush: "sync" },
  );

  // A new snapshot with the same error object, which the store keeps between
  // snapshots while the error is unchanged, triggers nothing.
  store.set(
    stateOf({
      ...pendingRoute,
      failure: quotaError,
      lastSentAt: Millis.orThrow(3500),
    }),
  );
  assertSame(status.value, error);
  assertSame(changeCount, 0);
});

test("uses the given owner and ignores it in another database", () => {
  const shardOwner = deriveShardOwner(testAppOwner, ["shard", 1]);
  const { status, store } = setupUseOwnerSyncStatus({
    use: (syncState) => useOwnerSyncStatus(syncState, shardOwner),
  });

  store.set(stateOf(completeRoute));
  assertEqual(status.value, { type: "NoRelays" });

  store.set(
    stateOf(completeRoute, {
      name: Name.orThrow("Other"),
      ownerId: shardOwner.id,
    }),
  );
  assertEqual(status.value, { type: "NoRelays" });

  store.set(stateOf(completeRoute, { ownerId: shardOwner.id }));
  assertEqual(status.value, { type: "Synced" });
});

test("returns NoRelays for a null owner without following the store", () => {
  const { status, listenerCount } = setupUseOwnerSyncStatus({
    initialState: stateOf(completeRoute),
    use: (syncState) => useOwnerSyncStatus(syncState, null),
  });

  assertEqual(status.value, { type: "NoRelays" });
  assertSame(listenerCount(), 0);
});

test("rejects an owner that may be undefined", () => {
  const owner = undefined as Owner | undefined;
  const { status } = setupUseOwnerSyncStatus({
    initialState: stateOf(completeRoute),
    use: (syncState) =>
      // @ts-expect-error No overload takes an owner that may be undefined, which would mean the app owner; pass null while there is none.
      useOwnerSyncStatus(syncState, owner),
  });

  // The app owner's status, which the type keeps a loading owner from getting.
  assertEqual(status.value, { type: "Synced" });
});

test("stops following the store when its scope is disposed", () => {
  const { listenerCount, scope } = setupUseOwnerSyncStatus();
  assertEqual(listenerCount(), 1);

  scope.stop();
  assertEqual(listenerCount(), 0);
});

test("returns NoRelays without following the store during server rendering", async () => {
  const { syncState, listenerCount } = setupSyncState(stateOf(completeRoute));
  const app = createSSRApp({
    setup: () => {
      // oxlint-disable-next-line react/rules-of-hooks -- A Vue composable runs in setup.
      const status = useOwnerSyncStatus(syncState);
      return () => h("p", status.value.type);
    },
  });
  app.provide(EvoluContext, evolu);

  assertEqual(await renderToString(app), "<p>NoRelays</p>");
  assertSame(listenerCount(), 0);
});
