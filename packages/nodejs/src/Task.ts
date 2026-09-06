/**
 * Node.js-specific Task utilities.
 *
 * @module
 */

import {
  createConsole,
  createRun,
  getOrThrow,
  isDisposable,
  ok,
  waitForAbort,
  type ConsoleDep,
  type ReportDefectDep,
  type Resource,
  type Run,
  type RunCustomDeps,
  type Task,
  type Typed,
} from "@evolu/common";
import type { createRelay } from "./local-first/Relay.ts";

/**
 * An abort requested by a Node.js termination signal.
 *
 * @group Node.js Task
 */
export interface NodeSignalAbortReason extends Typed<"NodeSignalAbortReason"> {
  readonly signal: NodeSignal;
}

/** A Node.js termination signal handled by {@link runMain}. */
export type NodeSignal = "SIGINT" | "SIGTERM" | "SIGBREAK";

/** Process lifecycle behavior for {@link runMain}. */
export type RunMainMode = "service" | "command";

/** Options for {@link runMain}. */
export interface RunMainOptions {
  /**
   * How termination signals affect the process exit status.
   *
   * Services treat a gracefully handled signal as a successful shutdown.
   * Commands use the conventional `128 + signal number` exit status unless
   * `process.exitCode` is already set.
   *
   * @default "service"
   */
  readonly mode?: RunMainMode;
}

/**
 * Runs the main {@link Task} of a Node.js command or service.
 *
 * A command does a finite job, such as importing data. A service handles
 * ongoing work, such as accepting connections. Choose a mode for how the
 * program reports an interruption:
 *
 * - `"command"`: A termination signal means the job was interrupted. After
 *   cleanup, use the conventional signal exit status, such as 130 for Ctrl-C,
 *   unless `process.exitCode` is already set.
 * - `"service"` (default): A termination signal is an expected way to stop the
 *   service. Graceful shutdown does not set a failure exit status.
 *
 * Both modes create one root {@link Run} and wait for cleanup. The mode controls
 * signal exit status; the main Task controls how long `runMain` waits.
 *
 * ### Lifetime
 *
 * When the main Task returns `void`, `runMain` finishes after the Task and root
 * Run cleanup. It does not force the Node.js process to exit.
 *
 * A service can return a live {@link Resource}, such as the relay created by
 * {@link createRelay}. This transfers ownership to `runMain`, which waits for
 * shutdown and then disposes the Resource. It must remain usable after the
 * creating Task finishes; do not dispose it before returning it.
 *
 * Alternatively, the main Task can own its resources with `using` or `await
 * using` while awaiting {@link waitForAbort} with `run(waitForAbort)`. Waiting
 * for abort does not itself keep Node.js running: the service needs active
 * work, such as a listening server.
 *
 * ### Shutdown and errors
 *
 * Handles `SIGINT` (Ctrl-C), `SIGTERM` (termination by the OS or a service
 * host), and `SIGBREAK` (Ctrl-Break on Windows). The first signal logs shutdown
 * progress, aborts the root Run, and waits for cleanup. A second signal exits
 * immediately with its conventional signal status, abandoning cleanup. Signals
 * are still handled during final cleanup.
 *
 * An error returned by the main Task is fatal. {@link getOrThrow} preserves it
 * in `Error.cause`; the Run reports the failure and finishes cleanup. Every
 * reported defect sets `process.exitCode` to 1, including an observer defect
 * that does not abort the Run. The default reporter logs to the configured
 * Evolu console.
 *
 * Escaped uncaught exceptions and unhandled rejections remain under Node.js
 * native reporting and termination.
 *
 * ### Example
 *
 * A command finishes when its main Task completes:
 *
 * ```ts
 * import { assertTrue, ok, type Task } from "@evolu/common";
 * import { runMain } from "@evolu/nodejs";
 *
 * let completed = false;
 * const command: Task<void> = () => {
 *   completed = true;
 *   return ok();
 * };
 *
 * await runMain(command, { mode: "command" });
 * assertTrue(completed);
 * ```
 *
 * @group Node.js Task
 */
export function runMain<T extends void | Resource, E = never>(
  main: Task<T, E>,
  options?: RunMainOptions,
): Promise<void>;
/** With custom dependencies. */
export function runMain<D extends object>(
  deps: RunCustomDeps<D>,
  options?: RunMainOptions,
): <T extends void | Resource, E = never>(main: Task<T, E, D>) => Promise<void>;
export function runMain<T extends void | Resource, E, D extends object>(
  mainOrDeps: Task<T, E> | RunCustomDeps<D>,
  { mode = "service" }: RunMainOptions = {},
):
  | Promise<void>
  | (<R extends void | Resource, E = never>(
      main: Task<R, E, D>,
    ) => Promise<void>) {
  return typeof mainOrDeps === "function"
    ? runMainInternal(mainOrDeps, {}, mode)
    : (main) => runMainInternal(main, mainOrDeps, mode);
}

const commandExitCodeBySignal: Readonly<Record<NodeSignal, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGBREAK: 149,
};

const runMainInternal = async <T extends void | Resource, E, D extends object>(
  main: Task<T, E, D>,
  deps: RunCustomDeps<D> & Partial<ConsoleDep & ReportDefectDep>,
  mode: RunMainMode,
): Promise<void> => {
  const console = deps.console ?? createConsole();
  const mainConsole = console.child("main");

  let defectReported = false as boolean;
  let receivedSignal = null as NodeSignal | null;

  await using disposer = new AsyncDisposableStack();
  const run = disposer.use(
    createRun<D>({
      ...deps,
      console,
      reportDefect: (reported) => {
        defectReported = true;
        process.exitCode = 1;
        if (deps.reportDefect) deps.reportDefect(reported);
        else console.error(reported);
      },
    }),
  );

  (["SIGINT", "SIGTERM", "SIGBREAK"] as const).forEach((signal) => {
    const handleSignal = (): void => {
      if (receivedSignal !== null) {
        mainConsole.warn("Forcing shutdown...");
        process.exit(commandExitCodeBySignal[signal]);
        return;
      }

      receivedSignal = signal;
      mainConsole.info("Shutting down...");
      run.abort({ type: "NodeSignalAbortReason", signal });
    };

    process.on(signal, handleSignal);
    run.defer(() => {
      process.off(signal, handleSignal);
    });
  });

  try {
    await run(async (run) => {
      const resource = getOrThrow(await run(main));
      if (!isDisposable(resource)) return ok();

      await using _resource = resource;
      return await run(waitForAbort);
    });
  } catch {
    // Aborts are control flow; defects are already handled by reportDefect.
  }

  // Move ownership out of the await-using setup safety net so an already
  // reported finalizer defect can be suppressed during explicit disposal.
  try {
    await disposer.move().disposeAsync();
  } catch {
    // Finalizer defects are already handled by reportDefect.
  }

  if (receivedSignal !== null) {
    if (defectReported) mainConsole.warn("Shutdown finished with errors");
    else mainConsole.info("Shutdown complete");
    if (mode === "command")
      process.exitCode ??= commandExitCodeBySignal[receivedSignal];
  }
};
