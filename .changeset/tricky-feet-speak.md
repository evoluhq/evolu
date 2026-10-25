---
"@evolu/react-native": minor
---

Replaced expo-sqlite with Evolu's own SQLite and supported apps without Expo

React Native now runs Evolu's own SQLite, the core the web compiles to
WebAssembly, compiled natively into the app through a JSI module that ships in
`@evolu/react-native`. Until now, Evolu relied on the SQLCipher that expo-sqlite
vendors, in whatever version an Expo release brought, and on the app enabling
it with `useSQLCipher`. Now the web and React Native share one codec, one
behavior after a crash and one set of tests, and native builds encrypt in
constant time with the CPU's AES and SHA-512 instructions where it has them.
The package no longer needs Expo, so React Native apps without Expo are
supported, with the same `createEvoluDeps`.

Sync now encrypts and decrypts changes in the same native code, which
`createEvoluDeps` passes to Evolu's workers as `@evolu/common`'s new
`XChaCha20Poly1305`, instead of in JavaScript with noble-ciphers. A fresh
database receiving 10,000 changes took 20% less time on the iOS simulator and
24% to 29% less on an arm64 Android emulator than with noble-ciphers.

What changes for an app:

- It needs a native rebuild with React Native 0.88 or later, in Expo SDK 58 or
  later, on Hermes, React Native's default engine. Expo Go can't load Evolu's
  native code, so Expo apps use a development build. iOS builds with CocoaPods;
  SwiftPM support comes later.
- It needs `@evolu/common` 8.24 or later, whose workers take that native
  encryption. An older one would keep decrypting with noble-ciphers.
- Bump the version that over-the-air updates target, such as Expo's runtime
  version, and don't ship this release as an over-the-air update to older
  native builds. On a build without Evolu's module it fails at startup, and an
  old bundle on a new build, which still links expo-sqlite, could open the
  database through two SQLites at once, which can corrupt it. Expo's
  `fingerprint` runtime version policy changes with native code.
- `createEvoluDeps` moved to `@evolu/react-native`, and
  `@evolu/react-native/expo-sqlite` no longer exists. `EvoluIdenticon` moved to
  `@evolu/react-native/identicon`, so bundling `createEvoluDeps` needs no
  `react-native-svg`.
- `installPolyfills` installs `crypto.getRandomValues` from Evolu's native
  module when the runtime lacks it, so `react-native-quick-crypto` is no longer
  needed. Call it in a module of its own, such as `polyfills.ts`, and import
  that module first in the app's entry file, because a file's imports all run
  before its own code. In an Expo app with Expo Router, that's an `index.ts`
  with `import "./polyfills";` then `import "expo-router/entry";`, and
  `"main": "index.ts"` in `package.json`. In any other app, it's
  `import "./polyfills";` on the first line of its entry file.
- Unless the app uses them itself, remove `useSQLCipher` and the expo-sqlite
  config plugin, and expo-sqlite, `react-native-quick-crypto` and
  `react-native-nitro-modules`. The package dropped its `expo`, `expo-sqlite` and
  `react-native-nitro-modules` peers.
- Existing databases open in place, from the same directory and with the same
  file names, and so do the hot journals that a crash or a killed app left. A
  database this release creates gets the format the web's have, which a release
  with expo-sqlite can't open. An app that goes back to such a release, by a
  downgrade or by shipping its code again as a newer version, fails on that
  database with NOTADB and loses nothing, and a later version with Evolu's
  SQLite opens it again. The databases that existed before keep SQLCipher's
  format, so an older release still opens them.
- SQL strings take single quotes, as on the web: Evolu's SQLite reads a
  double-quoted string as a column name, so `where title = "a"`, which
  expo-sqlite's SQLCipher accepted, fails with no such column. The schemas
  existing databases store still load.
- Every connection is defensive (`SQLITE_DBCONFIG_DEFENSIVE`), so SQL can't
  corrupt its database: it ignores `PRAGMA writable_schema = ON`,
  `journal_mode = OFF` and `schema_version = N`.
- A wrong key now sets `evoluError` to an `UnknownError` whose `error.cause`
  names the failure. A database that another JavaScript runtime of the app, such
  as one a reload replaced, still holds 10 seconds after Evolu began waiting for
  it fails with `DatabaseHeldError`, as on the web. A runtime still starting, as
  during an early reload, can open it between that wait and Evolu's open, which
  then tries again for 10 seconds and fails with an `UnknownError`. After
  either, the app must be restarted.

Installs get smaller. The package is now 11.6 MB unpacked, because it ships
SQLite and Evolu's SQLite core as C sources, but apps no longer install
expo-sqlite, 31 MB unpacked, react-native-quick-crypto, 6 MB, or
react-native-nitro-modules.

Apps get smaller too. Built for Release with each version, Evolu's Expo example
shrank: its iOS executable from 24.4 MB to 12.8 MB, its `.app` from 56.6 MB to
44.1 MB, and its Android APK, with all four ABIs, from 163 MB to 103 MB.
Evolu's SQLite adds 0.7 to 1.2 MB per architecture, while the app drops the
native code of expo-sqlite, react-native-quick-crypto and
react-native-nitro-modules, and on Android also the OpenSSL that expo-sqlite
packages.

```ts
import { createEvoluDeps, createRun } from "@evolu/react-native";
// @ts-expect-error @evolu/react-native/expo-sqlite no longer exists.
import type { createEvoluDeps as _createEvoluDeps } from "@evolu/react-native/expo-sqlite";
// @ts-expect-error EvoluIdenticon moved to @evolu/react-native/identicon.
import type { EvoluIdenticon as _MovedIdenticon } from "@evolu/react-native";
import type { EvoluIdenticon as _EvoluIdenticon } from "@evolu/react-native/identicon";

await using _run = createRun(createEvoluDeps());
```
