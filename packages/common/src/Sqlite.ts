/**
 * SQLite database abstraction and query execution.
 *
 * @module
 */

import { assertNotDisposed } from "./Assert.js";
import type { Brand } from "./Brand.js";
import { bytesToHex, hexToBytes } from "./Buffer.js";
import type { EncryptionKey } from "./Crypto.js";
import type { Eq } from "./Eq.js";
import { createEqObject, eqArrayNumber, eqString } from "./Eq.js";
import { createRecord, objectToEntries } from "./Object.js";
import type { Result } from "./Result.js";
import { ok } from "./Result.js";
import type { Run, Task } from "./Task.js";
import { testCreateRun, type TestDeps } from "./Test.js";
import type { InferType, Name, Typed } from "./Type.js";
import {
  array,
  Null,
  Number,
  object,
  record,
  set,
  String,
  testName,
  Uint8Array,
  union,
} from "./Type.js";

/**
 * Platform-agnostic SQLite wrapping a {@link SqliteDriver}.
 *
 * API is synchronous because it provides
 * {@link https://github.com/WiseLibs/better-sqlite3/issues/262 | better concurrency}
 * for SQLite.
 */
export interface Sqlite extends AsyncDisposable {
  readonly exec: <R extends SqliteRow = SqliteRow>(
    query: SqliteQuery,
  ) => SqliteExecResult<R>;

  /**
   * Executes a transaction, running the provided callback within a begin/commit
   * block.
   *
   * If the callback returns a {@link Result} error, the transaction is rolled
   * back and the error result is returned.
   *
   * If the callback returns `void`, the transaction is committed unless the
   * callback throws.
   */
  readonly transaction: SqliteTransaction;

  /**
   * Returns bytes backed by {@link ArrayBuffer}.
   *
   * Exported databases are forwarded through worker `postMessage` transfer
   * lists, which require transferable `ArrayBuffer` backing.
   */
  readonly export: () => Uint8Array<ArrayBuffer>;
}

export interface SqliteDep {
  readonly sqlite: Sqlite;
}

export interface SqliteTransaction {
  <T, E>(callback: () => Result<T, E>): Result<T, E>;
  (callback: () => void): void;
}

/** Represents a SQL query to be executed on a {@link Sqlite} database. */
export interface SqliteQuery {
  readonly sql: SafeSql;
  readonly parameters: Array<SqliteValue>;
  readonly options?: SqliteQueryOptions;
}

/** Serialized {@link SqliteQuery} used as a stable string key. */
export type SqliteQueryString = string & Brand<"SqliteQueryString">;

/** A sanitized SQL string for {@link SqliteQuery}. */
export type SafeSql = string & Brand<"SafeSql">;

/**
 * A value that can be stored in {@link Sqlite}.
 *
 * Note that Evolu can't support Int64 because expo-sqlite (and some others) do
 * not support it.
 */
export const SqliteValue = /*#__PURE__*/ union(
  Null,
  String,
  Number,
  Uint8Array,
);
export type SqliteValue = typeof SqliteValue.Type;

/** Equality comparison for {@link SqliteValue}. */
export const eqSqliteValue: Eq<SqliteValue> = (x, y) =>
  Uint8Array.is(x) && Uint8Array.is(y) ? eqArrayNumber(x, y) : x === y;

/** Options for configuring {@link SqliteQuery} execution behavior. */
export interface SqliteQueryOptions {
  /**
   * If set to `true`, logs the time taken to execute the SQL query. Useful for
   * performance monitoring and identifying slow queries.
   */
  readonly logQueryExecutionTime?: boolean;

  /**
   * If set to `true`, logs the SQLite Explain Query Plan (EQP) for the query.
   * This can help analyze how SQLite plans to execute the query and identify
   * potential optimizations.
   *
   * See: {@link https://www.sqlite.org/eqp.html}.
   */
  readonly logExplainQueryPlan?: boolean;

  /**
   * If set to `true`, explicitly prepares the query before execution. Prepared
   * statements can improve performance for repeated queries by reusing the
   * compiled query.
   *
   * See: {@link https://sqlite.org/wasm/doc/trunk/api-oo1.md#db-prepare}.
   */
  readonly prepare?: boolean;
}

/** Converts a {@link SqliteQuery} into a stable {@link SqliteQueryString}. */
export const sqliteQueryToSqliteQueryString = (
  query: SqliteQuery,
): SqliteQueryString => {
  const params = query.parameters.map((value) =>
    value instanceof globalThis.Uint8Array
      ? (["b", bytesToHex(value)] as const)
      : (["j", value] as const),
  );

  const options = query.options
    ? objectToEntries(query.options).toSorted(([a], [b]) => a.localeCompare(b))
    : [];

  return JSON.stringify([query.sql, params, options]) as SqliteQueryString;
};

/** Converts a {@link SqliteQueryString} back into a {@link SqliteQuery}. */
export const sqliteQueryStringToSqliteQuery = (
  query: SqliteQueryString,
): SqliteQuery => {
  const [sql, paramsArr, optionsArr] = JSON.parse(query) as [
    SafeSql,
    Array<readonly ["b", string] | readonly ["j", string | number | null]>,
    Array<Array<string | number | null>>,
  ];

  const parameters = paramsArr.map(([type, value]) =>
    type === "b" ? hexToBytes(value) : value,
  );

  const options = optionsArr.length
    ? (Object.fromEntries(optionsArr) as SqliteQueryOptions)
    : undefined;

  return {
    sql,
    parameters,
    ...(options !== undefined && { options }),
  };
};

/** Result of executing a SQLite query. */
export interface SqliteExecResult<R extends SqliteRow = SqliteRow> {
  readonly rows: ReadonlyArray<R>;
  readonly changes: number;
}

/**
 * A row returned from a {@link Sqlite} query, mapping column names to
 * {@link SqliteValue}.
 */
export type SqliteRow = Record<string, SqliteValue>;

/**
 * SQLite driver interface.
 *
 * Platform-specific drivers must implement this interface.
 */
export interface SqliteDriver extends Disposable {
  readonly exec: (query: SqliteQuery) => SqliteExecResult;

  /**
   * Returns bytes backed by {@link ArrayBuffer}.
   *
   * Exported databases are forwarded through worker `postMessage` transfer
   * lists, which require transferable `ArrayBuffer` backing.
   */
  readonly export: () => Uint8Array<ArrayBuffer>;
}

/** Creates a {@link SqliteDriver}. */
export type CreateSqliteDriver = (
  name: Name,
  options?: SqliteDriverOptions,
) => Task<SqliteDriver>;

export interface CreateSqliteDriverDep {
  createSqliteDriver: CreateSqliteDriver;
}

/**
 * Options for creating a {@link CreateSqliteDriver}.
 *
 * Three mutually exclusive modes: in-memory (for testing), encrypted persistent
 * (OPFS/file with encryption key), or persistent (default when omitted).
 */
export type SqliteDriverOptions =
  | { readonly mode: "memory" }
  | { readonly mode: "encrypted"; readonly encryptionKey: EncryptionKey };

/**
 * Creates a {@link Sqlite} instance backed by a platform-specific driver.
 *
 * The driver is created via {@link CreateSqliteDriver} and wrapped with logging,
 * error handling, and transaction helpers.
 */
export const createSqlite =
  (
    name: Name,
    options?: SqliteDriverOptions,
  ): Task<Sqlite, never, CreateSqliteDriverDep> =>
  async (run) => {
    const { createSqliteDriver } = run.deps;
    const console = run.deps.console.child("sql");
    await using stack = new AsyncDisposableStack();

    const driverResult = await run(createSqliteDriver(name, options));
    if (!driverResult.ok) return driverResult;
    const driver = stack.use(driverResult.value);
    console.debug("SQLite driver created");

    const moved = stack.move();

    const sqlite: Sqlite = {
      exec: <R extends SqliteRow = SqliteRow>(query: SqliteQuery) => {
        assertNotDisposed(moved);
        console.debug({ query });

        const label =
          query.options?.logQueryExecutionTime &&
          `SqliteQueryExecutionTime ${query.sql}`;

        if (label) console.time(label);
        const result = driver.exec(query);
        if (label) console.timeEnd(label);

        if (query.options?.logExplainQueryPlan) {
          const result = driver.exec({
            ...query,
            sql: `EXPLAIN QUERY PLAN ${query.sql}` as SafeSql,
          });
          console.log("[logExplainQueryPlan]", query);
          console.log(
            drawSqliteQueryPlan(
              result.rows as unknown as Array<SqliteQueryPlanRow>,
            ),
          );
        }

        console.debug({ result });
        return result as SqliteExecResult<R>;
      },

      transaction: ((callback: () => Result<unknown, unknown> | void) => {
        assertNotDisposed(moved);
        console.debug("begin");
        driver.exec(sql`begin;`);

        let shouldRollback = true;
        using _rollback = {
          [Symbol.dispose]: () => {
            if (!shouldRollback) return;
            console.debug("rollback");
            driver.exec(sql`rollback;`);
          },
        };

        const result = callback();
        if (result != null && !result.ok) return result;

        console.debug("commit");
        driver.exec(sql`commit;`);
        shouldRollback = false;

        return result;
      }) as SqliteTransaction,

      export: () => {
        assertNotDisposed(moved);
        return driver.export();
      },

      [Symbol.asyncDispose]: () => moved.disposeAsync(),
    };

    return ok(sqlite);
  };

/**
 * Creates a test {@link Run} with a ready-to-use in-memory {@link Sqlite}.
 *
 * This helper removes repetitive test setup where callers first create a test
 * run and then execute {@link createSqlite} manually.
 */
export function testCreateRunWithSqlite(
  deps: CreateSqliteDriverDep,
): Promise<Run<TestDeps & CreateSqliteDriverDep & SqliteDep>>;

export function testCreateRunWithSqlite<D extends CreateSqliteDriverDep>(
  deps: D,
): Promise<Run<TestDeps & D & SqliteDep>>;

export async function testCreateRunWithSqlite(
  deps: CreateSqliteDriverDep,
): Promise<Run<TestDeps & CreateSqliteDriverDep & SqliteDep>> {
  const run = testCreateRun(deps);
  const sqlite = await run.orThrow(createSqlite(testName, { mode: "memory" }));
  return run.addDeps({ sqlite });
}

interface SqliteQueryPlanRow {
  id: number;
  parent: number;
  detail: string;
}

const drawSqliteQueryPlan = (rows: Array<SqliteQueryPlanRow>): string =>
  rows
    .map((row) => {
      let parentId = row.parent;
      let indent = 0;

      do {
        const parent = rows.find((r) => r.id === parentId);
        if (!parent) break;
        parentId = parent.parent;
        indent++;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
      } while (true);

      return `${"  ".repeat(indent)}${row.detail}`;
    })
    .join("\n");

/**
 * Cache for compiled prepared statements.
 *
 * Statements are created on first access and reused for subsequent calls with
 * the same SQL. Disposing the cache finalizes all cached statements.
 */
export interface PreparedStatements<P> extends Disposable {
  readonly get: <T extends boolean>(
    query: SqliteQuery,
    alwaysPrepare?: T,
  ) => T extends true ? P : P | null;
}

/**
 * Creates a {@link PreparedStatements} cache backed by the given factory and
 * dispose function.
 */
export const createPreparedStatementsCache = <P>(
  factory: (sql: SafeSql) => P,
  disposeFn: (statement: P) => void,
): PreparedStatements<P> => {
  let isDisposed = false;
  const cache = new Map<SafeSql, P>();

  return {
    get: (query, alwaysPrepare) => {
      if (alwaysPrepare !== true && !query.options?.prepare)
        return null as never;
      let statement = cache.get(query.sql);
      if (!statement) {
        statement = factory(query.sql);
        cache.set(query.sql, statement);
      }
      return statement as never;
    },

    [Symbol.dispose]: () => {
      if (isDisposed) return;
      isDisposed = true;
      cache.forEach(disposeFn);
      cache.clear();
    },
  };
};

/** A double-quoted SQL identifier for safe column or table name interpolation. */
export interface SqlIdentifier extends Typed<"SqlIdentifier"> {
  readonly sql: SafeSql;
}

/**
 * An unescaped SQL fragment inserted verbatim into a query.
 *
 * **Warning**: Use only with trusted, constant strings to avoid SQL injection.
 */
export interface RawSql extends Typed<"RawSql"> {
  readonly sql: string;
}

/** A parameter accepted by the {@link sql} tagged template. */
export type SqlTemplateParam = SqliteValue | SqlIdentifier | RawSql;

/**
 * Creates a safe SQL query using a tagged template literal.
 *
 * Parameters are automatically escaped and bound as SQLite values. Use
 * `sql.identifier` for column/table names and `sql.raw` for unescaped SQL.
 *
 * ### Example
 *
 * ```ts
 * const id = 42;
 * const name = "Alice";
 *
 * const result = sqlite.exec(sql`
 *   select *
 *   from users
 *   where id = ${id} and name = ${name};
 * `);
 *
 * // For identifiers
 * const tableName = "users";
 * sqlite.exec(sql`
 *   create table ${sql.identifier(tableName)} (
 *     "id" text primary key,
 *     "name" text not null
 *   );
 * `);
 *
 * // For raw SQL (use with caution)
 * const orderBy = "created_at desc";
 * sqlite.exec(sql`select * from users order by ${sql.raw(orderBy)};`);
 * ```
 *
 * ## TIP
 *
 * Use `prettier-plugin-sql-cst` for SQL formatting. Like Prettier for
 * JavaScript, this plugin formats SQL expressions differently depending on
 * their length.
 */
export const sql = (
  strings: TemplateStringsArray,
  ...parameters: Array<SqlTemplateParam>
): SqliteQuery => {
  let sql = "";
  const values: Array<SqliteValue> = [];

  for (let i = 0; i < strings.length; i++) {
    sql += strings[i];
    if (i < parameters.length) {
      const param = parameters[i];
      if (typeof param === "object" && param != null && "type" in param) {
        sql += param.sql;
      } else {
        sql += "?";
        values.push(param);
      }
    }
  }

  return { sql: sql.trim() as SafeSql, parameters: values };
};

sql.identifier = (identifier: string): SqlIdentifier => ({
  type: "SqlIdentifier",
  // From Kysely
  sql: `"${identifier.replace(/"/g, '""')}"` as SafeSql,
});

/**
 * Insert any string verbatim.
 *
 * **Warning**: This is not escaped. Use only with trusted, constant SQL
 * fragments to avoid SQL injection.
 */
sql.raw = (raw: string): RawSql => ({ type: "RawSql", sql: raw });

/** Tagged template that creates a {@link SqliteQuery} with `prepare: true`. */
sql.prepared = (
  strings: TemplateStringsArray,
  ...parameters: Array<SqlTemplateParam>
): SqliteQuery => {
  const query = sql(strings, ...parameters);
  return { ...query, options: { prepare: true } };
};

/** Index metadata stored in `sqlite_master` for a {@link Sqlite} database. */
export const SqliteIndex = /*#__PURE__*/ object({ name: String, sql: String });
export interface SqliteIndex extends InferType<typeof SqliteIndex> {}

/** {@link Eq} instance for {@link SqliteIndex}. */
export const eqSqliteIndex: Eq<SqliteIndex> = /*#__PURE__*/ createEqObject({
  name: eqString,
  sql: eqString,
});

/**
 * Full schema metadata for a {@link Sqlite} database.
 *
 * Includes table-column mappings and user-visible indexes.
 */
export const SqliteSchema = /*#__PURE__*/ object({
  tables: /*#__PURE__*/ record(String, /*#__PURE__*/ set(String)),
  indexes: /*#__PURE__*/ array(SqliteIndex),
});
export interface SqliteSchema extends InferType<typeof SqliteSchema> {}

/** Get the current SQLite schema by reading SQLite metadata. */
export const getSqliteSchema =
  (deps: SqliteDep) =>
  ({
    excludeIndexNamePrefix,
  }: {
    /**
     * If provided, indexes with names starting with this prefix are excluded in
     * SQLite query.
     */
    excludeIndexNamePrefix?: string;
  } = {}): SqliteSchema => {
    const tables = createRecord<string, Set<string>>();

    const tableAndColumnInfoRows = deps.sqlite.exec<{
      tableName: string;
      columnName: string;
    }>(sql`
      select
        sqlite_master.name as tableName,
        table_info.name as columnName
      from
        sqlite_master
        join pragma_table_info(sqlite_master.name) as table_info;
    `);

    tableAndColumnInfoRows.rows.forEach(({ tableName, columnName }) => {
      (tables[tableName] ??= new Set()).add(columnName);
    });

    const indexNamePrefixFilter =
      excludeIndexNamePrefix != null
        ? ` and name not like '${excludeIndexNamePrefix.replaceAll("'", "''")}%'`
        : "";

    const indexesRows = deps.sqlite.exec<{ name: string; sql: string }>(
      sql`
        select name, sql
        from sqlite_master
        where
          type = 'index'
          and name not like 'sqlite_%'
          ${sql.raw(indexNamePrefixFilter)};
      `,
    );

    const indexes = indexesRows.rows.map(
      (row): SqliteIndex => ({
        name: row.name,
        /**
         * SQLite returns "CREATE INDEX" for "create index" for some reason.
         * Other keywords remain unchanged. We have to normalize the casing for
         * schema comparison manually.
         */
        sql: row.sql
          .replace("CREATE INDEX", "create index")
          .replace("CREATE UNIQUE INDEX", "create unique index"),
      }),
    );

    return { tables, indexes };
  };

/**
 * Returns {@link SqliteSchema} and full {@link SqliteRow} table contents for
 * inspection and testing.
 */
export interface SqliteSnapshot {
  readonly schema: SqliteSchema;
  readonly tables: Array<{
    readonly name: string;
    readonly rows: ReadonlyArray<SqliteRow>;
  }>;
}

/**
 * Captures a full {@link SqliteSnapshot} for testing and diagnostics.
 *
 * The snapshot includes current {@link SqliteSchema} and all rows from every
 * discovered table. Table order follows `schema.tables` iteration order.
 */
export const getSqliteSnapshot = (deps: SqliteDep): SqliteSnapshot => {
  const schema = getSqliteSchema(deps)();

  const tables: SqliteSnapshot["tables"] = [];

  for (const tableName in schema.tables) {
    const result = deps.sqlite.exec(sql`
      select * from ${sql.identifier(tableName)};
    `);

    tables.push({
      name: tableName,
      rows: result.rows,
    });
  }

  return { schema, tables };
};

/**
 * SQLite represents boolean values using `0` (false) and `1` (true) instead of
 * a dedicated boolean type.
 *
 * See: https://www.sqlite.org/quirks.html#no_separate_boolean_datatype
 *
 * ## Tips
 *
 * - Use {@link sqliteTrue} and {@link sqliteFalse} constants for better
 *   readability.
 * - Use {@link booleanToSqliteBoolean} and {@link sqliteBooleanToBoolean} for
 *   converting between JavaScript booleans and SQLite boolean values.
 */
export const SqliteBoolean = /*#__PURE__*/ union(0, 1);
export type SqliteBoolean = typeof SqliteBoolean.Type;

/**
 * Represents the {@link SqliteBoolean} value for `true`.
 *
 * See {@link SqliteBoolean}.
 */
export const sqliteTrue = 1;

/**
 * Represents the {@link SqliteBoolean} value for `false`.
 *
 * See {@link SqliteBoolean}.
 */
export const sqliteFalse = 0;

/**
 * Converts a JavaScript boolean to a {@link SqliteBoolean}.
 *
 * ### Example
 *
 * ```ts
 * const isActive = true;
 * const sqlValue = booleanToSqliteBoolean(isActive); // Returns 1
 * ```
 */
export const booleanToSqliteBoolean = (value: boolean): SqliteBoolean =>
  value ? sqliteTrue : sqliteFalse;

/**
 * Converts a {@link SqliteBoolean} to a JavaScript boolean.
 *
 * ### Example
 *
 * ```ts
 * const sqlValue: SqliteBoolean = 1;
 * const bool = sqliteBooleanToBoolean(sqlValue); // Returns true
 * ```
 */
export const sqliteBooleanToBoolean = (value: SqliteBoolean): boolean =>
  value === sqliteTrue;
