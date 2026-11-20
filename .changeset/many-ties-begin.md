---
"@evolu/common": patch
---

Fixed useOwner and createEvolu posting the caller's owner keys

`evolu.useOwner` and `createEvolu` posted an owner's `encryptionKey` and `writeKey` to Evolu's workers as the caller's `Uint8Array`s. A change of their bytes before they were sent, such as zeroing a key right after the call, reached the workers, a key that views a `SharedArrayBuffer` couldn't be posted to a `SharedWorker`, and a key sliced from Node's `Buffer` pool sent the whole pool. They now post copies of the keys, as mutations already copy their bytes.
