import type { AppOwnerEntry, EvoluApp } from "@evolu/common/local-first";
import { type Ref, shallowReadonly, shallowRef } from "vue";
import { useEvoluApp } from "./EvoluAppProvider.ts";
import { isServerRendering } from "./isServerRendering.ts";
import { subscribeForScope } from "./subscribeForScope.ts";

/**
 * Vue composable returning {@link EvoluApp.appOwners}, the AppOwners the app can
 * open on this device, in a ref that follows them until the current effect
 * scope, such as the component, is disposed. During server rendering, it reads
 * them once.
 */
export const useAppOwners = (): Readonly<Ref<ReadonlyArray<AppOwnerEntry>>> => {
  const { appOwners } = useEvoluApp();
  const entries = shallowRef(appOwners.get());

  if (!isServerRendering())
    subscribeForScope(() =>
      appOwners.subscribe(() => {
        entries.value = appOwners.get();
      }),
    );

  return shallowReadonly(entries);
};
