---
"@evolu/common": patch
---

Fixed a failed SQLite write during sync crashing a relay or a database worker

When SQLite failed while storing received messages, for example on a full disk
or a corrupt page, the relay's shared Run panicked, so the relay closed every
connection and exited, and a supervisor restarting it got the same crash on the
next write. On a client, the same failure panicked the database worker. Both
now roll the write back and keep running. The relay logs the failure and
answers the request with `ProtocolWriteError`, and a client reports it as the
failure of the relay's route. A relay that cannot store a new owner's write key
also answers with `ProtocolWriteError`, where it used to send no reply.

`StorageWriteMessagesError` now includes `UnknownError`, which both built-in
storages return when SQLite fails the write, so the error of
`applyProtocolMessageAsClient` and `SyncRouteError` include it too. A custom
`Storage` can return it as well; the relay answers it with
`ProtocolWriteError`. Code that treats these errors as a `StorageQuotaError`
must check their `type` first, and a switch over the `type` needs a case for
it.

```ts
import { assertEqual, createUnknownError } from "@evolu/common";
import type {
  StorageQuotaError,
  StorageWriteMessagesError,
} from "@evolu/common/local-first";

const _quotaErrorBefore = (
  error: StorageWriteMessagesError,
): StorageQuotaError =>
  // @ts-expect-error An UnknownError is not a StorageQuotaError.
  error;

const quotaErrorOf = (error: StorageWriteMessagesError) =>
  error.type === "StorageQuotaError" ? error : null;

assertEqual(quotaErrorOf(createUnknownError(new Error("disk full"))), null);
```
