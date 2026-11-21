# Evolu SQLite core guidance

This private package holds Evolu's SQLite core in C, compiled into
`@evolu/sqlite-wasm`, `@evolu/react-native`, and `@evolu/nodejs`. See
[README.md](README.md) for architecture, encryption format, and layout.

## Verification

- Run affected C tests with
  `node packages/sqlite-core/scripts/test.mts <test-name-prefix>` (add
  `--coverage` to list C coverage gaps) and affected TypeScript tests with
  `pnpm test:node "<test-file-or-glob>"`.
- Finish with `pnpm test:sqlite-core` once. It fails below 100% line, branch, or
  function coverage of the package's TypeScript, or when the C tests (run under
  AddressSanitizer and UndefinedBehaviorSanitizer on both hardware and software
  crypto paths) cover less than every line, branch, or function of `src/` and
  `binding/` that the host compiles.
- On a CPU lacking a hardware crypto feature its architecture's paths use (such
  as an arm64 CPU without SHA-512 or DIT), `core.test.mts` allows C coverage
  gaps only in the crypto layer's files (`evolu_crypto.c`, `evolu_crypto.h`,
  `evolu_crypto_hw.c`). On CI, each runner must report the exact feature mask
  declared in `.github/workflows/checks.yaml`.
- When changing C code with target attributes or intrinsics (such as
  `src/evolu_crypto_hw.c`), compile for both x86-64 and arm64 Linux and inspect
  the generated assembly.
- `pnpm test:sqlite-core` does not run ThreadSanitizer or 32-bit builds, which
  CI runs separately in `.github/workflows/checks.yaml`:
  - After changing thread/registry code in `binding/`, run
    `node packages/sqlite-core/scripts/test.mts binding_threads_ --thread-sanitizer`.
  - On x86-64 Linux (with `gcc-multilib`), test the 32-bit build (matching
    Android's 32-bit ABIs) with
    `EVOLU_TEST_M32=1 pnpm test:node --no-experimental-test-coverage packages/sqlite-core/test/core.test.mts`.

## Downstream triggers

- **Wasm (`packages/sqlite-wasm/AGENTS.md`):** After changing what the wasm
  compiles (`src/`, `vendor/`, `scripts/compile.mts`, or
  `scripts/sqlite-source.mts`), verify the wasm build (`emcc` still compiles
  `src/evolu_crypto_hw.c`, `src/evolu_xchacha.c`, and `vendor/monocypher/`, so
  syntax errors break it, though `wasm-ld` dead-strips their unexported symbols;
  `src/sqlite_config.h` and host-only helpers in `scripts/compile.mts` are
  native-only). Only when `packages/sqlite-wasm/wasm/sqlite3.wasm` output
  actually changes, re-pin it (as `packages/sqlite-wasm/scripts/build-wasm.mts`
  describes) and update the constant-time review
  (`packages/sqlite-wasm/scripts/constant-time.mts` and
  `packages/sqlite-wasm/scripts/constant-time.md`). Run `pnpm test:sqlite-wasm`
  then, and also after any change to `scripts/compile.mts` or
  `scripts/sqlite-source.mts` even when the output is unchanged, since
  `packages/sqlite-wasm/scripts/build-wasm.mts` and its tests import them.
- **Storage functions:** After changing `src/evolu_skiplist.c`,
  `src/evolu_skiplist.h`, `test/skiplist-fixture.json`, or
  `test/skiplist-fixture.mts`, run
  `pnpm test:node --no-experimental-test-coverage test/integration/nodejs/local-first/Storage/Storage.test.ts`
  (runs `Storage.ts` on the core's test addon and imports
  `test/skiplist-fixture.mts`) and
  `pnpm test:node --no-experimental-test-coverage test/integration/nodejs/sqlite-wasm/Database.test.ts`
  (imports `test/skiplist-fixture.mts`).
- **React Native (`packages/react-native/AGENTS.md`):**
  - After changing what `@evolu/react-native` vendors (`src/`, `binding/`,
    `vendor/`, `scripts/compile.mts`, or `scripts/sqlite-source.mts`), run
    `node packages/react-native/scripts/vendor-native.mts --update` (rewrites
    `packages/react-native/native.json`), then `pnpm test:react-native-sqlite`,
    and on macOS `pnpm test:react-native-hermes` and
    `node packages/react-native/scripts/vendor-native.mts --cross-compile=ios`
    (plus `--cross-compile=android --ndk=<NDK directory>` where an NDK is
    installed).
  - After changing `node/test_hooks.h`, `node/addon.c`,
    `scripts/build-addon.mts`, `scripts/coverage.mts`, `scripts/paths.mts`,
    `test/addon.mts`, `test/setup-addon.mts`, `test/sqlcipher.mts`, or
    `test/sqlcipher/fixture.c`, run `pnpm test:react-native-sqlite`; changing
    `scripts/coverage.mts` or `scripts/paths.mts` also requires
    `pnpm test:react-native-hermes` on macOS.
- **Node.js (`packages/nodejs/AGENTS.md`):**
  - After changing paths compiled into `@evolu/nodejs`'s addons (`src/`,
    `binding/`, `node/binding.c`, `node/module.c`, `vendor/`,
    `scripts/compile.mts`, or `scripts/sqlite-source.mts`), run
    `pnpm test:react-native-sqlite` (which runs the binding conformance suite,
    ASan/UBSan, and 100% C coverage on `node/binding.c` and `node/module.c`),
    plus `packages/nodejs/scripts/build-native.mts`,
    `packages/nodejs/scripts/check-native.mts`, and the Node.js unit and
    integration tests as `packages/nodejs/AGENTS.md` describes.
  - After changing `scripts/paths.mts` or `test/skiplist-fixture.json`, run the
    addon build, `packages/nodejs/scripts/check-native.mts`, unit tests, and
    integration tests as `packages/nodejs/AGENTS.md` describes.

## Changesets

- `@evolu/sqlite-core` is private and skipped by Changesets; never name it in a
  changeset (Changesets never consumes a file naming a private package, which
  blocks the Release workflow).
- Add a changeset for each published package that ships the changed paths
  (unless an unreleased changeset already covers the change), and none when a
  change does not touch any shipped path:
  - `@evolu/sqlite-wasm`: `src/`, `vendor/`, `scripts/compile.mts`,
    `scripts/sqlite-source.mts` — only when `packages/sqlite-wasm/wasm/sqlite3.wasm`
    output actually changes (skip native-only files such as `src/sqlite_config.h`,
    dead-stripped `src/evolu_crypto_hw.c` / `src/evolu_xchacha.c` /
    `vendor/monocypher/`, and host-only helpers in `scripts/compile.mts`, so
    unnecessary releases do not burn through the 9-build cap per SQLite release;
    bump type only selects the release-notes heading; see
    `packages/sqlite-wasm/AGENTS.md`).
  - `@evolu/react-native`: `src/`, `binding/`, `vendor/`, `scripts/compile.mts`,
    `scripts/sqlite-source.mts` — add a `patch` changeset for
    `@evolu/react-native` when what it vendors changes (or `minor` for an
    addition, following root `AGENTS.md`).
  - `@evolu/nodejs`: `src/`, `binding/`, `node/binding.c`, `node/module.c`, and
    changes to `vendor/`, `scripts/compile.mts`, or `scripts/sqlite-source.mts`
    that alter what its addons compile (not host-only helpers), following the
    bump-type rules in root `AGENTS.md`.

## Prerequisites

- `clang` with `llvm-profdata` and `llvm-cov` (Xcode on macOS; the `llvm`
  package on Ubuntu, installed with `clang` unless Recommends are skipped),
  `make`, `tar` (for `test/sqlcipher.mts`), `unzip`, `zip`, and Node.js headers
  (`include/node/node_api.h` next to `bin/node` from an official Node.js
  install, for `scripts/build-addon.mts`).
- On Linux: OpenSSL development headers (for SQLCipher fixture builds) and
  `clang`'s shared AddressSanitizer runtime (`apt-get install` with
  `--no-install-recommends` omits it, so also install the matching
  `libclang-rt-<major>-dev` package, e.g. `libclang-rt-18-dev` on Ubuntu 24.04,
  plus `llvm` for `llvm-profdata`/`llvm-cov`).
- In Docker on Linux: ThreadSanitizer requires
  `--security-opt seccomp=unconfined`, and `qemu-user` emulation breaks `-m32`
  AddressSanitizer (run 32-bit tests on native x86-64 Linux or CI).
- Network access on the first run to fetch the pinned SQLite source zip and
  expo-sqlite releases into `sqlite-cache/`. `SQLITE_CORE_CACHE` and
  `SQLITE_CORE_BUILD` override the cache and build directories.
