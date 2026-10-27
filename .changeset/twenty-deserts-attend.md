---
"@evolu/relay": patch
---

Moved the relay onto Evolu's own SQLite

The relay now runs SQLite 3.54.1 in Evolu's own build, the one
`@evolu/nodejs` ships prebuilt, instead of better-sqlite3. Its database stays
`data/evolu-relay.db`, unencrypted as before: the changes it stores are
already encrypted end-to-end, and the relay needs the rest, such as OwnerIds,
timestamps and write keys, to sync. A database an earlier relay wrote opens as
it is. As before, installing the relay runs no install script and builds
nothing; the Docker image now gets `@evolu/nodejs`'s addon for musl. The npm package doesn't run on Windows yet. A
database file that's a symbolic link no longer opens, where better-sqlite3
followed it: link or mount its directory, `data`, instead.
