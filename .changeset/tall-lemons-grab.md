---
"@evolu/common": minor
---

Added XChaCha20Poly1305, which lets a platform encrypt and decrypt changes natively

Evolu's DbWorker and SharedWorker now encrypt and decrypt changes with an
`XChaCha20Poly1305` that a platform can pass, and `@evolu/react-native` passes
Evolu's C. Until now, React Native's sync decrypted every change it received
with noble-ciphers in JavaScript. On an iPhone 16e, XChaCha20-Poly1305 alone
took about 185 µs to decrypt a 256-byte message with noble-ciphers on Hermes,
and 0.64 µs in Evolu's C, timed without the call into it. With Evolu's C, a
fresh database receiving 10,000 changes took 20% less time on the iOS simulator
and 24% to 29% less on an arm64 Android emulator. `createXChaCha20Poly1305`
implements `XChaCha20Poly1305` with noble-ciphers, in the byte layout of
`encryptWithXChaCha20Poly1305` and `decryptWithXChaCha20Poly1305`, which keep
their signatures: its ciphertext ends with the 16-byte tag, as theirs does.
Unlike `encryptWithXChaCha20Poly1305`, its `encrypt` takes the nonce instead of
drawing one, so a caller must never reuse a nonce with the same key.

`DbWorkerDeps` and `SharedWorkerDeps` take an optional `XChaCha20Poly1305Dep`
and use `createXChaCha20Poly1305` without one, so the web and Node.js work as
before. The local-first functions that encrypt or decrypt a change take the
dependency: `encodeAndEncryptDbChange`,
`createProtocolMessageFromCrdtMessages` and
`createProtocolBroadcastMessagesFromCrdtMessages` need it beside
`RandomBytesDep`, and `decryptAndDecodeDbChange` takes it first.

```ts
import {
  assertEqual,
  createId,
  createRandomBytes,
  createXChaCha20Poly1305,
  getOrThrow,
} from "@evolu/common";
import {
  decryptAndDecodeDbChange,
  encodeAndEncryptDbChange,
  testAppOwner,
  testCreateCrdtMessage,
} from "@evolu/common/local-first";

const randomBytes = createRandomBytes();
const deps = { randomBytes, xChaCha20Poly1305: createXChaCha20Poly1305() };
const key = testAppOwner.encryptionKey;
const message = testCreateCrdtMessage(createId(deps), 1, "Ada");
const encrypted = {
  timestamp: message.timestamp,
  change: encodeAndEncryptDbChange(deps)(message, key),
};

// @ts-expect-error encodeAndEncryptDbChange needs XChaCha20Poly1305Dep beside RandomBytesDep.
const _encryptWithoutDep = () => encodeAndEncryptDbChange({ randomBytes });
// @ts-expect-error decryptAndDecodeDbChange takes XChaCha20Poly1305Dep first.
const _decryptWithoutDeps = () => decryptAndDecodeDbChange(encrypted, key);

assertEqual(
  getOrThrow(decryptAndDecodeDbChange(deps)(encrypted, key)),
  message.change,
);
```
