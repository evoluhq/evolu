import * as O from "effect/Option";
import { pipe } from "effect/Function";
import { Owner } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";
import { useSyncEvoluStore } from "./useSyncEvoluStore.js";

/** Subscribe to {@link Owner} changes. */
export const useOwner = (): Owner | null => {
  const evolu = useEvolu();
  return pipe(
    useSyncEvoluStore(evolu.subscribeOwner, evolu.getOwner),
    O.getOrNull,
  );
};
