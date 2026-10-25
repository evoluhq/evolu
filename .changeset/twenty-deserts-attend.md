---
"@evolu/relay": patch
---

Moved the relay onto Evolu's own SQLite

The relay now runs SQLite 3.54.1 in Evolu's own build, the one
`@evolu/nodejs` ships prebuilt, instead of better-sqlite3. Its database stays
`data/evolu-relay.db`, unencrypted, since the data it stores is encrypted
already, and a database an earlier relay wrote opens as it is. Installing the
relay runs no install script and builds nothing, also in the Docker image,
which gets the addon for musl. The npm package doesn't run on Windows yet. A
database file that's a symbolic link no longer opens, where better-sqlite3
followed it: link or mount its directory, `data`, instead.
