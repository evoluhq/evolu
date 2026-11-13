import type {
  AppOwnerEvolu,
  Evolu,
  EvoluSchema,
} from "@evolu/common/local-first";
import { getCurrentInstance, inject } from "vue";
import { EvoluContext, evoluInstanceMap } from "./provideEvolu.ts";
import type { createEvoluBinding } from "./createEvoluBinding.ts";

/**
 * Vue composable returning a generic instance of {@link Evolu}, without
 * disposal, because the component doesn't own it.
 *
 * Applications should prefer {@link createEvoluBinding} for proper typing.
 */
export const useEvolu = (): AppOwnerEvolu<EvoluSchema> => {
  let evolu: AppOwnerEvolu<EvoluSchema> | null | undefined = inject(
    EvoluContext,
    null,
  );

  const vueInstance = getCurrentInstance();
  if (!evolu && vueInstance) {
    evolu = evoluInstanceMap.get(vueInstance);
  }

  if (!evolu) {
    throw new Error(
      "Could not find Evolu context value. Call provideEvolu() or wrap components with <EvoluProvider> or <EvoluAppProvider>.",
    );
  }

  return evolu;
};
