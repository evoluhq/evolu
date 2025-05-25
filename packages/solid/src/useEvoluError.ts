import { EvoluError } from "@evolu/common";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link EvoluError} changes. */
export const useEvoluError = (): (() => EvoluError | null) => {
  const evolu = useEvolu();
  const [error, setError] = createSignal<EvoluError | null>(evolu.getError());

  createEffect(() => {
    const unsubscribe = evolu.subscribeError(() => {
      setError(evolu.getError());
    });
    onCleanup(unsubscribe);
  });

  return error;
};
