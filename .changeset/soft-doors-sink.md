---
"@evolu/react": minor
---

Added createEvoluApp support

`createEvoluBinding` gains `EvoluAppProvider`, which provides an app that `createEvoluApp` created. Its children get the instance of the AppOwner the tab has open, so `useEvolu` and the query hooks read that AppOwner's data, and they remount when the tab opens another AppOwner. While the tab has none open, such as after a removal, it renders `withoutAppOwner` instead, such as a choice to create or restore an AppOwner. `useEvoluApp` returns the app, `useAppOwners` follows the AppOwners on this device, and `useDeviceEvolu`, `useDeviceQuery`, and `useDeviceQueries` read the device database, whose schema is `createEvoluBinding`'s second type argument.

`useEvolu` and `EvoluContext` now type the instance as `AppOwnerEvolu`, an `Evolu` without `Symbol.asyncDispose`, because the app disposes the instances it opens, so a helper that takes `useEvolu()`'s value declares `AppOwnerEvolu<S>` instead of `Evolu<S>`.

```ts
import {
  assertType,
  id,
  NonEmptyTrimmedString100,
  type AppOwnerEvolu,
  type Evolu,
  type Name,
} from "@evolu/common";
import { createEvoluBinding } from "@evolu/react";

const Schema = { todo: { id: id("Todo"), title: NonEmptyTrimmedString100 } };
type Schema = typeof Schema;
const { useEvolu } = createEvoluBinding<Schema>();

const oldNameOf = (evolu: Evolu<Schema>) => evolu.name;
const nameOf = (evolu: AppOwnerEvolu<Schema>) => evolu.name;

// Call hooks in components.
const useDatabaseName = () => {
  // @ts-expect-error -- An AppOwnerEvolu has no Symbol.asyncDispose, so it isn't an Evolu.
  oldNameOf(useEvolu());
  return nameOf(useEvolu());
};

assertType<ReturnType<typeof useDatabaseName>, Name>();
```
