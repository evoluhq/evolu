/**
 * Web platform-specific Task utilities.
 *
 * @module
 */

import {
  createRun as createCommonRun,
  createUnknownError,
  ok,
  type CreateRun,
  type LeaderLock,
  type Run,
  type RunDeps,
} from "@evolu/common";

/**
 * Creates a {@link LeaderLock} backed by the Web Locks API.
 *
 * Waiting for the browser lock is intentionally unabortable. If a caller starts
 * waiting and its {@link Run} or fiber is later aborted, the underlying Web
 * Locks request keeps waiting until the browser grants the lock. Only the
 * returned lease releases it.
 */
export const createLeaderLock = (): LeaderLock => ({
  lock: (name) => async () => {
    const acquired = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();

    void globalThis.navigator.locks.request(
      `evolu-leaderlock-${name}`,
      { mode: "exclusive" },
      async () => {
        acquired.resolve();
        await release.promise;
      },
    );

    await acquired.promise;

    return ok({
      [Symbol.asyncDispose]: async () => {
        release.resolve();
        return Promise.resolve();
      },
    });
  },
});

/**
 * Creates {@link Run} for the browser with global error handling.
 *
 * Registers `error` and `unhandledrejection` handlers that log errors to the
 * console. Handlers are removed when the Run is disposed.
 *
 * ### Example
 *
 * ```ts
 * const console = createConsole({
 *   formatter: createConsoleFormatter()({
 *     timestampFormat: "relative",
 *   }),
 * });
 *
 * await using run = createRun({ console });
 * await using disposer = new AsyncDisposableStack();
 *
 * disposer.use(await run.orThrow(startApp()));
 * ```
 */
export const createRun: CreateRun<RunDeps> = <D>(
  deps?: D,
): Run<RunDeps & D> => {
  const run = createCommonRun(deps);
  const console = run.deps.console.child("global");

  globalThis.addEventListener(
    "error",
    (event) => {
      console.error("error", createUnknownError(event.error));
    },
    { signal: run.signal },
  );

  globalThis.addEventListener(
    "unhandledrejection",
    (event) => {
      console.error("unhandledrejection", createUnknownError(event.reason));
    },
    { signal: run.signal },
  );

  return run;
};
