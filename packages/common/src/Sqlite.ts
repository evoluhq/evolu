import { Brand } from "./Brand.js";
import { ConsoleDep } from "./Console.js";
import { EncryptionKey } from "./Crypto.js";
import { createTransferableError, TransferableError } from "./Error.js";
import { err, ok, Result, tryAsync, trySync } from "./Result.js";
import { Null, Number, SimpleName, String, Uint8Array, union } from "./Type.js";
import { IntentionalNever, Predicate } from "./Types.js";

/**
 * SQLite driver interface. This is the minimal interface that platform-specific
 * drivers must implement.
 */
export interface SqliteDriver extends Disposable {
  readonly exec: (query: SqliteQuery, isMutation: boolean) => SqliteExecResult;
  readonly export: () => Uint8Array;
}

export type CreateSqliteDriver = (
  name: SimpleName,
  options?: SqliteDriverOptions,
) => Promise<SqliteDriver>;

export interface CreateSqliteDriverDep {
  readonly createSqliteDriver: CreateSqliteDriver;
}

export interface SqliteDriverOptions {
  memory?: boolean;
  encryptionKey?: EncryptionKey | undefined;
}

/**
 * Cross-platform SQLite abstraction.
 *
 * This API is sync only because SQLite is an embedded, single-threaded engine.
 * All operations are blocking and in-process, so async APIs add needless
 * complexity without any real benefit and are also slower. Check better-sqlite3
 * GitHub issues and docs for details.
 */
export interface Sqlite extends Disposable {
  readonly exec: <R extends SqliteRow = SqliteRow>(
    query: SqliteQuery,
  ) => Result<SqliteExecResult<R>, SqliteError>;

  /**
   * Executes a transaction, running the provided callback within a begin/commit
   * block. If the callback returns an error (E or {@link SqliteError}), the
   * transaction is rolled back. If the rollback fails, a SqliteError is
   * returned with both the original error and rollbackError.
   */
  readonly transaction: <T, E>(
    callback: () => Result<T, E | SqliteError>,
  ) => Result<T, E | SqliteError>;

  readonly export: () => Result<Uint8Array, SqliteError>;
}

export interface SqliteDep {
  readonly sqlite: Sqlite;
}

export interface SqliteQuery {
  readonly sql: SafeSql;
  readonly parameters: Array<SqliteValue>;
  readonly options?: SqliteQueryOptions;
}

/** A type representing a sanitized SQL string. */
export type SafeSql = string & Brand<"TimestampString">;

/**
 * A value that can be stored in Sqlite.
 *
 * Note that Evolu can't support Int64 because expo-sqlite (and some others) do
 * not support it.
 */
export const SqliteValue = union(Null, String, Number, Uint8Array);
export type SqliteValue = typeof SqliteValue.Type;

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
export interface SqliteError {
  readonly type: "SqliteError";
  readonly error: TransferableError;
  readonly rollbackError?: TransferableError;
}

export type SqliteRow = Record<string, SqliteValue>;

/**
 * Creates a fully featured {@link Sqlite} instance from a {@link SqliteDriver}
 * implementation.
 */
export const createSqlite =
  (deps: CreateSqliteDriverDep & Partial<ConsoleDep>) =>
  async (
    name: SimpleName,
    options?: SqliteDriverOptions,
  ): Promise<Result<Sqlite, SqliteError>> =>
    tryAsync(async () => {
      const driver = await deps.createSqliteDriver(name, options);
      let isDisposed = false;

      const doRollback = () =>
        trySync(() => {
          deps.console?.log("[sql] rollback");
          driver.exec(sql`rollback;`, true);
        }, createSqliteError);

      const sqlite: Sqlite = {
        exec: (query) =>
          trySync(
            () => {
              deps.console?.log("[sql]", { query });

              const result = maybeLogSqliteQueryExecutionTime(query, () =>
                driver.exec(query, isSqlMutation(query.sql)),
              );

              deps.console?.log("[sql]", { result });

              return result as IntentionalNever;
            },
            (error): SqliteError => ({
              type: "SqliteError",
              error: createTransferableError(error),
            }),
          ),

        transaction: (callback) => {
          const transactionResult = trySync(() => {
            deps.console?.log("[sql] begin");
            driver.exec(sql`begin;`, true);

            const result = callback();
            if (!result.ok) return result;

            deps.console?.log("[sql] commit");
            driver.exec(sql`commit;`, true);

            return result;
          }, createSqliteError);

          // There was an SqliteError during begin, callback, or commit
          if (!transactionResult.ok) {
            const rollback = doRollback();
            if (!rollback.ok) {
              deps.console?.log("[sql] rollback failed", rollback.error);
              return err({
                type: "SqliteError",
                error: transactionResult.error.error,
                rollbackError: rollback.error.error,
              });
            }
            return transactionResult;
          }

          // Callback returned an error
          if (!transactionResult.value.ok) {
            const rollback = doRollback();
            if (!rollback.ok) {
              deps.console?.log("[sql] rollback failed", rollback.error);
              return err({
                type: "SqliteError",
                error: createTransferableError(transactionResult.value.error),
                rollbackError: rollback.error.error,
              });
            }
            return transactionResult.value;
          }

          return ok(transactionResult.value.value);
        },

        export: () =>
          trySync(
            () => {
              return driver.export();
            },
            (error): SqliteError => ({
              type: "SqliteError",
              error: createTransferableError(error),
            }),
          ),

        [Symbol.dispose]: () => {
          if (isDisposed) return;
          isDisposed = true;
          driver[Symbol.dispose]();
        },
      };

      return sqlite;
    }, createSqliteError);

const createSqliteError = (error: unknown): SqliteError => ({
  type: "SqliteError",
  error: createTransferableError(error),
});

const maybeLogSqliteQueryExecutionTime = <T>(
  query: SqliteQuery,
  callback: () => T,
): T => {
  if (!query.options?.logQueryExecutionTime) {
    return callback();
  }

  const start = performance.now();
  const result = callback();
  const elapsed = performance.now() - start;

  // eslint-disable-next-line no-console
  console.log(`SqliteQueryExecutionTime: ${elapsed.toString()}ms`, query);

  return result;
};

export interface PreparedStatements<P> extends Disposable {
  readonly get: <T extends boolean>(
    query: SqliteQuery,
    alwaysPrepare?: T,
  ) => T extends true ? P : P | null;
}

export const createPreparedStatementsCache = <P>(
  factory: (sql: SafeSql) => P,
  disposeFn: (statement: P) => void,
): PreparedStatements<P> => {
  let isDisposed = false;
  const cache = new Map<SafeSql, P>();

  return {
    get: (query, alwaysPrepare) => {
      if (alwaysPrepare !== true && !query.options?.prepare)
        return null as IntentionalNever;
      let statement = cache.get(query.sql);
      if (!statement) {
        statement = factory(query.sql);
        cache.set(query.sql, statement);
      }
      return statement as IntentionalNever;
    },

    [Symbol.dispose]: () => {
      if (isDisposed) return;
      isDisposed = true;
      cache.forEach(disposeFn);
      cache.clear();
    },
  };
};

export interface SqlIdentifier {
  type: "SqlIdentifier";
  sql: SafeSql;
}

export interface RawSql {
  type: "RawSql";
  sql: string;
}

export type SqlTemplateParam = SqliteValue | SqlIdentifier | RawSql;

/** TODO: Docs. */
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

  return { sql: sql as SafeSql, parameters: values };
};

sql.identifier = (identifier: string): SqlIdentifier => ({
  type: "SqlIdentifier",
  // From Kysely
  sql: `"${identifier.replace(/"/g, '""')}"` as SafeSql,
});

/**
 * Insert any string.
 *
 * Sql.raw sometimes breaks auto-formatting because the parser does not consider
 * it valid SQL. A workaround is to remove it, format it, and put it back.
 *
 * **Warning**: This is not escaped.
 */
sql.raw = (raw: string): RawSql => ({ type: "RawSql", sql: raw });

sql.prepared = (
  strings: TemplateStringsArray,
  ...parameters: Array<SqlTemplateParam>
): SqliteQuery => {
  const query = sql(strings, ...parameters);
  return { ...query, options: { prepare: true } };
};

const isSqlMutationRegEx = new RegExp(
  `\\b(${[
    "alter",
    "create",
    "delete",
    "drop",
    "insert",
    "replace",
    "update",
    "begin",
    "commit",
    "rollback",
    "pragma",
    "vacuum",
  ].join("|")})\\b`,
  "i",
);

/**
 * Removes SQL line comments (--) from a SQL string without using regex to avoid
 * ReDoS vulnerabilities.
 */
const removeSqlComments = (sql: string): string => {
  let result = "";
  let i = 0;

  while (i < sql.length) {
    // Check for comment start
    if (i < sql.length - 1 && sql[i] === "-" && sql[i + 1] === "-") {
      // Skip until end of line or end of string
      i += 2;
      while (i < sql.length && sql[i] !== "\n") {
        i++;
      }
      // Keep the newline if present
      if (i < sql.length && sql[i] === "\n") {
        result += "\n";
        i++;
      }
    } else {
      result += sql[i];
      i++;
    }
  }

  return result;
};

export const isSqlMutation: Predicate<string> = (sql) =>
  isSqlMutationRegEx.test(removeSqlComments(sql));

export interface SqliteQueryPlanRow {
  id: number;
  parent: number;
  detail: string;
}

export const explainSqliteQueryPlan =
  (deps: SqliteDep) =>
  (query: SqliteQuery): Result<void, SqliteError> => {
    const result = deps.sqlite.exec({
      ...query,
      sql: `EXPLAIN QUERY PLAN ${query.sql}` as SafeSql,
    });
    if (!result.ok) return result;

    // eslint-disable-next-line no-console
    console.log("[explainSqliteQueryPlan]", query);
    // eslint-disable-next-line no-console
    console.log(
      drawSqliteQueryPlan(
        result.value.rows as unknown as Array<SqliteQueryPlanRow>,
      ),
    );

    return ok();
  };

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
 * SQLite represents boolean values using `0` (false) and `1` (true) instead of
 * a dedicated boolean type.
 *
 * Use {@link sqliteTrue} and {@link sqliteFalse} constants for better
 * readability.
 *
 * See: https://www.sqlite.org/quirks.html#no_separate_boolean_datatype
 */
export const SqliteBoolean = union(0, 1);
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
