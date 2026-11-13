# @evolu/vue

## 2.2.0

### Minor Changes

- 518e073: Added useStore

  `useStore(store)` returns the value of an Evolu `ReadonlyStore`, such as `evoluError` or `syncState` of the deps, in a ref that follows the store until the component's effect scope is disposed, as React's `useSyncExternalStore` does. Apps no longer mirror a store into a ref by hand. During server rendering, it reads the store once.

  ```ts
  import {
    assertType,
    type ReadonlyStore,
    type SyncState,
  } from "@evolu/common";
  import { useStore } from "@evolu/vue";
  import type { Ref } from "vue";

  // Call composables in component setup.
  const useSyncState = (syncState: ReadonlyStore<SyncState | null>) =>
    useStore(syncState);

  assertType<
    ReturnType<typeof useSyncState>,
    Readonly<Ref<SyncState | null>>
  >();
  ```

- 518e073: Added waitForRows

  A component couldn't tell a loading query from an empty one, and a query SQLite failed reached no UI, only an unhandled rejection, so apps listed each query twice, once for `useQuery` and once for an `await evolu.loadQuery` under `<Suspense>`. `waitForRows` takes the rows that `useQuery`, `useQueries`, `useDeviceQuery`, or `useDeviceQueries` returned and waits for their first loads, so an async setup under `<Suspense>` renders once they loaded. It rejects with the first failure, which then reaches `onErrorCaptured` of a component above and isn't also reported as an unhandled rejection; a failed load that no `waitForRows` awaits is still reported as one. It stays pending for an instance whose database was deleted, as React's `useQuery` stays suspended, and while a refused database answers no load.

  ```ts
  import {
    assertType,
    createQueryBuilder,
    testEvoluSchema,
    type QueryRows,
  } from "@evolu/common";
  import { useQueries, useQuery, waitForRows } from "@evolu/vue";
  import type { Ref } from "vue";

  const createQuery = createQueryBuilder(testEvoluSchema);
  const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());
  const allProjects = createQuery((db) => db.selectFrom("project").selectAll());

  // An async setup of a component under <Suspense>.
  const setup = async () => {
    // oxlint-disable-next-line react/rules-of-hooks -- Composables run before the await.
    const todos = useQuery(allTodos);
    // oxlint-disable-next-line react/rules-of-hooks -- Composables run before the await.
    const [projects] = useQueries([allProjects]);
    // A failure reaches onErrorCaptured of a component above.
    await waitForRows(todos, projects);
    return { todos, projects };
  };

  assertType<
    Awaited<ReturnType<typeof setup>>["projects"],
    Readonly<Ref<QueryRows<typeof allProjects.Row>>>
  >();
  ```

- 518e073: Exported UseQueryOptions and UseQueriesOptions

  The options of `useQuery` and `useDeviceQuery` are now the exported `UseQueryOptions`, and those of `useQueries` and `useDeviceQueries` the exported `UseQueriesOptions`, so a helper that forwards them can name their type. They take the same `once` as before.

- 518e073: Added createEvoluApp support

  `EvoluAppProvider` provides an app that `createEvoluApp` created. Its default slot gets the instance of the AppOwner the tab has open, so `useEvolu`, the query composables, `useOwner`, and `useOwnerSyncStatus` read that AppOwner's data, and the slot remounts when the tab opens another AppOwner. While the tab has none open, such as after a removal, it renders the `withoutAppOwner` slot instead, such as a choice to create or restore an AppOwner, and while the AppOwner's instance opens, the `opening` slot. `useEvoluApp` returns the app, to open, add, or remove an AppOwner, `useAppOwners` follows the AppOwners on this device, and `useDeviceEvolu`, `useDeviceQuery`, and `useDeviceQueries` read the device database. `createEvoluBinding` returns a `VueBinding`: `useEvolu`, `useEvoluApp`, `useDeviceEvolu`, and the query composables typed with the app's schema and its device schema, so `useDeviceQuery` rejects a query of the app's tables.

  `useEvolu` and `createUseEvolu` now type the instance as `AppOwnerEvolu`, an `Evolu` without `Symbol.asyncDispose`, because the components don't own it, so a helper that takes `useEvolu()`'s value declares `AppOwnerEvolu<S>` instead of `Evolu<S>`. `provideEvolu` and `EvoluProvider` accept either. `createUseEvolu` is deprecated: `createEvoluBinding<S>().useEvolu` returns the same instance, also for an app that `createEvolu` created.

  ```ts
  import {
    assertType,
    type AppOwnerEntry,
    type AppOwnerEvolu,
    type Evolu,
    type EvoluApp,
    type EvoluSchema,
    type Name,
  } from "@evolu/common";
  import {
    createEvoluBinding,
    EvoluAppProvider,
    useAppOwners,
    useEvolu,
  } from "@evolu/vue";
  import { h, type Ref, type VNode } from "vue";

  // The app is awaited, such as in `<script setup>` under `<Suspense>`.
  const renderApp = (app: EvoluApp<EvoluSchema>) =>
    h(
      EvoluAppProvider,
      { app },
      {
        default: () => h("p", "The open AppOwner's data"),
        withoutAppOwner: () => h("p", "Create or restore an AppOwner"),
        opening: () => h("p", "Opening"),
      },
    );

  const oldNameOf = (evolu: Evolu) => evolu.name;
  const nameOf = (evolu: AppOwnerEvolu<EvoluSchema>) => evolu.name;

  // Call composables in component setup.
  const useDatabaseName = () => {
    // @ts-expect-error -- An AppOwnerEvolu has no Symbol.asyncDispose, so it isn't an Evolu.
    oldNameOf(useEvolu());
    return nameOf(useEvolu());
  };

  assertType<
    [ReturnType<typeof useDatabaseName>, ReturnType<typeof useAppOwners>],
    [Name, Readonly<Ref<ReadonlyArray<AppOwnerEntry>>>]
  >();
  assertType<ReturnType<typeof renderApp>, VNode>();

  // Typed with the app's schema and its device schema.
  const { useEvoluApp } = createEvoluBinding<EvoluSchema>();
  assertType<ReturnType<typeof useEvoluApp>, EvoluApp<EvoluSchema>>();
  ```

### Patch Changes

- 518e073: Typed the refs of useQueries as read-only

  `useQueries` returned each query's rows as a `Ref`, though the refs are read-only at run time, as `useQuery`'s are, and an assignment to one only warns. It now types them as `Readonly<Ref>`, so such an assignment doesn't compile.

  ```ts
  import { createQueryBuilder, testEvoluSchema } from "@evolu/common";
  import type { useQueries } from "@evolu/vue";

  const allTodos = createQueryBuilder(testEvoluSchema)((db) =>
    db.selectFrom("todo").selectAll(),
  );
  type TodosRef = ReturnType<
    typeof useQueries<typeof testEvoluSchema, [typeof allTodos], []>
  >[0];

  // Rows change through mutations, which the refs then show.
  const clearTodos = (todos: TodosRef) => {
    // @ts-expect-error Cannot assign to 'value' because it is a read-only property.
    todos.value = [];
  };
  void clearTodos;
  ```

- 518e073: Fixed Vue composables leaking subscriptions in a component that unmounted while its async setup awaited

  A component whose `<script setup>` awaits before calling `useQuery`, `useQueries`, `useOwner`, or `useOwnerSyncStatus` could unmount during the await, such as when the user switched views. Vue then makes its stopped scope current again, which never runs what `onScopeDispose` registers, so the query's and the sync status's subscriptions stayed for the life of the Evolu instance, and `useOwner` kept syncing the owner over its transports. In such a scope, the query composables now return no rows without touching the instance, which the app may have disposed during the await, while `useOwner` uses no owner, and `useOwnerSyncStatus` reads the status once.

- 518e073: Fixed Vue components throwing after deleteDatabase

  `deleteDatabase` disposes the instance, and the app reloads or replaces it afterward. Until then, a component that set up after the deletion, such as one that shows when a list becomes empty, threw "Cannot use a disposed object." from `useQuery`, `useQueries`, or `useOwner`. They now check `isDatabaseDeleted`, as the React binding does: the query composables return empty rows, and `useOwner` uses no owner.

- Updated dependencies [546484b]
- Updated dependencies [18f65ea]
- Updated dependencies [518e073]
- Updated dependencies [e75628b]
- Updated dependencies [518e073]
- Updated dependencies [518e073]
- Updated dependencies [a73e71d]
- Updated dependencies [abd13c6]
- Updated dependencies [518e073]
- Updated dependencies [f004cd2]
- Updated dependencies [ac5706c]
- Updated dependencies [8dd9cf4]
- Updated dependencies [771dc61]
- Updated dependencies [f004cd2]
- Updated dependencies [518e073]
- Updated dependencies [e532d48]
- Updated dependencies [505274b]
- Updated dependencies [1e1568d]
  - @evolu/common@8.28.0

## 2.1.2

### Patch Changes

- 7cc5d91: Added links to bundled source, API documentation, and tests

  Package READMEs now point to the source, JSDoc documentation, usage examples,
  and tests included in the installed version. They also clarify that application
  imports use public package exports, since tests may import internal helpers.

- Updated dependencies [1c89914]
- Updated dependencies [bc4578a]
- Updated dependencies [7cc5d91]
- Updated dependencies [72177aa]
- Updated dependencies [1c89914]
- Updated dependencies [5c97752]
- Updated dependencies [be5afcb]
- Updated dependencies [fd3565e]
- Updated dependencies [f3a8831]
- Updated dependencies [f43e20e]
  - @evolu/common@8.24.0

## 2.1.1

### Patch Changes

- 92be745: Removed the promise options of useQuery and useQueries

  `useQuery` no longer accepts a `promise` option, and `useQueries` no longer accepts `promises`, as in `@evolu/react`. They were redundant: Evolu caches each load, so `useQuery` reuses a query prefetched with `evolu.loadQuery`, for example in a router guard, unless a mutation or sync drops it first. Drop the options and keep the prefetch:

  ```ts
  import {
    assertType,
    createQueryBuilder,
    testEvoluSchema,
    type Evolu,
    type QueryRows,
    type TestEvoluSchema,
  } from "@evolu/common";
  import { useQuery } from "@evolu/vue";

  const createQuery = createQueryBuilder(testEvoluSchema);
  const allTodos = createQuery((db) => db.selectFrom("todo").selectAll());

  // Prefetch the rows, for example in a router guard.
  const prefetchTodos = (evolu: Evolu<TestEvoluSchema>) =>
    evolu.loadQuery(allTodos);

  const useTodos = (promise: ReturnType<typeof prefetchTodos>) => {
    // @ts-expect-error useQuery no longer accepts a promise option.
    useQuery(allTodos, { promise });
    // Reuses the load prefetchTodos started, unless a mutation or sync dropped it.
    return useQuery(allTodos);
  };

  assertType<
    ReturnType<typeof useTodos>["value"],
    QueryRows<typeof allTodos.Row>
  >();
  ```

## 2.1.0

### Minor Changes

- 428350e: Added a sync status for apps and made sync state exact

  `syncStateToOwnerSyncStatus` in `@evolu/common/local-first` tells what an app
  shows about syncing one owner of one database: `NoRelays`, `Syncing`, `Synced`,
  `Offline`, or `Error` with its error. The error is the newest failure of any
  relay or, without one, the newest skipped change, because a failure stops
  syncing through its relay while a skipped change leaves out only that change.
  It takes the value of `deps.syncState`, which is null until the first snapshot,
  `evolu.name`, and the owner's ID. The React binding from `createEvoluBinding`
  has `useOwnerSyncStatus`, and `@evolu/vue` exports one. Both take the
  `deps.syncState` store of the deps the Evolu instance was created with. Without
  an owner, they return the app owner's status; otherwise they take the owner
  `useOwner` takes, and a null owner, for a component that waits for one, gives
  `NoRelays`. They update only when the status changes, not with every snapshot.

  `deps.syncState` now keeps the previous snapshot's object for every part that
  did not change, even when a part listed before it goes away, and a snapshot
  equal to the previous one no longer notifies subscribers.
  `syncStateToOwnerSyncStatus` returns the same object while the status is
  unchanged, so statuses can be compared with `===` in any framework, such as in
  an Angular `computed` or a Svelte `$derived`. The value caught inside a route's
  error, such as what a failed decryption threw, is an `UnknownError`, whose
  `error` holds its message, stack, and cause.

  The documentation of `OwnerSyncStatus` describes what to show, and the examples
  follow it. Evolu saves changes on the device before they sync, so show nothing
  while sync works. For `Offline` and `Error`, show one quiet line saying that
  changes are saved on this device, inside one element with `role="status"` that
  stays mounted, not with `role="alert"`. For `Error`, write actionable text for
  the error types the app handles, such as `ProtocolQuotaError`, and generic text
  otherwise.

  A relay's first connection now counts as `Syncing`, not `Offline`, so apps no
  longer show offline on every start until the relay connects. A relay is
  `Offline` once a connection fails or closes, until a connection opens again.

  Sync state is now made of unions, so each part holds only the fields valid for
  its state, and it no longer stores values derived from others. Code reading it
  stops compiling where it has to change:

  - `syncStateToOwnerSyncStates` and `OwnerSyncState` are removed. The `type` of
    `syncStateToOwnerSyncStatus(state, name, ownerId)` replaces `status`:
    `"initial"` becomes `NoRelays`, which also covers a missing snapshot,
    database, or owner, and `"syncing"`, `"synced"`, `"offline"`, and `"error"`
    become `Syncing`, `Synced`, `Offline`, and `Error`, whose `error` replaces the
    owner's `error`. To list every database and owner, as
    `syncStateToOwnerSyncStates` did, pass the `name` of each `Active` tenant in
    `state.tenants` with the `ownerId` of each of its `Writable` owners.
  - `syncStateToRelaySyncStates(state, name, ownerId)` replaces `relays`, and
    `relaySyncStateToStatus(relay)` replaces `relay.status`. The newest
    `completeAt` of their routes replaces `syncedAt`.
  - A transport's `type` is its kind, `WebSocket`, and its `connection` replaces
    `readyState`, `openedAt`, `closedAt`, and `error`. It is `Connecting` only
    before the first connection opens or fails, `Open` with `openedAt`, or
    `Disconnected` with `disconnectedAt` and the last `openedAt`, if any. Both
    `Open` and `Disconnected` keep the last `error`. A transport becomes
    `Disconnected` when a connection closes or fails or a request goes
    unanswered, and failed reconnect attempts keep the time it disconnected. A
    closing transport is `Open` until it closes.
  - A tenant is `Active` with `owners`, or `Refused` with its
    `UnsupportedDbVersionError` and no owners, instead of having `refused`.
  - An owner is `Writable` with `routes`, or `Readonly` with `transportIds`,
    instead of having `writable`. A writable owner's transport IDs are the
    `transportId` of its routes.
  - A route is `Pending`, `Settled`, or `Complete` instead of having `complete`
    and `error`. `Pending` holds both its `failure` and its `skippedError`,
    `Settled` holds the `skippedError` that keeps it incomplete, `completeAt` is
    required on `Complete`, and `lastSentAt` is required on `Settled` and
    `Complete`.

  ```ts
  import {
    assertEqual,
    createId,
    Millis,
    testCreateDeps,
    testName,
  } from "@evolu/common";
  import {
    syncStateToOwnerSyncStatus,
    testAppOwner,
    type SyncState,
    type SyncTenant,
    type SyncTransport,
  } from "@evolu/common/local-first";

  const deps = testCreateDeps();
  const transportId = createId<"SyncTransport">(deps);
  const state: SyncState = {
    transports: [
      {
        type: "WebSocket",
        id: transportId,
        label: "wss://relay.example",
        connection: {
          type: "Disconnected",
          disconnectedAt: Millis.orThrow(2000),
          openedAt: Millis.orThrow(1000),
          error: null,
        },
      },
    ],
    tenants: [
      {
        type: "Active",
        name: testName,
        owners: [
          {
            type: "Writable",
            ownerId: testAppOwner.id,
            routes: [
              {
                type: "Pending",
                transportId,
                failure: null,
                skippedError: null,
                completeAt: Millis.orThrow(1500),
                lastSentAt: Millis.orThrow(1800),
                lastReceivedAt: Millis.orThrow(1500),
              },
            ],
          },
        ],
      },
    ],
  };

  // @ts-expect-error A transport has no readyState; its connection tells whether it is open.
  type _ReadyState = SyncTransport["readyState"];
  assertEqual(state.transports[0]?.connection.type, "Disconnected");

  const _tenant: SyncTenant = {
    type: "Active",
    name: testName,
    // @ts-expect-error A tenant has no refused flag; its type tells whether it refused startup.
    refused: false,
    owners: [],
  };
  assertEqual(state.tenants[0]?.type, "Active");

  const status = syncStateToOwnerSyncStatus(state, testName, testAppOwner.id);
  // @ts-expect-error An owner sync status is an object; compare its type.
  const _isOffline = status === "offline";
  assertEqual(status, { type: "Offline" });
  ```

### Patch Changes

- 428350e: Stopped Vue composables from subscribing during server rendering

  Vue never disposes a component rendered on the server, so every server render
  left a query subscription of `useQuery` and `useQueries` behind, and `useOwner`
  kept its owner in use. During server rendering, `useQuery` and `useQueries` now
  only load their queries, so they still render empty rows, and `useOwner` uses no
  owner, as the React binding does.

- Updated dependencies [9e5a033]
- Updated dependencies [428350e]
- Updated dependencies [428350e]
- Updated dependencies [6257650]
- Updated dependencies [eeaa3c5]
- Updated dependencies [6257650]
- Updated dependencies [428350e]
- Updated dependencies [3a83a48]
- Updated dependencies [36f9f81]
  - @evolu/common@8.13.0

## 2.0.4

### Patch Changes

- 9030053: Released the owner used by useOwner when its component unmounts

  The `useOwner` composable called `Evolu.useOwner` and discarded the function
  that releases the owner, so the owner kept syncing after its component
  unmounted. It now releases the owner when the current effect scope, such as the
  component, is disposed.

- fdac39e: Removed the useSyncState hook

  It threw on every call. Read `deps.syncState` from the shared Evolu deps
  instead.

- Updated dependencies [f0101ca]
- Updated dependencies [fdac39e]
- Updated dependencies [ecbac00]
- Updated dependencies [b506c9b]
- Updated dependencies [fdac39e]
- Updated dependencies [d2973b9]
- Updated dependencies [b75abfa]
- Updated dependencies [69b756c]
- Updated dependencies [5a671b2]
- Updated dependencies [e270e42]
- Updated dependencies [ef320ff]
- Updated dependencies [5a671b2]
- Updated dependencies [09b1b5c]
- Updated dependencies [fdac39e]
- Updated dependencies [0770038]
- Updated dependencies [e270e42]
- Updated dependencies [f52d66b]
- Updated dependencies [d2973b9]
- Updated dependencies [fdac39e]
- Updated dependencies [11ccc28]
- Updated dependencies [2e139eb]
- Updated dependencies [0624d35]
- Updated dependencies [ecd1c0d]
- Updated dependencies [568358b]
- Updated dependencies [237fd7f]
- Updated dependencies [e7d27be]
- Updated dependencies [2e139eb]
- Updated dependencies [daf6295]
- Updated dependencies [d2973b9]
- Updated dependencies [ba8c493]
- Updated dependencies [8e23edb]
- Updated dependencies [fdac39e]
- Updated dependencies [cf68cee]
  - @evolu/common@8.11.0

## 2.0.3

### Patch Changes

- 9fc736f: Updated internal Evolu peer dependency requirements

  Aligned internal peer dependency minimums with the current workspace releases. Upgrade the Evolu packages together when updating an adapter or framework integration.

- Updated dependencies [532feaa]
- Updated dependencies [6bd0a36]
- Updated dependencies [f4d9ad7]
- Updated dependencies [3d84543]
- Updated dependencies [6bd0a36]
- Updated dependencies [76554bd]
- Updated dependencies [918d77b]
- Updated dependencies [f4d9ad7]
- Updated dependencies [6bd0a36]
- Updated dependencies [ad85bdb]
- Updated dependencies [f4d9ad7]
- Updated dependencies [91ff875]
- Updated dependencies [ad85bdb]
- Updated dependencies [6bd0a36]
- Updated dependencies [140c4cf]
- Updated dependencies [3d84543]
- Updated dependencies [3d84543]
- Updated dependencies [f3b5829]
- Updated dependencies [ad85bdb]
- Updated dependencies [f4d9ad7]
- Updated dependencies [9ee6f15]
  - @evolu/common@8.10.0

## 2.0.2

### Patch Changes

- 037c390: Required Node.js 24.20 or newer

  Evolu packages now require Node.js 24.20 or newer, matching the repository's tested LTS baseline.

## 2.0.1

### Patch Changes

- 13ee2e8: Updated internal peer dependency ranges to require stable releases.

## 2.0.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)

## 2.0.0-next.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)

### Patch Changes

- Updated dependencies [6fc3bba]
- Updated dependencies [2f39c8e]
- Updated dependencies [98a4b6c]
- Updated dependencies [ce83b24]
- Updated dependencies [97f5314]
- Updated dependencies [5275b07]
- Updated dependencies [cd6b74d]
- Updated dependencies [5a4d172]
- Updated dependencies [87780a3]
- Updated dependencies [bfaa2ca]
- Updated dependencies [f0bbebb]
- Updated dependencies [332dfca]
- Updated dependencies [7da2364]
- Updated dependencies [6f1d6ea]
- Updated dependencies [0528425]
- Updated dependencies [5f97e83]
- Updated dependencies [7fe328d]
- Updated dependencies [3ba2a92]
- Updated dependencies [5720b0b]
- Updated dependencies [e948269]
- Updated dependencies [d1f817f]
- Updated dependencies [2abf93d]
- Updated dependencies [b956a5f]
- Updated dependencies [ece429b]
- Updated dependencies [d30b95a]
- Updated dependencies [953c1fb]
- Updated dependencies [9ba5442]
- Updated dependencies [3b74e48]
- Updated dependencies [c24ec2f]
- Updated dependencies [9373afa]
- Updated dependencies [4be336d]
  - @evolu/common@8.0.0-next.0

## 1.4.0

### Patch Changes

- Updated dependencies [1479665]
  - @evolu/common@7.4.0

## 1.3.0

### Patch Changes

- Updated dependencies [d957af4]
- Updated dependencies [a21a9fa]
- Updated dependencies [604940a]
- Updated dependencies [a04e86e]
- Updated dependencies [5f5a867]
  - @evolu/common@7.3.0

## 1.2.1

### Patch Changes

- 84f1663: Rename `Evolu` directory to `local-first`

  Reorganize internal directory structure to better reflect the local-first architecture. The `Evolu` directory in `src` is now named `local-first` across all packages.

  It's not breaking change unless `@evolu/common/evolu` was used (now its `@evolu/common/local-first`). The JSDoc called is "internal" so not considered as public API change.

- Updated dependencies [84f1663]
  - @evolu/common@7.2.1

## 1.2.0

### Patch Changes

- Updated dependencies [0830d8b]
  - @evolu/common@7.2.0

## 1.1.0

### Patch Changes

- Updated dependencies [be0ad00]
  - @evolu/common@7.1.0

## 1.0.0

### Minor Changes

- 8b66ecc: Introduces a Vue integration for Evolu

### Patch Changes

- Updated dependencies [36af10c]
- Updated dependencies [6452d57]
- Updated dependencies [eec5d8e]
- Updated dependencies [dd3c865]
- Updated dependencies [8f0c0d3]
- Updated dependencies [eec5d8e]
- Updated dependencies [6759c31]
- Updated dependencies [2f87ac8]
- Updated dependencies [6195115]
- Updated dependencies [eec5d8e]
- Updated dependencies [47386b8]
- Updated dependencies [202eaa3]
- Updated dependencies [f4a8866]
- Updated dependencies [eec5d8e]
- Updated dependencies [13b688f]
- Updated dependencies [a1dfb7a]
- Updated dependencies [45c8ca9]
- Updated dependencies [4a960c7]
- Updated dependencies [6279aea]
- Updated dependencies [02e8aa0]
- Updated dependencies [f5e4232]
- Updated dependencies [0911302]
- Updated dependencies [31d0d21]
- Updated dependencies [0777577]
- Updated dependencies [29886ff]
- Updated dependencies [eec5d8e]
- Updated dependencies [de37bd1]
- Updated dependencies [1d8c439]
- Updated dependencies [3daa221]
- Updated dependencies [eed43d5]
- Updated dependencies [05fe5d5]
- Updated dependencies [4a82c06]
  - @evolu/common@7.0.0

## 1.0.0-preview.3

### Patch Changes

- 816f497: Fix package.json repository field format to use full object notation required for npm publishing

## 1.0.0-preview.2

### Minor Changes

- 8b66ecc: Introduces a Vue integration for Evolu

## 1.0.0-preview.1

- Initial release for the new Evolu
