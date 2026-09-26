# @evolu/web

## 3.2.0

### Minor Changes

- 0624d35: Fixed apps that stayed blank where the browser offers no storage

  Safari's Private Browsing offers no OPFS, so Evolu could not open its database
  there, and the app waited forever without reporting an error. Evolu now checks
  storage once when its shared worker starts, and without it keeps every database
  in memory. Data synced with a relay comes back, as on a new device, and nothing
  stays on the device afterwards, which suits checking your app on a borrowed
  phone. A persistent database the browser cannot reach right now is left
  untouched. Data that exists only locally, or has not synced yet, is lost when
  the tab hosting the database closes, even while other tabs stay open.

  The new `onStorageUnavailable` option of the web and React web
  `createEvoluDeps` tells the app, so it can tell the user, for example "Nothing
  from this session is kept on this device."

  A custom platform adapter must handle the new `StorageUnavailable` shared
  worker message in an exhaustive switch, and a platform that can lack persistent
  storage can give the shared worker `isPersistentStorageAvailable`.

- e7d27be: Fixed a new app version not working while an older one was open in another tab

  After a deploy that updated Evolu, opening the app while an older version was
  open in another tab could leave the new tab unresponsive.

  Now only one version of an app uses the local database at a time. When a new
  version opens, tabs of the old version reload by themselves. A tab the user is
  in reloads when they leave it. A reload loses unsaved UI state, so keep drafts
  in local-only tables.

  If an old version keeps running, for example in a tab of an Evolu release
  before this one, the new tab waits and reports the new `OtherBuildRunningError`.
  Apps can show a message asking the user to close the app's other tabs. The
  error clears by itself when the wait ends. An exhaustive `switch` over
  `EvoluError` needs a case for it.

  ```ts
  import { assertEqual, type EvoluError } from "@evolu/common";

  const isOtherBuildRunning = (error: EvoluError | null): boolean =>
    error?.type === "OtherBuildRunningError";

  assertEqual(isOtherBuildRunning({ type: "OtherBuildRunningError" }), true);
  ```

  The web `createEvoluDeps` accepts a custom `reloadApp`, for example to save
  state first; it must still reload the page, because the other build waits until
  this tab reloads or closes. The default one now reloads the current page instead
  of loading `/`. The React web
  `createEvoluDeps` now accepts the same options as the web one, including
  `onSharedWorkerUnsupported`.

  Update `@evolu/web` together with `@evolu/common`; with an older `@evolu/web`,
  queries never complete. A custom platform adapter must forward the new
  `Connected` and `Error` shared worker messages and handle the new `Waiting`
  message. One that runs the shared worker in-process must connect every
  `createEvoluDeps` call in a JS runtime to one worker, as React Native does,
  because the worker holds the build lock until it is disposed. On React Native,
  Evolu keeps working after Fast Refresh recreates its dependencies.

### Patch Changes

- e45a549: Fixed tabs that stopped working after Safari relaunched Evolu's shared worker

  When the process hosting Evolu's shared worker ends, WebKit can start the
  worker again without its state and connect the open tabs to it
  ([WebKit bug 318873](https://bugs.webkit.org/show_bug.cgi?id=318873)). Those
  tabs stopped working until the user reloaded them. A tab now reloads by itself
  when a relaunched worker contacts it, including a tab that was still waiting
  for another build.

- fdac39e: Added sync state

  `createEvoluDeps` exposes `deps.syncState`, a `ReadonlyStore<SyncState | null>`
  beside `evoluError`, shared by every Evolu instance and kept current by the
  shared worker; a tab never receives snapshots from a worker of another app
  version. A snapshot lists every transport with an opaque id, a label that is
  the URL without its query, the ready state, and the last open, close, and error
  times; and every database with its owner registrations, each marked writable or
  readonly, with the transports claimed for the owner and, for a writable owner,
  one route per transport saying whether the database is reconciled with that
  relay: `complete`, `completeAt`, `lastSentAt`, `lastReceivedAt`, and the last
  `error`, whose `type` is a protocol error, the original storage write
  rejection, `WriteFailed`, or `SyncFailed`. Local-only writes leave completed
  routes complete; `isLocalOnlyTable` tells whether a table is local-only.

  A failed route retries at most once by itself before it completes again;
  further retries wait for `requestSync` or a reconnect.

  `syncStateToOwnerSyncStates` folds the routes into one `initial`, `syncing`,
  `synced`, `offline`, or `error` state per database and owner with the last
  synced time, the newest error, and each relay's transport, route, and own
  `syncing`, `synced`, `offline`, or `error` status. The completion rules are
  documented in the Shared module. The
  [Sync playground](https://www.evolu.dev/playgrounds/sync) shows the state of
  two relays while one goes down and catches up.

  ```ts
  import {
    assertEqual,
    createId,
    createStore,
    testCreateDeps,
  } from "@evolu/common";
  import type { SyncState, SyncStateDep } from "@evolu/common/local-first";

  const openRelayLabels = (deps: SyncStateDep): ReadonlyArray<string> =>
    (deps.syncState.get()?.transports ?? [])
      .filter(({ readyState }) => readyState === "open")
      .map(({ label }) => label);

  using syncState = createStore<SyncState | null>(null);
  assertEqual(openRelayLabels({ syncState }), []);

  const deps = testCreateDeps();
  syncState.set({
    transports: [
      {
        id: createId<"SyncTransport">(deps),
        label: "wss://relay.example",
        readyState: "open",
        openedAt: null,
        closedAt: null,
        error: null,
      },
    ],
    tenants: [],
  });
  assertEqual(openRelayLabels({ syncState }), ["wss://relay.example"]);
  ```

- a0c716a: Fixed tabs that stalled or stopped saving after Safari's back-forward cache

  Safari keeps a page the user navigates away from frozen in its back-forward
  cache. When that page's tab hosted the database, the app's other tabs, and any
  tab opened later, waited until the page was restored or dropped. When the user
  went back, the page looked normal but silently dropped every write. A page
  entering the back-forward cache now stops the database workers it hosts, so
  another tab takes the database over as if the tab had closed, and a page
  restored from the cache reloads.

  As when a tab closes, data kept only in memory, as in Safari's Private
  Browsing, is lost when the tab hosting the database navigates away. A cached
  page of an older build still keeps a newer build waiting until Safari drops the
  page or the user goes back to it.

- d17ce92: Fixed losing or failing to open a database right after the tab hosting it closed

  When the tab hosting a database closed or crashed, the browser could hand the
  database to another tab before it released the database files; Safari
  releases them in no set order. Opening the database there failed, and
  SQLite's cleanup after the failure tried to delete the database directory. The
  still-open files usually prevented that, but a file released in between let it
  delete the device's local data. Evolu now waits
  until every database file can be opened before it opens the database, and
  logs a warning when the wait lasts longer than five seconds.

- ecd1c0d: Fixed defect reports that showed only "[object Object]"

  The browser and React Native `createRun` passed a panic's `AbortError`, a plain
  object, to the platform's error reporter, which shows it only as
  "[object Object]" or similar. A worker's error reaches its page, including an
  error tracker listening there, as that text alone, so when a database worker
  failed, nothing said why. Both now report an `Error` from the new
  `defectToError`: a panic reports its defect, and any other value that is not an
  `Error` is described in one whose cause is what was reported. A `DOMException`,
  which Chromium reports from a worker without its name or message, is described
  with both.

  A custom `reportDefect`, such as one passing defects to an error tracker, can
  use `defectToError` too:

  ```ts
  import { assertSame, createRun, defectToError } from "@evolu/common";

  const errors: Array<Error> = [];
  await using run = createRun({
    reportDefect: (reported) => {
      errors.push(defectToError(reported));
    },
  });
  const defect = new Error("boom");

  run.panic(defect);

  assertSame(errors[0], defect);
  ```

- ba8c493: Added database versioning with startup refusal

  Evolu now records a database version, `dbVersion`, in its `evolu_version`
  table instead of the unused `protocolVersion`, and converts existing databases
  at startup. The version covers Evolu's internal storage format and how stored
  data is interpreted. It is independent of the application schema, which still
  evolves append-only, and of the network protocol version. This release supports
  database version 2 and migrates older databases to it.

  A database newer than the code supports appears when an older build opens data
  a newer one migrated: after a deployment, for example when an older build is
  loaded later from a cache, or after a downgrade, including installing an older
  React Native build. Evolu refuses such a database before writing anything, and
  every tab using it gets `UnsupportedDbVersionError` in `evoluError`, where it
  stays for the lifetime of the dependencies. Queries and exports of that
  database stay pending, and mutation `onComplete` callbacks do not run. The
  `EvoluErrorDep` API docs describe when the refusal is reported again. Only code
  from this release onward checks the version, so earlier releases are not
  protected. Nothing produces a newer database yet; the first refusal can come
  when a later release introduces version 3, so handle the error now.

  On the web, a refused tab reloads once for each stored version, so it loads the
  build the server now serves. The error is reported only when the reloaded build
  refuses the database too, or when the tab has no session storage.

  Apps should observe `evoluError` outside query-loading UI and show a blocking
  message for `UnsupportedDbVersionError`, such as asking users to update the
  app. An exhaustive `switch` over `EvoluError` needs a case for it.

  ```ts
  import { assertEqual, PositiveInt, type EvoluError } from "@evolu/common";

  const describeError = (error: EvoluError): string => {
    // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- The default handles every other EvoluError.
    switch (error.type) {
      case "UnsupportedDbVersionError":
        return "Your data requires a newer version of this app. Please update it.";
      default:
        return "Something went wrong.";
    }
  };

  assertEqual(
    describeError({
      type: "UnsupportedDbVersionError",
      storedVersion: PositiveInt.orThrow(3),
      supportedVersion: PositiveInt.orThrow(2),
    }),
    "Your data requires a newer version of this app. Please update it.",
  );
  ```

- Updated dependencies [f0101ca]
- Updated dependencies [fdac39e]
- Updated dependencies [ecbac00]
- Updated dependencies [b506c9b]
- Updated dependencies [fdac39e]
- Updated dependencies [d2973b9]
- Updated dependencies [b75abfa]
- Updated dependencies [69b756c]
- Updated dependencies [5a671b2]
- Updated dependencies [e270e42]
- Updated dependencies [ef320ff]
- Updated dependencies [5a671b2]
- Updated dependencies [09b1b5c]
- Updated dependencies [fdac39e]
- Updated dependencies [0770038]
- Updated dependencies [e270e42]
- Updated dependencies [f52d66b]
- Updated dependencies [d2973b9]
- Updated dependencies [fdac39e]
- Updated dependencies [11ccc28]
- Updated dependencies [2e139eb]
- Updated dependencies [0624d35]
- Updated dependencies [ecd1c0d]
- Updated dependencies [568358b]
- Updated dependencies [237fd7f]
- Updated dependencies [e7d27be]
- Updated dependencies [2e139eb]
- Updated dependencies [daf6295]
- Updated dependencies [d2973b9]
- Updated dependencies [ba8c493]
- Updated dependencies [8e23edb]
- Updated dependencies [fdac39e]
- Updated dependencies [cf68cee]
  - @evolu/common@8.11.0

## 3.1.2

### Patch Changes

- 9fc736f: Updated internal Evolu peer dependency requirements

  Aligned internal peer dependency minimums with the current workspace releases. Upgrade the Evolu packages together when updating an adapter or framework integration.

- Updated dependencies [532feaa]
- Updated dependencies [6bd0a36]
- Updated dependencies [f4d9ad7]
- Updated dependencies [3d84543]
- Updated dependencies [6bd0a36]
- Updated dependencies [76554bd]
- Updated dependencies [918d77b]
- Updated dependencies [f4d9ad7]
- Updated dependencies [6bd0a36]
- Updated dependencies [ad85bdb]
- Updated dependencies [f4d9ad7]
- Updated dependencies [91ff875]
- Updated dependencies [ad85bdb]
- Updated dependencies [6bd0a36]
- Updated dependencies [140c4cf]
- Updated dependencies [3d84543]
- Updated dependencies [3d84543]
- Updated dependencies [f3b5829]
- Updated dependencies [ad85bdb]
- Updated dependencies [f4d9ad7]
- Updated dependencies [9ee6f15]
  - @evolu/common@8.10.0

## 3.1.1

### Patch Changes

- 037c390: Required Node.js 24.20 or newer

  Evolu packages now require Node.js 24.20 or newer, matching the repository's tested LTS baseline.

## 3.1.0

### Minor Changes

- 31d2888: Added Apple platform detection

  Use `isApplePlatform` to detect macOS, iOS, iPadOS, and iPod platforms in the
  browser.

  ```ts
  import { isApplePlatform } from "@evolu/web";

  expectTypeOf(isApplePlatform()).toEqualTypeOf<boolean>();
  ```

## 3.0.2

### Patch Changes

- 34fa9df: Improved API documentation

  Expanded the Result, Task, Type, and Owner documentation with module
  introductions, semantic API groups, and tested examples. Improved the platform
  `createRun` documentation for Web and React Native.

## 3.0.1

### Patch Changes

- 13ee2e8: Updated internal peer dependency ranges to require stable releases.

## 3.0.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)
- 0528425: - Merged `@evolu/common/local-first/Platform.ts` into `@evolu/common/Platform.ts`
  - Made `@evolu/react-web` re-export everything from `@evolu/web`, allowing React users to install only `@evolu/react-web`
- 2abf93d: Refactored SQLite integration to use Task and throw-first semantics

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
  - Added `testSetupSqlite` helper for SQLite tests

  Why `SqliteError` was removed:

  - In Evolu, SQLite runs in-process. Failures are infrastructure-level and unrecoverable at the call site.
  - Wrapping these failures as `Result` values did not create meaningful recovery paths; callers still had to fail.
  - Such failures now throw as Task defects, panic the owning Run tree, and are reported through its `ReportDefect` dependency.
  - Platform Run adapters provide native defect reporters, and applications can inject a custom reporter at the composition root.

  Boundary handling:

  - At protocol boundaries (for example Protocol ↔ Storage), error handling remains explicit.
  - Since storage implementations may throw, boundary code uses `try/catch`, logs with `console.error(error)`, and returns protocol-level outcomes.
  - Protocol handles all thrown errors as boundary concerns, without coupling to SQLite-specific error types.

- 953c1fb: Replaced interface-based symmetric encryption with direct function-based API

  ### Breaking Changes

  **Removed:**

  - `SymmetricCrypto` interface
  - `SymmetricCryptoDep` interface
  - `createSymmetricCrypto()` factory function
  - `SymmetricCryptoDecryptError` error type

  **Added:**

  - `encryptWithXChaCha20Poly1305()` - Direct encryption function with explicit algorithm name
  - `decryptWithXChaCha20Poly1305()` - Direct decryption function
  - `XChaCha20Poly1305Ciphertext` - Branded type for ciphertext
  - `Entropy24` - Branded type for 24-byte nonces
  - `DecryptWithXChaCha20Poly1305Error` - Algorithm-specific error type
  - `xChaCha20Poly1305NonceLength` - Constant for nonce length (24)

  ### Migration Guide

  **Before:**

  ```ts
  const symmetricCrypto = createSymmetricCrypto({ randomBytes });
  const { nonce, ciphertext } = symmetricCrypto.encrypt(plaintext, key);
  const result = symmetricCrypto.decrypt(ciphertext, key, nonce);
  ```

  **After:**

  ```ts
  const [ciphertext, nonce] = encryptWithXChaCha20Poly1305({ randomBytes })(
    plaintext,
    key,
  );
  const result = decryptWithXChaCha20Poly1305(ciphertext, nonce, key);
  ```

  **Error handling:**

  ```ts
  // Before
  if (!result.ok && result.error.type === "SymmetricCryptoDecryptError") { ... }

  // After
  if (!result.ok && result.error.type === "DecryptWithXChaCha20Poly1305Error") { ... }
  ```

  **Dependency injection:**

  ```ts
  // Before
  interface Deps extends SymmetricCryptoDep { ... }

  // After - only encrypt needs RandomBytesDep
  interface Deps extends RandomBytesDep { ... }
  ```

  ### Rationale

  This change improves API extensibility by using explicit function names instead of a generic interface. Adding new encryption algorithms (e.g., `encryptWithAES256GCM`) is now straightforward without breaking existing code.

- 5c55b05: Changed the local database and ownership layout.

  Upgrading an existing Evolu 7 application to Evolu 8 is not yet supported.
  Applications containing Evolu 7 user data should remain on Evolu 7 until
  migration support is released. New Evolu 8 applications and applications
  already using Evolu 8 preview releases are unaffected.

- 4be336d: Refactored worker abstraction to support all platforms uniformly:

  - Added platform-agnostic worker interfaces: `Worker<Input, Output>`, `SharedWorker<Input, Output>`, `MessagePort<Input, Output>`, `MessageChannel<Input, Output>`
  - Added worker-side interfaces: `WorkerSelf<Input, Output>` and `SharedWorkerSelf<Input, Output>` for typed worker `self` wrappers
  - Changed `onMessage` from a method to a property for consistency with Web APIs
  - Made all worker and message port interfaces `Disposable` for proper resource cleanup
  - Added default generic parameters (`Output = never`) for simpler one-way communication patterns
  - Added complete web platform implementations: `createWorker`, `createSharedWorker`, `createMessageChannel`, `createWorkerSelf`, `createSharedWorkerSelf`, `createMessagePort`
  - Added React Native polyfills for Workers and MessageChannel

### Minor Changes

- 66941ed: Added `availableParallelism()` with a validated `PositiveInt` return value.

### Patch Changes

- c1f97ff: Fixed the SharedWorker fallback on older Chrome Android versions without native SharedWorker support.

  Apps can pass `onSharedWorkerUnsupported` to show a custom message when another fallback tab is already running:

  ```ts
  createEvoluDeps({
    onSharedWorkerUnsupported: () => {
      alert(
        "This browser supports Evolu in one tab only. Close this tab and use the already open tab.",
      );
    },
  });
  ```

## 3.0.0-next.1

### Patch Changes

- c1f97ff: Fixed the SharedWorker fallback on older Chrome Android versions without native SharedWorker support.

  Apps can pass `onSharedWorkerUnsupported` to show a custom message when another fallback tab is already running:

  ```ts
  createEvoluDeps({
    onSharedWorkerUnsupported: () => {
      alert(
        "This browser supports Evolu in one tab only. Close this tab and use the already open tab.",
      );
    },
  });
  ```

- 63dce92: Updated Task and Run dependency injection API.

  Removed `Run.addDeps` because every `Run` now owns its deps. The new API is more flexible and better matches sync Pure DI: deps are passed explicitly where a task is called, can replace existing deps when needed, and can be scoped to an owned disposable `Run` with `run.create(deps)`.
  - Renamed `RunDeps` to `RunDefaultDeps` to describe default Run dependencies more clearly.
  - Replaced `Run.addDeps` with explicit dependency passing via `run(task, deps)`, `run.orThrow(task, deps)`, and `run.create(deps)`.
  - Allowed explicit deps to override default `RunDefaultDeps` when needed.

## 3.0.0-next.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)
- 0528425: - Merged `@evolu/common/local-first/Platform.ts` into `@evolu/common/Platform.ts`
  - Made `@evolu/react-web` re-export everything from `@evolu/web`, allowing React users to install only `@evolu/react-web`
- 2abf93d: Refactored SQLite integration to use Task and throw-first semantics
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
  - Added `testSetupSqlite` helper for SQLite tests

  Why `SqliteError` was removed:
  - In Evolu, SQLite runs in-process. Failures are infrastructure-level and unrecoverable at the call site.
  - Wrapping these failures as `Result` values did not create meaningful recovery paths; callers still had to fail.
  - The correct behavior is to let such failures throw and surface them through platform `createRun` global handlers (web, nodejs, react-native), which report uncaught errors via Evolu `console.error`.
  - Evolu also propagates `console.error` entries through its messaging layer into the shared `evoluError` global store, so app-level error subscriptions still receive these failures.

  Boundary handling:
  - At protocol boundaries (for example Protocol ↔ Storage), error handling remains explicit.
  - Since storage implementations may throw, boundary code uses `try/catch`, logs with `console.error(error)`, and returns protocol-level outcomes.
  - Protocol handles all thrown errors as boundary concerns, without coupling to SQLite-specific error types.

- 953c1fb: Replaced interface-based symmetric encryption with direct function-based API

  ### Breaking Changes

  **Removed:**
  - `SymmetricCrypto` interface
  - `SymmetricCryptoDep` interface
  - `createSymmetricCrypto()` factory function
  - `SymmetricCryptoDecryptError` error type

  **Added:**
  - `encryptWithXChaCha20Poly1305()` - Direct encryption function with explicit algorithm name
  - `decryptWithXChaCha20Poly1305()` - Direct decryption function
  - `XChaCha20Poly1305Ciphertext` - Branded type for ciphertext
  - `Entropy24` - Branded type for 24-byte nonces
  - `DecryptWithXChaCha20Poly1305Error` - Algorithm-specific error type
  - `xChaCha20Poly1305NonceLength` - Constant for nonce length (24)

  ### Migration Guide

  **Before:**

  ```ts
  const symmetricCrypto = createSymmetricCrypto({ randomBytes });
  const { nonce, ciphertext } = symmetricCrypto.encrypt(plaintext, key);
  const result = symmetricCrypto.decrypt(ciphertext, key, nonce);
  ```

  **After:**

  ```ts
  const [ciphertext, nonce] = encryptWithXChaCha20Poly1305({ randomBytes })(
    plaintext,
    key,
  );
  const result = decryptWithXChaCha20Poly1305(ciphertext, nonce, key);
  ```

  **Error handling:**

  ```ts
  // Before
  if (!result.ok && result.error.type === "SymmetricCryptoDecryptError") { ... }

  // After
  if (!result.ok && result.error.type === "DecryptWithXChaCha20Poly1305Error") { ... }
  ```

  **Dependency injection:**

  ```ts
  // Before
  interface Deps extends SymmetricCryptoDep { ... }

  // After - only encrypt needs RandomBytesDep
  interface Deps extends RandomBytesDep { ... }
  ```

  ### Rationale

  This change improves API extensibility by using explicit function names instead of a generic interface. Adding new encryption algorithms (e.g., `encryptWithAES256GCM`) is now straightforward without breaking existing code.

- 4be336d: Refactored worker abstraction to support all platforms uniformly:
  - Added platform-agnostic worker interfaces: `Worker<Input, Output>`, `SharedWorker<Input, Output>`, `MessagePort<Input, Output>`, `MessageChannel<Input, Output>`
  - Added worker-side interfaces: `WorkerSelf<Input, Output>` and `SharedWorkerSelf<Input, Output>` for typed worker `self` wrappers
  - Changed `onMessage` from a method to a property for consistency with Web APIs
  - Made all worker and message port interfaces `Disposable` for proper resource cleanup
  - Added default generic parameters (`Output = never`) for simpler one-way communication patterns
  - Added complete web platform implementations: `createWorker`, `createSharedWorker`, `createMessageChannel`, `createWorkerSelf`, `createSharedWorkerSelf`, `createMessagePort`
  - Added React Native polyfills for Workers and MessageChannel

### Patch Changes

- Updated dependencies [6fc3bba]
- Updated dependencies [2f39c8e]
- Updated dependencies [98a4b6c]
- Updated dependencies [ce83b24]
- Updated dependencies [97f5314]
- Updated dependencies [5275b07]
- Updated dependencies [cd6b74d]
- Updated dependencies [5a4d172]
- Updated dependencies [87780a3]
- Updated dependencies [bfaa2ca]
- Updated dependencies [f0bbebb]
- Updated dependencies [332dfca]
- Updated dependencies [7da2364]
- Updated dependencies [6f1d6ea]
- Updated dependencies [0528425]
- Updated dependencies [5f97e83]
- Updated dependencies [7fe328d]
- Updated dependencies [3ba2a92]
- Updated dependencies [5720b0b]
- Updated dependencies [e948269]
- Updated dependencies [d1f817f]
- Updated dependencies [2abf93d]
- Updated dependencies [b956a5f]
- Updated dependencies [ece429b]
- Updated dependencies [d30b95a]
- Updated dependencies [953c1fb]
- Updated dependencies [9ba5442]
- Updated dependencies [3b74e48]
- Updated dependencies [c24ec2f]
- Updated dependencies [9373afa]
- Updated dependencies [4be336d]
  - @evolu/common@8.0.0-next.0

## 2.4.0

### Patch Changes

- Updated dependencies [1479665]
  - @evolu/common@7.4.0

## 2.3.0

### Patch Changes

- Updated dependencies [d957af4]
- Updated dependencies [a21a9fa]
- Updated dependencies [604940a]
- Updated dependencies [a04e86e]
- Updated dependencies [5f5a867]
  - @evolu/common@7.3.0

## 2.2.1

### Patch Changes

- 84f1663: Rename `Evolu` directory to `local-first`

  Reorganize internal directory structure to better reflect the local-first architecture. The `Evolu` directory in `src` is now named `local-first` across all packages.

  It's not breaking change unless `@evolu/common/evolu` was used (now its `@evolu/common/local-first`). The JSDoc called is "internal" so not considered as public API change.

- Updated dependencies [84f1663]
  - @evolu/common@7.2.1

## 2.2.0

### Patch Changes

- Updated dependencies [0830d8b]
  - @evolu/common@7.2.0

## 2.1.0

### Patch Changes

- Updated dependencies [be0ad00]
  - @evolu/common@7.1.0

## 2.0.0

### Major Changes

- dd3c865: - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
  - Added experimental jsdoc note to LocalAuth
  - Moved LocalAuth out of expo deps to it's own export

### Patch Changes

- Updated dependencies [36af10c]
- Updated dependencies [6452d57]
- Updated dependencies [eec5d8e]
- Updated dependencies [dd3c865]
- Updated dependencies [8f0c0d3]
- Updated dependencies [eec5d8e]
- Updated dependencies [6759c31]
- Updated dependencies [2f87ac8]
- Updated dependencies [6195115]
- Updated dependencies [eec5d8e]
- Updated dependencies [47386b8]
- Updated dependencies [202eaa3]
- Updated dependencies [f4a8866]
- Updated dependencies [eec5d8e]
- Updated dependencies [13b688f]
- Updated dependencies [a1dfb7a]
- Updated dependencies [45c8ca9]
- Updated dependencies [4a960c7]
- Updated dependencies [6279aea]
- Updated dependencies [02e8aa0]
- Updated dependencies [f5e4232]
- Updated dependencies [0911302]
- Updated dependencies [31d0d21]
- Updated dependencies [0777577]
- Updated dependencies [29886ff]
- Updated dependencies [eec5d8e]
- Updated dependencies [de37bd1]
- Updated dependencies [1d8c439]
- Updated dependencies [3daa221]
- Updated dependencies [eed43d5]
- Updated dependencies [05fe5d5]
- Updated dependencies [4a82c06]
  - @evolu/common@7.0.0

## 1.0.1-preview.7

### Patch Changes

- dd3c865: - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
  - Added experimental jsdoc note to LocalAuth
  - Moved LocalAuth out of expo deps to it's own export
- Updated dependencies [dd3c865]
  - @evolu/common@6.0.1-preview.23

## 1.0.1-preview.6

### Patch Changes

- 5c05d2e: Internal improvements and dependency updates
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
  - @evolu/common@6.0.1-preview.20

## 1.0.1-preview.5

### Patch Changes

- 899d647: Update SQLite and export createWasmSqliteDriver

## 1.0.1-preview.4

### Patch Changes

- 570d28d: Update @sqlite.org/sqlite-wasm to 3.50.3-build1

## 1.0.1-preview.3

### Patch Changes

- 45c8ca9: Add in-memory database support for testing and temporary data

  This change introduces a new `inMemory` configuration option that allows creating SQLite databases in memory instead of persistent storage. In-memory databases exist only in RAM and are completely destroyed when the process ends, making them ideal for:
  - Testing scenarios where data persistence isn't needed
  - Temporary data processing
  - Forensically safe handling of sensitive data

  **Usage:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    inMemory: true, // Creates database in memory instead of file
  });
  ```

- Updated dependencies [45c8ca9]
  - @evolu/common@6.0.1-preview.10

## 1.0.1-preview.2

### Patch Changes

- 2a37317: Update dependencies
- Updated dependencies [2a37317]
- Updated dependencies [39cbd9b]
  - @evolu/common@6.0.1-preview.3

## 1.0.1-preview.1

### Patch Changes

- 8ff21e5: GitHub release
- Updated dependencies [8ff21e5]
  - @evolu/common@6.0.1-preview.2

## 1.0.1-preview.0

### Patch Changes

- 632768f: Preview release
- Updated dependencies [632768f]
  - @evolu/common@6.0.1-preview.0

## 1.0.0

### Major Changes

- Updated to use new Evolu architecture
