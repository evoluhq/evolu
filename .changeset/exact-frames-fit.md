---
"@evolu/common": minor
---

Added trial writes that measure protocol frames exactly

`ProtocolMessageBuffer.tryWrite` runs a write and keeps it only if the frame,
measured exactly, still has room to be closed with one Fingerprint range with
`InfiniteUpperBound` within `totalMaxSize` and `rangesMaxSize`. Otherwise it
undoes the write, also when the write throws. An optional reserve holds room for
bytes the caller adds later. Inside a trial, `addMessage` and `addRange` do not
assert the size limit; outside one they assert that the frame fits
`totalMaxSize` without safety margins. `getSize` now returns the exact encoded
size; it used to add a 22-byte reservation once the frame had ranges.

`createProtocolMessageFromCrdtMessages` and
`createProtocolBroadcastMessagesFromCrdtMessages` use trials, so a change that
fits the rest of a frame exactly is sent in it rather than in the next round or
frame. A broadcast change that does not fit an empty frame still throws.

The trials undo writes with the new `checkpoint` of `RunLengthEncoder` and
`TimestampsBuffer`, which returns a function that restores the encoder or buffer
in constant time.

```ts
import {
  assertEqual,
  assertFalse,
  assertTrue,
  createId,
  createRunLengthEncoder,
  encodeNonNegativeInt,
  NonNegativeInt,
  testCreateDeps,
} from "@evolu/common";
import {
  createProtocolMessageBuffer,
  defaultProtocolMessageMaxSize,
  encodeAndEncryptDbChange,
  MessageType,
  testAppOwner,
  testCreateCrdtMessage,
} from "@evolu/common/local-first";

const encoder = createRunLengthEncoder<NonNegativeInt>(encodeNonNegativeInt);
encoder.add(NonNegativeInt.orThrow(5));
const restore = encoder.checkpoint();
encoder.add(NonNegativeInt.orThrow(5));
assertEqual(encoder.unwrap(), new Uint8Array([5, 2]));
restore();
assertEqual(encoder.unwrap(), new Uint8Array([5, 1]));

const deps = testCreateDeps();
const crdtMessage = testCreateCrdtMessage(createId(deps), 1, "Ada");
const message = {
  timestamp: crdtMessage.timestamp,
  change: encodeAndEncryptDbChange(deps)(
    crdtMessage,
    testAppOwner.encryptionKey,
  ),
};
const buffer = createProtocolMessageBuffer(testAppOwner.id, {
  messageType: MessageType.Request,
});
const emptySize = buffer.getSize();

// Reserving the whole frame for later bytes leaves no room for the message.
assertFalse(
  buffer.tryWrite(() => {
    buffer.addMessage(message);
  }, NonNegativeInt.orThrow(defaultProtocolMessageMaxSize)),
);
assertEqual(buffer.getSize(), emptySize);

assertTrue(
  buffer.tryWrite(() => {
    buffer.addMessage(message);
  }),
);
assertTrue(buffer.getSize() > emptySize);
```
