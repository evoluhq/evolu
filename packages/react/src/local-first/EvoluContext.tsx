"use client";

import { assert, type Result } from "@evolu/common";
import type { Evolu, EvoluSchema } from "@evolu/common/local-first";
import { createContext, use, type ReactNode } from "react";

export const EvoluContext = /*#__PURE__*/ createContext<Evolu>(null as never);

/**
 * Creates typed React Context and Provider for {@link Evolu}.
 *
 * Returns a tuple for easy renaming when using multiple Evolu instances.
 *
 * The provider internally uses React's `use()` to unwrap the Fiber, so it must
 * be wrapped in a Suspense boundary.
 *
 * ### Example
 *
 * ```tsx
 * const app = run(Evolu.createEvolu(Schema, {...}));
 * const [App, AppProvider] = createEvoluContext(app);
 *
 * // Multiple instances with custom names
 * const [TodoEvolu, TodoEvoluProvider] = createEvoluContext(todo);
 * const [NotesEvolu, NotesEvoluProvider] = createEvoluContext(notes);
 *
 * <Suspense>
 *   <AppProvider>
 *     <App />
 *   </AppProvider>
 * </Suspense>;
 *
 * // In a component
 * const evolu = use(App);
 * ```
 */
export const createEvoluContext = <S extends EvoluSchema>(
  fiber: PromiseLike<Result<Evolu<S>, unknown>>,
): readonly [
  React.Context<Evolu<S>>,
  React.FC<{ readonly children?: ReactNode }>,
] => [
  EvoluContext as React.Context<Evolu<S>>,
  ({ children }) => {
    const result = use(fiber);
    assert(result.ok, "createEvolu failed");

    return (
      <EvoluContext value={result.value as Evolu}>{children}</EvoluContext>
    );
  },
];
