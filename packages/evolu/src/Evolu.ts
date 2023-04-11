import * as S from "@effect/schema/Schema";
import * as Config from "./Config.js";
import * as DbWorker from "./DbWorker.js";
import * as Owner from "./Owner.js";
import * as Schema from "./Schema.js";
import * as Query from "./Query.js";

export interface EvoluError {
  _tag: "EvoluError";
  // TODO:
  error: unknown;
}

export interface Evolu<S extends Schema.Schema> {
  readonly subscribeError: (listener: () => void) => () => void;
  readonly getError: () => EvoluError | null;

  readonly subscribeOwner: (listener: () => void) => () => void;
  readonly getOwner: () => Owner.Owner | null;

  readonly subscribeRowsWithLoadingState: (
    queryString: Query.QueryString | null
  ) => (listener: () => void) => () => void;
  readonly getRowsWithLoadingState: (
    queryString: Query.QueryString | null
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
