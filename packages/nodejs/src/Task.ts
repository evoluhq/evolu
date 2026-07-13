/**
 * Node.js-specific Task utilities.
 *
 * @module
 */

import {
  createConsole,
  createRun,
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
   * Commands use the conventional `128 + signal number` exit status unless a
   * reported defect has already set a failure status.
   *
   * @default "service"
   */
  readonly mode?: RunMainMode;
}

/**
 * Runs the main Task as the Node.js program lifecycle.
 *
 * Creates one root {@link Run} and aborts it on:
 *
 * - `SIGINT`: Ctrl-C on all platforms.
 * - `SIGTERM`: OS, service, Docker, or Kubernetes termination on Unix.
 * - `SIGBREAK`: Ctrl-Break on Windows.
 *
 * The first signal logs shutdown progress, aborts the root Run, and waits for
 * the main Task and structured cleanup to finish. A subsequent signal exits
 * immediately with its conventional signal status, abandoning cleanup. A signal
 * received during final cleanup still applies signal shutdown behavior.
 *
 * A main Task returning {@link Resource} keeps the program running until a
 * termination signal and is disposed during shutdown. A main Task returning
 * `void` completes the program immediately. A Resource result transfers
 * ownership of a live resource that must remain valid after its creating Task
 * settles.
 *
 * Service mode treats graceful signal shutdown as successful. Command mode
 * preserves conventional signal exit statuses. Every defect reported through
 * `reportDefect`, including an observer defect that does not abort the Run,
 * sets `process.exitCode` to 1. The default reporter logs to the configured
 * Evolu console.
 *
 * Escaped uncaught exceptions and unhandled rejections remain under Node.js
 * native reporting and termination.
 *
 * ### Service Example
 *
 * ```ts
 * const deps = { ...createRelayDeps(), console: createConsole() };
 *
 * await runMain(deps)(createRelay({ port: 4000 }));
 * ```
 *
 * A Task returning `void` can keep a service alive explicitly when no Resource
 * owns its lifetime:
 *
 * ```ts
 * await runMain(deps)(async (run) => {
 *   void run(processMessages);
 *   return await run(waitForAbort);
 * });
 * ```
 *
 * ### Command Example
 *
 * ```ts
 * await runMain(runCommand, { mode: "command" });
 * ```
 *
 * @group Node.js Task
 */
export function runMain<T extends void | Resource>(
  main: Task<T>,
  options?: RunMainOptions,
): Promise<void>;
/** With custom dependencies. */
export function runMain<D extends object>(
  deps: RunCustomDeps<D>,
  options?: RunMainOptions,
): <T extends void | Resource>(main: Task<T, never, D>) => Promise<void>;
export function runMain<T extends void | Resource, D extends object>(
  mainOrDeps: Task<T> | RunCustomDeps<D>,
  { mode = "service" }: RunMainOptions = {},
):
  | Promise<void>
  | (<R extends void | Resource>(main: Task<R, never, D>) => Promise<void>) {
  return typeof mainOrDeps === "function"
    ? runMainInternal(mainOrDeps, {}, mode)
    : (main) => runMainInternal(main, mainOrDeps, mode);
}

const commandExitCodeBySignal: Readonly<Record<NodeSignal, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGBREAK: 149,
};

const runMainInternal = async <T extends void | Resource, D extends object>(
  main: Task<T, never, D>,
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
      const resource = await run.ok(main);
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
