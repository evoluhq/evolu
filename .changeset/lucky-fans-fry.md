---
"@evolu/svelte": minor
---

Added storeState

`storeState(store)` follows an Evolu `ReadonlyStore`, such as `evoluError` or `syncState` of `evoluSvelteDeps`, and returns an object whose `current` is the store's value, as React's `useSyncExternalStore` does and as Svelte's `fromStore` names it. Apps no longer mirror a store into `$state` by hand, which missed a change made between the first render and the effect's subscription: `storeState` reads the store again once subscribed. Like `queryState`, it creates an `$effect`, so call it during component initialization.
