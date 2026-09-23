---
"@evolu/common": minor
"@evolu/web": patch
---

Added sync state

`createEvoluDeps` exposes `deps.syncState`, a `ReadonlyStore<SyncState | null>`
beside `evoluError`, shared by every Evolu instance and kept current by the
shared worker. Each worker broadcasts snapshots on its own channel: a connecting
tab receives the channel's name through its port, listens, and asks for a
snapshot, and then receives one after every change the worker observes, so it
never hears a worker of another app version. The snapshot lists every transport
with an opaque id, a label that is the URL without its query, the ready state,
and the last open, close, and error times; and every database with its owner
registrations, each marked writable or readonly, with the transports claimed for
the owner and, for a writable owner, one route per transport saying whether the
database is reconciled with that relay: `complete`, `completeAt`, `lastSentAt`,
`lastReceivedAt`, and the last `error`. Expected write rejections retain their
concrete type in `error.type`; `WriteFailed` identifies a `writeMessages` call
that threw, logged by the protocol. A failed result on a route requests one
round through it; any further failure before the route completes waits for an
explicit request or a reopen.
A copy of another database's messages holds every route of its owner until this
database applies it, because such a copy arrives without a request of its own; a
copy that fails to apply requests a round through every relay. When a
continuation copy stores new messages, the database reconciles them through the
other relays before reporting those routes complete. Duplicate copies do not
start additional rounds. Local-only writes leave completed routes complete;
`isLocalOnlyTable` tells whether a table is local-only.
`syncStateToOwnerSyncStates` folds the routes into one `initial`, `syncing`,
`synced`, `offline`, or `error` state per database and owner with the last
synced time and each relay: its transport, its route, and its own `syncing`,
`synced`, `offline`, or `error` status. The rules are documented in the Shared
module. The [Sync playground](https://www.evolu.dev/playgrounds/sync) shows the
state of two relays while one goes down and catches up.

```ts
import {
  assertEqual,
  createId,
  createStore,
  testCreateDeps,
} from "@evolu/common";
import type { SyncState, SyncStateDep } from "@evolu/common/local-first";

const openRelayLabels = (deps: SyncStateDep): ReadonlyArray<string> =>
  (deps.syncState.get()?.transports ?? [])
    .filter(({ readyState }) => readyState === "open")
    .map(({ label }) => label);

using syncState = createStore<SyncState | null>(null);
assertEqual(openRelayLabels({ syncState }), []);

const deps = testCreateDeps();
syncState.set({
  transports: [
    {
      id: createId<"SyncTransport">(deps),
      label: "wss://relay.example",
      readyState: "open",
      openedAt: null,
      closedAt: null,
      error: null,
    },
  ],
  tenants: [],
});
assertEqual(openRelayLabels({ syncState }), ["wss://relay.example"]);
```
