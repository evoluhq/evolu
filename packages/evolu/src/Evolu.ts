import * as Brand from "@effect/data/Brand";
import * as S from "@effect/schema/Schema";
import * as Config from "./Config.js";
import * as DbWorker from "./DbWorker.js";
import * as Owner from "./Owner.js";
import * as Schema from "./Schema.js";

export interface EvoluError {
  _tag: "EvoluError";
  // TODO:
  error: unknown;
}

// n

// Like Kysely CompiledQuery but without a `query` prop.
export interface Query {
  readonly sql: string;
  readonly parameters: readonly Schema.Value[];
}

export type QueryString = string & Brand.Brand<"QueryString">;

export const queryToString = ({ sql, parameters }: Query): QueryString =>
  JSON.stringify({ sql, parameters }) as QueryString;

export const queryFromString = (s: QueryString): Query =>
  JSON.parse(s) as Query;

export interface Evolu<S extends Schema.Schema> {
  readonly subscribeError: (listener: () => void) => () => void;
  readonly getError: () => EvoluError | null;

  readonly subscribeOwner: (listener: () => void) => () => void;
  readonly getOwner: () => Owner.Owner | null;

  readonly subscribeRowsWithLoadingState: (
    queryString: QueryString | null
  ) => (listener: () => void) => () => void;
  readonly getRowsWithLoadingState: (
    queryString: QueryString | null
  ) => () => Schema.RowsWithLoadingState | null;

  readonly mutate: Schema.Mutate<S>;
  readonly ownerActions: Owner.Actions;
}

export const createEvolu = <From, To extends Schema.Schema>(
  _schema: S.Schema<From, To>,
  _config?: Partial<Config.Config>
): Evolu<To> => {
  // takze, vratit api, a naimplementovat funkce
  // jako prvni asi musim vytvorit ten worker

  // const dbWorker =
  DbWorker.create();

  throw "";
};
