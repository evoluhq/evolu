import type { EvoluError } from "@evolu/common";
import { onScopeDispose, Ref, ref } from "vue";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link EvoluError} changes. */
export const useEvoluError = (): Ref<EvoluError | null> => {
  const evolu = useEvolu();
  const error = ref(evolu.getError());

  const unsubscribe = evolu.subscribeError(() => {
    error.value = evolu.getError();
  });

  onScopeDispose(unsubscribe);

  return error;
};
