---
"@evolu/common": minor
"@evolu/web": patch
---

Added sync state

`createEvoluDeps` exposes `deps.syncState`, a `ReadonlyStore<SyncState | null>`
beside `evoluError`, shared by every Evolu instance and kept current by the
shared worker; a tab never receives snapshots from a worker of another app
version. A snapshot lists every transport with an opaque id, a label that is
the URL without its query, the ready state, and the last open, close, and error
times; and every database with its owner registrations, each marked writable or
readonly, with the transports claimed for the owner and, for a writable owner,
one route per transport saying whether the database is reconciled with that
relay: `complete`, `completeAt`, `lastSentAt`, `lastReceivedAt`, and the last
`error`, whose `type` is a protocol error, the original storage write
rejection, `WriteFailed`, or `SyncFailed`. Local-only writes leave completed
routes complete; `isLocalOnlyTable` tells whether a table is local-only.

A failed route retries at most once by itself before it completes again;
further retries wait for `requestSync` or a reconnect.

`syncStateToOwnerSyncStates` folds the routes into one `initial`, `syncing`,
`synced`, `offline`, or `error` state per database and owner with the last
synced time, the newest error, and each relay's transport, route, and own
`syncing`, `synced`, `offline`, or `error` status. The completion rules are
documented in the Shared module. The
[Sync playground](https://www.evolu.dev/playgrounds/sync) shows the state of
two relays while one goes down and catches up.

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
