# @evolu/svelte

## 3.1.0

### Minor Changes

- 518e073: Added loaded to queryState

  A component couldn't tell a loading query from an empty one, and a query SQLite failed reached no UI, only an unhandled rejection, so apps listed each query twice, once for `queryState` and once for an `{#await}` of `evolu.loadQuery`. `queryState` now returns a `QueryState`, whose `loaded` is the current query's first load, so a component renders `{#await todos.loaded}`, what shows while the query loads, `{:then}`, the rows of `todos.rows`, `{:catch error}`, the failure, `{/await}`. When the query changes, `loaded` is the new query's first load, and a later refresh leaves it as it is. A failure the component awaits isn't also reported as an unhandled rejection, and one that nothing awaits still is. Without a query, `loaded` has resolved with no rows. It stays pending for an instance whose database was deleted, as React's `useQuery` stays suspended, and while a refused database answers no load.

- 518e073: Added storeState

  `storeState(store)` follows an Evolu `ReadonlyStore`, such as `evoluError` or `syncState` of `evoluSvelteDeps`, and returns an object whose `current` is the store's value, as React's `useSyncExternalStore` does and as Svelte's `fromStore` names it. Apps no longer mirror a store into `$state` by hand, which missed a change made between the first render and the effect's subscription: `storeState` reads the store again once subscribed. Like `queryState`, it creates an `$effect`, so call it during component initialization.

- 518e073: Added evoluAppState for createEvoluApp

  `evoluAppState(app)` follows an app that `createEvoluApp` created and returns an `EvoluAppState`, whose `state` and `appOwners` update when it changes. `state` is an `AppOwnerState`: `None` while the tab has no AppOwner open, `Opening` with the `current` AppOwner while its instance opens, and `Open` with `current` and `evolu`, the instance. A component renders `{#if appState.state.type === "Open"}{#key appState.state.evolu}` with the AppOwner's UI, which the key remounts when the tab opens another AppOwner, and passes the instance to `queryState`. While the state is `None`, such as after a removal, it shows a choice such as to create or restore an AppOwner. Like `queryState`, it creates an `$effect`, so call it during component initialization.

  `queryState` now takes any instance, also `AppOwnerEvolu` and the device database's `app.device`, not only an `Evolu`.

- 518e073: Added ownerSync and ownerSyncStatusState

  Svelte apps get what React's and Vue's `useOwner` and `useOwnerSyncStatus` do. `ownerSync(evolu, () => owner, () => transports)` syncs an owner, such as a shared project's, while the component lives, and stops when it's destroyed or the owner or transports change. A null owner syncs none, for a component that waits for one, and owners and transports are compared by content, so recreating them keeps the registration. `ownerSyncStatusState(evolu, syncState)` returns an object whose `status` is the `OwnerSyncStatus` of the instance's AppOwner, or of the owner a third argument returns, and updates when the status changes, not with every snapshot. Pass `evoluSvelteDeps.syncState`, or the `syncState` of the deps the instance was created with. Before the first snapshot and during server rendering, the status is `NoRelays`. Like `queryState`, both create an `$effect`, so call them during component initialization.

### Patch Changes

- 518e073: Fixed queryState throwing after deleteDatabase

  `deleteDatabase` disposes the instance, and the app reloads or replaces it afterward. Until then, `queryState` threw "Cannot use a disposed object." when its effect ran again, such as for a query that depends on rows the deletion emptied, and destroying the component then threw "subscribeQuery unsubscribe can be called only once." A `queryState` created after the deletion threw as well. It now checks `isDatabaseDeleted`, as the React binding does, and returns empty rows without loading or subscribing.

- Updated dependencies [546484b]
- Updated dependencies [518e073]
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
  - @evolu/web@3.8.0

## 3.0.5

### Patch Changes

- 7cc5d91: Added links to bundled source, API documentation, and tests

  Package READMEs now point to the source, JSDoc documentation, usage examples,
  and tests included in the installed version. They also clarify that application
  imports use public package exports, since tests may import internal helpers.

- Updated dependencies [1c89914]
- Updated dependencies [bc4578a]
- Updated dependencies [7cc5d91]
- Updated dependencies [89b626c]
- Updated dependencies [72177aa]
- Updated dependencies [1c89914]
- Updated dependencies [5c97752]
- Updated dependencies [be5afcb]
- Updated dependencies [fd3565e]
- Updated dependencies [f3a8831]
- Updated dependencies [f43e20e]
  - @evolu/common@8.24.0
  - @evolu/web@3.6.3

## 3.0.4

### Patch Changes

- 75d0d22: Fixed queryState showing rows of a previous query

  When the query of `queryState` changed and a load of a previous query finished last, `rows` showed that query's rows until the current query's data changed, for example after switching to a query and back before it loaded. `rows` now holds only rows of the current query, so it is empty until that query loads and while there is no query. Previously, the rows of the previous query stayed in both cases.

- cc920d2: Simplified queryState and removed appOwnerState

  `queryState` no longer takes a `mapping` option. The option never applied: `rows` always held the query rows, though typed as the mapped rows. Derive mapped rows with `$derived` instead, which also updates when state read by the mapping changes.

  `rows` is now the readonly `QueryRows` array Evolu returns, as with `useQuery` in React and Vue. `queryState` previously stored rows in deep `$state`, so `rows` held proxies, and every update gave even unchanged rows a new identity. Mutating `rows` no longer updates the UI.

  `appOwnerState` was removed. `evolu.appOwner` is available as soon as Evolu is created, so `appOwnerState` only delayed it: its `current` was `undefined` until an effect ran. Read `evolu.appOwner` directly.

  ```svelte
  <script lang="ts">
    // Before: queryState(evolu, () => allTodos, { mapping: (row) => row.title });
    const todos = queryState(evolu, () => allTodos);
    const titles = $derived(todos.rows.map((row) => row.title));

    // Before: appOwnerState(evolu).current?.mnemonic
    const mnemonic = evolu.appOwner.mnemonic;
  </script>
  ```

- Updated dependencies [bfba9bf]
- Updated dependencies [609d399]
  - @evolu/common@8.20.1
  - @evolu/web@3.5.2

## 3.0.3

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
- Updated dependencies [9fc736f]
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
  - @evolu/web@3.1.2

## 3.0.2

### Patch Changes

- 037c390: Required Node.js 24.20 or newer

  Evolu packages now require Node.js 24.20 or newer, matching the repository's tested LTS baseline.

## 3.0.1

### Patch Changes

- 13ee2e8: Updated internal peer dependency ranges to require stable releases.

## 3.0.0

## 3.0.0-next.0

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
  - @evolu/web@3.0.0-next.0

## 2.4.0

### Patch Changes

- Updated dependencies [1479665]
  - @evolu/common@7.4.0
  - @evolu/web@2.4.0

## 2.3.0

### Patch Changes

- Updated dependencies [d957af4]
- Updated dependencies [a21a9fa]
- Updated dependencies [604940a]
- Updated dependencies [a04e86e]
- Updated dependencies [5f5a867]
  - @evolu/common@7.3.0
  - @evolu/web@2.3.0

## 2.2.1

### Patch Changes

- 84f1663: Rename `Evolu` directory to `local-first`

  Reorganize internal directory structure to better reflect the local-first architecture. The `Evolu` directory in `src` is now named `local-first` across all packages.

  It's not breaking change unless `@evolu/common/evolu` was used (now its `@evolu/common/local-first`). The JSDoc called is "internal" so not considered as public API change.

- Updated dependencies [84f1663]
  - @evolu/common@7.2.1
  - @evolu/web@2.2.1

## 2.2.0

### Patch Changes

- Updated dependencies [0830d8b]
  - @evolu/common@7.2.0
  - @evolu/web@2.2.0

## 2.1.0

### Patch Changes

- Updated dependencies [be0ad00]
  - @evolu/common@7.1.0
  - @evolu/web@2.1.0

## 2.0.0

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
  - @evolu/web@2.0.0

## 1.0.1-preview.4

### Patch Changes

- 5c05d2e: Internal improvements and dependency updates
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [5c05d2e]
- Updated dependencies [eec5d8e]
  - @evolu/common@6.0.1-preview.20
  - @evolu/web@1.0.1-preview.6

## 1.0.1-preview.3

### Patch Changes

- 2f30dcd: Update deps
- Updated dependencies [2f30dcd]
- Updated dependencies [4a82c06]
  - @evolu/common@6.0.1-preview.18
  - @evolu/web@1.0.1-preview.4

## 1.0.1-preview.2

### Patch Changes

- 2a37317: Update dependencies
- Updated dependencies [2a37317]
- Updated dependencies [39cbd9b]
  - @evolu/common@6.0.1-preview.3
  - @evolu/web@1.0.1-preview.2

## 1.0.1-preview.1

### Patch Changes

- 8ff21e5: GitHub release
- Updated dependencies [8ff21e5]
  - @evolu/common@6.0.1-preview.2
  - @evolu/web@1.0.1-preview.1

## 1.0.1-preview.0

### Patch Changes

- 632768f: Preview release
- Updated dependencies [632768f]
  - @evolu/common@6.0.1-preview.0
  - @evolu/web@1.0.1-preview.0

## 1.0.0

### Major Changes

- Updated to use new Evolu architecture
