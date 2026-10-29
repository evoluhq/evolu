---
"@evolu/sqlite-wasm": patch
"@evolu/web": patch
"@evolu/react-native": patch
"@evolu/nodejs": patch
---

Reported an encrypted database with an altered page size as tampered

Evolu authenticates every page of an encrypted database, except the page size in the first page's header, which SQLite reads before anything is decrypted, so Evolu checks it separately. Some reads skipped that check, so a database whose page size someone had altered failed to open with an error that had no cause. It now fails as any tampered database does, with `SQLITE_NOTADB` and a `SqlitePageAuthenticationError` cause, and a hot journal altered this way is treated as any other tampered journal. Only someone who can already write an app's files can alter the page size, so databases Evolu wrote aren't affected.
