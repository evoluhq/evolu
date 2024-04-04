import type { Accessor } from "solid-js";
import * as O from "effect/Option";
import { pipe } from "effect/Function";
import { EvoluError } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";
import { useSyncExternalStore } from "./useSyncExternalStore.js";

/** Subscribe to {@link Owner} changes. */
export const useEvoluError = (): Accessor<EvoluError | null> => {
  const evolu = useEvolu();
  return pipe(
    useSyncExternalStore(evolu.subscribeError, evolu.getError),
    (v) => () => O.getOrNull(v()),
  );
};
