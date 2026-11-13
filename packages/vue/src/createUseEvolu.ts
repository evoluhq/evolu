import type {
  AppOwnerEvolu,
  createEvolu,
  Evolu,
  EvoluSchema,
} from "@evolu/common";
import type { createEvoluBinding } from "./createEvoluBinding.ts";
import type { EvoluAppProvider } from "./EvoluAppProvider.ts";
import { useEvolu } from "./useEvolu.ts";

/**
 * Creates a helper function returning a type-aware instance of {@link Evolu},
 * without disposal, because the component doesn't own it. It's for an app that
 * creates its instance with {@link createEvolu}; an app that
 * {@link EvoluAppProvider} provides uses {@link createEvoluBinding}.
 *
 * ### Example
 *
 * Its replacement, `useEvolu` of {@link createEvoluBinding}, returns the same
 * instance.
 *
 * ```ts
 * import {
 *   assertType,
 *   type AppOwnerEvolu,
 *   type TestEvoluSchema,
 * } from "@evolu/common";
 * import { createEvoluBinding } from "@evolu/vue";
 *
 * // Instead of createUseEvolu(evolu). Call useEvolu in component setup.
 * const { useEvolu } = createEvoluBinding<TestEvoluSchema>();
 *
 * assertType<
 *   ReturnType<typeof useEvolu>,
 *   AppOwnerEvolu<TestEvoluSchema>
 * >();
 * ```
 *
 * @deprecated Use `createEvoluBinding<S>().useEvolu` of
 *   {@link createEvoluBinding}, which returns the same instance, also for an app
 *   that creates it with {@link createEvolu}.
 */
export const createUseEvolu = <S extends EvoluSchema>(
  _evolu: AppOwnerEvolu<S>,
): (() => AppOwnerEvolu<S>) => useEvolu as () => AppOwnerEvolu<S>;
