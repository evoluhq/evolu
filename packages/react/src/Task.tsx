"use client";

import { testCreateRun, type Run } from "@evolu/common";
import { createContext, type ReactNode } from "react";

const RunContext = /*#__PURE__*/ createContext<Run>(testCreateRun());

/**
 * Creates typed React Context and Provider for {@link Run}.
 *
 * ### Example
 *
 * ```tsx
 * const run = createRun(createEvoluDeps());
 * const { Run, RunProvider } = createRunContext(run);
 *
 * <RunProvider>
 *   <App />
 * </RunProvider>;
 *
 * // In a component
 * const run = use(Run);
 * ```
 */
export const createRunContext = <D,>(
  run: Run<D>,
): {
  readonly Run: React.Context<Run<D>>;
  readonly RunProvider: React.FC<{ readonly children?: ReactNode }>;
} => ({
  Run: RunContext as React.Context<Run<D>>,
  RunProvider: ({ children }) => (
    <RunContext value={run}>{children}</RunContext>
  ),
});
