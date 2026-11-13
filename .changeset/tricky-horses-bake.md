---
"@evolu/svelte": minor
---

Added ownerSync and ownerSyncStatusState

Svelte apps get what React's and Vue's `useOwner` and `useOwnerSyncStatus` do. `ownerSync(evolu, () => owner, () => transports)` syncs an owner, such as a shared project's, while the component lives, and stops when it's destroyed or the owner or transports change. A null owner syncs none, for a component that waits for one, and owners and transports are compared by content, so recreating them keeps the registration. `ownerSyncStatusState(evolu, syncState)` returns an object whose `status` is the `OwnerSyncStatus` of the instance's AppOwner, or of the owner a third argument returns, and updates when the status changes, not with every snapshot. Pass `evoluSvelteDeps.syncState`, or the `syncState` of the deps the instance was created with. Before the first snapshot and during server rendering, the status is `NoRelays`. Like `queryState`, both create an `$effect`, so call them during component initialization.
