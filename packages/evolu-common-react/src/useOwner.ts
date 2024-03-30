import * as O from "effect/Option";
import { Owner } from "@evolu/common";
import { pipe } from "effect/Function";
import { useSyncExternalStore } from "react";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link Owner} changes. */
export const useOwner = (): Owner | null => {
  const evolu = useEvolu();
  const oStore = useSyncExternalStore(
    evolu.subscribeOwner,
    evolu.getOwner,
    (): O.Option<Owner> => O.none(),
  );

  return pipe(oStore, O.getOrNull);
};
