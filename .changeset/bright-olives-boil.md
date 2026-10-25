---
"@evolu/common": minor
"@evolu/nodejs": patch
"@evolu/web": patch
"@evolu/react-native": patch
---

Replaced sql.prepared with Sqlite.prepared, which keeps statements per database

`sqlite.prepared` is a tagged template that runs SQL as `sql` builds it, on a statement the database prepares on the first call and finalizes when it is disposed. The statement belongs to the template and the SQL of its `sql.identifier` and `sql.raw` fragments, so later calls build no SQL text. Pass fragments from a bounded set, such as the tables and columns of a schema, because each combination keeps a statement. Evolu's hot statements, except the one that streams timestamps during sync, use it and no longer build and hash their text. In Node with better-sqlite3, a fresh client receiving 20,000 todos from a relay used about 14% less CPU and 20,000 local inserts about 13% less, and with the web's SQLite in Node on an in-memory database, inserting and uploading 20,000 todos used about 12% less.

```ts
import { assertEqual, sql, testSetupSqlite } from "@evolu/common";
import { createNodeJsSqliteDriver } from "@evolu/nodejs";

await using setup = await testSetupSqlite({
  createSqliteDriver: createNodeJsSqliteDriver,
});
const { sqlite } = setup;
sqlite.exec(sql`create table todo (title text);`);

// @ts-expect-error sql.prepared was removed; use sqlite.prepared.
type _SqlPrepared = typeof sql.prepared;
sqlite.prepared`insert into todo (title) values (${"Buy milk"});`;

assertEqual(sqlite.prepared<{ title: string }>`select title from todo;`.rows, [
  { title: "Buy milk" },
]);
```

A query passed as data, such as one made with `createQuery(…, { prepare: true })` and run in the database worker, keeps the `prepare` option. `sqlite.exec` now keeps the statement of such a query per database, by its SQL text, on every driver.

Drivers no longer cache statements. `SqliteDriver` gained `prepare`, which returns a `SqliteDriverStatement` that runs many times until its owner disposes it, and `exec` runs every query on a statement of its own, also on Node.js, whose driver used to keep every query. `createPreparedStatementsCache` and `PreparedStatements` are removed. Update `@evolu/web`, `@evolu/react-native` and `@evolu/nodejs` together with `@evolu/common`, because older drivers import the removed `createPreparedStatementsCache` and have no `prepare`. A custom `SqliteDriver` drops its cache and implements `prepare`:

```ts
import {
  assertEqual,
  constVoid,
  sql,
  type SqliteDriver,
  type SqliteRow,
} from "@evolu/common";

const rows: ReadonlyArray<SqliteRow> = [{ a: 1 }];

// @ts-expect-error A SqliteDriver must implement prepare.
const _driverBefore: SqliteDriver = {
  exec: () => ({ rows, changes: 0 }),
  iterate: constVoid,
  export: () => new Uint8Array(),
  deleteDatabase: constVoid,
  [Symbol.dispose]: constVoid,
};

const driver: SqliteDriver = {
  exec: () => ({ rows, changes: 0 }),
  prepare: () => ({
    exec: () => ({ rows, changes: 0 }),
    [Symbol.dispose]: constVoid,
  }),
  iterate: constVoid,
  export: () => new Uint8Array(),
  deleteDatabase: constVoid,
  [Symbol.dispose]: constVoid,
};

using statement = driver.prepare(sql`select a from t;`.sql);
assertEqual(statement.exec([]).rows, [{ a: 1 }]);
```

Transactions run `begin`, `commit`, and `rollback` on prepared statements.

To migrate:

- `sql.prepared` is removed. Run SQL where it is written with `sqlite.prepared`, and give a query passed as data, such as one made with `createQuery`, the `prepare` option.
- A custom `Sqlite`, such as a test fake or a wrapper, implements `prepared`. A wrapper that spreads a `Sqlite` and replaces only `exec` still compiles, but it no longer sees Evolu's hot statements, which run on `prepared`.
- Statements run with `sqlite.prepared` take no `logQueryExecutionTime` or `logExplainQueryPlan` option.
- On Node.js, a query keeps its statement only with the `prepare` option, because its driver no longer keeps every query.

```ts
import {
  assertEqual,
  sql,
  testSetupSqlite,
  type Sqlite,
  type SqliteQuery,
  type SqliteRow,
  type SqlTemplateParam,
} from "@evolu/common";
import { createNodeJsSqliteDriver } from "@evolu/nodejs";

await using setup = await testSetupSqlite({
  createSqliteDriver: createNodeJsSqliteDriver,
});
const { sqlite } = setup;
const executed: Array<string> = [];
const exec = <R extends SqliteRow = SqliteRow>(query: SqliteQuery) => {
  executed.push(query.sql);
  return sqlite.exec<R>(query);
};

// @ts-expect-error A Sqlite must implement prepared.
const _loggingBefore: Sqlite = {
  exec,
  iterate: sqlite.iterate,
  transaction: sqlite.transaction,
  export: sqlite.export,
  [Symbol.asyncDispose]: () => sqlite[Symbol.asyncDispose](),
};

const logging: Sqlite = {
  ...sqlite,
  exec,
  prepared: <R extends SqliteRow = SqliteRow>(
    strings: TemplateStringsArray,
    ...parameters: Array<SqlTemplateParam>
  ) => {
    executed.push(sql(strings, ...parameters).sql);
    return sqlite.prepared<R>(strings, ...parameters);
  },
};

logging.exec(sql`create table todo (title text);`);
logging.prepared`insert into todo (title) values (${"Buy milk"});`;

assertEqual(executed, [
  "create table todo (title text);",
  "insert into todo (title) values (?);",
]);
```
