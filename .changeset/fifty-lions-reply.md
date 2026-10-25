---
"@evolu/sqlite-wasm": major
"@evolu/web": patch
---

Moved database encryption into Evolu's SQLite core and updated SQLite to 3.54.1

`@evolu/sqlite-wasm` 3.54.1-build1, which `@evolu/web` now uses, encrypts
databases with Evolu's SQLite core, Evolu's own C code inside the WebAssembly.
It's the start of one SQLite for every Evolu platform. The same C compiles
natively for React Native in `@evolu/react-native` and will for Node.js, so
every platform gets one file format, one behavior after a crash and one set of
tests. Until now, the web encrypted in TypeScript, React Native relied on the
SQLCipher that expo-sqlite vendors, and Node.js didn't encrypt at all.

What this brings:

- The file format is unchanged. Databases encrypted by earlier versions open as
  they did, and earlier builds open what this one writes.
- AES runs in constant time, with BearSSL's bitsliced AES. Unlike the
  table-based AES it replaces, it leaves no trace of the key in the CPU's
  caches for code running beside it, such as another tab or app. WebAssembly
  engines promise no constant time, so this holds as long as they add no
  secret-dependent branch or memory access of their own. A check of the
  compiled WebAssembly finds none in Evolu's build.
- Less to load and less to trust. What `@evolu/web` imports from
  `@evolu/sqlite-wasm` is 39,781 bytes of JavaScript minified by esbuild,
  13,418 with `gzip -9`, instead of 194,844 and 67,501. The package has no
  runtime dependencies now that `@awasm/noble` is gone, and a worker that
  encrypts no longer allocates its 30 MiB of WebAssembly memory. The wasm grew
  from 677,479 to 720,542 bytes, from 305,733 to 323,059 with `gzip -9`.
- SQLite 3.54.1 fixes a regression of 3.54.0 that made a statement with a
  `column = ?` term and an ORDER BY, GROUP BY, `min`, `max`, DISTINCT or a join
  prepare again on every run, as eleven of Evolu's storage queries did. It also
  fixes a possible heap-buffer overflow on 32-bit builds.
- A database that `@evolu/web` 3.0.0 to 3.4.1 encrypted, whose salt a crash
  tore, opens with the salt its hot journal stores.

Constant time has a price, paid on writes. On an Apple M5, writing an 8 KiB page
with its journal record takes about 300 µs instead of about 100 with
table-based AES, in Chromium, Firefox and WebKit alike. A small commit after the
storage idled, as in an app, gains 2.5 to 2.7 ms instead of 1.4 to 1.9, and
large write transactions take about twice as long in Chromium. Back-to-back
small commits in Chromium on macOS cost about 4 ms more each: Chromium flushes
OPFS with `F_BARRIERFSYNC`, which slows down after about 100 to 200 µs without
storage activity, and encrypting a page with constant-time AES takes longer
than that, so each of a commit's five flushes is slow. Reads barely change:
decrypting a page takes 60 to 70 µs instead of 40 to 60. We chose constant time
because protecting the key matters more than raw speed. The README of
`@evolu/sqlite-wasm` explains how writes could be faster and why we keep the
codec simple instead.

Tabs of earlier versions sharing the pool:

- Tabs of `@evolu/web` 3.5.0 and later, with `@evolu/sqlite-wasm`
  3.53.4-build1 to 3.54.0-build2, share databases in SQLite's default DELETE
  journal mode, which Evolu keeps, and roll back each other's interrupted
  transactions. With a journal SQLite keeps, in PERSIST mode or with EXCLUSIVE
  locking and a database recreated at its path, those builds can keep a
  half-applied transaction, so that is not supported.
- As since 3.5.0, a tab of `@evolu/web` 3.4.1 or earlier opens only the
  databases those versions created, and its `@evolu/sqlite-wasm` 2.2.4 never
  rolls back a hot journal. After a crash, it reads the rows the interrupted
  transaction half wrote, and its next write transaction keeps them.

Behavior changes:

- `PRAGMA key`, `hexkey`, `textkey`, `rekey`, `hexrekey`, `textrekey` and the
  `cipher` pragmas fail with `SQLITE_ERROR` on `File` and `EncryptedFile`
  databases instead of being ignored, so no database is keyed through SQL.
  Memory databases still ignore them, and `ATTACH` still ignores its `KEY`
  clause.
- A `File` or `EncryptedFile` connection attaches databases read-only and
  creates no file, so a transaction no longer spans two databases, and
  `VACUUM INTO` writes a plaintext file.
- Every connection has Evolu's SQL functions: the `evolu_skiplist_*`
  functions, Evolu's timestamp storage in C, for Evolu's sync to switch to in a
  later release, and `evolu_core_version()`.
- Every connection is defensive (`SQLITE_DBCONFIG_DEFENSIVE`), so SQL can't
  corrupt its database: it ignores `PRAGMA writable_schema = ON`,
  `journal_mode = OFF` and `schema_version = N`.
- The key is staged in wasm memory for the open and zeroed right after, and the
  core keeps its keys in wasm memory until the database is disposed. SQLite's
  heap shares that memory, so a memory-disclosure bug in SQLite could reach the
  keys, where with the TypeScript codec it could reach plaintext but not the
  key. After a trap, no C can run to wipe them, so they stay until the instance
  ends.
- A trap reaches the caller as the trap itself, also from a `File` or
  `EncryptedFile` open, which threw a `SuppressedError` whose `suppressed` was
  the trap. Disposing a database afterwards throws only the refusal of its
  close, whose `cause` is the trap, also with statements open, and disposing
  its `SahPool` closes the pool's handles instead of throwing.
- A database shorter than 16 bytes fails with the raw key's error without
  deriving a legacy key.
- The package ships `THIRD_PARTY_NOTICES.md`, with the notices that the
  licenses of the code in its WebAssembly ask for.

API changes in `@evolu/sqlite-wasm`:

- `File` and `EncryptedFile` databases take a `SahPool`. `SqliteVfs` and
  `SqliteEncryptingVfs` are gone, and so is the pool's `registerKey`, with the
  encrypted files `ATTACH` and `VACUUM INTO` could write through it.
  `SqliteEncryptedDatabaseOptions` is gone too: `createEncryptedSqliteDatabase`
  takes `SqliteEncryptedFileDatabaseOptions`.
- `SqliteError.cause` is a `SqliteFailure`: the pool's `SqliteVfsFailure`, now
  tagged with `type`, or the codec's `SqliteCodecFailure`, whose
  `SqliteCodecError` is a `SqlitePageAuthenticationError`, a
  `SqliteEncryptionUnsupportedError` or a `SqliteRandomSourceError`. A page
  that fails to authenticate is now a `SqliteCodecFailure`, not a
  `SqliteVfsFailure`, so a cause has a `method` only once narrowed.
  `SqliteEncryptionUnsupportedError`, whose `type` is
  `SqliteEncryptionUnsupported`, replaces `SahPoolEncryptionUnsupportedError`,
  whose `type` was `SahPoolEncryptionUnsupported`. `SqliteVfsMethod` lists
  only the methods whose failures the pool records: no longer `xFileControl`,
  which records none now, nor `xAccess`, `xClose`, `xLock`, `xUnlock` and
  `xCheckReservedLock`, which never recorded any.

```ts
import { assertType, type EncryptionKey } from "@evolu/common";
import {
  SqliteVfsPath,
  type SahPool,
  type SqliteCodecFailure,
  type SqliteEncryptedFileDatabaseOptions,
  type SqliteEncryptionUnsupportedError,
  type SqliteError,
  type SqliteFailure,
  type SqliteVfsFailure,
  type SqliteVfsMethod,
} from "@evolu/sqlite-wasm";
// @ts-expect-error SqliteVfs is no longer exported; File databases take a SahPool.
import type { SqliteVfs as _SqliteVfs } from "@evolu/sqlite-wasm";
// @ts-expect-error SqliteEncryptingVfs is no longer exported; EncryptedFile databases take a SahPool.
import type { SqliteEncryptingVfs as _SqliteEncryptingVfs } from "@evolu/sqlite-wasm";
// @ts-expect-error SqliteEncryptedDatabaseOptions is no longer exported; use SqliteEncryptedFileDatabaseOptions.
import type { SqliteEncryptedDatabaseOptions as _SqliteEncryptedDatabaseOptions } from "@evolu/sqlite-wasm";
// @ts-expect-error SahPoolEncryptionUnsupportedError is no longer exported; use SqliteEncryptionUnsupportedError.
import type { SahPoolEncryptionUnsupportedError as _SahPoolEncryptionUnsupportedError } from "@evolu/sqlite-wasm";

// @ts-expect-error A SahPool has no registerKey: only a database it opens is keyed.
type _RegisterKey = SahPool["registerKey"];

// createEncryptedSqliteDatabase takes these options, with the pool itself.
const _options = (
  pool: SahPool,
  key: EncryptionKey,
): SqliteEncryptedFileDatabaseOptions => ({
  type: "EncryptedFile",
  vfs: pool,
  path: SqliteVfsPath.orThrow("/evolu1.db"),
  key,
});

// A cause can be the codec's, which has no method, so narrow it first.
const _failedMethod = (error: SqliteError): SqliteVfsMethod | null => {
  // @ts-expect-error A SqliteCodecFailure has no method.
  const _isWrite = error.cause?.method === "xWrite";
  return error.cause?.type === "SqliteVfsFailure" ? error.cause.method : null;
};

// @ts-expect-error The pool no longer records xFileControl failures.
const _fileControl: SqliteVfsMethod = "xFileControl";
// The methods whose failures the pool records.
assertType<
  SqliteVfsMethod,
  "xOpen" | "xDelete" | "xRead" | "xWrite" | "xTruncate" | "xSync" | "xFileSize"
>();

assertType<SqliteError["cause"], SqliteFailure | null>();
assertType<SqliteFailure, SqliteVfsFailure | SqliteCodecFailure>();
assertType<
  SqliteEncryptionUnsupportedError["type"],
  "SqliteEncryptionUnsupported"
>();
```
