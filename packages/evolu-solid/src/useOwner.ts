import type { Accessor } from "solid-js";
import * as O from "effect/Option";
import { pipe } from "effect/Function";
import { Owner } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";
import { useSyncExternalStore } from "./useSyncExternalStore.js";

/** Subscribe to {@link Owner} changes. */
export const useOwner = (): Accessor<Owner | null> => {
  const evolu = useEvolu();
  return pipe(
    useSyncExternalStore(evolu.subscribeOwner, evolu.getOwner),
    (v) => () => O.getOrNull(v()),
  );
};
