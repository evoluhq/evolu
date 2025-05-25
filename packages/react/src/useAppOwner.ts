import { AppOwner, constNull } from "@evolu/common";
import { useSyncExternalStore } from "react";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link AppOwner} changes. */
export const useAppOwner = (): AppOwner | null => {
  const evolu = useEvolu();
  return useSyncExternalStore(
    evolu.subscribeAppOwner,
    evolu.getAppOwner,
    constNull,
  );
};
