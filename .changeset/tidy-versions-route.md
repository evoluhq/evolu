---
"@evolu/common": patch
---

Reported relay protocol version mismatches instead of dropping them

A relay answers a request from another protocol version with only its version
and the owner ID. The client rejected that reply as invalid data, so the
mismatch was never reported. `parseProtocolHeader` now parses the version and
owner ID of any version and reads the message type only for the supported one,
and the reply is reported as `ProtocolVersionError` through `evoluError`.
`ProtocolHeader.version` is a `NonNegativeInt` and `messageType` is optional.
Direct callers must handle an absent `messageType` before using it.

```ts
import {
  assertEqual,
  assertType,
  createBuffer,
  encodeNonNegativeInt,
  getOrThrow,
  NonNegativeInt,
} from "@evolu/common";
import {
  createProtocolMessageBuffer,
  MessageType,
  ownerIdToOwnerIdBytes,
  parseProtocolHeader,
  protocolVersion,
  testAppOwner,
  type ProtocolHeader,
} from "@evolu/common/local-first";

assertType<ProtocolHeader["version"], NonNegativeInt>();

const readMessageType = (header: ProtocolHeader): MessageType | null => {
  // @ts-expect-error A parsed version is no longer restricted to the literal 1.
  const _oldVersion: 1 = header.version;
  // @ts-expect-error A different protocol version has no parsed message type.
  const _oldMessageType: MessageType = header.messageType;

  if (header.messageType === undefined) return null;
  return header.messageType;
};

// A version-mismatch reply contains only the version and owner ID.
const otherVersion = NonNegativeInt.orThrow(protocolVersion + 1);
const reply = createBuffer();
encodeNonNegativeInt(reply, otherVersion);
reply.extend(ownerIdToOwnerIdBytes(testAppOwner.id));
const header = getOrThrow(parseProtocolHeader(reply.unwrap()));
assertEqual(header.version, otherVersion);
assertEqual(header.ownerId, testAppOwner.id);
assertEqual(readMessageType(header), null);

const request = createProtocolMessageBuffer(testAppOwner.id, {
  messageType: MessageType.Request,
}).unwrap();
assertEqual(
  readMessageType(getOrThrow(parseProtocolHeader(request))),
  MessageType.Request,
);
```
