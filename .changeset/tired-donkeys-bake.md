---
"@evolu/common": minor
---

Fixed an owner reporting Synced while another local database was still uploading a large write

When two local databases in an app, such as those of two AppOwners, sync the same owner, Evolu copies a write from one to the other and normally relies on the writing database to upload it. A write too large for one sync message uploads across multiple rounds. Until the final round finished, the other database could report the owner as `Synced`. If the writing database closed, stopped using the owner, or was deleted before the upload completed, the remaining changes reached the relay only on the other database's next sync round. Now, when a write doesn't fit in one sync message or no relay connection is open, the other database syncs it with the relay itself.

For low-level sync protocol code, `createProtocolUploadFromCrdtMessages` of `@evolu/common/local-first` replaced `createProtocolMessageFromCrdtMessages`. It returns a `ProtocolUpload` (`{ message, isComplete }`): `message` is what the old function returned, so `createProtocolMessageFromCrdtMessages(deps)(owner, messages)` becomes `createProtocolUploadFromCrdtMessages(deps)(owner, messages).message`, and `isComplete` tells whether every CRDT message fit:

```ts
import {
  assertSame,
  assertType,
  createId,
  createXChaCha20Poly1305,
  testCreateDeps,
} from "@evolu/common";
import {
  createProtocolUploadFromCrdtMessages,
  testAppOwner,
  testCreateCrdtMessage,
  type ProtocolUpload,
} from "@evolu/common/local-first";
// @ts-expect-error createProtocolMessageFromCrdtMessages is no longer exported.
import type { createProtocolMessageFromCrdtMessages as _createProtocolMessageFromCrdtMessages } from "@evolu/common/local-first";

const deps = {
  ...testCreateDeps(),
  xChaCha20Poly1305: createXChaCha20Poly1305(),
};
const upload = createProtocolUploadFromCrdtMessages(deps)(testAppOwner, [
  testCreateCrdtMessage(createId(deps), 1, "Ada"),
]);
assertType<typeof upload, ProtocolUpload>();
assertSame(upload.isComplete, true);
```
