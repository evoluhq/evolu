---
"@evolu/common": minor
---

Added Map and WeakMap upsert helpers and binary-type improvements to `@evolu/common`.

- Added `LookupMap.getOrInsert` and `LookupMap.getOrInsertComputed` for lookup-key-aware insert-or-read operations that preserve the first logical key representative.
- Added the `ArrayBuffer` base `Type` and formatter support.
- Installed `Map` and `WeakMap` collection upsert polyfills in `installPolyfills()` for runtimes that do not provide them yet.
- Normalized `WebSocket.send` binary payload handling so `Uint8Array` views backed by `ArrayBuffer` stay zero-copy while `SharedArrayBuffer`-backed views are cloned into a sendable `Uint8Array`.
