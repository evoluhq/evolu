"use client";

import { assert, type DisposableRun, type Run } from "@evolu/common";
import { createContext, use, type FC, type ReactNode } from "react";

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
 * import { assertEqual, createRun } from "@evolu/common";
 * import { createRunBinding } from "@evolu/react";
 * import type { FC } from "react";
 * import { renderToString } from "react-dom/server";
 *
 * interface GreetingDep {
 *   readonly greeting: string;
 * }
 *
 * await using run = createRun<GreetingDep>({ greeting: "Hello" });
 * const { RunContext, useRun } = createRunBinding<typeof run>();
 *
 * const Greeting: FC = () => <p>{useRun().deps.greeting}</p>;
 *
 * assertEqual(
 *   renderToString(
 *     <RunContext value={run}>
 *       <Greeting />
 *     </RunContext>,
 *   ),
 *   "<p>Hello</p>",
 * );
 * ```
 *
 * ### Testing
 *
 * Provide a {@link Run} with test dependencies to the app's `RunContext`.
 *
 * ```tsx
 * import {
 *   assertEqual,
 *   testCreateRun,
 *   type DisposableRun,
 * } from "@evolu/common";
 * import { createRunBinding } from "@evolu/react";
 * import type { FC } from "react";
 * import { renderToString } from "react-dom/server";
 *
 * interface GreetingDep {
 *   readonly greeting: string;
 * }
 *
 * const { RunContext, useRun } =
 *   createRunBinding<DisposableRun<GreetingDep>>();
 * const Greeting: FC = () => <p>{useRun().deps.greeting}</p>;
 *
 * await using run = testCreateRun({ greeting: "Hi" });
 *
 * assertEqual(
 *   renderToString(
 *     <RunContext value={run}>
 *       <Greeting />
 *     </RunContext>,
 *   ),
 *   "<p>Hi</p>",
 * );
 * ```
 */
export const createRunBinding = <
  R extends DisposableRun<any> = DisposableRun,
>(): {
  readonly RunContext: FC<{
    value: Run<R extends DisposableRun<infer D> ? D : never>;
    children?: ReactNode;
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
