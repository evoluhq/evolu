---
"@evolu/common": patch
"@evolu/react-native": patch
"@evolu/web": patch
---

Fixed tabs of a new app build staying unresponsive after a tab of another build closed

When tabs of two app builds with different shared worker scripts were open at
once, such as an old tab during a deploy that updated Evolu, the new build's
shared worker failed on its first database request, and its tabs stayed
unresponsive even after the old tab closed.

The shared worker now holds an origin-wide lock for its lifetime, so one shared
worker at a time uses the local databases. A tab of another build waits, with
its requests queued, until every tab of the running build is closed or reloaded,
and then continues. Releases before this one take the same lock in their leader
tab, so they are excluded too, and separately built Evolu apps on one origin
take turns the same way. A tab of an earlier release that opens while this
release's worker runs gets no response to its database requests and no error.
It needs a reload, and until then it also blocks tabs of this release opened
after the lock is freed. Safari suspends the worker of a build
whose tabs are all in its back-forward cache without releasing the lock, so
there a waiting build also waits until Safari drops those pages. On React
Native, every `createEvoluDeps` call in a JS runtime now connects to one
in-process worker, so deps created again, for example after Fast Refresh, keep
working.

`SharedWorkerOutput` has a new `Connected` message, which carries the worker's
`SharedWorkerId` and the name of its sync state channel. Tabs start a database
worker only after receiving it. `@evolu/web` 3.1.2 and earlier drop it, so
update `@evolu/web` together with `@evolu/common`; with an older `@evolu/web`,
queries and mutations never complete. A custom platform adapter must forward
`Connected` too, and because `initSharedWorker` now holds the lock until it is
disposed, it must connect every `createEvoluDeps` call in a JS runtime to one
worker, as React Native now does.
