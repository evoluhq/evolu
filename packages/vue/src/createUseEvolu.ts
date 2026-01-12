import type { Evolu, EvoluSchema } from "@evolu/common";
import { useEvolu } from "./useEvolu.js";

/**
 * Creates a helper function returning a type-aware instance of {@link Evolu}.
 *
 * ### Example
 *
 * ```ts
 * const useEvolu = createUseEvolu(evolu);
 * const { insert, update } = useEvolu();
 * ```
 */
export const createUseEvolu = <S extends EvoluSchema>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  evolu: Evolu<S>,
): (() => Evolu<S>) => useEvolu as () => Evolu<S>;
