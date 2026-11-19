---
"@evolu/common": minor
"@evolu/react": minor
"@evolu/vue": minor
"@evolu/svelte": minor
---

Added deleteWhenUnused to useOwner and moved transports into options

An app that uses an owner temporarily, such as one for a shared document or a shard of a large list, may want to free that local storage afterwards. `evolu.deleteOwner` immediately deletes the owner's local rows across all tabs of that database, so calling it when a component unmounts would also remove rows another tab is still showing, along with local changes relays haven't received yet.

With `deleteWhenUnused: true`, Evolu keeps syncing the owner for 10 seconds after its last use in that database ends across all tabs, then deletes the owner's rows from the local database if every relay has received all of its changes by then. Like `evolu.deleteOwner`, this also deletes the owner's local-only table rows and refreshes queries, without calling `onOwnerDeleted` because nothing uses the owner then. Calling `useOwner` again within those 10 seconds cancels the deletion and keeps the rows, avoiding a re-download when a component remounts, relays change, or the user quickly returns to a page.

Rows stay on the device if the app closes before those 10 seconds elapse, if any relay still lacks changes when those 10 seconds end (including a relay dropped while another use continued or after one replaced it within those 10 seconds), or if any use while the owner was active didn't pass `deleteWhenUnused: true` or passed a `ReadonlyOwner` (even with `deleteWhenUnused: true`), which sends nothing, so Evolu can't tell whether relays have the owner's rows. In those cases, the rows stay until the owner is used with `deleteWhenUnused: true` and released again. `deleteWhenUnused: true` can't be used with the instance's own `AppOwner` (or an owner with its ID); use `evolu.deleteDatabase` instead.

`useOwner` now takes an options object (`UseOwnerOptions`) as its second argument instead of a transports array, so callers passing transports must wrap them in `{ transports }` (passing an array throws at runtime). `options` and `options.transports` remain optional on `Evolu.useOwner`, React's and Vue's `useOwner`, and Svelte's `ownerSync` (whose third argument now returns the options object), defaulting to `config.transports`. On `DeviceEvolu.useOwner`, `options` and `options.transports` remain required:

```ts
import {
  assertType,
  createOwnerWebSocketTransport,
  deriveShardOwner,
  RelayUrl,
  testAppOwner,
  type DeviceEvolu,
  type Evolu,
  type EvoluSchema,
  type UnuseOwner,
  type UseOwnerOptions,
} from "@evolu/common";
import { createEvoluBinding } from "@evolu/react";
import { useOwner as useVueOwner } from "@evolu/vue";

const shardOwner = deriveShardOwner(testAppOwner, ["movies", 1]);
const transport = createOwnerWebSocketTransport({
  url: RelayUrl.orThrow("wss://relay.example.com/"),
  ownerId: shardOwner.id,
});
const options: UseOwnerOptions = {
  transports: [transport],
  deleteWhenUnused: true,
};

const _before = (evolu: Evolu): UnuseOwner =>
  // @ts-expect-error Transports go in the options object.
  evolu.useOwner(shardOwner, [transport]);

const _after = (evolu: Evolu): UnuseOwner =>
  evolu.useOwner(shardOwner, options);

const _afterDefaultTransports = (evolu: Evolu): UnuseOwner =>
  evolu.useOwner(shardOwner, { deleteWhenUnused: true });

const _deviceBefore = (device: DeviceEvolu<EvoluSchema>): UnuseOwner =>
  // @ts-expect-error Transports go in the options object.
  device.useOwner(shardOwner, [transport]);

const _deviceWithoutTransports = (
  device: DeviceEvolu<EvoluSchema>,
): UnuseOwner =>
  // @ts-expect-error DeviceEvolu.useOwner requires transports in options.
  device.useOwner(shardOwner, { deleteWhenUnused: true });

const _deviceAfter = (device: DeviceEvolu<EvoluSchema>): UnuseOwner =>
  device.useOwner(shardOwner, {
    transports: [transport],
    deleteWhenUnused: true,
  });

const { useOwner: useReactOwner } = createEvoluBinding();
const useShardOwner = () => {
  // @ts-expect-error Transports go in the options object.
  useReactOwner(shardOwner, [transport]);
  useReactOwner(shardOwner, options);
};
assertType<ReturnType<typeof useShardOwner>, void>();

const useVueShardOwner = () => {
  // @ts-expect-error Transports go in the options object.
  useVueOwner(shardOwner, [transport]);
  useVueOwner(shardOwner, options);
};
assertType<ReturnType<typeof useVueShardOwner>, void>();
```

In Svelte, the third argument of `ownerSync` now returns the options object:

```svelte
<script lang="ts">
  // Before: ownerSync(evolu, () => shardOwner, () => [transport]);
  ownerSync(evolu, () => shardOwner, () => ({
    transports: [transport],
    deleteWhenUnused: true,
  }));
</script>
```
