import * as Brand from "@effect/data/Brand";
import * as Context from "@effect/data/Context";
import * as ReadonlyRecord from "@effect/data/ReadonlyRecord";
import * as Effect from "@effect/io/Effect";

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord.ReadonlyRecord<Value>;

export type Rows = ReadonlyArray<Row>;

export interface RowsWithLoadingState {
  readonly rows: Rows;
  readonly isLoading: boolean;
}

// Like Kysely CompiledQuery but without a `query` prop.
export interface Query {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Value>;
}

export type QueryString = string & Brand.Brand<"QueryString">;

export const queryToString = ({ sql, parameters }: Query): QueryString =>
  JSON.stringify({ sql, parameters }) as QueryString;

export const queryFromString = (s: QueryString): Query =>
  JSON.parse(s) as Query;

export interface Db {
  readonly exec: (arg: string | Query) => Effect.Effect<never, never, Rows>;

  readonly changes: () => Effect.Effect<never, never, number>;
}

export const Db = Context.Tag<Db>();
