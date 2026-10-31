---
"@evolu/common": patch
"@evolu/relay": patch
---

Fixed relays storing a new owner's write key before its quota check

A relay stored the write key of an owner it hadn't seen with any request that carried one, including a sync request without changes, before it asked `isOwnerWithinQuota`. On a relay that admits anyone, requests with made-up OwnerIds added rows that no quota limited. On a relay whose quota refuses unknown owners, someone who knew an OwnerId could claim it, and the relay then refused the owner's own writes until its operator deleted the owner. A relay now stores an owner's write key only with the first write for the owner that passes the quota check, so a quota that refuses an OwnerId also keeps others from claiming it. Once the quota admits it, whoever writes first still can, as [Privacy](https://www.evolu.dev/docs/privacy#write-keys) describes.

Write keys that earlier releases stored stay. With the relay stopped, `delete from evolu_writeKey where ownerId not in (select ownerId from evolu_message);` deletes the ones stored without data, which an owner's next accepted write stores again, and `relay.deleteOwner` removes a squatter that stored data.

For custom relay storage: `Storage` no longer has `validateWriteKey`. `RelayStorage`, which `applyProtocolMessageAsRelay` now takes, has it, and it only compares keys, because the relay calls it only for a request without messages. Its `writeMessages` takes the writer's write key before the messages, so an implementation written for `Storage` no longer compiles. It must compare the key with the owner's under the owner's lock, return `StorageWriteKeyError` for another, and store a new owner's key in the write's transaction, as `createRelaySqliteStorage` does.

```ts
import {
  assertType,
  ok,
  type NonEmptyReadonlyArray,
  type Task,
} from "@evolu/common";
import type {
  EncryptedCrdtMessage,
  OwnerIdBytes,
  OwnerWriteKey,
  RelayStorage,
  RelayStorageWriteMessagesError,
  Storage,
  StorageWriteMessagesError,
} from "@evolu/common/local-first";

// A client's Storage no longer has validateWriteKey; RelayStorage has it.
assertType<"validateWriteKey" extends keyof Storage ? true : false, false>();

const writeMessagesWithoutWriteKey =
  (
    _ownerIdBytes: OwnerIdBytes,
    _messages: NonEmptyReadonlyArray<EncryptedCrdtMessage>,
  ): Task<void, StorageWriteMessagesError> =>
  () =>
    ok();

// @ts-expect-error RelayStorage's writeMessages takes the write key before the messages.
const _before: RelayStorage["writeMessages"] = writeMessagesWithoutWriteKey;

const _after: RelayStorage["writeMessages"] =
  (_ownerIdBytes, _writeKey, _messages) => () =>
    ok();

assertType<Parameters<RelayStorage["writeMessages"]>[1], OwnerWriteKey>();
assertType<
  ReturnType<RelayStorage["writeMessages"]>,
  Task<void, RelayStorageWriteMessagesError>
>();
```
