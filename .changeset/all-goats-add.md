---
"@evolu/react-native": patch
"@evolu/nodejs": patch
---

Kept every transaction whole across a power loss on iOS and macOS

On iOS and macOS, Evolu's SQLite synced with `fsync()`, which only hands data to the drive. The drive may persist it late and out of order when it loses power or the OS crashes, which could leave a transaction half applied and the database corrupted. It now syncs with `F_BARRIERFSYNC`, which orders everything synced before it ahead of anything written after it, as Apple's own SQLite does with `PRAGMA fullfsync` on. With SQLite's default `synchronous = FULL`, a crash now leaves every transaction whole, though the last ones before it may be lost, except on some network shares and FAT and exFAT drives. A commit to an Evolu database takes about 2 ms longer on an iPhone 16e and 1 ms longer on an M-series Mac. An app that turns on `PRAGMA fullfsync` or `checkpoint_fullfsync` for an Evolu database now gets barriers too, which don't keep its last commit after a power loss. Linux, Android and the web are unchanged.
