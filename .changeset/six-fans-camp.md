---
"@evolu/vue": minor
---

Added createEvoluApp support

`EvoluAppProvider` provides an app that `createEvoluApp` created. Its default slot gets the instance of the AppOwner the tab has open, so `useEvolu`, the query composables, `useOwner`, and `useOwnerSyncStatus` read that AppOwner's data, and the slot remounts when the tab opens another AppOwner. While the tab has none open, such as after a removal, it renders the `withoutAppOwner` slot instead, such as a choice to create or restore an AppOwner, and while the AppOwner's instance opens, the `opening` slot. `useEvoluApp` returns the app, to open, add, or remove an AppOwner, `useAppOwners` follows the AppOwners on this device, and `useDeviceEvolu`, `useDeviceQuery`, and `useDeviceQueries` read the device database. `createEvoluBinding` returns a `VueBinding`: `useEvolu`, `useEvoluApp`, `useDeviceEvolu`, and the query composables typed with the app's schema and its device schema, so `useDeviceQuery` rejects a query of the app's tables.

`useEvolu` and `createUseEvolu` now type the instance as `AppOwnerEvolu`, an `Evolu` without `Symbol.asyncDispose`, because the components don't own it, so a helper that takes `useEvolu()`'s value declares `AppOwnerEvolu<S>` instead of `Evolu<S>`. `provideEvolu` and `EvoluProvider` accept either. `createUseEvolu` is deprecated: `createEvoluBinding<S>().useEvolu` returns the same instance, also for an app that `createEvolu` created.

```ts
import {
  assertType,
  type AppOwnerEntry,
  type AppOwnerEvolu,
  type Evolu,
  type EvoluApp,
  type EvoluSchema,
  type Name,
} from "@evolu/common";
import {
  createEvoluBinding,
  EvoluAppProvider,
  useAppOwners,
  useEvolu,
} from "@evolu/vue";
import { h, type Ref, type VNode } from "vue";

// The app is awaited, such as in `<script setup>` under `<Suspense>`.
const renderApp = (app: EvoluApp<EvoluSchema>) =>
  h(
    EvoluAppProvider,
    { app },
    {
      default: () => h("p", "The open AppOwner's data"),
      withoutAppOwner: () => h("p", "Create or restore an AppOwner"),
      opening: () => h("p", "Opening"),
    },
  );

const oldNameOf = (evolu: Evolu) => evolu.name;
const nameOf = (evolu: AppOwnerEvolu<EvoluSchema>) => evolu.name;

// Call composables in component setup.
const useDatabaseName = () => {
  // @ts-expect-error -- An AppOwnerEvolu has no Symbol.asyncDispose, so it isn't an Evolu.
  oldNameOf(useEvolu());
  return nameOf(useEvolu());
};

assertType<
  [ReturnType<typeof useDatabaseName>, ReturnType<typeof useAppOwners>],
  [Name, Readonly<Ref<ReadonlyArray<AppOwnerEntry>>>]
>();
assertType<ReturnType<typeof renderApp>, VNode>();

// Typed with the app's schema and its device schema.
const { useEvoluApp } = createEvoluBinding<EvoluSchema>();
assertType<ReturnType<typeof useEvoluApp>, EvoluApp<EvoluSchema>>();
```
