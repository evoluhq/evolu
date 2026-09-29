---
"@evolu/common": minor
"@evolu/react": minor
"@evolu/vue": minor
---

Added a sync status for apps and made sync state exact

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
