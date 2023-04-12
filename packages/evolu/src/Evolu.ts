import * as S from "@effect/schema/Schema";
import * as Config from "./Config.js";
import * as Db from "./Db.js";
import * as DbWorkerFactory from "./DbWorkerFactory.js";
import * as Owner from "./Owner.js";
import * as Schema from "./Schema.js";

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
    queryString: Db.QueryString | null
  ) => (listener: () => void) => () => void;
  readonly getRowsWithLoadingState: (
    queryString: Db.QueryString | null
  ) => () => Db.RowsWithLoadingState | null;

  readonly mutate: Schema.Mutate<S>;
  readonly ownerActions: Owner.Actions;
}

export const createEvolu = <From, To extends Schema.Schema>(
  _schema: S.Schema<From, To>,
  _config?: Partial<Config.Config>
): Evolu<To> => {
  DbWorkerFactory.createDbWorker((_output) => {
    //
  });

  throw "";
};
