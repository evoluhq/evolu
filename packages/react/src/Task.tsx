"use client";

import { assert, type Run } from "@evolu/common";
import { createContext, use, type ReactNode } from "react";

/**
 * Creates typed React Context and hook for {@link Run}.
 *
 * The `run` argument is used to infer the deps type for the returned API.
 *
 * `useRun` throws when the provider is missing.
 *
 * ### Example
 *
 * ```tsx
 * const run = createRun(createEvoluDeps());
 * const { RunContext, useRun } = createRunBinding(run);
 *
 * <RunContext value={run}>
 *   <App />
 * </RunContext>;
 *
 * // In a component
 * const run = useRun();
 * ```
 *
 * ### Testing
 *
 * ```tsx
 * const testRun = testCreateRun({ api: testApi });
 * const { RunContext } = createRunBinding(testRun);
 *
 * <RunContext value={testRun}>
 *   <MyComponent />
 * </RunContext>;
 * ```
 */
export const createRunBinding = <D,>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  run: Run<D>,
): {
  readonly RunContext: React.FC<{
    readonly value: Run<D>;
    readonly children?: ReactNode;
  }>;
  readonly useRun: () => Run<D>;
} => {
  const RunContext = createContext<Run<D> | null>(null);

  return {
    RunContext,
    useRun: () => {
      const run = use(RunContext);
      assert(run, "RunContext is missing.");
      return run;
    },
  };
};
