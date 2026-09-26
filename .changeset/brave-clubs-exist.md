---
"@evolu/common": minor
---

Fixed local synchronization between databases

Named databases with writable registrations for the same owner now receive each other's mutation and continuation uploads locally, including while relay sockets are closed or a relay's quota check is pending. Large mutation batches are split into complete frames.

Added `createProtocolBroadcastMessagesFromCrdtMessages` for producing all broadcast frames from a mutation batch. Client protocol responses can also include a `broadcast` companion containing their uploaded messages.

```ts
import {
  assertSame,
  createId,
  getOrThrow,
  testCreateDeps,
} from "@evolu/common";
import {
  createProtocolBroadcastMessagesFromCrdtMessages,
  MessageType,
  parseProtocolHeader,
  testAppOwner,
  testCreateCrdtMessage,
} from "@evolu/common/local-first";

const deps = testCreateDeps();
const broadcasts = createProtocolBroadcastMessagesFromCrdtMessages(deps)(
  testAppOwner,
  [testCreateCrdtMessage(createId(deps), 1, "Ada")],
);
assertSame(broadcasts.length, 1);
assertSame(
  getOrThrow(parseProtocolHeader(broadcasts[0])).messageType,
  MessageType.Broadcast,
);
```
