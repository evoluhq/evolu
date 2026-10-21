# Evolu SQLite Core

This private package is Evolu's SQLite core in C: unmodified SQLite from sqlite.org, Evolu's encryption codec as a VFS shim under it, Evolu's storage functions as SQL functions, and the cryptography they need. It isn't published. Its C is compiled into the WebAssembly of `@evolu/sqlite-wasm`, and will be into `@evolu/nodejs` and `@evolu/react-native` as their bindings land, so every platform runs the same SQLite with the same encryption.

## Why

Evolu encrypts its databases, but each platform did it differently. On the web, `@evolu/sqlite-wasm` encrypted pages in TypeScript with `@awasm/noble` until this core replaced it. On React Native, Evolu relies on the SQLCipher that expo-sqlite vendors, in whatever version an Expo release brings. On Node.js, the driver ignores the key and doesn't encrypt at all.

We want one implementation that every platform compiles: one file format, one behavior after a crash, one set of tests. That code has to be C. Hermes, React Native's JavaScript engine, has no WebAssembly, while C compiles to WebAssembly for the web and natively for React Native and Node.js.

We didn't take an existing encrypted SQLite. SQLCipher is a fork of SQLite that trails its releases and needs a crypto provider of its own for WebAssembly. In our crash tests of SQLite3 Multiple Ciphers 2.6.1, `PRAGMA rekey` could leave a database that no longer opened ([#291](https://github.com/utelle/SQLite3MultipleCiphers/issues/291)), and opening a database without its key deleted its hot journal, leaving a transaction half-applied ([#292](https://github.com/utelle/SQLite3MultipleCiphers/issues/292)). A rekey that failed did the same as a crash ([#294](https://github.com/utelle/SQLite3MultipleCiphers/issues/294)), and over the web's 4096-byte sectors without powersafe overwrite, even a `ROLLBACK` left a transaction that had spilled pages half-applied ([#293](https://github.com/utelle/SQLite3MultipleCiphers/issues/293)). So the codec is a VFS shim over plain SQLite instead, and SQLite never sees ciphertext. SQLite stays unpatched, built from the source zip sqlite.org publishes, pinned by its SHA3-256.

The core serves Evolu only, because encrypting pages is the easy part of encrypting a database. A database is only as safe as its key: where the key comes from, where it's kept, how it changes, and what's lost when it's lost. Evolu answers all of that for its owners and devices, so the core takes a key only from Evolu, as 32 raw bytes, never a password. A general-purpose encrypted SQLite would leave those questions to every app, which is where encrypted databases usually go wrong. So the core isn't one, and its bindings expose what Evolu's drivers need, not SQLite's whole C API. On the web, `@evolu/sqlite-wasm` keeps its `c-api` of SQLite's public functions, while the core's functions stay internal. A plain database has no key to get wrong, so the core can be used plainly, as the relay will.

## Encryption

The codec writes SQLCipher 4's page format, so the databases Evolu has already encrypted open unchanged. Every page ends with 80 reserved bytes, a random IV and an HMAC. The rest of the page is encrypted with AES-256-CBC and authenticated with HMAC-SHA512 before it's decrypted. Page 1 comes in two layouts, and the codec reads both. One is how SQLite3 Multiple Ciphers' `sqlcipher` scheme writes it, which `@evolu/sqlite-wasm` 2.2.4 wrote for `@evolu/web` 3 and its builds since have written, the last ones that encrypted in TypeScript included. The other is SQLCipher's own, which the databases of Evolu's expo-sqlite driver have. A new database gets the first.

A rollback journal's records are encrypted as pages of their database, and hot journals left by `@evolu/sqlite-wasm` 2.2.4 and by expo-sqlite's SQLCipher roll back. A wrong key restores no page, and a connection without a key refuses an encrypted database's hot journal, so neither can leave a transaction half-applied. Temporary files stay in memory, an encrypted database never switches to WAL, `ATTACH` opens databases read-only, and the pragmas that key a database in SQLCipher fail rather than leave it in plaintext.

The key reaches the database file through a thread-local pointer while `evolu_codec_open` runs. It never appears in SQL, a URI or an error, and the codec keeps its copy outside SQLite's allocator. SQLite's heap shares the process's memory, in WebAssembly one linear memory, so a memory-disclosure bug in SQLite could reach the key. `src/evolu_page.h` documents the format, and `src/evolu_codec.h` the codec, with what it protects against and what it doesn't in its threat model.

## Cryptography

Everything that handles a key or a page runs in constant time. WebAssembly engines promise no constant time, so `@evolu/sqlite-wasm` checks that its compiled code branches on no secret and indexes no memory by one. The software path, the only one in WebAssembly, uses the vendored [BearSSL](https://www.bearssl.org)'s bitsliced constant-time AES, `aes_ct64`, or `aes_ct` on 32-bit CPUs, and its SHA-256 and SHA-512. It's slower than table-based AES, whose memory accesses depend on the key. Native builds use the CPU's AES instructions, ARMv8's or x86's AES-NI, and ARMv8.2's SHA-512 instructions when it has them, detected once. On arm64 CPUs with data independent timing, the codec and XChaCha20-Poly1305 turn it on around their work. HMAC-SHA512 and PBKDF2-HMAC-SHA512 are Evolu's own, a few dozen lines over BearSSL's SHA-512.

XChaCha20-Poly1305, which encrypts Evolu's sync messages, comes from the vendored [Monocypher](https://monocypher.org), in the byte layout of `@evolu/common`'s `encryptWithXChaCha20Poly1305`.

The vendored files come from a pinned BearSSL commit and Monocypher release. BearSSL has two local changes that initialize inactive AES lanes; its other files and Monocypher are copied byte for byte. Their READMEs document the changes and list each vendored file's SHA-256, which `test/vendor.test.mts` checks. The weekly Upstream pins workflow (the repository's `scripts/check-upstream-pins.mts`) opens an issue when BearSSL, Monocypher or SQLite has something newer than its pin.

## Storage functions

`src/evolu_skiplist.h` implements Evolu's timestamp storage as SQL functions over the `evolu_timestamp` table that `Storage.ts` in `@evolu/common` creates: the same skiplist, read and written in C instead of recursive common table expressions. The same inserts at the same levels leave the same rows, and every query returns what `Storage.ts`'s SQL returns, except where `src/evolu_skiplist.h` says otherwise: `evolu_skiplist_lower_bound` returns NULL when no timestamp is at or after its argument, and the last record of `evolu_skiplist_fingerprints` ends with 16 zero bytes at the size. A published function never changes meaning. A change gets a new name and a new `EVOLU_CORE_VERSION`, which `evolu_core_version()` returns.

A plain database, such as the relay's, whose data is already encrypted, needs no codec. It opens SQLite on the default VFS, where WAL, memory-mapped I/O and direct overflow reads work as SQLite has them, and gets the storage functions from `evolu_skiplist_register`. The rest of `src/sqlite_config.h` still applies, so its sorts and temporary files stay in memory and it has no progress handler.

## Layout

- `src/`: the codec, the page format, the storage functions, the crypto layer and its hardware paths, and the SQLite compile options every native build shares, `sqlite_config.h`.
- `vendor/`: the BearSSL and Monocypher files the crypto layer uses, each directory with a README of its origin.
- `binding/`: what every native binding shares and the wasm doesn't compile: the build check, how databases open, the registry that keeps one connection per file in the process, deleting and exporting a database, and the error record, which `binding/evolu_database.h` describes.
- `node/addon.c`: a minimal Node-API addon over the core, used only by tests for now, so TypeScript tests can drive the C.
- `scripts/`: fetching the pinned SQLite source, compiling with a cache, and building and running the tests.
- `test/`: the C tests, `*_test.c`, and the TypeScript tests, `*.test.mts`.

## Tests

Run `pnpm test:sqlite-core` in the repository root. It needs [clang](https://clang.llvm.org) with its `llvm-profdata` and `llvm-cov`, which Xcode installs, and on Ubuntu the llvm package (installed with clang unless Recommends are skipped), make, unzip and zip, on Linux also OpenSSL's development headers and clang's shared AddressSanitizer runtime. The first run needs network access to fetch the pinned SQLite source and expo-sqlite releases into `sqlite-cache/`, and compiles SQLite once. Compiled objects are cached in `build/`, keyed by their sources, flags and compiler. `SQLITE_CORE_CACHE` and `SQLITE_CORE_BUILD` choose other directories.

The C tests run under AddressSanitizer and UndefinedBehaviorSanitizer, once with hardware crypto and once on the software path, and together they must cover every line, function and branch of `src/` and `binding/` that the host compiles, which they keep to the code its architecture and OS can run. That needs a CPU with every hardware crypto feature its architecture's paths use: AES on x86-64, and AES, SHA-512 and DIT on arm64, which Apple silicon has. On another CPU, such as one of GitHub's arm64 Linux runners, which report no DIT, the check allows gaps only in the crypto layer's files and lists them. Each CI runner declares the features its CPU reports in the Checks workflow, and fails when they differ. They make each call of the inner VFS's files, each allocation of the core's own and each of SQLite's fail in turn, so error paths run too. On x86-64 Linux, CI also runs them built with `-m32`, as Android's 32-bit ABIs compile the core, which needs `gcc-multilib`: `EVOLU_TEST_M32=1 pnpm test:node --no-experimental-test-coverage packages/sqlite-core/test/core.test.mts`. It also runs the binding's thread tests under ThreadSanitizer, which can't combine with AddressSanitizer: `node packages/sqlite-core/scripts/test.mts binding_threads_ --thread-sanitizer`. To run the C tests whose names start with a prefix, and with `--coverage` list what the run left uncovered:

```sh
node packages/sqlite-core/scripts/test.mts codec_
```

The TypeScript tests check the codec against two references that share no code with it: pages encrypted and decrypted with `node:crypto`, and `@evolu/sqlite-wasm` 2.2.4, rolling back each other's hot journals. They build the SQLCipher of expo-sqlite 57.0.4 and 58.0.13 on the host and crash it at every write, and they check the storage functions against `Storage.ts`'s SQL. The addon's tests also run with the sanitizers. Crash tests copy the files as a power loss would leave them before each write of a transaction, for both page-1 layouts, every rollback journal mode, and 512- and 4096-byte sectors, and check that each crash leaves the database wholly before or after the transaction.

The tests must also cover every line, branch and function of the package's TypeScript, its scripts and test helpers, on every platform. Code that differs by platform takes the platform as a parameter, so each host tests both sides, and the build scripts' tests run them with a fake clang.

## Status

The core, its tests and its WebAssembly binding in `@evolu/sqlite-wasm` are done. The Node.js and React Native bindings come next, each in the package it ships in, and the measurements that decide their details come with them. The Checks workflow runs the tests on x86-64 Linux, with AES-NI and LeakSanitizer, on arm64 Linux, whose CPU reports no data independent timing, and on arm64 macOS, with AES, SHA-512 and data independent timing. Nothing has run on Windows yet.

An architecture decision record will document the decisions once the work is done.

## Versions

The package is private, so it's never published, and Changesets skips it, so its version stays 0.0.0. Its changes reach users only inside the packages that compile it, so a change that one of them already ships gets a changeset for that package, describing what its users see, as Changesets' maintainers [advise](https://github.com/changesets/changesets/issues/921#issuecomment-1219139351) for code that only dependents ship.

A changeset must never name this package. `pnpm changeset` refuses it, saying it may be misspelled ([changesets/changesets#2339](https://github.com/changesets/changesets/issues/2339)), and Changesets never consumes one written by hand ([changesets/changesets#2338](https://github.com/changesets/changesets/issues/2338)), which then keeps the release workflow from publishing ([changesets/action#241](https://github.com/changesets/action/issues/241)). Named together with a published package, it fails `changeset version`. A package that compiles the core lists it in `devDependencies`, if at all, because Changesets refuses a published package that depends on a skipped one, and npm couldn't install that dependency.

## Credits

- [SQLite](https://sqlite.org), public domain.
- [BearSSL](https://www.bearssl.org) by Thomas Pornin, MIT License.
- [Monocypher](https://monocypher.org) by Loup Vaillant, BSD-2-Clause or CC0-1.0, at the user's choice.

The tests build [SQLCipher](https://www.zetetic.net/sqlcipher/) from expo-sqlite releases to check the codec against it. Neither is vendored or shipped.
