---
"@evolu/common": patch
---

Moved sync errors from evoluError to sync state

A problem syncing an owner through a relay belongs to that relay and often
repeats in every round, so it no longer goes to the global `evoluError` store.
`ProtocolError` and `StorageQuotaError` are no longer `EvoluError` members, so
`EvoluError` holds only app-level errors: `OtherBuildRunningError`,
`UnknownError`, and `UnsupportedDbVersionError`. An unexpected failure while
syncing, which Evolu logs, is still an `UnknownError`.

Sync state shows each sync problem with its details on the relay's route, as
the route's `failure`, or `skippedError` for a skipped change, and as the
owner's `Error` status. Because sync state shows them, tabs no longer log them
to the console. Apps that reacted to one of these errors through
`evoluError` read it there instead: a `ProtocolQuotaError` still means more
relay quota, then `evolu.requestSync`, and a `ProtocolVersionError` still means
an app or relay update. An app that showed every `evoluError` no longer shows
these problems. Show them from sync state instead, as the examples do: use
`useOwnerSyncStatus` from the React binding that `createEvoluBinding` returns
or from `@evolu/vue`, or `syncStateToOwnerSyncStatus`, and show the `Error`
status. `evoluError` reported these problems for every owner of every database,
but a status covers one owner of one database, so an app that handled them for
other owners checks each owner it syncs: with `useOwnerSyncStatus` where it
shows that owner's data, or with `syncStateToOwnerSyncStatus` for each
`Writable` owner of its database.

```ts
import { assertTrue, Millis, type EvoluError } from "@evolu/common";
import { testAppOwner, type OwnerSyncStatus } from "@evolu/common/local-first";

const ownerId = testAppOwner.id;

// @ts-expect-error A ProtocolQuotaError is no longer an EvoluError.
const _evoluError: EvoluError = { type: "ProtocolQuotaError", ownerId };

// Sync state shows it as the owner's Error status instead.
const needsQuota = (status: OwnerSyncStatus): boolean =>
  status.type === "Error" && status.error.type === "ProtocolQuotaError";

assertTrue(
  needsQuota({
    type: "Error",
    error: { type: "ProtocolQuotaError", ownerId, at: Millis.orThrow(1000) },
  }),
);
```

Evolu databases in one app that sync the same owner hand each other the changes
they send, without waiting for a relay, so such a copy has no route. If applying
a copy fails or skips a change, which only a bug can cause, such as the two
databases holding different keys for the owner, `evoluError` reports it as an
`UnknownError`.
