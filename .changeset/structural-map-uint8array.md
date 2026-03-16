---
"@evolu/common": minor
---

Added `StructuralMap`, a `Map`-like collection for registries and coordination tables where callers naturally already have immutable JSON-like keys or `Uint8Array` values and do not want to maintain a separate string id.

`StructuralMap` works by deriving a canonical structural id for each key and storing entries in a native `Map` keyed by that id. Repeated lookups of the same object or array instance reuse cached ids through a `WeakMap`.
