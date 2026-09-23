---
"@evolu/common": patch
---

Distinguished converged and failed client protocol results

`applyProtocolMessageAsClient` returned `NoResponse` for a converged round, a
rejected storage write, a failed range reconciliation, and a missing write key
alike. It now returns `Converged` or `Readonly`, and reports a `Broadcast`
before checking for a write key. `Failed` with cause `Write` now identifies a
logged exception thrown by calling the storage's `writeMessages`; an exception
while its Task runs, as the built-in storages throw, aborts the run instead;
cause `Sync` identifies a logged range reconciliation failure, which may follow
committed writes.

Expected write rejections return the original `StorageWriteMessagesError`
through `Err`. Direct callers handle these in `result.error`, rather than as a
successful `Failed` result. Client storage returns errors without reporting
them; the shared worker reports each accepted failed apply once, after rejecting
stale worker responses. Existing retries can report another failed attempt. A
relay still answers a rejected write that is not a quota error with
`ProtocolWriteError`.

`Storage.writeMessages` returns `StorageWriteMessagesError` instead of only
`StorageQuotaError`. Implementations may return any subset, while callers must
handle every member. `EvoluError` now includes `StorageQuotaError`, a member of
`StorageWriteMessagesError` that the built-in client storage does not return
yet, so exhaustive handling of `EvoluError` must add it.

```ts
import {
  assertEqual,
  assertType,
  err,
  type InferTaskErr,
  type Result,
} from "@evolu/common";
import type {
  applyProtocolMessageAsClient,
  ApplyProtocolMessageAsClientResult,
  ProtocolError,
  StorageWriteMessagesError,
} from "@evolu/common/local-first";

type ClientApplyError = InferTaskErr<
  ReturnType<typeof applyProtocolMessageAsClient>
>;
assertType<ClientApplyError, ProtocolError | StorageWriteMessagesError>();

const describeApply = (
  result: Result<ApplyProtocolMessageAsClientResult, ClientApplyError>,
): string => {
  if (!result.ok) return result.error.type;
  return result.value.type;
};

const rejected = err<ClientApplyError>({
  type: "TimestampTimeOutOfRangeError",
});
// @ts-expect-error Client apply errors now include storage rejections beyond ProtocolError.
const _oldResult: Result<ApplyProtocolMessageAsClientResult, ProtocolError> =
  rejected;
assertEqual(describeApply(rejected), "TimestampTimeOutOfRangeError");
```

Fingerprint-query exceptions stop synchronization instead of producing
incomplete ranges. `createProtocolMessageForSync` propagates them to its caller
and no longer requires `ConsoleDep`. While creating a round, the database worker
logs the exception and still answers, so other owners keep synchronizing, and
sync state reports `SyncFailed` for the failed owner's routes. While applying a
frame, clients report `Failed` with cause `Sync`, and relays send a
`ProtocolSyncError` response.
