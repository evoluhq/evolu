---
"@evolu/common": major
"@evolu/nodejs": major
"@evolu/web": major
"@evolu/react-native": major
---

Refactored SQLite integration to use Task and throw-first semantics

- Changed `createSqlite` to `Task<Sqlite, never, CreateSqliteDriverDep>`
- Changed `CreateSqliteDriver` to `Task<SqliteDriver>`
- Removed `SqliteError` from SQLite driver/task APIs
- Changed `Sqlite.exec` to return `SqliteExecResult` directly (no `Result<..., SqliteError>`)
- Changed `Sqlite.transaction` to support callbacks returning either `Result<T, E>` or `void` (no `SqliteError` in the error channel)
- Changed `Sqlite.export` to return `Uint8Array` directly (no `Result<..., SqliteError>`)
- Simplified `SqliteDriver.exec` by removing the `isMutation` parameter, so the driver determines read vs write internally
- Replaced `options.memory` and `options.encryptionKey` with a discriminated `options.mode` field (`"memory"` | `"encrypted"`)
- Updated Expo and op-sqlite drivers to match the new API
- Added SQLite schema metadata primitives (`SqliteSchema`, `SqliteIndex`, `eqSqliteIndex`, `getSqliteSchema`, `getSqliteSnapshot`)
- Added `testCreateSqlite` and updated tests to construct SQLite through Task-based helpers

Why `SqliteError` was removed:

- In Evolu, SQLite runs in-process. Failures are infrastructure-level and unrecoverable at the call site.
- Wrapping these failures as `Result` values did not create meaningful recovery paths; callers still had to fail.
- The correct behavior is to let such failures throw and surface them through platform `createRun` global handlers (web, nodejs, react-native), which report uncaught errors via Evolu `console.error`.
- Evolu also propagates `console.error` entries through its messaging layer into the shared `evoluError` global store, so app-level error subscriptions still receive these failures.

Boundary handling:

- At protocol boundaries (for example Protocol ↔ Storage), error handling remains explicit.
- Since storage implementations may throw, boundary code uses `try/catch`, logs with `console.error(error)`, and returns protocol-level outcomes.
- Protocol handles all thrown errors as boundary concerns, without coupling to SQLite-specific error types.

Developer experience:

- This change reduces boilerplate (`if (!result.ok)` branches and `SqliteError` plumbing), making infrastructure code less verbose and easier to follow.
