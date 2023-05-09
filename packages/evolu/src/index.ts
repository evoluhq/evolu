export * from "./Model.js";
export type { EvoluError, Mnemonic, Owner, OwnerId } from "./Types.js";
import * as S from "@effect/schema/Schema";
import { createEvolu } from "./Evolu.js";
import { Hooks, createHooks } from "./React.js";
import { Config, Schema } from "./Types.js";

export const create = <From, To extends Schema>(
  schema: S.Schema<From, To>,
  config?: Partial<Config>
): Hooks<To> => {
  const evolu = createEvolu(schema, config);
  // TODO: loadQuery with compile etc.
  // evolu.loadQuery

  return createHooks(evolu);
};
