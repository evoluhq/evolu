import { Brand, Context, Effect, ReadonlyRecord } from "effect";
import { ParseJSONResultsPlugin } from "kysely";

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

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord.ReadonlyRecord<
  Value | Row | ReadonlyArray<Row>
>;

export type Query = string & Brand.Brand<"Query">;

export const queryObjectToQuery = ({ sql, parameters }: QueryObject): Query =>
  JSON.stringify({ sql, parameters }) as Query;

export const queryObjectFromQuery = (s: Query): QueryObject =>
  JSON.parse(s) as QueryObject;

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
