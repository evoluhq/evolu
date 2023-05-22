export * from "./Model.js";
export type { EvoluError, Mnemonic, Owner, OwnerId } from "./Types.js";
import { pipe } from "@effect/data/Function";
import * as S from "@effect/schema/Schema";
import { createEvolu } from "./Evolu.js";
import { Hooks, createHooks } from "./React.js";
import { Config, Schema } from "./Types.js";

export const create = <From, To extends Schema>(
  schema: S.Schema<From, To>,
  config?: Partial<Config>
): Hooks<To> => pipe(createEvolu(schema, config), createHooks);
