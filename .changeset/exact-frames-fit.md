---
"@evolu/common": minor
---

Fixed sync failing when a protocol message was nearly full

Sync predicted message sizes with fixed safety margins, and some writes, such as
the timestamps the other side already had, a range split, or the ranges answering
an empty part of storage, were added without checking the space left. When large
changes nearly filled a reply or request, an assertion failed: a relay logged it
and sent no reply or replied with `ProtocolSyncError`, and a client's sync
failed the same way. The data did not change, so every retry failed the same way
and the owner stopped syncing through that relay. Sync now makes every write as
a trial that measures the exact message and undoes the write when the message
could no longer be closed, so it never fails on size and stays within
`totalMaxSize` and `rangesMaxSize`. Splits and messages near the total size no
longer leave margins unused, so some syncs take fewer rounds. Replies from a
relay are fixed once the relay updates `@evolu/common`.

A message without room for its next range ends with one fingerprint over
everything after the last range it answered. That fingerprint used to leave out
the range it could not answer and any skipped ranges before it, which cost
redundant rounds.

`ProtocolMessageBuffer.tryWrite` runs a write and keeps it only if the frame,
measured exactly, still has room to be closed with one Fingerprint range with
`InfiniteUpperBound` within `totalMaxSize` and `rangesMaxSize`. Otherwise it
undoes the write, also when the write throws. An optional reserve holds room for
bytes the caller adds later. Inside a trial, `addMessage` and `addRange` do not
assert the size limit; outside one they assert that the frame fits
`totalMaxSize` without safety margins. `getSize` now returns the exact encoded
size; it used to add a 22-byte reservation once the frame had ranges.
`canAddMessage`, `canSplitRange`, and `canAddTimestampsRangeAndMessage` were
removed with their margins; make the write inside `tryWrite` instead, which
returns whether it fit. The builder references each change rather than copying
it, so a change, including one a custom `Storage.readDbChange` returns, must not
be modified while the builder is in use. `unwrap` can now be called more than
once; it used to append the message timestamps to the header again, so a second
call returned a corrupt message.

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
  assertType,
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
  type ProtocolMessageBuffer,
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

// ProtocolMessageBuffer no longer predicts whether a write fits.
assertType<Extract<keyof ProtocolMessageBuffer, `can${string}`>, never>();

assertTrue(
  buffer.tryWrite(() => {
    buffer.addMessage(message);
  }),
);
assertTrue(buffer.getSize() > emptySize);
```
