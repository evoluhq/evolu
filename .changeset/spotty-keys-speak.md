---
"evolu": major
---

React Native, Kysely relations, and new encryption.

Evolu becomes universal. All React platforms are supported. There is only one minor drawback: Expo 49 Sqlite binding needs to be completed. iOS doesn't support binary columns; all columns are stringified on Android. The good news is that Expo 50 should be OK.

Evolu also has a new feature: Relations. It's based on the ingenious [Kysely helper](https://kysely.dev/docs/recipes/relations), allowing you to nest related rows in queries to write super efficient queries with nested relations. Yes, we can fetch nested objects and arrays in a single query. No magic, it's still SQL.

As for encryption, Evolu switched from AES-GCM to NaCl / Libsodium-compatible Secretbox (xsalsa20poly1305). Evolu CRDT messages are also versioned.

While preparing the React Native version, I refactored the code so it's much more readable. CRDT shouldn't be a magic black box. On the contrary, it should be as simple as possible so everyone understands how it works, and nothing breaks because of complexity.
