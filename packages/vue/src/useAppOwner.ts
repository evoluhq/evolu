import { AppOwner } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";
import { onScopeDispose, Ref, ref } from "vue";

/** Subscribe to {@link AppOwner} changes. */
export const useAppOwner = (): Ref<AppOwner | null> => {
  const evolu = useEvolu();

  const appOwner = ref(evolu.getAppOwner());

  const unsubscribe = evolu.subscribeAppOwner(() => {
    appOwner.value = evolu.getAppOwner();
  });
  onScopeDispose(unsubscribe);

  return appOwner;
};
