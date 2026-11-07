---
"@evolu/sqlite-wasm": patch
---

Released callback slots after a failed Wasm install

If installing SQLite callbacks runs out of slots, it releases the slots
already taken by that call so a later installation can reuse them.
