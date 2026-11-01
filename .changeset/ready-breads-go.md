---
"@evolu/common": minor
"@evolu/web": minor
"@evolu/react-native": patch
"@evolu/react": patch
---

Implemented Evolu.deleteDatabase

`deleteDatabase` was declared but threw, so an app couldn't wipe its local data, for example when a user resets the app or removes an account from a device ([#676](https://github.com/evoluhq/evolu/issues/676)). It now deletes the instance's local database on this device and resolves once the database's files are gone, which lets the app wait for the wipe to finish.

The deletion runs after the mutations and requests made before it. Then every instance of the database disposes itself, in every tab, and the requests they made after the deletion are dropped. Each instance, including the one that asked, first calls `EvoluConfig.onDatabaseDeleted`, which is now called, or reloads the app when it's not set, because rendering a disposed instance throws. Until the app reloads or provides another instance, `@evolu/react` keeps the components that use the disposed one suspended instead of throwing, and other bindings can check the new `isDatabaseDeleted`. On the web, the deletion also removes the database's OPFS directory, whose name would show which owner used the device. A database kept in memory, as with `memoryOnly`, has a name of its own and no files, so deleting it leaves a stored database of the same owner alone.

It deletes only this device's copy. Changes not yet synced are lost, and an instance created later with the same owner opens a new, empty database, which its transports fill again from relays, so forget the owner first if its data must not come back.

`deleteDatabase` now returns a promise of a `Result` instead of `void`. It fails with `DatabaseHeldError` when another context keeps holding the files, and with `UnknownError` when the platform fails to delete them. After an `UnknownError`, the instances keep working, and calling it again deletes again. After a `DatabaseHeldError`, the database's next worker waits for the files as every startup does, and Evolu refuses the database when they stay held. It fails with the new `EvoluDisposedError` when its instance is disposed first, so await it before disposing. `exportDatabase` already rejected with that error, which is now a declared type.

```ts
import {
  assertType,
  type DeleteDatabaseError,
  type Evolu,
  type Result,
} from "@evolu/common";

const deleteLocalData = (evolu: Evolu) => evolu.deleteDatabase();

assertType<
  Awaited<ReturnType<typeof deleteLocalData>>,
  Result<void, DeleteDatabaseError>
>();
```

Custom platform integrations: `DbWorkerDeps` now requires `deleteDatabaseFiles`, a `DeleteDatabaseFiles` that deletes a database's files by name. `@evolu/web` exports its `createDeleteDatabaseFiles`.
