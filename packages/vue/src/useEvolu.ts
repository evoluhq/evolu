import { Evolu } from "@evolu/common/evolu";
import { EvoluContext } from "./EvoluContext.js";
import type { createUseEvolu } from "./createUseEvolu.js";
import { getCurrentInstance, inject } from "vue";
import { evoluInstanceMap } from "./provideEvolu.js";

/**
 * Vue composable returning a generic instance of {@link Evolu}.
 *
 * This is intended for internal usage. Applications should use
 * {@link createUseEvolu}, which provides a correctly typed instance.
 */
export const useEvolu = (): Evolu => {
  // We first try to inject it normally via Vue's dependency injection
  let evolu: Evolu | null | undefined = inject(EvoluContext, null);

  // We also check the evoluInstanceMap if not injectable (i.e. the root Vue component where Evolu was provided)
  const vueInstance = getCurrentInstance();
  if (!evolu && vueInstance) {
    evolu = evoluInstanceMap.get(vueInstance);
  }

  // By this point, a missing Evolu instance means it was not configured properly
  if (!evolu) {
    throw new Error(
      "Could not find Evolu context value. Ensure you provide Evolu via provideEvolu() or the <EvoluProvider> wrapper component.",
    );
  }

  return evolu;
};
