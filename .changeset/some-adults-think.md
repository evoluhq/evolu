---
"@evolu/common": patch
"@evolu/react-native": patch
"@evolu/web": patch
---

Reported a database whose worker failed instead of waiting for it forever

When a database's worker failed, every instance of the database waited forever:
`evoluError` stayed `null`, and queries, mutations, and exports never completed.
At startup, which could also leave `devicePersistence` pending, this happened
when the SQLite driver threw, for example in an Expo build without SQLCipher;
when the file could not be read, for example because it was corrupt or
unencrypted while SQLCipher was on; or when SQLite's wasm failed to load. Later
it happened when SQLite failed a query or an export, or after a defect while
applying sync. Only the platform's error reporter saw the error. In React
Native, a failed query's exception escaped a timer, which React Native treats as
fatal. On the web, a database also waited forever, with no error reaching the
app, when its worker's script failed to load, for example after a deployment
removed it while a tab still ran the previous build.

A worker that throws while it starts or handles a request now refuses its
database, and on the web, the tab that hosts a worker whose script fails to load
refuses the database for it. The refusal carries an `UnknownError` of the error,
so every tab of the database, including tabs opened later, gets it as
`evoluError`, `devicePersistence` resolves, and sync state shows the database as
`Refused`. Other databases keep working. As for other refusals, queries and
exports stay pending until the instance is disposed, and mutations are not
stored, so show `evoluError` outside any query-loading boundary and ask the user
to close all the app's tabs. Once every instance of the database is disposed and
Evolu disposes it when idle, creating an instance again retries the start. A
mutation that SQLite fails is still answered with an `UnknownError`, and its
database keeps working.

`RefusedSyncTenant.error` can now be an `UnknownError`, so a switch over it
needs that case. A switch without it no longer compiles:

```ts
import { assertEqual, createUnknownError, Name } from "@evolu/common";
import type { RefusedSyncTenant } from "@evolu/common/local-first";

// @ts-expect-error A switch without the UnknownError case does not return a string for every refusal.
const _refusalMessageBefore = (tenant: RefusedSyncTenant): string => {
  // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- The switch from before, which TypeScript rejects.
  switch (tenant.error.type) {
    case "DatabaseHeldError":
      return "Close the app's other tabs or restart the browser.";
    case "UnsupportedDbVersionError":
      return "Update the app.";
  }
};

const refusalMessage = (tenant: RefusedSyncTenant): string => {
  switch (tenant.error.type) {
    case "DatabaseHeldError":
      return "Close the app's other tabs or restart the browser.";
    case "UnknownError":
      return "Close all tabs of this app and open it again.";
    case "UnsupportedDbVersionError":
      return "Update the app.";
  }
};

assertEqual(
  refusalMessage({
    type: "Refused",
    name: Name.orThrow("app"),
    error: createUnknownError(new Error("No SQLCipher.")),
  }),
  "Close all tabs of this app and open it again.",
);
```
