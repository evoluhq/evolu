# evolu

## 1.0.1

### Patch Changes

- f2c88d3: Use SQLite without rowid

  A WITHOUT ROWID table is an optimization that can reduce storage and processing requirements.

## 1.0.0

### Major Changes

- 0ed4d15: Release 1.0

## 0.12.3

### Patch Changes

- 004f6f2: Move fp-ts from peer deps to deps

## 0.12.2

### Patch Changes

- bafed45: Ensure DbSchema for received messages

## 0.12.1

### Patch Changes

- 63cd8e7: Export perf utils

  - logTaskEitherDuration
  - logReaderTaskEitherDuration

## 0.12.0

### Minor Changes

- 277d80e: Replace OpenPGP.js with micro-aes-gcm

## 0.11.0

### Minor Changes

- d010dea: Add createExpressApp

  Now everybody can run their own Evolu sync&backup server.

  ```ts
  import { createExpressApp } from "evolu/server";

  const app = createExpressApp();

  app.get("/ping", (req, res) => {
    res.send("ok");
  });

  // eslint-disable-next-line turbo/no-undeclared-env-vars
  const port = process.env.PORT || 4000;

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server is listening at http://localhost:${port}`);
  });
  ```

## 0.10.4

### Patch Changes

- c803352: Remove RowsCache GC

  We will make better.

## 0.10.3

### Patch Changes

- 09dc778: Update SQLite

  This version only removes debug console.log output.

## 0.10.2

### Patch Changes

- 8ddc92f: Reduce the size of the library by 11kb

## 0.10.1

### Patch Changes

- bb0d128: Improve mnemonic code

  - fix validateMnemonic checksum
  - replace custom mnemonic code with audited lib @scure/bip39
  - import code on demand to decrease library size

## 0.10.0

### Minor Changes

- ec3755a: Switch to the official sqlite3 WASM client with a friendly MIT license

  Evolu no longer uses IndexedDB for persisting sqlite3 files. Instead, it uses modern Origin-Private FileSystem (OPFS) in Chrome and good old LocalStorage in other browsers.

  The LocalStorage implementation leverages VFS, so it doesn't load and save whole files. In other words, it's fast enough. The only limit is LocalStorage max size (5MB), which is sufficient unless a lot of data are stored.

  The Origin-Private FileSystem (OPFS) is currently supported only in Chrome, but both Safari and Firefox are finishing their support. Meanwhile, Evolu is using LocalStorage.

  We recommend Chrome OPFS Explorer extension to download the sqlite3 file.

## 0.9.3

### Patch Changes

- ce68694: Add README.md to NPM

## 0.9.2

### Patch Changes

- 108d20d: Fix sync called before updateDbSchema

## 0.9.1

### Patch Changes

- 8ff7e3a: Fix reloadAllTabs bug

  If the browser is going to be reloaded, all DB operations have to be skipped.

## 0.9.0

### Minor Changes

- 6417799: Add useQuery filterMap

## 0.8.0

### Minor Changes

- 36a3cab: Remove logging

  It didn't do much, and I'll make it better anyway.

### Patch Changes

- 6ec12ff: Refactor global config to ConfigEnv

## 0.7.5

### Patch Changes

- 2216d7f: Make float-integer conversion more explicit

## 0.7.4

### Patch Changes

- 95adfb6: Fix a bug causing SyncError

## 0.7.3

### Patch Changes

- 389883a: Add missing react-dom peer dependency

## 0.7.2

### Patch Changes

- 2cb1af4: Memoize useQuery return value

  So it can be used with useDeferredValue.

## 0.7.1

### Patch Changes

- c171392: Run mutate onComplete after React flushSync

  Using mutate onComplete is rare because Evolu updates active queries automatically. We need onComplete typically when dealing with DOM, for example, moving focus for keyboard navigation. For such cases, onComplete must be called when DOM is already updated, and this update ensures it via React flushSync.

## 0.7.0

### Minor Changes

- abad8f5: Purge cache on a mutation

  Before this change, Evolu cached all queries forever. Caching forever is not a real issue because, sooner or later, users will reload the tab or browser itself. But UX could have been better. Imagine a situation when a user goes from page A to page B and then back. Without a mutation, everything is OK, and the user will see the valid data from the cache. But when a mutation is made, obsolete data will flash for milliseconds. While this is OK for server-loaded data (better stale than dead), there is absolutely no reason to favor stale over actual data for local-first apps because fetching is super fast and will never fail.

## 0.6.0

### Minor Changes

- e193754: Replace rfc6902 and immutable-json-patch with custom and much faster algorithm.

  For now, we detect only a change in the whole result and in-place edits. In the future, we will add more heuristics. We will probably not implement the Myers diff algorithm because it's faster to rerender all than to compute many detailed patches. We will only implement a logic a developer would implement manually, if necessary.

## 0.5.1

### Patch Changes

- 02a8c47: Publish README.md

## 0.5.0

### Minor Changes

- b957aea: Add has helper

  Helper `has` filters items with NonNullable props with type refinement. It helps filter yet-to-be-synced data.

## 0.4.1

### Patch Changes

- 8d29b99: Fix ESM bug

## 0.4.0

### Minor Changes

- 74a94ee: Add config reloadUrl

## 0.3.1

### Patch Changes

- 15fa758: Make useMutation mutate stable

## 0.3.0

### Minor Changes

- fcdbff9: Add onComplete to mutate function

## 0.2.2

### Patch Changes

- 127f1ae: Add SQLiteError

  This error should happen only in Firefox's private mode, which does not support IndexedDB.

## 0.2.1

### Patch Changes

- fd03f74: Fix useEvoluFirstDataAreLoaded bug.

  Empty table did not generate any patch so onQuery did not update rowsCache.

## 0.2.0

### Minor Changes

- 96a0954: Add useEvoluFirstDataAreLoaded React Hook

  React Hook returning `true` if any data are loaded. It's helpful to prevent screen flickering as data are loading. React Suspense would be better, but we are not there yet.

## 0.1.7

### Patch Changes

- ec6d9f2: Add isLoaded to useQuery React Hook

## 0.1.6

### Patch Changes

- d903dd2: Refactor types

## 0.1.5

### Patch Changes

- 3a78e4c: Remove dev comment

## 0.1.4

### Patch Changes

- 309f99f: Publish Evolu source code to NPM

  "I get so annoyed when "go to definition" just takes me to typescript def files rather than actual code."

## 0.1.3

### Patch Changes

- fee19a7: Expose Zod string and number

## 0.1.2

### Patch Changes

- 5244c0c: Kysely 0.22.0 and remove a mutation from its interface

## 0.1.1

### Patch Changes

- 5d820a1: Add some TS comments

## 0.1.0

### Minor Changes

- a0fab5e: Add Evolu test server for sync and backup
