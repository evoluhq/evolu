import * as Db from "./Db.js";
import * as Schema from "@effect/schema/Schema";
import * as Errors from "./Errors.js";
import * as Model from "./Model.js";
import * as Config from "./Config.js";

export interface Evolu {
  readonly subscribeError: (listener: () => void) => () => void;
  readonly getError: () => Errors.EvoluError | null;

  readonly subscribeOwner: (listener: () => void) => () => void;
  readonly getOwner: () => Model.Owner | null;

  readonly subscribeRowsWithLoadingState: (
    queryString: Db.QueryString | null
  ) => (listener: () => void) => () => void;
  readonly getRowsWithLoadingState: (
    queryString: Db.QueryString | null
  ) => () => Db.RowsWithLoadingState | null;

  readonly mutate: Db.Mutate;
  readonly ownerActions: Db.OwnerActions;
}

export const createEvolu = <From, To extends Db.Schema>(
  _schema: Schema.Schema<From, To>,
  _config?: Partial<Config.Config>
): Evolu => {
  throw "";
};
