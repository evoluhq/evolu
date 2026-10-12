---
"@evolu/sqlite-wasm": minor
---

Added iterate to read a query's rows one at a time

`SqliteStatement.iterate` and `SqliteDatabase.iterate` pass a query's rows to a
callback one at a time and stop when it returns `false`, so SQLite steps no row
after that one, while `run` collects every row. A query whose plan sorts, groups
or aggregates still reads all its input before the first row, so stream a query
that an index orders.

The statement is reset also when a step fails or the callback throws, and the
throw is rethrown without breaking the instance. When the callback stops a write
with RETURNING early, the reset commits it, and `iterate` returns that commit's
error. The callback can run other statements of the same database, but not run,
iterate or dispose the statement it iterates. `SqliteDatabase.iterate` prepares
and finalizes a statement of its own.

```ts
import {
  assertType,
  getOrThrow,
  type Result,
  type SqliteRow,
} from "@evolu/common";
import type {
  SqliteDatabase,
  SqlitePrepareError,
  SqliteRunError,
  SqliteStatement,
} from "@evolu/sqlite-wasm";

// Reads at most `count` rows, however many the query returns.
const readFirstRows = (
  statement: SqliteStatement,
  count: number,
): ReadonlyArray<SqliteRow> => {
  const rows: Array<SqliteRow> = [];
  if (count > 0)
    getOrThrow(
      statement.iterate([], (row) => {
        rows.push(row);
        return rows.length < count;
      }),
    );
  return rows;
};

assertType<
  ReturnType<SqliteStatement["iterate"]>,
  Result<void, SqliteRunError>
>();
assertType<
  ReturnType<SqliteDatabase["iterate"]>,
  Result<void, SqlitePrepareError | SqliteRunError>
>();
assertType<ReturnType<typeof readFirstRows>, ReadonlyArray<SqliteRow>>();
```
