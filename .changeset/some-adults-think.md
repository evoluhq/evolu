---
"@evolu/common": patch
---

Reported a database that failed to start instead of waiting for it forever

When a database failed to start, every instance of it waited forever:
`evoluError` stayed `null`, `devicePersistence` could stay pending, and queries,
mutations, and exports never completed. This happened when its SQLite driver
threw, for example in an Expo build without SQLCipher; when the file could not
be read, for example because it was corrupt or unencrypted while SQLCipher was
on; or when SQLite's wasm failed to load. Only the platform's error reporter saw
the error.

A failed start is now answered like a refusal. The database is refused with an
`UnknownError` that carries the original error, so every tab, including tabs
opened later, gets it as `evoluError`, `devicePersistence` resolves, and sync
state shows the database as `Refused`. As for other refusals, queries and
exports stay pending until the instance is disposed, and mutations are not
stored, so show `evoluError` outside any query-loading boundary and ask the user
to close all the app's tabs. Once every instance of the database is disposed and
Evolu disposes it when idle, creating an instance again retries the start.

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
