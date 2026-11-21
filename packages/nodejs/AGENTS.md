# Evolu Node.js guidance

This package compiles Evolu's SQLite core into prebuilt Node-API addons shipped
for six targets: `darwin-arm64`, `darwin-x64`, `linux-arm64-gnu`,
`linux-arm64-musl`, `linux-x64-gnu`, and `linux-x64-musl`. See
[README.md](README.md) for package overview.

## Native SQLite addon build and checks

- The addons compile `packages/sqlite-core`'s `src/`, `binding/`,
  `node/binding.c`, `node/module.c`, `vendor/`, `scripts/compile.mts`, and
  `scripts/sqlite-source.mts` into the gitignored
  `packages/nodejs/native/<target>/evolu.node`.
- After changing `packages/nodejs/scripts/build-native.mts`,
  `packages/nodejs/scripts/check-native.mts`,
  `packages/nodejs/scripts/known-answer.db`,
  `packages/nodejs/src/NativeSqlite*.ts`,
  `packages/sqlite-core/scripts/paths.mts`,
  `packages/sqlite-core/test/skiplist-fixture.json`, or any
  `packages/sqlite-core` path compiled into the addon:
  - On a glibc Linux host, run `packages/nodejs/scripts/build-native.mts` and
    `packages/nodejs/scripts/check-native.mts` inside the pinned `almalinux:8`
    image with the same `docker run` as the `nodejs-native-linux` job in
    `.github/workflows/checks.yaml` (`check-native.mts` rejects symbols newer
    than glibc 2.28 before `--load`). Without Docker, report the check as not
    run; never raise `glibcVersionMax`.
  - Otherwise (macOS or musl Linux), build the host target (or either macOS
    target on macOS) with
    `node packages/nodejs/scripts/build-native.mts --target=<target>` (omit
    `--target` for the host target). Needs `clang`, `nm`, `make`, `unzip`,
    Node.js headers (`include/node/node_api.h` next to `bin/node` from an
    official Node.js install), and the pinned SQLite source or first-run network
    access.
  - Check exported addon symbols (as `.github/workflows/checks.yaml` does):
    `nm -gU packages/nodejs/native/<target>/evolu.node` on macOS or
    `nm -D --defined-only packages/nodejs/native/<target>/evolu.node` on Linux
    must list only `napi_register_module_v1` and
    `node_api_module_get_api_version_v1` (underscore-prefixed on macOS; Alpine
    also lists `_init` and `_fini`).
  - Verify the addon header, runtime load, known-answer/skiplist behavior, and
    reproducible bytes for the host target with
    `node packages/nodejs/scripts/check-native.mts --target=<target> --load --reproduce`,
    as `.github/workflows/checks.yaml` runs for every target. Omit `--load` for
    cross-architecture targets (for example, cross-compiled `darwin-x64` on
    `darwin-arm64` or vice versa), as `--load` only works for the host target.
  - Run the unit tests for the scripts, loader, row builder, and driver (also
    after changing `packages/nodejs/src/Sqlite.ts`) with
    `pnpm test:node packages/nodejs/scripts/check-native.test.mts packages/nodejs/src/NativeSqlite.test.ts packages/nodejs/src/NativeSqliteRows.test.ts packages/nodejs/src/Sqlite.test.ts`.
  - Run the release-addon conformance and driver integration suites (also after
    changing `packages/nodejs/src/Sqlite.ts`) with
    `pnpm test:node --no-experimental-test-coverage "test/integration/nodejs/Sqlite/{NativeSqliteConformance,NodeJsSqliteDriver}.test.ts"`.
    Both files unconditionally call `buildNativeSqlite()` at module load, which
    on glibc Linux overwrites `packages/nodejs/native/<target>/evolu.node` with
    a host-glibc binary and breaks subsequent `check-native.mts` or `prepack`
    runs until rebuilt inside `almalinux:8` or re-downloaded.
- `pnpm test:e2e` and `pnpm test:e2e:dev` start relays that load the host
  target's `packages/nodejs/native/<target>/evolu.node`, which they do not
  build; build it first with `node packages/nodejs/scripts/build-native.mts`.

## Row builder and binding coverage

- `packages/nodejs/src/NativeSqliteRows.ts` is the row builder paired with
  `packages/sqlite-core/node/binding.c`.
- After changing `packages/nodejs/src/NativeSqliteRows.ts`,
  `packages/common/src/NativeSqlite.ts`, or
  `packages/sqlite-core/node/{binding,module}.c`, run
  `pnpm test:react-native-sqlite` (which runs
  `packages/react-native/test/node/NativeSqlite*.test.ts`, including ASan/UBSan
  and 100% C coverage of `node/binding.c` and `node/module.c`) alongside
  `pnpm test:node "packages/nodejs/src/NativeSqliteRows.test.ts"`. When
  `packages/common/src/NativeSqlite.ts` changes, also run
  `pnpm test:node "packages/nodejs/src/Sqlite.test.ts"` and
  `pnpm test:node --no-experimental-test-coverage "test/integration/nodejs/Sqlite/NodeJsSqliteDriver.test.ts"`.
- When testing or profiling native memory in
  `packages/sqlite-core/node/binding.c`, note that
  `napi_adjust_external_memory` only drives V8's GC heuristics and does not
  appear in `process.memoryUsage().external`,
  `v8.getHeapStatistics().external_memory`, or
  `process.memoryUsage().arrayBuffers`. Both `external` and `external_memory`
  count external `ArrayBuffer` backing stores (such as the buffer `export()`
  returns via `napi_create_external_arraybuffer`, whereas `arrayBuffers` counts
  only V8-allocated ones), and other C/SQLite allocations appear only in
  `process.memoryUsage().rss`.

## Packing and `pnpm check:packages`

- `@evolu/nodejs`'s `prepack` (`npm run build && node scripts/check-native.mts --pack`)
  requires all six targets' `evolu.node` addons in `packages/nodejs/native/`,
  which only CI builds for every platform (`nodejs-native-*` jobs in
  `.github/workflows/checks.yaml`).
- To run `pnpm check:packages` locally, download all six artifacts from a CI or
  Release workflow run (both call `.github/workflows/checks.yaml`) and copy them
  into `packages/nodejs/native/` (create the gitignored directory first, as
  `cp -R` with multiple sources fails when the destination does not exist):

  ```sh
  gh run download <run> -p 'nodejs-native-*' -D <dir>
  mkdir -p packages/nodejs/native
  cp -R <dir>/nodejs-native-*/. packages/nodejs/native/
  ```
