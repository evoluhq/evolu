# Evolu SQLite Wasm guidance

This package compiles SQLite and Evolu's SQLite core to WebAssembly with Evolu's
TypeScript layer. See [README.md](README.md) for architecture, bundler notes,
and the Docker build command.

## Code generation and verification

- After changing `packages/sqlite-wasm/scripts/generate.mts`,
  `packages/sqlite-wasm/scripts/bindings.mts`, or
  `packages/sqlite-wasm/scripts/upstream/`, regenerate with
  `node packages/sqlite-wasm/scripts/generate.mts`. CI verifies outputs are up
  to date with `pnpm check:sqlite-wasm`.
- After changing `packages/sqlite-wasm/src` or `packages/sqlite-wasm/scripts`,
  run `pnpm test:sqlite-wasm`. It runs the package's unit tests, Node.js
  `sqlite-wasm` integration tests,
  `test/integration/nodejs/Sqlite/WasmSqliteDriver.test.ts`, and
  `packages/sqlite-wasm/scripts/constant-time.test.mts`, and fails below 100%
  line, branch, or function coverage of `packages/sqlite-wasm/**`.
- For browser OPFS, worker, and quota behavior, run the `browser-sqlite-wasm`
  and `browser-sqlite-wasm-quota` Vitest projects (see `test/README.md`).

## The `wasm/sqlite3.wasm` binary

- Tests, dev servers, and package checks that load or pack SQLite Wasm
  (including `pnpm test:unit`, `pnpm test:sqlite-wasm`, `pnpm test:bundle`,
  `pnpm build:web`, `apps/web` `dev` via `check-wasm.mts`, `pnpm check:packages`,
  and browser/E2E suites) require the uncommitted
  `packages/sqlite-wasm/wasm/sqlite3.wasm` and fail when it is missing or does
  not match `wasmSha256` in `packages/sqlite-wasm/scripts/check-wasm.mts`.
- Get the pinned binary with `pnpm sqlite-wasm:download`, which needs network
  access and downloads the version in `packages/sqlite-wasm/package.json`. It
  fails with HTTP 404 until that version is published, and with a checksum
  mismatch after a pin change until the next release; in either case, build it
  from source as [README.md](README.md) and
  `packages/sqlite-wasm/scripts/build-wasm.mts` describe.
- After changing an input or what the wasm compiles from `packages/sqlite-core`
  (`src/`, `vendor/`, `scripts/compile.mts`, or `scripts/sqlite-source.mts`),
  verify the wasm build, but re-pin and update the constant-time review only
  when `sqlite3.wasm` output actually changes. Native-only `src/sqlite_config.h`
  and host-only helpers in `scripts/compile.mts` do not affect wasm output, and
  while `emcc` still compiles `src/evolu_crypto_hw.c`, `src/evolu_xchacha.c`,
  and `vendor/monocypher/` (so syntax errors break the build), `wasm-ld`
  dead-strips their unexported symbols; leaving `sqlite3.wasm` untouched avoids
  burning through the 9-build cap per SQLite release.
  1. Build with `packages/sqlite-wasm/scripts/build-wasm.mts` (needs `EMSDK` set
     or Docker, as [README.md](README.md) describes; the build fails with the
     new sha256 and keeps its work directory when output changed).
  2. When bumping SQLite, copy
     `packages/sqlite-wasm/scripts/upstream/sqlite3-api-glue.c-pp.js` verbatim
     from `ext/wasm/api` of the SQLite source zip (see
     `packages/sqlite-wasm/scripts/generate.mts`). Review the output, pin it
     with `node packages/sqlite-wasm/scripts/generate.mts --pin-build <wasm>`,
     regenerate with `node packages/sqlite-wasm/scripts/generate.mts`, and
     update `wasmSha256` in `packages/sqlite-wasm/scripts/check-wasm.mts`.
  3. Rebuild so `packages/sqlite-wasm/scripts/build-wasm.mts` succeeds and
     writes `packages/sqlite-wasm/wasm/sqlite3.wasm`,
     `packages/sqlite-wasm/wasm/sqlite3.symbols`, and
     `packages/sqlite-wasm/wasm/build-info.json`.
- Upgrading Emscripten also updates the pinned image tag and digest in
  `.github/workflows/checks.yaml` and [README.md](README.md); upgrading `wabt`
  updates the exact `wabt` `devDependency` in `packages/sqlite-wasm/package.json`
  and `pnpm-lock.yaml`.

## Constant-time verification

- `packages/sqlite-wasm/scripts/constant-time.test.mts` (run by both
  `pnpm test:sqlite-wasm` and `pnpm test:unit`) inspects compiled crypto
  functions in `packages/sqlite-wasm/wasm/sqlite3.wasm` and fails when their
  indices, code, or findings change.
- Caveat: `problemsOf` in `packages/sqlite-wasm/scripts/constant-time.mts`
  checks code `sha256`, unreviewed/stale sources, and unreviewed/stale calls,
  but never fails on a reviewed source of type `Secret`, so verify
  `packages/sqlite-wasm/scripts/constant-time.md` has no secret-dependent
  findings during review.
- After every wasm rebuild that changes `sqlite3.wasm` (not only after crypto
  changes, since function indices and compiler output can change), run
  `node packages/sqlite-wasm/scripts/constant-time.mts packages/sqlite-wasm/wasm/sqlite3.wasm packages/sqlite-wasm/wasm/sqlite3.symbols`,
  update `reviewedFunctions` in
  `packages/sqlite-wasm/scripts/constant-time.mts`, update the
  `packages/sqlite-wasm/scripts/constant-time.md` snapshot with
  `pnpm test:node --test-update-snapshots --test-name-pattern='the pinned wasm' packages/sqlite-wasm/scripts/constant-time.test.mts`
  (so randomized test order does not run `runConstantTimeCli` before `the pinned wasm`
  rewrites `constant-time.md`), and then run the full
  `pnpm test:node packages/sqlite-wasm/scripts/constant-time.test.mts`.

## Versioning

- `@evolu/sqlite-wasm` does not follow semver. It is versioned
  `<SQLite version>-build<n>`, any build may change its API, and repo-root
  `scripts/version-sqlite-wasm.mts` (run by `pnpm run version` after
  `changeset version`) replaces the version its changeset bump computes, so the
  bump type only selects its release-notes heading.
- Semver compares `build10` below `build9` as text, so repo-root
  `scripts/version-sqlite-wasm.mts` allows at most 9 builds per SQLite release.

## Upstream watch

- Last checked 2026-11-18 through `sqlite/sqlite-wasm` `e5b104c` and SQLite
  trunk `2026-11-17`.
- **SQLite 3.55+:** `sqlite3_serialize` returns `NULL` on a page read error
  instead of zero-filling (`sqlite/sqlite` `3e97799009`), so update the
  `pages === 0` branch in `packages/sqlite-wasm/src/Database.ts` to check
  `toCause(db)` first (covered by `EncryptedPoolDatabase.test.ts`). Also expect
  a new `sqlite3__wasm_disposal_notifier` export on regeneration.
- **Emscripten > 6.0.3:** adds an `env.__syscall_geteuid32` import that
  `packages/sqlite-wasm/src/Wasm.ts` must implement (and possibly a `setThrew`
  export), and newer Binaryen's `wasm-opt --all-features` emits compact imports
  that browsers reject unless passed `--disable-compact-imports`.
- **Cross-Origin Storage (WICG):** rejected for Evolu — looking up Evolu's
  distinct wasm hash across origins would leak that the user runs another Evolu
  app.
