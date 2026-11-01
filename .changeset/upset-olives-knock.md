---
"@evolu/common": patch
"@evolu/web": patch
"@evolu/react-native": patch
---

Kept a database in memory apart from the stored database of the same owner

Instances of one `appName` and `appOwner` shared one database whatever their mode, and it kept the mode of the instance that opened it ([#742](https://github.com/evoluhq/evolu/issues/742)). A `memoryOnly` instance created while a stored one was open, or within a few seconds after it was disposed, as an app does to stop keeping data on the device, wrote to the stored database, local-only tables included. A stored instance created while a `memoryOnly` one was open lost the changes that hadn't synced when the memory database closed.

A database kept in memory, with `memoryOnly` or where the platform offers no persistent storage, as in Safari's Private Browsing, now has a name of its own, `${appName}-${createIdFromString("MemoryDatabase", appOwner.id)}`, so it never shares a local database with the stored one. `Evolu.name` changes for such instances. Instances kept in memory still share one memory database across tabs, as stored instances share the stored one. Both still sync the owner, so while a stored instance of the owner syncs on the device, it stores the changes made in memory too; to keep nothing on the device, dispose it first.

Each tab now checks whether the browser offers persistent storage when it creates an instance without `memoryOnly`, instead of the shared worker checking once for all its tabs, and `evolu.devicePersistence` resolves when `createEvolu` does.

Update `@evolu/web` and `@evolu/react-native` together with `@evolu/common`: with an older one, `createEvolu` throws because its deps have no `getDevicePersistence`, and an older `@evolu/common` cannot start the new web shared worker.

Custom platform integrations: `EvoluPlatformDeps` now requires `getDevicePersistence`, the `DevicePersistenceDep` that `SharedWorkerDeps` no longer takes, and the `OnDevicePersistence` message is gone. Local-first APIs aren't stable yet, so these incompatible changes ship as a patch; see [Updating](https://www.evolu.dev/docs/local-first#updating).
