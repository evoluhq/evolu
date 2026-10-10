import type { Evolu, EvoluSchema } from "@evolu/common";
import { useEvolu } from "./useEvolu.ts";

/**
 * Creates a helper function returning a type-aware instance of {@link Evolu}.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertType,
 *   type Evolu,
 *   type TestEvoluSchema,
 * } from "@evolu/common";
 * import { createUseEvolu } from "@evolu/vue";
 *
 * // The argument only types the result, which returns the instance from
 * // provideEvolu. Call it in component setup.
 * const createAppUseEvolu = (evolu: Evolu<TestEvoluSchema>) =>
 *   createUseEvolu(evolu);
 *
 * assertType<
 *   ReturnType<typeof createAppUseEvolu>,
 *   () => Evolu<TestEvoluSchema>
 * >();
 * ```
 */
export const createUseEvolu = <S extends EvoluSchema>(
  _evolu: Evolu<S>,
): (() => Evolu<S>) => useEvolu as () => Evolu<S>;
