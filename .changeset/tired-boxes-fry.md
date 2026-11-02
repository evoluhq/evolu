---
"@evolu/common": minor
---

Implemented Evolu.deleteOwner

`deleteOwner` was declared but threw, so an app couldn't remove one owner's data from a device without deleting the whole database, for example when a user removes a wallet ([#676](https://github.com/evoluhq/evolu/issues/676)). It now deletes the owner's rows from the instance's local database on this device, stops syncing the owner, and resolves once the rows are gone.

The deletion runs after the mutations and requests made before it. It deletes the owner's rows of every table, local-only tables included, and its history in one transaction, including tables a newer version of the app created. Then it ends every `useOwner` registration of the owner in every instance of the database, in every tab, so relays don't bring the rows back; other databases that use the owner keep it. Each instance of the database, including the one that asked, then calls `EvoluConfig.onOwnerDeleted`, which is now called, so the app stops showing the owner in one place, whichever tab deleted it. Subscribed queries load again right after, and until then they still return the owner's rows.

It deletes only this device's copy. Changes not yet synced are lost, relays keep the owner's data, and a later `useOwner` of the owner syncs it back, so stop using the owner first, such as by removing it from where the app lists it.

`deleteOwner` now takes a `ShardOwner`, `SharedOwner`, or `SharedReadonlyOwner` instead of any `Owner`, so passing the AppOwner, whose ID names the database, fails to compile; `deleteDatabase` deletes the whole database instead. It returns a promise of a `Result` instead of `void`. It fails with `UnknownError` when SQLite fails the deletion, which then deletes nothing, with the refusal's error when Evolu refused the database, and with `EvoluDisposedError` when its instance is disposed first. `onOwnerDeleted` receives the owner's ID instead of the owner, because other tabs never get the owner's keys.

```ts
import {
  assertType,
  type DeleteOwnerError,
  type Evolu,
  type EvoluConfig,
  type Owner,
  type OwnerId,
  type Result,
  type ShardOwner,
} from "@evolu/common";

const _deleteWalletBefore = (evolu: Evolu, wallet: Owner) =>
  // @ts-expect-error deleteOwner takes a ShardOwner, SharedOwner, or SharedReadonlyOwner, not any Owner, because the AppOwner is one.
  evolu.deleteOwner(wallet);

const _deleteAppOwner = (evolu: Evolu) =>
  // @ts-expect-error deleteOwner takes no AppOwner, which names the database.
  evolu.deleteOwner(evolu.appOwner);

const deleteWallet = (evolu: Evolu, wallet: ShardOwner) =>
  evolu.deleteOwner(wallet);

assertType<
  Awaited<ReturnType<typeof deleteWallet>>,
  Result<void, DeleteOwnerError>
>();

const _configBefore: Pick<EvoluConfig, "onOwnerDeleted"> = {
  // @ts-expect-error onOwnerDeleted receives the owner's ID, not the owner.
  onOwnerDeleted: (wallet: Owner) => {
    void wallet;
  },
};

const _config: Pick<EvoluConfig, "onOwnerDeleted"> = {
  onOwnerDeleted: (walletId: OwnerId) => {
    void walletId;
  },
};
```
