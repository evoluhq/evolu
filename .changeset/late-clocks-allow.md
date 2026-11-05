---
"@evolu/common": minor
"@evolu/web": patch
"@evolu/react-native": patch
---

Kept memory databases separate for each instance

Instances of one app and owner that kept their database in memory, with
`memoryOnly` or where the browser refuses storage, shared one memory database,
and on the web one of their tabs hosted it. Closing that tab emptied the other
tabs' memory databases and lost their unsynced changes. Each memory instance now
has its own database under a random `Evolu.name`, and on the web its own tab
runs its workers. Stored databases are unchanged.

A memory instance loses its data when it ends, including when its tab closes,
navigates away, or enters the back-forward cache. On the web, it exchanges
changes with other instances, stored instances of the same owner included, only
through relays, so not offline. It opens its own relay connections, so a relay
can appear in `deps.syncState` once per worker.

Where the browser refuses storage, Evolu no longer reloads the tab when another
tab loads a new version of the app. Where storage is available, it still may,
and the reload ends `memoryOnly` instances too.

Update `@evolu/web` and `@evolu/react-native` together with `@evolu/common`;
with an older adapter, `evoluError` reports an `UnknownError` and instances
never load. Custom platform integrations pass `createStoredWorker` to
`createEvoluDeps` instead of `sharedWorker`, and may pass the new
`createMemoryInstanceWorker` to run each memory instance in a worker of its
own. Code that runs `createEvolu` with its own deps provides `storedWorker`.
