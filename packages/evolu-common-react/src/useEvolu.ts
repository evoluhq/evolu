import { Evolu, Schema } from "@evolu/common";
import { useContext } from "react";
import { EvoluContext } from "./EvoluContext.js";

/**
 * React Hook returning an instance of {@link Evolu}.
 *
 * Please don't use it without the generic parameter.
 *
 * @example
 *   const Database = S.struct({
 *     todo: TodoTable,
 *   });
 *   type Database = S.Schema.To<typeof Database>;
 *
 *   const { create, update } = useEvolu<Database>();
 *
 *   // Or make an alias:
 *   // const useEvolu = Evolu.useEvolu<Database>;
 */
export const useEvolu = <S extends Schema>(): Evolu<S> => {
  const evolu = useContext(EvoluContext);
  if (evolu == null)
    throw new Error(
      "could not find Evolu context value; please ensure the component is wrapped in a <EvoluProvider>",
    );
  return evolu as Evolu<S>;
};
