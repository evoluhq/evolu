---
"@evolu/common": minor
"@evolu/nodejs": minor
---

Added deleteOwner to Relay, which deletes an owner's data

A relay operator can now delete everything a relay stores for an owner, its messages, timestamps, usage, and write key, such as the data of a customer who leaves a paid relay, without editing the relay's database file. `relay.deleteOwner(ownerId)` waits for the owner's write in progress and closes the connections subscribed to the owner. Refuse the owner's writes first with `isOwnerWithinQuota`, or its devices upload their data again on their next sync. `isOwnerAllowed` is not enough, because it checks only the OwnerId a connection names when it connects.

`Storage` no longer has `deleteOwner`, which sync never called; `BaseSqliteStorage` and the new `RelaySqliteStorage` have it. `createRelaySqliteStorage` now returns a `RelaySqliteStorage`, whose `deleteOwner` returns a `Task` instead of deleting right away, so run it, as in `await run(storage.deleteOwner(ownerIdBytes))`. A call such as `storage.deleteOwner(ownerIdBytes)` still compiles but deletes nothing. A custom implementation of `Relay` needs `deleteOwner`.

```ts
import {
  assertType,
  type OwnerId,
  type OwnerIdBytes,
  type Result,
  type Run,
  type Task,
  type UnknownError,
} from "@evolu/common";
import type { Relay, RelaySqliteStorage } from "@evolu/common/local-first";

// The relay's isOwnerWithinQuota answers with !deletedOwnerIds.has(ownerId).
const deletedOwnerIds = new Set<OwnerId>();

const deleteCustomer = (
  relay: Relay,
  ownerId: OwnerId,
): Task<void, UnknownError> => {
  deletedOwnerIds.add(ownerId);
  return relay.deleteOwner(ownerId);
};

assertType<ReturnType<typeof deleteCustomer>, Task<void, UnknownError>>();

// RelaySqliteStorage's deleteOwner returns a Task, so a custom relay runs it.
const deleteFromStorage = (
  run: Run,
  storage: RelaySqliteStorage,
  ownerIdBytes: OwnerIdBytes,
): Promise<Result<void, UnknownError>> =>
  run(storage.deleteOwner(ownerIdBytes));

assertType<
  ReturnType<RelaySqliteStorage["deleteOwner"]>,
  Task<void, UnknownError>
>();
assertType<
  ReturnType<typeof deleteFromStorage>,
  Promise<Result<void, UnknownError>>
>();
```
