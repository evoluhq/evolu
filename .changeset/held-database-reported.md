---
"@evolu/common": minor
"@evolu/web": minor
---

Reported a database that another context keeps holding

On the web, a database worker that ended without closing its database, for
example because its tab closed or crashed, can hold the database's files for a
few seconds. A browser can hold them until it restarts. Chromium does that on
Windows after site data is cleared. Opening such a database used to wait without
a bound and warn after 5 seconds.

Now the database worker tries the files again after 50 ms and then doubles the
delay each time, up to a second. If the files are still held 10 seconds after
the first attempt started, the database refuses to start with the new
`DatabaseHeldError`. Every tab of the database gets the error as its
`evoluError`, and the database's sync tenant is `Refused`, until all its tabs
release the database. Ask the user to close the app's other tabs or restart the
browser, then reload the app.

`EvoluError` includes `DatabaseHeldError`, so a switch over its type needs a
case for it.

The waiting moved from `createWasmSqliteDriver` to the database worker. The
worker waits for the files before it opens the database, with
`waitForDatabaseRelease`, a new optional dependency of `startDbWorker` that
`@evolu/web` creates with `createWaitForDatabaseRelease`. A database worker of
your own should pass both the driver and `waitForDatabaseRelease`, created from
the same dependencies, as Evolu's does. Other platforms do not wait.

```ts
import {
  assertEqual,
  Name,
  type CreateSqliteDriverDep,
  type EvoluError,
} from "@evolu/common";
import type { WaitForDatabaseReleaseDep } from "@evolu/common/local-first";
import {
  createRun,
  createWaitForDatabaseRelease,
  createWasmSqliteDriver,
  loadSqliteWasm,
} from "@evolu/web";

const toMessage = (error: EvoluError): string => {
  switch (error.type) {
    case "DatabaseHeldError":
      return "Close this app's other tabs or restart the browser, then reload.";
    case "OtherBuildRunningError":
      return "Close this app's tab with a different version.";
    case "UnknownError":
      return "Something went wrong.";
    case "UnsupportedDbVersionError":
      return "Update this app.";
  }
};

assertEqual(
  toMessage({ type: "DatabaseHeldError", name: Name.orThrow("App") }),
  "Close this app's other tabs or restart the browser, then reload.",
);

// The switch from before, without DatabaseHeldError, no longer compiles.
const _toMessageBefore = (
  error: EvoluError,
  // @ts-expect-error Without a case for DatabaseHeldError, not every EvoluError returns a string.
): string => {
  // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- The switch from before, which TypeScript rejects.
  switch (error.type) {
    case "OtherBuildRunningError":
      return "Close this app's tab with a different version.";
    case "UnknownError":
      return "Something went wrong.";
    case "UnsupportedDbVersionError":
      return "Update this app.";
  }
};

// In a database worker of your own, which has OPFS sync access handles.
const _createWorkerSqliteDeps = (): CreateSqliteDriverDep &
  WaitForDatabaseReleaseDep => {
  const run = createRun();
  const deps = {
    opfsRoot: navigator.storage,
    sqliteWasmLoad: run(loadSqliteWasm),
    subtleCrypto: crypto.subtle,
  };
  return {
    createSqliteDriver: createWasmSqliteDriver(deps),
    waitForDatabaseRelease: createWaitForDatabaseRelease(deps),
  };
};
```
