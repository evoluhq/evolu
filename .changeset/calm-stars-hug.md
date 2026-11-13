---
"@evolu/vue": minor
---

Added useStore

`useStore(store)` returns the value of an Evolu `ReadonlyStore`, such as `evoluError` or `syncState` of the deps, in a ref that follows the store until the component's effect scope is disposed, as React's `useSyncExternalStore` does. Apps no longer mirror a store into a ref by hand. During server rendering, it reads the store once.

```ts
import { assertType, type ReadonlyStore, type SyncState } from "@evolu/common";
import { useStore } from "@evolu/vue";
import type { Ref } from "vue";

// Call composables in component setup.
const useSyncState = (syncState: ReadonlyStore<SyncState | null>) =>
  useStore(syncState);

assertType<ReturnType<typeof useSyncState>, Readonly<Ref<SyncState | null>>>();
```
