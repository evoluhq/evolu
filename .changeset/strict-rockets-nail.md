---
"@evolu/svelte": patch
---

Simplified queryState and removed appOwnerState

`queryState` no longer takes a `mapping` option. The option never applied: `rows` always held the query rows, though typed as the mapped rows. Derive mapped rows with `$derived` instead, which also updates when state read by the mapping changes.

`rows` is now the readonly `QueryRows` array Evolu returns, as with `useQuery` in React and Vue. `queryState` previously stored rows in deep `$state`, so `rows` held proxies, and every update gave even unchanged rows a new identity. Mutating `rows` no longer updates the UI.

`appOwnerState` was removed. `evolu.appOwner` is available as soon as Evolu is created, so `appOwnerState` only delayed it: its `current` was `undefined` until an effect ran. Read `evolu.appOwner` directly.

```svelte
<script lang="ts">
  // Before: queryState(evolu, () => allTodos, { mapping: (row) => row.title });
  const todos = queryState(evolu, () => allTodos);
  const titles = $derived(todos.rows.map((row) => row.title));

  // Before: appOwnerState(evolu).current?.mnemonic
  const mnemonic = evolu.appOwner.mnemonic;
</script>
```
