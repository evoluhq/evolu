import { Brand, Context, Effect, Predicate, ReadonlyRecord } from "effect";
import { ParseJSONResultsPlugin } from "kysely";

export interface Sqlite {
  readonly exec: (
    arg: string | QueryObject,
  ) => Effect.Effect<never, never, ExecResult>;
}

export const Sqlite = Context.Tag<Sqlite>("evolu/Sqlite");

export interface QueryObject {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Value>;
}

export type Value = SqliteValue | JsonObjectOrArray;

export type SqliteValue = null | string | number | Uint8Array;

export type JsonObjectOrArray = JsonObject | JsonArray;

type JsonObject = ReadonlyRecord.ReadonlyRecord<Json>;
type JsonArray = ReadonlyArray<Json>;
type Json = string | number | boolean | null | JsonObject | JsonArray;

interface ExecResult {
  readonly rows: ReadonlyArray<Row>;
  readonly changes: number;
}

export type Row = ReadonlyRecord.ReadonlyRecord<
  Value | Row | ReadonlyArray<Row>
>;

export type Query = string & Brand.Brand<"Query">;

export const isJsonObjectOrArray: Predicate.Refinement<
  Value,
  JsonObjectOrArray
> = (value): value is JsonObjectOrArray =>
  value !== null && typeof value === "object" && !(value instanceof Uint8Array);

export const valuesToSqliteValues = (
  values: ReadonlyArray<Value>,
): ReadonlyArray<SqliteValue> =>
  values.map((value) =>
    isJsonObjectOrArray(value) ? JSON.stringify(value) : value,
  );

export const queryObjectToQuery = ({ sql, parameters }: QueryObject): Query =>
  JSON.stringify({ sql, parameters }) as Query;

export const queryObjectFromQuery = (s: Query): QueryObject =>
  JSON.parse(s) as QueryObject;

// TODO: Rewrite.
export const parseJSONResults = (
  // pass ParseJSONResultsPlugin because of tree shaking
  parseJSONResultsPlugin: ParseJSONResultsPlugin,
  rows: ReadonlyArray<Row>,
): Effect.Effect<never, never, ReadonlyArray<Row>> =>
  Effect.promise(() =>
    parseJSONResultsPlugin
      .transformResult({ result: { rows } } as never)
      .then((a) => a.rows as ReadonlyArray<Row>),
  );
