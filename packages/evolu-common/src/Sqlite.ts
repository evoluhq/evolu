import { Brand, Context, Effect, Predicate, ReadonlyRecord } from "effect";

export interface Sqlite {
  readonly exec: (
    arg: string | SqliteQuery,
  ) => Effect.Effect<never, never, ExecResult>;
}

export const Sqlite = Context.Tag<Sqlite>("evolu/Sqlite");

export type SerializedSqliteQuery = string &
  Brand.Brand<"SerializedSqliteQuery">;

export interface SqliteQuery {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Value>;
}

export const serializeSqliteQuery = ({
  sql,
  parameters,
}: SqliteQuery): SerializedSqliteQuery =>
  JSON.stringify({ sql, parameters }) as SerializedSqliteQuery;

export const deserializeSqliteQuery = (s: SerializedSqliteQuery): SqliteQuery =>
  JSON.parse(s) as SqliteQuery;

export type Value = SqliteValue | JsonObjectOrArray;

export type SqliteValue = null | string | number | Uint8Array;
export type SqliteRow = Record<string, SqliteValue>;

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

export const isJsonObjectOrArray: Predicate.Refinement<
  Value,
  JsonObjectOrArray
> = (value): value is JsonObjectOrArray =>
  value !== null && typeof value === "object" && !(value instanceof Uint8Array);

export const valuesToSqliteValues = (
  values: ReadonlyArray<Value>,
): SqliteValue[] =>
  values.map((value) =>
    isJsonObjectOrArray(value) ? JSON.stringify(value) : value,
  );

export const parseJsonResults = (rows: SqliteRow[]): void => {
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
  // Predicate.isReadonlyRecord
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
