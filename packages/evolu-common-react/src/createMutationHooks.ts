import { Create, Schema, Update } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";

/**
 * Create React Hooks for Evolu's {@link Create} and {@link Update} functions.
 * These two hooks must be created to ensure their types match the database
 * schema.
 */
export const createMutationHooks = <S extends Schema>(): {
  useCreate: () => Create<S>;
  useUpdate: () => Update<S>;
} => ({
  useCreate: () => useEvolu<S>().create,
  useUpdate: () => useEvolu<S>().update,
});
