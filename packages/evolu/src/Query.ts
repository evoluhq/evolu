import * as Brand from "@effect/data/Brand";
import * as Schema from "./Schema.js";

// Like Kysely CompiledQuery but without a `query` prop.
export interface Query {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Schema.Value>;
}

export type QueryString = string & Brand.Brand<"QueryString">;

export const queryToString = ({ sql, parameters }: Query): QueryString =>
  JSON.stringify({ sql, parameters }) as QueryString;

export const queryFromString = (s: QueryString): Query =>
  JSON.parse(s) as Query;
