import * as O from "effect/Option";
import { pipe } from "effect/Function";
import { EvoluError } from "@evolu/common";
import { useSyncExternalStore } from "react";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link EvoluError} changes. */
export const useEvoluError = (): EvoluError | null => {
  const evolu = useEvolu();
  const oStore = useSyncExternalStore(
    evolu.subscribeError,
    evolu.getError,
    (): O.Option<EvoluError> => O.none(),
  );

  return pipe(oStore, O.getOrNull); 
};
