---
"@evolu/common": major
"@evolu/nodejs": major
"@evolu/web": major
"@evolu/react-native": major
---

Refactored createSqlite and CreateSqliteDriver to use Task

- Changed `createSqlite` to `Task<Sqlite, SqliteError, CreateSqliteDriverDep>`
- Changed `CreateSqliteDriver` to `Task<SqliteDriver, SqliteError>`
- Simplified `SqliteDriver.exec` by removing the `isMutation` parameter — the driver now determines read vs write internally
- Replaced `options.memory` and `options.encryptionKey` with a discriminated `options.mode` field (`"memory"` | `"encrypted"`)
- Added 100% test coverage for better-sqlite3 and WASM SQLite drivers
- Updated Expo and op-sqlite drivers to match the new API
