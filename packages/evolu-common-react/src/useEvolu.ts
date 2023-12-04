import { Evolu, Schema } from "@evolu/common";
import { useContext } from "react";
import { EvoluContext } from "./EvoluContext.js";

/** React Hook returning an instance of {@link Evolu}. */
export const useEvolu = <S extends Schema>(): Evolu<S> => {
  const evolu = useContext(EvoluContext);
  if (evolu == null)
    throw new Error(
      "could not find Evolu context value; please ensure the component is wrapped in a <EvoluProvider>",
    );
  return evolu as Evolu<S>;
};
