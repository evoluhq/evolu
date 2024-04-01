import * as O from "effect/Option";
import { pipe } from "effect/Function";
import { EvoluError } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";
import { useSyncEvoluStore } from "./useSyncEvoluStore.js";

/** Subscribe to {@link Owner} changes. */
export const useEvoluError = (): EvoluError | null => {
  const evolu = useEvolu();
  return pipe(
    useSyncEvoluStore(evolu.subscribeError, evolu.getError),
    O.getOrNull,
  );
};
