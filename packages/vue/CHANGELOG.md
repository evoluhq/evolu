# @evolu/vue

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
