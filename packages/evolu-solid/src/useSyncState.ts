import * as O from "effect/Option";
import { pipe } from "effect/Function";
import { SyncState } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";
import { useSyncEvoluStore } from "./useSyncEvoluStore.js";

/** Subscribe to {@link SyncState} changes. */
export const useSyncState = (): SyncState => {
  const evolu = useEvolu();
  return pipe(
    useSyncEvoluStore(evolu.subscribeSyncState, () =>
      O.some(evolu.getSyncState()),
    ),
    // kinda `absurd`, because `SyncState` is always there (`some`)
    O.getOrThrowWith(() =>
      Error("Unexpected error. `SyncState` should be there, but is `none`"),
    ),
  );
};
