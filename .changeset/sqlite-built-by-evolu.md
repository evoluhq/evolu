---
"@evolu/web": minor
---

Switched to SQLite 3.53.4 built by Evolu

`@evolu/web` now runs SQLite 3.53.4 from Evolu's own `@evolu/sqlite-wasm`. Evolu
compiles it to WebAssembly and adds its own TypeScript layer and encryption.
Until now, `@evolu/web` used `@evolu/sqlite-wasm` 2.2.4, which packaged SQLite
3.50.4 with SQLite3 Multiple Ciphers and SQLite's JavaScript.

The binary is 669,403 bytes, 302,491 with `gzip -9`, down from 1,036,167 and
461,020. No other project builds it anymore. Evolu builds it from SQLite's
source, reproducibly, so there is less third-party code to trust. The README of
`@evolu/sqlite-wasm` explains why Evolu builds its own SQLite and what the
binary contains.

The encryption now runs in JavaScript and WebAssembly outside SQLite, and it
costs memory. `@awasm/noble`, which encrypts, gives its AES and SHA-512 code
fixed WebAssembly memories of 10 and 20 MiB, so a database worker with an
encrypted database uses about 30 MiB more. Every persistent Evolu database is
encrypted.

We compared Evolu's SQLite with 2.2.4 using
[Evolu's SQLite benchmark](https://github.com/evoluhq/evolu/tree/main/bench/sqlite-wasm).
It times wa-sqlite's 16 benchmark workloads, taken from SQLite's classic speed
comparison, on OPFS in Chromium 153, Firefox 155 and WebKit 26.6. We ran it on
an Apple M5. Its README says how to run it. The figures below are medians of
ratios taken within each round, and each range covers two runs of the whole
benchmark.

An encrypted database is about as fast in Chromium and Firefox and takes 7% to
8% longer in WebKit.

Evolu's SQLite writes as many bytes as 2.2.4, encrypted or not, and flushes OPFS
5 times per commit instead of 6. Without encryption, 1,000 single-row commits
take 11% to 12% less time in Firefox, 13% to 19% less in WebKit and about the
same in Chromium. The other workloads together take 1% to 5% longer in every
engine.

So WebKit's difference comes from the encryption, which now runs outside SQLite
and costs more there than SQLite3 Multiple Ciphers did. It costs a little more
in Firefox too, but the faster commits make up for it. In Chromium, the same
encryption costs about as much as SQLite3 Multiple Ciphers did, so the
difference comes from how WebKit runs it, not from the design, and we expect it
to shrink.

That is the price of a smaller supply chain. SQLite is now plain SQLite, built
by Evolu from sqlite.org's source, and the only code that encrypts is
`@awasm/noble`, which has no dependencies of its own. It comes from Paul Miller.
`@evolu/common` already depends on his `@noble/ciphers`, `@noble/hashes` and
`@scure/bip39`, so encrypting databases adds no new party to trust.

Existing databases open unchanged in every browser. They stay in the same OPFS
directory, `.<name>`, in the same file and the same format. A database that
`@evolu/web` 3 encrypted keeps the key that 2.2.4 derived from the encryption
key. Because of a
[bug](https://github.com/utelle/SQLite3MultipleCiphers/issues/218), SQLite3
Multiple Ciphers 2.2.4 took the key, passed in SQLCipher's raw-key notation, as
a passphrase. A new database is encrypted with the encryption key itself, so
`@evolu/web` 3.4.1 and earlier cannot open it. A tab still running an older
build of the app, or the app downgraded to an older `@evolu/web`, fails to open
a database this version created.

A transaction that a closed tab or a crash interrupted is now rolled back when
the database opens again. The pool of 2.2.4 never rolled one back, so the next
open could see it half-applied.

When the browser refuses a write because the site's storage quota is exceeded,
the error now says that storage is full. The write fails with `SQLITE_FULL`,
"database or disk is full", instead of the generic `SQLITE_IOERR`, "disk I/O
error". Evolu writes in transactions. After `SQLITE_FULL` writing the journal,
SQLite rolls back only the statement, and the error is the `SQLITE_FULL` error.
After `SQLITE_FULL` writing the database, SQLite rolls back the whole
transaction, so Evolu's `ROLLBACK` fails too, and the error is a
`SuppressedError` whose `suppressed` is the `SQLITE_FULL` error.

An integer in a query result outside JavaScript's safe integer range is now a
number rounded to the nearest double, as with better-sqlite3, instead of a
`BigInt`. A number that is not a safe integer is now bound as a `REAL`. 2.2.4
bound such a number without a fraction as an `INTEGER`. From 2^63 on, that
stored a wrong value, such as `-9223372036854775808` for 2^63 or `0` for
`1e300`.

Text containing a NUL character is now returned whole, and a leading byte order
mark is kept. 2.2.4 stored such text whole but returned it only up to its first
NUL and without a leading U+FEFF.

A query whose SQL contains a NUL character or a lone surrogate now fails instead
of running. 2.2.4 ignored the SQL after a NUL. It replaced a lone surrogate with
U+FFFD, or with other characters in the SQL of a query without the `prepare`
option. Either way, it ran other SQL.

SQLite changes since 3.50.4 that apps may notice:

- Floats converted to text keep up to 17 significant digits instead of 15, so
  the text converts back to the same number. This affects `CAST(x AS TEXT)`,
  `||`, `printf`'s `%s` and the JSON functions. So `evoluJsonArrayFrom`,
  `evoluJsonObjectFrom` and `evoluJsonBuildObject` now return a stored `REAL`
  exactly, such as `0.30000000000000004` instead of `0.3`. `CAST(1e15 AS TEXT)`
  is now `'1000000000000000.0'` instead of `'1.0e+15'`.
- `quote` returns that text for a float too, such as `0.30000000000000004`
  instead of `3.000000000000000445e-01`. Its 19 digits already converted back to
  the same number, except for some very large or very small numbers, from about
  `1e118` and below about `1e-82`. Those now convert back too.
- SQLite has a new parser depth limit. SQL nested deeper, such as more than
  2,493 nested parentheses or 415 nested subqueries in `FROM`, fails with
  "Recursion limit".
- `UNION`, `INTERSECT` and `EXCEPT` always sort and merge. When values are equal
  under a collation such as `NOCASE`, a different one of them can be returned.
- `printf` and `format` with the `#` flag no longer print `-0.00` for a negative
  number that rounds to zero.
- New SQL includes `json_array_insert`, `jsonb_each` and `jsonb_tree`, and
  `ALTER TABLE` can add and remove `NOT NULL` and `CHECK` constraints.

SQLite is built in its bare-bones configuration with JSON and the math
functions. Features that 2.2.4 had and Evolu does not use are gone: FTS5,
R\*Tree, WAL, the `dbstat`, `sqlite_dbpage`, `sqlite_stmt`, `bytecode` and
`tables_used` virtual tables, `sqlite_offset`, and `PRAGMA function_list`,
`module_list` and `pragma_list`. Temporary tables, indexes and sorts always stay
in memory. If you need any of this, start a
[discussion](https://github.com/evoluhq/evolu/discussions).

Bundlers emit the binary from `new URL("../wasm/sqlite3.wasm",
import.meta.url)` in `@evolu/sqlite-wasm`. Vite does not process that URL in a
dependency it prebundles, so keep `@evolu/sqlite-wasm` in
`optimizeDeps.exclude`.

For code that creates the driver itself, `createWasmSqliteDriver` now takes its
dependencies and returns the `CreateSqliteDriver`. Start `loadSqliteWasm` early,
so SQLite loads while the worker waits for its database.

The driver throws errors with SQLite's message, without the
`SQLITE_…: sqlite3 result code N:` prefix, and with the typed error as `cause`.
A query without the `prepare` option runs exactly one statement, as with the
better-sqlite3 driver. `changes` is 0 for a statement that changes nothing, and
rows are objects without a prototype.

```ts
import { assertType, type CreateSqliteDriver } from "@evolu/common";
import { createRun, createWasmSqliteDriver, loadSqliteWasm } from "@evolu/web";

// @ts-expect-error createWasmSqliteDriver is no longer a CreateSqliteDriver.
const _createSqliteDriver: CreateSqliteDriver = createWasmSqliteDriver;

// In a dedicated worker, which has OPFS sync access handles.
const createWorkerSqliteDriver = (): CreateSqliteDriver => {
  const run = createRun();
  return createWasmSqliteDriver({
    opfsRoot: navigator.storage,
    sqliteWasmLoad: run(loadSqliteWasm),
    subtleCrypto: crypto.subtle,
  });
};

assertType<typeof createWorkerSqliteDriver, () => CreateSqliteDriver>();
```
