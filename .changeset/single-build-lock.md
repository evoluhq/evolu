---
"@evolu/common": patch
"@evolu/react-native": patch
"@evolu/react-web": patch
"@evolu/web": patch
---

Fixed a new app version not working while an older one was open in another tab

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

The web `createEvoluDeps` accepts a custom `reloadApp`, and the default one now
reloads the current page instead of loading `/`. The React web
`createEvoluDeps` now accepts the same options as the web one, including
`onSharedWorkerUnsupported`.

Update `@evolu/web` together with `@evolu/common`; with an older `@evolu/web`,
queries never complete. A custom platform adapter must forward the new
`Connected` message. On React Native, Evolu keeps working after Fast Refresh
recreates its dependencies.
