import { AppOwner } from "@evolu/common";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { useEvolu } from "./useEvolu.js";

/** Subscribe to {@link AppOwner} changes. */
export const useAppOwner = (): (() => AppOwner | null) => {
  const evolu = useEvolu();
  const [appOwner, setAppOwner] = createSignal<AppOwner | null>(
    evolu.getAppOwner(),
  );

  createEffect(() => {
    const unsubscribe = evolu.subscribeAppOwner(() => {
      setAppOwner(evolu.getAppOwner());
    });
    onCleanup(unsubscribe);
  });

  return appOwner;
};
