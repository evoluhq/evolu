---
"@evolu/common": minor
---

Added createEvoluApp, which creates and keeps the app's AppOwners

An app no longer has to create, store, and reopen its AppOwner itself, as the examples did with the public `testAppOwner`. `createEvoluApp` keeps the app's AppOwners in a device database and opens the one opened last, or the one `startAppOwnerId` names. With `createFirstAppOwner: true`, the first start creates one, so the app starts with an AppOwner. `appOwners` lists them; `open`, `add`, `rename`, and `remove` change them; and `current` holds the open AppOwner with its Evolu instance. `subscribeAppOwnerState` follows `current` as an `AppOwnerState`: `None`, `Opening` while the instance opens, or `Open` with it, as the UI bindings do. `device` is the device database's instance for the app's own data that belongs to the device, such as settings. It takes no AppOwner. Its `useOwner` takes transports, because it has none by default. A mutation of one of its synced tables takes the `owner` it syncs with.

The `auth` option encrypts the device database, which holds the AppOwners' secrets. `{ type: "InstantStart" }` needs no prompt, but its key is public, so anything that can read the app's storage can read those secrets. `{ type: "DeviceSecret", secret }` takes a secret only the user or the platform can unlock. On the web, `unlockWrappedDeviceSecret` creates and unlocks one with a key provider, such as `@evolu/web`'s passkeys, `hasWrappedDeviceSecret` tells whether one is stored, and `forgetWrappedDeviceSecret` starts over, with `onlyPending` only while no secret is stored. [Privacy](https://www.evolu.dev/docs/privacy#encryption-on-the-device) says what each mode protects.

Apps that bring their own AppOwners, such as ones derived from a hardware wallet, keep calling `createEvolu`. `createEvoluApp` replaces Evolu 7's `restoreAppOwner` and `resetAppOwner`, which Evolu 8 removed: `add` restores an AppOwner from the secret `mnemonicToOwnerSecret` derives from its mnemonic, and to start over, an app adds a new AppOwner, then removes the old one.

```ts
import {
  AppName,
  assertEqual,
  assertOk,
  createEvoluApp,
  createOwnerSecret,
  id,
  NonEmptyTrimmedString100,
  subscribeAppOwnerState,
  type AppOwnerState,
} from "@evolu/common";
import { createEvoluDeps, createRun } from "@evolu/web";

const Schema = { todo: { id: id("Todo"), title: NonEmptyTrimmedString100 } };
const run = createRun(createEvoluDeps());

await using app = await run.orThrow(
  createEvoluApp(Schema, {
    appName: AppName.orThrow("todos"),
    auth: { type: "InstantStart" },
    createFirstAppOwner: true,
    transports: [],
  }),
);
// The first start created an AppOwner and opened it.
assertEqual(app.appOwners.get().length, 1);

// An added AppOwner opens at once.
const added = await app.add(createOwnerSecret(run.deps));
assertOk(added);
assertEqual(app.current.get()?.appOwner.id, added.value);

// Without a UI binding, the app follows the open AppOwner itself.
const states: Array<AppOwnerState<typeof Schema>["type"]> = [];
const unsubscribe = subscribeAppOwnerState(app.current, (state) => {
  states.push(state.type);
});
await app.current.get()?.evolu;
assertEqual(states, ["Opening", "Open"]);
unsubscribe();
```

The `DeviceAppOwner` type is gone. It described an owner of a local-only instance for the device's data, kept in secure storage that Evolu didn't provide. `createEvoluApp`'s `device` instance is that instance now, with an owner it derives from `auth`, so type an owner of your own as `AppOwner`.

```ts
import { assertType, type AppOwner } from "@evolu/common";
// @ts-expect-error -- DeviceAppOwner is gone; type an owner of your own as AppOwner.
import type { DeviceAppOwner } from "@evolu/common"; // oxlint-disable-line no-unused-vars -- Only shows that the type is gone.

// An owner of the app's own, such as one derived from a hardware wallet.
const ownerIdOf = (owner: AppOwner) => owner.id;

assertType<Parameters<typeof ownerIdOf>, [AppOwner]>();
```
