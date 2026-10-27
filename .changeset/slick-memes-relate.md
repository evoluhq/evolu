---
"@evolu/common": minor
---

Added createNativeSqliteDriver, the SQLite driver React Native and Node.js share

`createNativeSqliteDriver` is the `CreateSqliteDriver` over `NativeSqlite`, the
JavaScript interface of Evolu's native SQLite binding, which
`@evolu/react-native` implements with JSI and `@evolu/nodejs` with Node-API, so
both platforms run one driver. A platform passes its binding and
`DatabasePathDep`, where its database files are. `NativeSqlite` is exported
with it, and so are the causes of the `Error`s its binding throws, such as
`DatabaseFileHeldError` for a file another connection of the process holds, and
`retryWhileHeld`, with which an open of a held file tries again for up to 10
seconds.

```ts
import {
  assertEqual,
  createNativeSqliteDriver,
  Name,
  sql,
  testCreateRun,
  type NativeSqlite,
  type NativeSqliteDatabase,
} from "@evolu/common";

// A binding whose file another connection holds at the first open, and whose
// run of a query returns its rows.
const unused = (): never => {
  throw new Error("The driver doesn't call it here.");
};
const opens: Array<string> = [];
const database: NativeSqliteDatabase = {
  prepare: unused,
  run: () => [{ answer: 42 }],
  export: () => new ArrayBuffer(0),
  close: () => undefined,
};
const nativeSqlite: NativeSqlite = {
  abiVersion: 2,
  openMemory: unused,
  openFile: (path) => {
    opens.push(path);
    if (opens.length === 1)
      throw new Error("The database is held.", {
        cause: { type: "DatabaseFileHeldError" },
      });
    return database;
  },
  openEncryptedFile: unused,
  isFileOpen: unused,
  deleteFile: unused,
  fillRandom: unused,
  encryptXChaCha20Poly1305: unused,
  decryptXChaCha20Poly1305: unused,
};

const createSqliteDriver = createNativeSqliteDriver({
  nativeSqlite,
  databasePath: (name) => `/data/evolu1-${name}.db`,
});

await using run = testCreateRun();
const opening = run.ok(createSqliteDriver(Name.orThrow("App")));
// The open of the held file tries again 50 ms later.
run.deps.time.advance("50ms");
using driver = await opening;

assertEqual(driver.exec(sql`select 42 as answer;`).rows, [{ answer: 42 }]);
assertEqual(opens, ["/data/evolu1-App.db", "/data/evolu1-App.db"]);
```
