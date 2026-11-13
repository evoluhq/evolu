---
"@evolu/svelte": minor
---

Added evoluAppState for createEvoluApp

`evoluAppState(app)` follows an app that `createEvoluApp` created and returns an `EvoluAppState`, whose `state` and `appOwners` update when it changes. `state` is an `AppOwnerState`: `None` while the tab has no AppOwner open, `Opening` with the `current` AppOwner while its instance opens, and `Open` with `current` and `evolu`, the instance. A component renders `{#if appState.state.type === "Open"}{#key appState.state.evolu}` with the AppOwner's UI, which the key remounts when the tab opens another AppOwner, and passes the instance to `queryState`. While the state is `None`, such as after a removal, it shows a choice such as to create or restore an AppOwner. Like `queryState`, it creates an `$effect`, so call it during component initialization.

`queryState` now takes any instance, also `AppOwnerEvolu` and the device database's `app.device`, not only an `Evolu`.
