---
"@evolu/common": patch
"@evolu/web": patch
---

Added database versioning with startup refusal

Evolu now records `dbVersion` in its `evolu_version` table instead of the
unused `protocolVersion`. Existing databases are converted at startup. The
database version covers Evolu's internal storage format and how stored data is
interpreted. It is independent of the application schema, which still evolves
append-only, and of the network protocol version. This release supports
database version 1 and adds no migration.

A newer database appears in two situations. After a deployment, a tab running
the new app version migrates the database while an older tab is still open or
a cached older build loads; when that older tab later hosts the database
worker, its code meets a database it does not understand, which is why the
recovery is closing all tabs rather than reloading one. Or the app is
downgraded, including installing an older React Native build, after a newer
version migrated the local data; then only the newer app helps. Only code from
this release onward checks the version, so releases before it cannot be
protected. Nothing produces a newer database yet: the first refusal can occur
when a later release introduces version 2, so handle the error now.

A database whose version is newer than the code supports is refused before
Evolu reads the clock, touches the application schema, or replays quarantine.
Nothing is written, and the database worker exits and releases the database.
While the refused database's tenant remains alive, the SharedWorker sends
`UnsupportedDbVersionError` to each tab once, including tabs that connect later.
The tenant stops processing requests and does not start replacement database
workers. After all instances release the
tenant and it is disposed when idle, creating another instance retries startup
and may report the refusal again.

The first `UnsupportedDbVersionError` remains in `evoluError` for the lifetime
of the dependencies returned by `createEvoluDeps`, including across tenant
disposal and recreation. Later errors are still logged but cannot replace the
refusal or notify the error store's subscribers. Fresh dependencies start with
an empty error store.

Unanswered `loadQuery` and `exportDatabase` calls remain pending, and mutation
`onComplete` callbacks do not run. Disposing an instance still
resolves pending query loads with empty rows and rejects its pending export with
`EvoluDisposedError`.

Apps should observe `evoluError` outside query-loading UI and show a blocking
message asking users to close all tabs of the app and reopen it for
`UnsupportedDbVersionError`. Evolu does not automatically reload tabs or replace the SharedWorker.

```ts
import { assertEqual, PositiveInt, type EvoluError } from "@evolu/common";

const describeError = (error: EvoluError): string => {
  // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- The default handles every other EvoluError.
  switch (error.type) {
    case "UnsupportedDbVersionError":
      return "Your data requires a newer app version. Close all tabs of this app, then open it again.";
    default:
      return "Something went wrong.";
  }
};

assertEqual(
  describeError({
    type: "UnsupportedDbVersionError",
    storedVersion: PositiveInt.orThrow(2),
    supportedVersion: PositiveInt.orThrow(1),
  }),
  "Your data requires a newer app version. Close all tabs of this app, then open it again.",
);
```
