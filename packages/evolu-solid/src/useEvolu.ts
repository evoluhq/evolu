import { Evolu, DatabaseSchema } from "@evolu/common";
import { useContext } from "solid-js";
import { EvoluContext } from "./EvoluContext.js";

/**
 * Hook returning an instance of {@link Evolu}.
 *
 * Please don't use it without the generic parameter.
 *
 * @example
 *   const Database = database({
 *     todo: TodoTable,
 *   });
 *   type Database = S.Schema.Type<typeof Database>;
 *
 *   const { create, update } = useEvolu<Database>();
 *
 *   // Or make an alias:
 *   // const useEvolu = Evolu.useEvolu<Database>;
 */
export const useEvolu = <S extends DatabaseSchema>(): Evolu<S> => {
  const evolu = useContext(EvoluContext);
  if (evolu == null)
    throw new Error(
      "could not find Evolu context value; please ensure the component is wrapped in a <EvoluProvider>",
    );
  return evolu as Evolu<S>;
};
