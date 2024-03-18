import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";

export interface Sqlite {
  readonly exec: (query: SqliteQuery) => Effect.Effect<SqliteExecResult>;
}

export const Sqlite = Context.GenericTag<Sqlite>("@services/Sqlite");

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

export const maybeParseJson = (rows: SqliteRow[]): SqliteRow[] =>
  parseArray(rows);

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
    return effect.pipe(
      Effect.tap(() => Effect.log("QueryExecutionTime")),
      // Not using Effect.log because of formating
      // eslint-disable-next-line no-console
      Effect.tap(() => console.log(query.sql)),
      Effect.withLogSpan("duration"),
    );
  };

export type QueryPlanRow = {
  id: number;
  parent: number;
  detail: string;
};

export const drawQueryPlan = (rows: QueryPlanRow[]): string =>
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
