---
"@evolu/common": minor
"@evolu/nodejs": patch
"@evolu/react-native": patch
"@evolu/relay": patch
"@evolu/web": patch
---

Stopped sync from reading timestamps it does not use

To answer a Timestamps range, sync reads the owner's timestamps in order until
its frame is full, but storage read every timestamp of the range up front. So
every round of an initial download read the rest of the owner again, and a relay
answering a device with nothing stored spent time and memory that grew with the
owner, about 700 ms for 900,000 changes. Storage now streams the timestamps and
stops at the last one sync uses. That answer takes about 40 ms at any owner
size, and syncing 20,000 changes reads about 40,000 rows instead of 138,000 on
the relay when downloading, and instead of 121,000 on the client when uploading.

`Sqlite` and `SqliteDriver` gained `iterate`, which passes a query's rows to a
callback one at a time until it returns `false`. The callback can read the
database but must not write it. Update `@evolu/web`, `@evolu/react-native` and
`@evolu/nodejs` together with `@evolu/common`, because sync fails with an older
driver. A custom `SqliteDriver` must implement `iterate` on a statement of its
own, because the callback can run queries:

```ts
import {
  assertEqual,
  constVoid,
  sql,
  type SqliteDriver,
  type SqliteRow,
} from "@evolu/common";

const rows: ReadonlyArray<SqliteRow> = [{ a: 1 }, { a: 2 }, { a: 3 }];

// @ts-expect-error A SqliteDriver must implement iterate.
const _driverBefore: SqliteDriver = {
  exec: () => ({ rows, changes: 0 }),
  export: () => new Uint8Array(),
  deleteDatabase: constVoid,
  [Symbol.dispose]: constVoid,
};

const driver: SqliteDriver = {
  exec: () => ({ rows, changes: 0 }),
  iterate: (_query, onRow) => {
    for (const row of rows) if (!onRow(row)) break;
  },
  export: () => new Uint8Array(),
  deleteDatabase: constVoid,
  [Symbol.dispose]: constVoid,
};

const passed: Array<SqliteRow> = [];
driver.iterate(sql`select a from t;`, (row) => {
  passed.push(row);
  return passed.length < 2;
});
assertEqual(passed, [{ a: 1 }, { a: 2 }]);
```
