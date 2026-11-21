# Evolu React Native guidance

This package ships Evolu's SQLite core as vendored C alongside the React Native
JSI adapter, TurboModules, and native build files. See [README.md](README.md)
for package overview.

## Vendoring native C

- `packages/react-native/native/` is gitignored and generated from
  `packages/sqlite-core` (`src/`, `binding/`, `vendor/`, `scripts/compile.mts`,
  `scripts/sqlite-source.mts`) and the pinned SQLite source.
- Run `node packages/react-native/scripts/vendor-native.mts` to write `native/`
  matching `packages/react-native/native.json` (CI checks this with `--check`),
  or pass `--update` to rewrite both `native/` and `native.json` after changing
  what the package vendors.
- Prepack (`npm run build && node scripts/vendor-native.mts`, also run by
  `pnpm check:packages`) writes `native/` and needs `clang` with `llvm-nm`,
  `make`, `unzip`, and the pinned SQLite source (cached in
  `packages/sqlite-core/sqlite-cache/` or fetched over the network).

## Node-hosted SQLite and build-file tests

- Run `pnpm test:react-native-sqlite` after changing
  `packages/react-native/scripts`, `src`, `test/device`, `test/node`,
  `test/bindingConformance.ts`, `test/illFormedNames.ts`,
  `EvoluReactNative.podspec`, `cpp/CMakeLists.txt`, `react-native.config.js`,
  `native.json`, `packages/common/src/NativeSqlite.ts`,
  `packages/nodejs/src/NativeSqliteRows.ts`, or `packages/sqlite-core` (`src/`,
  `binding/`, `vendor/`, `scripts/compile.mts`, `scripts/sqlite-source.mts`,
  `node/binding.c`, `node/module.c`, or shared scripts/test-addon helpers
  `node/test_hooks.h`, `node/addon.c`, `scripts/build-addon.mts`,
  `scripts/coverage.mts`, `scripts/paths.mts`, `test/addon.mts`,
  `test/setup-addon.mts`, `test/sqlcipher.mts`, `test/sqlcipher/fixture.c`).
  After changing `src/sqlite/Binding.ts`, `test/bindingConformance.ts`, or
  `test/illFormedNames.ts`, also run
  `pnpm test:node --no-experimental-test-coverage "test/integration/nodejs/Sqlite/NativeSqliteConformance.test.ts"`.
- It runs the package's Node tests, the binding conformance suite on
  `node/binding.c`, AddressSanitizer and UndefinedBehaviorSanitizer runs of the
  binding/module/driver tests, podspec and CMake tests, and fails below 100%
  line, branch, or function coverage of:
  - `packages/react-native/scripts`, `src/Sqlite.ts`, and `src/sqlite`,
  - `packages/common/src/NativeSqlite.ts` (shared with `@evolu/nodejs`), and
  - `packages/sqlite-core`'s `node/binding.c` and `node/module.c`.
- Prerequisites: everything in `packages/sqlite-core/AGENTS.md` (`clang` with
  `llvm-nm`, `llvm-profdata`, and `llvm-cov`, `make`, `tar`, `unzip`, `zip`,
  Node.js headers, Linux OpenSSL dev headers and shared ASan runtime, first-run
  network), plus `ruby` and `cmake` (from `PATH` or the Android SDK).

## C++ adapter (`cpp/EvoluSqliteBinding.cpp`) vs TurboModule (`cpp/EvoluSqlite.cpp`)

- **JSI adapter (`cpp/EvoluSqliteBinding.{h,cpp}`):** After changing
  `cpp/EvoluSqliteBinding.{h,cpp}`, `src/sqlite/Binding.ts`, `test/hermes`,
  `test/bindingConformance.ts`, `test/illFormedNames.ts`,
  `packages/react-native/scripts/hermes.mts`,
  `packages/sqlite-core/scripts/coverage.mts`,
  `packages/sqlite-core/scripts/paths.mts`, or what the package vendors, run
  `pnpm test:react-native-hermes` on macOS. It runs the conformance suite and
  Hermes tests under React Native's pinned Hermes with ASan+UBSan and then
  ThreadSanitizer, and fails below 100% line, branch, or function coverage of
  `cpp/EvoluSqliteBinding.cpp` (needs `native/`, Xcode's `clang`, and first-run
  network for the pinned Hermes tarball).
- **Cross-compilation (`--cross-compile`):** After changing
  `cpp/EvoluSqliteBinding.{h,cpp}`, what the package vendors,
  `packages/react-native/scripts/vendor-native.mts`, or bumping `react-native`,
  run `node packages/react-native/scripts/vendor-native.mts --cross-compile=ios`
  on macOS, and `--cross-compile=android --ndk=<NDK directory>` where an NDK is
  installed (both require `native/`, compile `native/units` and
  `cpp/EvoluSqliteBinding.cpp` for every target with `-Wall -Wextra -Werror` on
  `packages/sqlite-core/{src,binding}` and `cpp/EvoluSqliteBinding.cpp` — not
  `sqlite3.c`, BearSSL, or Monocypher — and verify defined symbol names).
- **React Native version bumps:** Even on a patch bump, update the pinned Hermes
  tarball in `packages/react-native/scripts/hermes.mts` to match React Native's
  `sdks/hermes-engine/version.properties`
  (`packages/react-native/scripts/hermes.test.mts` checks the pin against the
  installed `react-native`).
- **TurboModule (`cpp/EvoluSqlite.{h,cpp}`) and `src/specs/`:** Neither
  `pnpm test:react-native-hermes` nor `vendor-native.mts --cross-compile`
  compiles `cpp/EvoluSqlite.cpp` (it requires React Native's generated codegen
  spec). Verify changes to `cpp/EvoluSqlite.{h,cpp}` and `src/specs/` with the
  app builds and device tests below.

## App builds and device tests

- After changing how `@evolu/react-native` builds into apps,
  `EvoluReactNative.podspec`, `cpp/CMakeLists.txt`, `cpp/EvoluSqlite.{h,cpp}`,
  `src/specs/`, `ios/`, `android/`, `react-native.config.js`, `codegenConfig`,
  `test/device/`, or either example's native setup (`examples/react-expo`,
  `examples/react-native`), run the device route on a simulator and an emulator
  in the affected example, as `.github/workflows/react-native-app.yaml` does:
  1. Run `node packages/react-native/scripts/vendor-native.mts`, then build and
     install the example in Release. `examples/react-expo` keeps its `ios/` and
     `android/` gitignored, so run
     `npx expo prebuild --platform <ios|android> --no-install` first (and
     `pod install` in `ios/` on iOS). When building both examples for Android,
     run the second build with `--no-daemon`: one Gradle daemon building both
     exhausts its 512 MB Metaspace (`org.gradle.jvmargs` in
     `examples/react-native/android/gradle.properties`) and wedges.
  2. On iOS, check every compiled pod object (`ios/*.mm` and
     `cpp/EvoluSqlite.cpp` included) with
     `node packages/react-native/scripts/vendor-native.mts --check-objects=<derived data>/Build/Intermediates.noindex/Pods.build/Release-iphonesimulator/EvoluReactNative.build/Objects-normal/arm64`.
  3. Write test fixtures with
     `node packages/react-native/scripts/device-tests.mts --write-fixtures=<dir>`
     (needs `clang`, `tar`, network on first run to fetch pinned expo-sqlite
     tarballs, and OpenSSL dev headers on Linux).
  4. Run
     `node packages/react-native/scripts/device-tests.mts --platform=<ios|android> --device=<id> --app=<bundle-or-pkg> --url=<url> --fixtures=<dir>`.
     Android needs a `google_apis` emulator image (which allows `adb root`;
     `.github/workflows/react-native-app.yaml` creates an AVD named `evolu` with
     `system-images;android-36;google_apis;x86_64`).
- Pull requests and merge-queue runs execute the app jobs only when they change
  a path listed in repo-root `scripts/select-react-native-app.mts`, so add any
  new path that only the app jobs check there.
- After a change that moves the example apps' Release sizes on purpose, update
  `bench/app-size/baselines.json` from a dispatched CI run as
  `bench/app-size/README.md` describes.
