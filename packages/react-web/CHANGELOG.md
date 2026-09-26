# @evolu/react-web

## 3.1.0

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

- Updated dependencies [f0101ca]
- Updated dependencies [fdac39e]
- Updated dependencies [ecbac00]
- Updated dependencies [b506c9b]
- Updated dependencies [e45a549]
- Updated dependencies [fdac39e]
- Updated dependencies [d2973b9]
- Updated dependencies [b75abfa]
- Updated dependencies [69b756c]
- Updated dependencies [5a671b2]
- Updated dependencies [e270e42]
- Updated dependencies [ef320ff]
- Updated dependencies [a0c716a]
- Updated dependencies [5a671b2]
- Updated dependencies [09b1b5c]
- Updated dependencies [fdac39e]
- Updated dependencies [0770038]
- Updated dependencies [e270e42]
- Updated dependencies [f52d66b]
- Updated dependencies [d17ce92]
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
  - @evolu/web@3.2.0

## 3.0.3

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
- Updated dependencies [9fc736f]
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
  - @evolu/web@3.1.2

## 3.0.2

### Patch Changes

- 037c390: Required Node.js 24.20 or newer

  Evolu packages now require Node.js 24.20 or newer, matching the repository's tested LTS baseline.

## 3.0.1

### Patch Changes

- 13ee2e8: Updated internal peer dependency ranges to require stable releases.

## 3.0.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)
- 0528425: - Merged `@evolu/common/local-first/Platform.ts` into `@evolu/common/Platform.ts`
  - Made `@evolu/react-web` re-export everything from `@evolu/web`, allowing React users to install only `@evolu/react-web`
- 4be336d: Refactored worker abstraction to support all platforms uniformly:

  - Added platform-agnostic worker interfaces: `Worker<Input, Output>`, `SharedWorker<Input, Output>`, `MessagePort<Input, Output>`, `MessageChannel<Input, Output>`
  - Added worker-side interfaces: `WorkerSelf<Input, Output>` and `SharedWorkerSelf<Input, Output>` for typed worker `self` wrappers
  - Changed `onMessage` from a method to a property for consistency with Web APIs
  - Made all worker and message port interfaces `Disposable` for proper resource cleanup
  - Added default generic parameters (`Output = never`) for simpler one-way communication patterns
  - Added complete web platform implementations: `createWorker`, `createSharedWorker`, `createMessageChannel`, `createWorkerSelf`, `createSharedWorkerSelf`, `createMessagePort`
  - Added React Native polyfills for Workers and MessageChannel

## 3.0.0-next.0

### Major Changes

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)
- 0528425: - Merged `@evolu/common/local-first/Platform.ts` into `@evolu/common/Platform.ts`
  - Made `@evolu/react-web` re-export everything from `@evolu/web`, allowing React users to install only `@evolu/react-web`
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
  - @evolu/web@3.0.0-next.0

## 2.4.0

### Patch Changes

- Updated dependencies [1479665]
  - @evolu/common@7.4.0
  - @evolu/web@2.4.0

## 2.3.0

### Patch Changes

- Updated dependencies [d957af4]
- Updated dependencies [a21a9fa]
- Updated dependencies [604940a]
- Updated dependencies [a04e86e]
- Updated dependencies [5f5a867]
  - @evolu/common@7.3.0
  - @evolu/web@2.3.0

## 2.2.1

### Patch Changes

- 84f1663: Rename `Evolu` directory to `local-first`

  Reorganize internal directory structure to better reflect the local-first architecture. The `Evolu` directory in `src` is now named `local-first` across all packages.

  It's not breaking change unless `@evolu/common/evolu` was used (now its `@evolu/common/local-first`). The JSDoc called is "internal" so not considered as public API change.

- Updated dependencies [84f1663]
  - @evolu/common@7.2.1
  - @evolu/web@2.2.1

## 2.2.0

### Patch Changes

- Updated dependencies [0830d8b]
  - @evolu/common@7.2.0
  - @evolu/web@2.2.0

## 2.1.0

### Patch Changes

- Updated dependencies [be0ad00]
  - @evolu/common@7.1.0
  - @evolu/web@2.1.0

## 2.0.0

### Major Changes

- dd3c865: - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
  - Added experimental jsdoc note to LocalAuth
  - Moved LocalAuth out of expo deps to it's own export
- f4a8866: Add owner usage tracking and storage improvements

  ### Breaking Changes
  - Renamed `TransportConfig` to `OwnerTransport` and `WebSocketTransportConfig` to `OwnerWebSocketTransport` for clearer naming
  - Renamed `SqliteStorageBase` to `BaseSqliteStorage` and `createSqliteStorageBase` to `createBaseSqliteStorage`
  - Extracted storage table creation into separate functions: `createBaseSqliteStorageTables` and `createRelayStorageTables` to support serverless deployments where table setup must be separate from storage operations
  - Removed `assertNoErrorInCatch` - it was unnecessary

  ### Features
  - **Owner usage tracking** (in progress): Added `evolu_usage` table and `OwnerUsage` interface to track data consumption metrics per owner (stored bytes, received bytes, sent bytes, first/last timestamps). Table structure is in place but not yet fully implemented
  - **Timestamp privacy documentation**: Added privacy considerations explaining that timestamps are metadata visible to relays, with guidance on implementing local write queues for maximum privacy
  - **React Native polyfills**: Added polyfills for `AbortSignal.any()` and `AbortSignal.timeout()` to support Task cancellation on React Native platforms that don't yet implement these APIs

  ### Performance
  - **isSqlMutation optimization**: Added LRU cache (10,000 entries) to `isSqlMutation` function, restoring Timestamp insert benchmark from 34k back to 57k inserts/sec.

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
  - @evolu/web@2.0.0

## 1.0.1-preview.7

### Patch Changes

- 184b555: Move EvoluIdenticon to components
- Updated dependencies [a957aa0]
  - @evolu/common@6.0.1-preview.27
  - @evolu/web@1.0.1-preview.7

## 1.0.1-preview.6

### Patch Changes

- f4a8866: Add owner usage tracking and storage improvements

  ### Breaking Changes
  - Renamed `TransportConfig` to `OwnerTransport` and `WebSocketTransportConfig` to `OwnerWebSocketTransport` for clearer naming
  - Renamed `SqliteStorageBase` to `BaseSqliteStorage` and `createSqliteStorageBase` to `createBaseSqliteStorage`
  - Extracted storage table creation into separate functions: `createBaseSqliteStorageTables` and `createRelayStorageTables` to support serverless deployments where table setup must be separate from storage operations
  - Removed `assertNoErrorInCatch` - it was unnecessary

  ### Features
  - **Owner usage tracking** (in progress): Added `evolu_usage` table and `OwnerUsage` interface to track data consumption metrics per owner (stored bytes, received bytes, sent bytes, first/last timestamps). Table structure is in place but not yet fully implemented
  - **Timestamp privacy documentation**: Added privacy considerations explaining that timestamps are metadata visible to relays, with guidance on implementing local write queues for maximum privacy
  - **React Native polyfills**: Added polyfills for `AbortSignal.any()` and `AbortSignal.timeout()` to support Task cancellation on React Native platforms that don't yet implement these APIs

  ### Performance
  - **isSqlMutation optimization**: Added LRU cache (10,000 entries) to `isSqlMutation` function, restoring Timestamp insert benchmark from 34k back to 57k inserts/sec.

- Updated dependencies [f4a8866]
- Updated dependencies [02e8aa0]
- Updated dependencies [31d0d21]
  - @evolu/common@6.0.1-preview.26
  - @evolu/web@1.0.1-preview.7

## 1.0.1-preview.5

### Patch Changes

- dd3c865: - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
  - Added experimental jsdoc note to LocalAuth
  - Moved LocalAuth out of expo deps to it's own export
- Updated dependencies [dd3c865]
  - @evolu/common@6.0.1-preview.23
  - @evolu/web@1.0.1-preview.7

## 1.0.1-preview.4

### Patch Changes

- 5c05d2e: Internal improvements and dependency updates
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [eec5d8e]
- Updated dependencies [5c05d2e]
- Updated dependencies [eec5d8e]
  - @evolu/common@6.0.1-preview.20
  - @evolu/web@1.0.1-preview.6

## 1.0.1-preview.3

### Patch Changes

- 2f30dcd: Update deps
- Updated dependencies [2f30dcd]
- Updated dependencies [4a82c06]
  - @evolu/common@6.0.1-preview.18
  - @evolu/web@1.0.1-preview.4

## 1.0.1-preview.2

### Patch Changes

- 2a37317: Update dependencies
- Updated dependencies [2a37317]
- Updated dependencies [39cbd9b]
  - @evolu/common@6.0.1-preview.3
  - @evolu/web@1.0.1-preview.2

## 1.0.1-preview.1

### Patch Changes

- 8ff21e5: GitHub release
- Updated dependencies [8ff21e5]
  - @evolu/common@6.0.1-preview.2
  - @evolu/web@1.0.1-preview.1

## 1.0.1-preview.0

### Patch Changes

- 632768f: Preview release
- Updated dependencies [632768f]
  - @evolu/common@6.0.1-preview.0
  - @evolu/web@1.0.1-preview.0

## 1.0.0

### Major Changes

- Updated to use new Evolu architecture
