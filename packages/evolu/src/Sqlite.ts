import { Brand, Context, Effect, ReadonlyRecord } from "effect";

interface ExecResult {
  readonly rows: ReadonlyArray<Row>;
  readonly changes: number;
}

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

// TODO: Put Uint8Array back once expo-sqlite is fixed.
export type Value = null | string | number;

// TODO: jsonObjectFrom
// TODO: Can JSON be nested?
// export type Row = ReadonlyRecord.ReadonlyRecord<Value | ReadonlyArray<Row>>;
export type Row = ReadonlyRecord.ReadonlyRecord<
  Value | ReadonlyArray<ReadonlyRecord.ReadonlyRecord<Value>>
>;

export type Query = string & Brand.Brand<"Query">;

export const queryObjectToQuery = ({ sql, parameters }: QueryObject): Query =>
  JSON.stringify({ sql, parameters }) as Query;

export const queryObjectFromQuery = (s: Query): QueryObject =>
  JSON.parse(s) as QueryObject;
