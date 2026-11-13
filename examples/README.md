# Examples

Each example is one full app with the same schema, projects and their todos,
and implements the same checklist in its framework's idiom. Agents copy
examples, so none of them shows an incomplete pattern.

## Auth modes

`createEvoluApp` keeps the app's AppOwners in a device database, which its
`auth` unlocks. The mode is fixed per `appName`; see
[docs/adr/evolu-creates-and-stores-app-owners.md](../docs/adr/evolu-creates-and-stores-app-owners.md).

| Example           | Auth                                       |
| ----------------- | ------------------------------------------ |
| `react-vite-pwa`  | Passkey, the canonical React web app       |
| `react-nextjs`    | Instant start                              |
| `react-electron`  | Instant start, until `safeStorage` (#782)  |
| `vue-vite-pwa`    | Instant start                              |
| `svelte-vite-pwa` | Instant start                              |
| `react-expo`      | DeviceSecret from the Keychain or Keystore |

Instant start needs no prompt, but the key of the device database is public.
The passkey variant's logic runs before `createEvoluApp` and is the same in
every web framework, so the instant start examples point to `react-vite-pwa`
instead of repeating it. The [full playground](https://www.evolu.dev/playgrounds/full/instant)
has both variants and a few extras: a JSON column, an enum-like `union` column,
a Trash that lists deleted projects and todos with Restore and queries the
relation's other direction with `evoluJsonObjectFrom`, and relays added at
runtime with `useOwner`, the way to keep syncing through a backup relay.
`react-native` is not an example app but the harness of `@evolu/react-native`'s
device tests.

## Checklist

- **Start:** `createEvoluApp` with the platform's auth. Instant start may use
  `createFirstAppOwner: true`, because the AppOwner list lets the user remove
  an unwanted first AppOwner. The passkey variant and Expo offer to create or
  restore an AppOwner on the first use (`createFirstAppOwner: false`), and the
  passkey variant creates the passkey then.
- **Passkey variant:** an unlock screen before the app on `createPasskeyAuth`
  from `@evolu/web`, whose state picks Create or Unlock and says when Start
  Over may be offered; the unlock runs in a user gesture, and the app passes
  its own confirmation to `startOver`. Errors keep the app usable with Try
  Again. Where the browser keeps nothing, as in private browsing, the app
  starts in memory without a passkey.
- **Errors:** startup errors in the framework's idiom (a React error boundary,
  Svelte `{#await}`, Vue `onErrorCaptured`, Expo's recovery view), and
  `evoluError` outside the Suspense boundary, including the wait for another
  build.
- **AppOwners:** the list (identicon, name, last opened) with open, create,
  restore from a mnemonic, rename, and remove after a confirmation; the open
  AppOwner's mnemonic for backup, with the `devicePersistence` advice where
  the browser may delete the data (`Unknown`), a plaintext export of its
  database, and Delete Database, which deletes its database on this device
  with `deleteDatabase` after a confirmation and keeps the account; the state
  with no AppOwner open. Creating or restoring asks for a name, prefilled with
  "Account N", the next number no name has, or for an AppOwner already on the
  device, its own name. Expo's identicon needs `react-native-svg`.
- **Data:** the relation query (projects with their todos) under Suspense or
  the framework's equivalent, insert, update, and soft delete, with the
  `NotPersisted` notice above it. A query that fails shows a message in place
  of the data, and the other sections stay.
- **Sync:** the owner's sync status line and a panel of each relay's state.
- **Expo:** leaves out the `devicePersistence` notices, because React Native
  always keeps the data, and the export, which needs a file module to save the
  file, and shows disposing the app and creating it again instead.

## Testing examples

To test an example, move its directory out of Evolu monorepo. Otherwise, package managers will not work correctly. Examples are meant to work in isolation.

If you are using Yarn, you must install peer dependencies manually.

## Toggle dependencies

```bash
pnpm examples:toggle-deps
```

This script toggles all example dependencies between:

- **Development**: `workspace:*` (uses local monorepo packages)
- **Production**: `latest` (uses published packages)
