/**
 * The worker side of the web target. Each stack has a worker module that calls
 * {@link serveWebStack} with a function creating its `BenchStack`. The worker
 * then answers the runner's requests one at a time: it fetches and splits the
 * workloads and opens the stack in a directory of its own, runs `runBench` of
 * `run.mts` per run, and disposes the stack.
 *
 * @module
 */

import { workloads, workloadsPath } from "../../sqlite-wasm/workload.mts";
import { runBench, type BenchStack } from "../run.mts";
import { splitStatements } from "../workload.mts";

/** Options of a stack, which its worker module interprets. */
export type WebStackOptions = Readonly<Record<string, string>>;

/** What a stack's create function gets. */
export interface CreateWebStackOptions {
  /** A directory of the stack's own under the OPFS root. */
  readonly directory: string;
  readonly options: WebStackOptions;
  /** Where the wa-sqlite clone is served, ending with a slash. */
  readonly waSqliteUrl: string;
}

/** A request from the runner. */
export type WebRequest =
  | {
      readonly type: "Open";
      readonly stack: CreateWebStackOptions;
      readonly encrypted: boolean;
    }
  | {
      readonly type: "Run";
      readonly name: string;
      readonly verifyContent: boolean;
    }
  | { readonly type: "Dispose" };

/** The answer to a {@link WebRequest}. */
export type WebResponse =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

/** What an Open request returns. */
export interface WebOpenResult {
  readonly userAgent: string;
  /**
   * Whether the worker is cross-origin isolated, which makes engines time with
   * microseconds instead of a tenth of a millisecond or a millisecond.
   */
  readonly crossOriginIsolated: boolean;
  /** The smallest step of `performance.now()` the worker observed. */
  readonly timerResolutionMs: number;
}

/** Answers the runner's requests with the stack the function creates. */
export const serveWebStack = (
  createStack: (options: CreateWebStackOptions) => Promise<BenchStack>,
): void => {
  let stack: BenchStack | null = null;
  let workloadStatements: ReadonlyArray<ReadonlyArray<string>> | null = null;
  let encrypted = false;
  // Each request starts when the previous one settles.
  let queue: Promise<void> = Promise.resolve();

  const handle = async (request: WebRequest): Promise<unknown> => {
    switch (request.type) {
      case "Open": {
        workloadStatements = await Promise.all(
          workloads.map(async (workload) => {
            const response = await fetch(
              `${request.stack.waSqliteUrl}${workloadsPath}${workload.file}`,
            );
            if (!response.ok)
              throw new Error(
                `Cannot fetch ${workload.file} (${response.status}).`,
              );
            return splitStatements(await response.text());
          }),
        );
        encrypted = request.encrypted;
        stack = await createStack(request.stack);
        return {
          userAgent: navigator.userAgent,
          crossOriginIsolated,
          timerResolutionMs: measureTimerResolution(),
        } satisfies WebOpenResult;
      }
      case "Run": {
        if (stack == null || workloadStatements == null)
          throw new Error("The stack is not open.");
        return runBench(stack, {
          name: request.name,
          workloads: workloadStatements,
          encrypted,
          verifyContent: request.verifyContent,
        });
      }
      case "Dispose": {
        await stack?.dispose();
        stack = null;
        return null;
      }
    }
  };

  addEventListener("message", (event: MessageEvent<WebRequest>) => {
    queue = queue.then(async () => {
      try {
        postMessage({
          ok: true,
          value: await handle(event.data),
        } satisfies WebResponse);
      } catch (error) {
        postMessage({
          ok: false,
          error:
            error instanceof Error
              ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
              : String(error),
        } satisfies WebResponse);
      }
    });
  });
};

/**
 * Returns the smallest step of `performance.now()` among the first 20 steps or
 * within 100 ms, because engines coarsen it without cross-origin isolation.
 */
const measureTimerResolution = (): number => {
  const start = performance.now();
  let previous = start;
  let smallest = Infinity;
  let steps = 0;
  while (steps < 20) {
    const now = performance.now();
    if (now !== previous) {
      smallest = Math.min(smallest, now - previous);
      previous = now;
      steps++;
    }
    if (now - start > 100) break;
  }
  return smallest;
};
