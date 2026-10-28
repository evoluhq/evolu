---
"@evolu/sqlite-wasm": patch
---

Fixed the OPFS pool keeping a malformed slot whose digest is bad

A slot whose header's path and flags hold no zero byte, which no pool writes, is
now freed when its digest is bad, even when it holds data, and mapped under all
but the last of those 516 bytes when its digest is valid, as in SQLite's own
pool. The pool searched the digest for the end of the path too, so it could keep
such a slot, and mapped it under a path that ran past its flags.
