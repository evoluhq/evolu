import type { Evolu } from "@evolu/common/evolu";
import { getCurrentInstance, inject } from "vue";
import { EvoluContext, evoluInstanceMap } from "./provideEvolu.js";
import type { createUseEvolu } from "./createUseEvolu.js";

/**
 * Vue composable returning a generic instance of {@link Evolu}.
 *
 * Applications should prefer {@link createUseEvolu} for proper typing.
 */
export const useEvolu = (): Evolu => {
  let evolu: Evolu | null | undefined = inject(EvoluContext, null);

  const vueInstance = getCurrentInstance();
  if (!evolu && vueInstance) {
    evolu = evoluInstanceMap.get(vueInstance);
  }

  if (!evolu) {
    throw new Error(
      "Could not find Evolu context value. Call provideEvolu() or wrap components with <EvoluProvider>.",
    );
  }

  return evolu;
};
