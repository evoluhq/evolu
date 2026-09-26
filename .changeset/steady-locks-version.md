---
"@evolu/common": minor
"@evolu/web": patch
---

Added database versioning with startup refusal

Evolu now records a database version, `dbVersion`, in its `evolu_version`
table instead of the unused `protocolVersion`, and converts existing databases
at startup. The version covers Evolu's internal storage format and how stored
data is interpreted. It is independent of the application schema, which still
evolves append-only, and of the network protocol version. This release supports
database version 2 and migrates older databases to it.

A database newer than the code supports appears when an older build opens data
a newer one migrated: after a deployment, for example when an older build is
loaded later from a cache, or after a downgrade, including installing an older
React Native build. Evolu refuses such a database before writing anything, and
every tab using it gets `UnsupportedDbVersionError` in `evoluError`, where it
stays for the lifetime of the dependencies. Queries and exports of that
database stay pending, and mutation `onComplete` callbacks do not run. The
`EvoluErrorDep` API docs describe when the refusal is reported again. Only code
from this release onward checks the version, so earlier releases are not
protected. Nothing produces a newer database yet; the first refusal can come
when a later release introduces version 3, so handle the error now.

On the web, a refused tab reloads once for each stored version, so it loads the
build the server now serves. The error is reported only when the reloaded build
refuses the database too, or when the tab has no session storage.

Apps should observe `evoluError` outside query-loading UI and show a blocking
message for `UnsupportedDbVersionError`, such as asking users to update the
app. An exhaustive `switch` over `EvoluError` needs a case for it.

```ts
import { assertEqual, PositiveInt, type EvoluError } from "@evolu/common";

const describeError = (error: EvoluError): string => {
  // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- The default handles every other EvoluError.
  switch (error.type) {
    case "UnsupportedDbVersionError":
      return "Your data requires a newer version of this app. Please update it.";
    default:
      return "Something went wrong.";
  }
};

assertEqual(
  describeError({
    type: "UnsupportedDbVersionError",
    storedVersion: PositiveInt.orThrow(3),
    supportedVersion: PositiveInt.orThrow(2),
  }),
  "Your data requires a newer version of this app. Please update it.",
);
```
