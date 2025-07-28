import { Evolu } from "@evolu/common/evolu";
import type { createUseEvolu } from "./createUseEvolu.js";
import { getCurrentInstance, inject } from "vue";
import { evoluInstanceMap, EvoluContext } from "./provideEvolu.js";

/**
 * Vue composable returning a generic instance of {@link Evolu}.
 *
 * This is intended for internal usage. Applications should use
 * {@link createUseEvolu}, which provides a correctly typed instance.
 */
export const useEvolu = (): Evolu => {
  let evolu: Evolu | null | undefined = inject(EvoluContext, null);

  // We also check the evoluInstanceMap if not injectable (i.e. the root Vue component where Evolu was provided)
  const vueInstance = getCurrentInstance();
  if (!evolu && vueInstance) {
    evolu = evoluInstanceMap.get(vueInstance);
  }

  if (!evolu) {
    throw new Error(
      "Could not find Evolu context value. Ensure you provide Evolu by calling provideEvolu() or wrapping with the <EvoluProvider> wrapper component.",
    );
  }

  return evolu;
};
