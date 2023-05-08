export * from "./Model.js";
export type { EvoluError, Mnemonic, Owner, OwnerId } from "./Types.js";
import * as S from "@effect/schema/Schema";
import { createEvolu } from "./Evolu.js";
import { Hooks, createHooks } from "./React.js";
import { Config, Schema } from "./Types.js";

// TODO: loadQuery with compile etc.
export const create = <From, To extends Schema>(
  schema: S.Schema<From, To>,
  config?: Partial<Config>
): Hooks<To> => {
  // tohle je problem, ja potrebuju loadQuery
  // evolu musim vytvorit tady
  // a predat to hooks
  // a vratit oboje.
  const evolu = createEvolu(schema, config);
  // evolu.

  return createHooks(evolu);
};
