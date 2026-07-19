"use client";

import { assert, type DisposableRun, type Run } from "@evolu/common";
import { createContext, use, type ReactNode } from "react";

/**
 * Creates typed React Context and hook for {@link Run}.
 *
 * The {@link DisposableRun} type argument is used to infer the deps type for the
 * returned API, which exposes only {@link Run}.
 *
 * `useRun` throws when the provider is missing.
 *
 * ### Example
 *
 * ```tsx
 * const run = createRun(createEvoluDeps());
 * const { RunContext, useRun } = createRunBinding<typeof run>();
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
 * const { RunContext } = createRunBinding<typeof testRun>();
 *
 * <RunContext value={testRun}>
 *   <MyComponent />
 * </RunContext>;
 * ```
 */
export const createRunBinding = <
  R extends DisposableRun<any> = DisposableRun<unknown>,
>(): {
  readonly RunContext: React.FC<{
    readonly value: Run<R extends DisposableRun<infer D> ? D : never>;
    readonly children?: ReactNode;
  }>;
  readonly useRun: () => Run<R extends DisposableRun<infer D> ? D : never>;
} => {
  type D = R extends DisposableRun<infer D> ? D : never;

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
