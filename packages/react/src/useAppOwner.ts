import { AppOwner, constNull } from "@evolu/common";
import { useSyncExternalStore } from "react";
import { useEvolu } from "./useEvolu.js";

/** Get {@link AppOwner}. */
export const useAppOwner = (): AppOwner | null => {
  const evolu = useEvolu();
  return useSyncExternalStore(
    evolu.subscribeAppOwner,
    evolu.getAppOwner,
    constNull,
  );
};
