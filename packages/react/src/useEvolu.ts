import { Evolu } from "@evolu/common/local-first";
import { useContext } from "react";
import { EvoluContext } from "./EvoluContext.js";
import type { createUseEvolu } from "./createUseEvolu.js";

/**
 * React Hook returning a generic instance of {@link Evolu}.
 *
 * This is intended for internal usage. Applications should use
 * {@link createUseEvolu}, which provides a correctly typed instance.
 */
export const useEvolu = (): Evolu => {
  const evolu = useContext(EvoluContext);
  if (evolu == null) {
    throw new Error(
      "Could not find Evolu context value. Ensure the component is wrapped in an <EvoluProvider>.",
    );
  }
  return evolu as Evolu;
};
