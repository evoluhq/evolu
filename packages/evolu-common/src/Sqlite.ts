import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as Scope from "effect/Scope";
import { Config } from "./Config.js";

export class Sqlite extends Context.Tag("Sqlite")<
  Sqlite,
  {
    readonly exec: (query: SqliteQuery) => Effect.Effect<SqliteExecResult>;
    readonly transaction: (
      /**
       * Use `exclusive` for mutations and `shared` for read-only queries. This
       * shared/exclusive lock pattern allows multiple simultaneous readers but
       * only one writer. In Evolu, this pattern also ensures that every write
       * can be immediately read without waiting to complete. For example, we
       * can add data on one page and then immediately redirect to another, and
       * the data will be there.
       *
       * There is also a `last` mode that ensures no other transaction can run.
       * It's for DbWorker reset to ensure no data are accidentally saved after
       * database wipe-out.
       */
      mode: SqliteTransactionMode,
    ) => <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, Sqlite | R>;
  }
>() {}

export type SqliteTransactionMode = "exclusive" | "shared" | "last";

/**
 * Usually, Tag and Service can have the same name, but in this case, we create
 * instances dynamically via `createSqlite` and not via Layer, so we need
 * Context.Tag.Service type. Logically, `createSqlite` creates a service, not a
 * tag.
 */
export interface SqliteService extends Context.Tag.Service<typeof Sqlite> {}

export class SqliteFactory extends Context.Tag("SqliteFactory")<
  SqliteFactory,
  {
    readonly createSqlite: Effect.Effect<
      SqliteService,
      never,
      Config | Scope.Scope
    >;
  }
>() {
  static Common = Layer.effect(
    SqliteFactory,
    Effect.map(SqliteFactory, (platformSqliteFactory) => ({
      createSqlite: Effect.logTrace("SqliteFactory createSqlite").pipe(
        Effect.zipRight(platformSqliteFactory.createSqlite),
        Effect.map(
          (platformSqlite): SqliteService => ({
            exec: (query) =>
              platformSqlite.exec(query).pipe(
                Effect.tap((result) => {
                  maybeParseJson(result.rows);
                }),
                Effect.tap((result) =>
                  ["begin", "rollback", "commit"].includes(query.sql)
                    ? Effect.logDebug(`SQLiteCommon ${query.sql} transaction`)
                    : Effect.logDebug(["SQLiteCommon exec", query, result]),
                ),
              ),
            transaction: (mode) => (effect) => {
              // Shared is for readonly queries.
              if (mode === "shared")
                return platformSqlite.transaction(mode)(effect);
              return Effect.flatMap(Sqlite, (sqlite) =>
                Effect.acquireUseRelease(
                  sqlite.exec({ sql: "begin" }),
                  () => effect,
                  (_, exit) =>
                    Exit.isFailure(exit)
                      ? sqlite.exec({ sql: "rollback" })
                      : sqlite.exec({ sql: "commit" }),
                ),
              ).pipe(platformSqlite.transaction(mode));
            },
          }),
        ),
      ),
    })),
  );
}

export interface SqliteQuery {
  readonly sql: string;
  readonly parameters?: Value[];
  readonly options?: SqliteQueryOptions;
}

export interface SqliteQueryOptions {
  readonly logQueryExecutionTime?: boolean;
  /** https://www.sqlite.org/eqp.html */
  readonly logExplainQueryPlan?: boolean;
}

export type Value = SqliteValue | JsonObjectOrArray;
export type SqliteValue = null | string | number | Uint8Array;
export type JsonObjectOrArray = JsonObject | JsonArray;
type JsonObject = { [key: string]: Json };
type JsonArray = ReadonlyArray<Json>;
type JsonPrimitive = string | number | boolean | null;
type Json = JsonPrimitive | JsonObject | JsonArray;

export interface SqliteExecResult {
  readonly rows: SqliteRow[];
  readonly changes: number;
}

export type SqliteRow = Record<string, SqliteValue>;

export const isJsonObjectOrArray: Predicate.Refinement<
  Value,
  JsonObjectOrArray
> = (value): value is JsonObjectOrArray =>
  value !== null && typeof value === "object" && !Predicate.isUint8Array(value);

export const valuesToSqliteValues = (
  values: ReadonlyArray<Value>,
): SqliteValue[] =>
  values.map((value) =>
    isJsonObjectOrArray(value) ? JSON.stringify(value) : value,
  );

/** This function mutates for better performance. */
export const maybeParseJson = (rows: SqliteRow[]): void => {
  parseArray(rows);
};

const parseArray = <T>(a: T[]): T[] => {
  for (let i = 0; i < a.length; ++i) a[i] = parse(a[i]) as T;
  return a;
};

const parse = (o: unknown): unknown => {
  if (Predicate.isString(o)) return parseString(o);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  if (Array.isArray(o)) return parseArray(o);
  if (typeof o === "object" && o !== null && !Predicate.isUint8Array(o))
    return parseObject(o as Record<string, unknown>);
  return o;
};

const parseString = (s: string): unknown => {
  if (maybeJson(s))
    try {
      return parse(JSON.parse(s));
    } catch (err) {
      // Nothing to do.
    }
  return s;
};

export const maybeJson: Predicate.Predicate<string> = (value) =>
  value.match(/^[[{]/) != null;

const parseObject = (o: Record<string, unknown>): Record<string, unknown> => {
  for (const key in o) o[key] = parse(o[key]);
  return o;
};

/** This is good enough detection because SQL strings in Evolu are predictable. */
const isSqlMutationRegEx = new RegExp(
  `\\b(${[
    "alter",
    "create",
    "delete",
    "drop",
    "insert",
    "replace",
    "update",
  ].join("|")})\\b`,
);

export const isSqlMutation = (sql: string): boolean =>
  isSqlMutationRegEx.test(sql);

export const maybeLogSqliteQueryExecutionTime =
  (query: SqliteQuery) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    if (!query.options?.logQueryExecutionTime) return effect;
    return Effect.Do.pipe(
      Effect.let("start", () => performance.now()),
      Effect.bind("result", () => effect),
      Effect.let("elapsed", ({ start }) => performance.now() - start),
      Effect.tap(({ elapsed }) =>
        Console.log(`QueryExecutionTime: ${elapsed}ms`, query),
      ),
      Effect.map(({ result }) => result),
    );
  };

export type SqliteQueryPlanRow = {
  id: number;
  parent: number;
  detail: string;
};

export const drawSqliteQueryPlan = (rows: SqliteQueryPlanRow[]): string =>
  rows
    .map((row) => {
      let parentId = row.parent;
      let indent = 0;

      do {
        const parent = rows.find((r) => r.id === parentId);
        if (!parent) break;
        parentId = parent.parent;
        indent++;
        // eslint-disable-next-line no-constant-condition
      } while (true);

      return `${"  ".repeat(indent)}${row.detail}`;
    })
    .join("\n");
