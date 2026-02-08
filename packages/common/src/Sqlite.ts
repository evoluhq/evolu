/**
 * SQLite database abstraction and query execution.
 *
 * @module
 */

import type { Brand } from "./Brand.js";
import type { EncryptionKey } from "./Crypto.js";
import type { Eq } from "./Eq.js";
import { eqArrayNumber } from "./Eq.js";
import type { UnknownError } from "./Error.js";
import { createUnknownError } from "./Error.js";
import type { Result } from "./Result.js";
import { err, ok, trySync } from "./Result.js";
import type { Task } from "./Task.js";
import type { SimpleName, Typed } from "./Type.js";
import { Null, Number, String, Uint8Array, union } from "./Type.js";

/**
 * Platform-agnostic SQLite wrapping a {@link SqliteDriver}.
 *
 * API is synchronous because it provides
 * {@link https://github.com/WiseLibs/better-sqlite3/issues/262 | better concurrency}
 * for SQLite.
 */
export interface Sqlite extends Disposable {
  readonly exec: <R extends SqliteRow = SqliteRow>(
    query: SqliteQuery,
  ) => Result<SqliteExecResult<R>, SqliteError>;

  /**
   * Executes a transaction, running the provided callback within a begin/commit
   * block. If the callback returns an error, the transaction is rolled back. If
   * the rollback fails, a {@link SqliteError} is returned with both the original
   * error and rollbackError.
   */
  readonly transaction: <T, E>(
    callback: () => Result<T, E | SqliteError>,
  ) => Result<T, E | SqliteError>;

  readonly export: () => Result<Uint8Array, SqliteError>;
}

export interface SqliteDep {
  readonly sqlite: Sqlite;
}

/** Represents a SQL query to be executed on a {@link Sqlite} database. */
export interface SqliteQuery {
  readonly sql: SafeSql;
  readonly parameters: Array<SqliteValue>;
  readonly options?: SqliteQueryOptions;
}

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

/** Result of executing a SQLite query. */
export interface SqliteExecResult<R extends SqliteRow = SqliteRow> {
  readonly rows: ReadonlyArray<R>;
  readonly changes: number;
}

/** Represents an error that occurred during a SQLite operation. */
export interface SqliteError extends Typed<"SqliteError"> {
  readonly error: UnknownError;
  readonly rollbackError?: UnknownError;
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
  readonly export: () => Uint8Array;
}

/** Creates a {@link SqliteDriver}. */
export type CreateSqliteDriver = (
  name: SimpleName,
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
    name: SimpleName,
    options?: SqliteDriverOptions,
  ): Task<Sqlite, SqliteError, CreateSqliteDriverDep> =>
  async (run) => {
    const { createSqliteDriver } = run.deps;
    const console = run.deps.console.child("sql");

    console.debug("createSqliteDriver");
    const result = await run(createSqliteDriver(name, options));
    if (!result.ok) return result;
    const driver = result.value;

    let isDisposed = false;

    const rollback = <T, E>(
      result: Result<T, E | SqliteError>,
      error: UnknownError,
    ): Result<T, E | SqliteError> => {
      const rollbackResult = trySync(() => {
        console.debug("rollback");
        driver.exec(sql`rollback;`);
      }, createSqliteError);
      if (!rollbackResult.ok) {
        console.warn("rollback failed", rollbackResult.error);
        return err({
          type: "SqliteError",
          error,
          rollbackError: rollbackResult.error.error,
        });
      }
      return result;
    };

    return ok({
      exec: (query) =>
        trySync(
          () => {
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
            return result as never;
          },
          (error): SqliteError => ({
            type: "SqliteError",
            error: createUnknownError(error),
          }),
        ),

      transaction: (callback) => {
        const beginResult = trySync(() => {
          console.debug("begin");
          driver.exec(sql`begin;`);
        }, createSqliteError);
        if (!beginResult.ok) return beginResult;

        const callbackResult = trySync(callback, createSqliteError);
        if (!callbackResult.ok) {
          return rollback(callbackResult, callbackResult.error.error);
        }

        const callbackValue = callbackResult.value;
        if (!callbackValue.ok) {
          return rollback(
            callbackValue,
            createUnknownError(callbackValue.error),
          );
        }

        const commitResult = trySync(() => {
          console.debug("commit");
          driver.exec(sql`commit;`);
        }, createSqliteError);
        if (!commitResult.ok) {
          return rollback(commitResult, commitResult.error.error);
        }

        return ok(callbackValue.value);
      },

      export: () =>
        trySync(
          () => driver.export(),
          (error): SqliteError => ({
            type: "SqliteError",
            error: createUnknownError(error),
          }),
        ),

      [Symbol.dispose]: () => {
        if (isDisposed) return;
        isDisposed = true;
        driver[Symbol.dispose]();
      },
    });
  };

const createSqliteError = (error: unknown): SqliteError => ({
  type: "SqliteError",
  error: createUnknownError(error),
});

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
