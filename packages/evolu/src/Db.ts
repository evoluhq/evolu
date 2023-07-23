import { Brand, Context, Effect, ReadonlyRecord } from "effect";

export interface Db {
  readonly exec: (
    arg: string | QueryObject
  ) => Effect.Effect<never, never, ReadonlyArray<Row>>;

  readonly changes: Effect.Effect<never, never, number>;
}

export const Db = Context.Tag<Db>();

export interface QueryObject {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Value>;
}

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord.ReadonlyRecord<Value>;

export interface TableDefinition {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

export type Query = string & Brand.Brand<"Query">;

export const queryObjectToQuery = ({ sql, parameters }: QueryObject): Query =>
  JSON.stringify({ sql, parameters }) as Query;

// const queryObjectFromQuery = (s: Query): QueryObject =>
//   JSON.parse(s) as QueryObject;
