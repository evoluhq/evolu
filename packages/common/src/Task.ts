/**
 * JavaScript-native structured concurrency.
 *
 * @module
 */

import { isNonEmptyArray } from "./Array.js";
import { assert, assertType } from "./Assert.js";
import type { RandomBytesDep } from "./Crypto.js";
import { createRandomBytes } from "./Crypto.js";
import { eqArrayStrict } from "./Eq.js";
import { lazyTrue, lazyVoid } from "./Function.js";
import { decrement, increment } from "./Number.js";
import type { Random, RandomDep } from "./Random.js";
import { createRandom } from "./Random.js";
import type { Ref } from "./Ref.js";
import type { Done, NextResult, Result } from "./Result.js";
import { err, ok, tryAsync } from "./Result.js";
import type { Schedule, ScheduleStep } from "./Schedule.js";
import { addToSet, deleteFromSet, emptySet } from "./Set.js";
import type { Duration, Time, TimeDep } from "./Time.js";
import { createTime, durationToMillis, Millis } from "./Time.js";
import type { TracerConfigDep, TracerDep } from "./Tracer.js";
import {
  brand,
  createId,
  Id,
  type InferType,
  minPositiveInt,
  NonNegativeInt,
  PositiveInt,
  type Typed,
  typed,
  union,
  Unknown,
  UnknownResult,
} from "./Type.js";
import {
  type Awaitable,
  type DistributiveOmit,
  type Mutable,
  type Predicate,
} from "./Types.js";

/**
 * JavaScript-native structured concurrency.
 *
 * Structured concurrency is a simple idea: async operations form a tree where
 * no child can outlive its parent — ending a parent aborts its children and
 * waits for them to complete. This eliminates resource leaking and "fire and
 * forget" bugs.
 *
 * - **Automatic cancellation** — abort propagates to all descendants
 * - **Guaranteed cleanup** — resources always released
 * - **Observable state** — inspect what’s running and why
 *
 * Evolu implements structured concurrency with these types:
 *
 * - **{@link Task}** — a function that takes {@link Runner} and deps, returning
 *   {@link Awaitable} (sync or async) {@link Result}
 * - **{@link Runner}** — runs tasks, creates {@link Fiber}s, monitors and aborts
 *   them
 * - **{@link Fiber}** — awaitable, abortable/disposable handle to a running task
 * - **{@link AsyncDisposableStack}** — task-aware resource management that
 *   completes even when aborted
 *
 * Evolu's structured concurrency core is minimal — one function with a few
 * flags and helper methods using native APIs.
 *
 * Task's `deps` argument is for dependency injection — dependencies are defined
 * as interfaces, wrapped to avoid clashes, and passed to every task
 * automatically by the runner.
 *
 * ### Example
 *
 * ```ts
 * // A dependency — wraps native fetch for testability.
 * interface NativeFetchDep {
 *   readonly fetch: typeof globalThis.fetch;
 * }
 *
 * // Typed is an interface for objects with a `type` property.
 * interface FetchError extends Typed<"FetchError"> {
 *   readonly error: unknown;
 * }
 *
 * // A Task wrapping native fetch — adds abortability.
 * const fetchUrl =
 *   (url: string): Task<Response, FetchError, NativeFetchDep> =>
 *   ({ signal }, deps) =>
 *     tryAsync(
 *       () => deps.fetch(url, { signal }),
 *       (error): FetchError | AbortError => {
 *         if (AbortError.is(error)) return error;
 *         return { type: "FetchError", error };
 *       },
 *     );
 *
 * // In a composition root…
 * const deps: NativeFetchDep = {
 *   fetch: globalThis.fetch.bind(globalThis),
 * };
 *
 * // Create runner with deps (passed to every task automatically).
 * await using run = createRunner(deps);
 *
 * // Running a task returns a fiber that can be awaited.
 * const result = await run(fetchUrl("/users/123"));
 * expectTypeOf(result).toEqualTypeOf<
 *   Result<Response, FetchError | AbortError>
 * >();
 *
 * // A fiber can also be aborted (or disposed with `using`).
 * const fiber = run(fetchUrl("/users/456"));
 * fiber.abort();
 *
 * // When this block ends, `await using` disposes run — aborting all fibers.
 * ```
 *
 * ## Composition
 *
 * Tasks are lazy — just functions — so they can be wrapped and combined before
 * running with helpers like:
 *
 * - {@link timeout} — time-bounded execution
 * - {@link retry} — retry with backoff
 * - {@link all} — run tasks concurrently, fail fast
 *
 * Composition helpers add typed errors to the error union (e.g.,
 * {@link TimeoutError}, `RetryError`). These are for business logic — callers
 * can pattern match on `error.type` to handle specific failures.
 *
 * Add timeout to prevent hanging:
 *
 * ```ts
 * const fetchWithTimeout = (url: string) => timeout(fetchUrl(url), "30s");
 *
 * expectTypeOf(fetchWithTimeout).toEqualTypeOf<
 *   (url: string) => Task<Response, TimeoutError | FetchError>
 * >();
 * ```
 *
 * Add retry for resilience:
 *
 * ```ts
 * const fetchWithRetry = (url: string) =>
 *   retry(fetchWithTimeout(url), take(3)(spaced("100ms")));
 *
 * // RetryError wraps the original error as `cause` when all attempts fail
 * expectTypeOf(fetchWithRetry).toEqualTypeOf<
 *   (
 *     url: string,
 *   ) => Task<
 *     Response,
 *     TimeoutError | FetchError | RetryError<TimeoutError | FetchError>
 *   >
 * >();
 * ```
 *
 * Control concurrency with semaphore:
 *
 * ```ts
 * const semaphore = createSemaphore(PositiveInt.orThrow(2));
 *
 * // Semaphore adds AbortError (semaphore can be disposed)
 * const fetchWithPermit = (url: string) =>
 *   semaphore.withPermit(fetchWithRetry(url));
 *
 * expectTypeOf(fetchWithPermit).toEqualTypeOf<
 *   (
 *     url: string,
 *   ) => Task<
 *     Response,
 *     | TimeoutError
 *     | FetchError
 *     | AbortError
 *     | RetryError<TimeoutError | FetchError>
 *   >
 * >();
 * ```
 *
 * Run composed tasks in parallel:
 *
 * ```ts
 * // Create a global root runner at app startup
 * await using run = createRunner();
 *
 * const urls = [
 *   "https://api.example.com/users",
 *   "https://api.example.com/posts",
 *   "https://api.example.com/comments",
 * ];
 *
 * // Semaphore limits to 2 concurrent requests
 * const results = await Promise.all(
 *   urls.map((url) => run(fetchWithPermit(url))),
 * );
 *
 * expectTypeOf(results).toEqualTypeOf<
 *   Array<
 *     Result<
 *       Response,
 *       | AbortError
 *       | TimeoutError
 *       | FetchError
 *       | RetryError<TimeoutError | FetchError>
 *     >
 *   >
 * >();
 * ```
 *
 * ## Resource management
 *
 * Evolu uses standard JavaScript
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management | resource management}.
 *
 * For task-based disposal, Evolu provides {@link AsyncDisposableStack}: a
 * wrapper around the native
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncDisposableStack | AsyncDisposableStack}
 * where methods accept {@link Task} for acquisition. All operations run
 * {@link unabortable}, ensuring resources are acquired and released even when
 * abort is requested.
 *
 * ### Example
 *
 * ```ts
 * await using stack = run.stack();
 * stack.defer(task);
 * const conn = await stack.use(openConnection);
 * const session = await stack.adopt(login, logout);
 * ```
 *
 * ## Awaitable
 *
 * ```ts
 * type Awaitable<T> = T | PromiseLike<T>;
 * ```
 *
 * While {@link Task} returns {@link Awaitable} (allowing sync or async results),
 * {@link Runner} is always async. This is a deliberate design choice:
 *
 * - **Sync** → {@link Result}, native `using` / `DisposableStack`
 * - **Async** → {@link Task}, {@link Runner}, {@link Fiber}, `await using` /
 *   `AsyncDisposableStack`
 *
 * Benefits:
 *
 * - **No API ambiguity** — Task means async, Result means sync
 * - **Zero overhead** — sync code stays with zero overhead
 *
 * Even though a unified sync/async API is technically possible - with
 * `isPromiseLike` detection and two-phase disposal (sync first, async if
 * needed, and a flag for callers) - we prefer plain functions for sync code
 * because almost anything can be async anyway, and when we need sync, it's for
 * simplicity (no dependencies) and performance (zero abstraction).
 *
 * ## FAQ
 *
 * ### Is `Task<T, E, D>` still Pure DI? Isn't Runner a DI container?
 *
 * Yes, it's still Pure DI. `D` is just a deps object passed as a normal
 * function argument. Instead of writing `task(deps)(args)` (curried DI), we
 * write `createRunner<AppDeps>(deps)` once and the runner passes `deps` to
 * every task as a second argument. This removes repetitive plumbing.
 *
 * ### How does it work?
 *
 * Some libraries represent computations as data structures that a runtime
 * interprets later. Evolu is simpler — it uses wrapped promises. Check the
 * source code; it's short and readable.
 *
 * @group Core Types
 */
export type Task<T, E = never, D = unknown> = (
  run: Runner<D>,
  deps: D,
) => Awaitable<Result<T, E | AbortError>>;

/**
 * Extracts the value type from a {@link Task}.
 *
 * @group Type Utilities
 */
export type InferTaskOk<R extends Task<any, any, any>> =
  R extends Task<infer T, any, any> ? T : never;

/**
 * Extracts the error type from a {@link Task}.
 *
 * @group Type Utilities
 */
export type InferTaskErr<R extends Task<any, any, any>> =
  R extends Task<any, infer E, any> ? E : never;

/**
 * Extracts the deps type from a {@link Task}.
 *
 * @group Type Utilities
 */
export type InferTaskDeps<R extends Task<any, any, any>> =
  R extends Task<any, any, infer D> ? D : never;

/**
 * A {@link Task} that can complete with a value, signal done, or fail.
 *
 * Forms a parallel with {@link NextResult}:
 *
 * - `Result<A, E>` → `NextResult<A, E, D>`
 * - `Task<T, E>` → `NextTask<T, E, D>`
 *
 * Use for pull-based protocols like iterators where `Done<D>` signals normal
 * completion rather than an error.
 *
 * @group Core Types
 */
export type NextTask<T, E = never, D = void> = Task<T, E | Done<D>>;

/**
 * Extracts the done value type from a {@link NextTask}.
 *
 * @group Type Utilities
 */
export type InferTaskDone<T extends Task<any, any, any>> =
  InferTaskErr<T> extends infer Errors
    ? Errors extends Done<infer D>
      ? D
      : never
    : never;

/**
 * Error returned when a {@link Task} is aborted via
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal | AbortSignal}.
 *
 * The `reason` field is `unknown` by design — use typed errors for business
 * logic. If you need to inspect the reason, use type guards like
 * `RaceLostError.is(reason)`.
 *
 * @group Core Types
 */
export const AbortError = typed("AbortError", { reason: Unknown });
export interface AbortError extends InferType<typeof AbortError> {}

/**
 * Runs a {@link Task} with
 * {@link https://en.wikipedia.org/wiki/Structured_concurrency | structured concurrency}
 * guarantees.
 *
 * - **Lifetime** — child tasks are bound to parent scope
 * - **Cancellation** — abort propagates to all descendants
 * - **Observable state** — inspect running tasks via snapshots and events
 *
 * `Runner` is a callable object — callable because it's convenient to run tasks
 * as `run(task)`, and an object because it holds state for abortability and
 * monitoring.
 *
 * Evolu's structured concurrency leverages native JavaScript APIs:
 *
 * - `PromiseLike` as the async primitive
 * - `AbortSignal` for cancellation
 * - `await using` for resource management
 * - `SuppressedError` for error aggregation
 *
 * This makes Runner idiomatic to JavaScript, tiny with minimal overhead, and
 * easy to debug (native stack traces).
 *
 * @group Core Types
 * @see {@link createRunner}
 * @see {@link Task}
 */
export interface Runner<D = unknown> extends AsyncDisposable {
  /** Runs a {@link Task} and returns a {@link Fiber} handle. */
  <T, E>(task: Task<T, E, D>): Fiber<T, E, D>;

  /** Unique {@link Id} for this runner. */
  readonly id: Id;

  /** The parent {@link Runner}, if this runner was created as a child. */
  readonly parent: Runner<D> | null;

  /** @see https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal */
  readonly signal: AbortSignal;

  /** The abort mask depth. `0` means abortable, `>= 1` means unabortable. */
  readonly abortMask: AbortMask;

  /**
   * Registers a callback to run when abort is requested.
   *
   * Shorthand for `signal.addEventListener("abort", ..., { once: true })`.
   */
  readonly onAbort: (fn: (reason: unknown) => void) => void;

  /** Returns the current {@link RunnerState}. */
  readonly getState: () => RunnerState;

  /**
   * Returns the fiber's completion value.
   *
   * `null` while pending. If abort was requested, this is {@link AbortError}
   * even if the task completed successfully — see {@link Runner.getOutcome} for
   * what the task actually returned.
   */
  readonly getResult: () => Result<unknown, unknown> | null;

  /**
   * Returns what the task actually returned.
   *
   * `null` while pending. Unlike {@link Runner.getResult}, not overridden by
   * abort.
   */
  readonly getOutcome: () => Result<unknown, unknown> | null;

  /** Returns the current child {@link Fiber}s. */
  readonly getChildren: () => ReadonlySet<Fiber<any, any, D>>;

  /**
   * Creates a memoized {@link FiberSnapshot} of this runner.
   *
   * Use for monitoring, debugging, or building UI that visualizes task trees.
   *
   * ### Example
   *
   * ```ts
   * // React integration with useSyncExternalStore
   * const useFiberSnapshot = (runner: Runner) =>
   *   useSyncExternalStore(
   *     (callback) => {
   *       runner.onEvent = callback;
   *       return () => {
   *         runner.onEvent = undefined;
   *       };
   *     },
   *     () => runner.snapshot(),
   *   );
   * ```
   */
  readonly snapshot: () => FiberSnapshot;

  /**
   * Callback for monitoring runner events.
   *
   * Called when this runner or any descendant emits a {@link RunnerEvent}.
   * Events bubble up through parent runners, enabling centralized monitoring.
   * Only emitted when {@link RunnerConfig.eventsEnabled} is `true`.
   */
  onEvent: ((event: RunnerEvent) => void) | undefined;

  /**
   * Runs a {@link Task} on the root runner instead of the current runner.
   *
   * ### Example
   *
   * ```ts
   * const myTask: Task<void, never> = async (run) => {
   *   // Aborted when myTask ends
   *   run(helperTask);
   *
   *   // Outlives myTask, aborted when the root runner is disposed
   *   run.daemon(backgroundSync);
   *
   *   return ok();
   * };
   * ```
   */
  readonly daemon: <T, E>(task: Task<T, E, D>) => Fiber<T, E, D>;

  /**
   * Creates an {@link AsyncDisposable} that runs the task when disposed.
   *
   * Use for one-off task; for multiple, use {@link Runner.stack} instead.
   *
   * ### Example
   *
   * ```ts
   * // One-off task with defer
   * await using _ = run.defer(task);
   *
   * // For more tasks, a stack is more practical
   * await using stack = run.stack();
   * stack.defer(taskA);
   * stack.defer(taskB);
   *
   * // Spread to make any object disposable with Task
   * const connection = {
   *   send: (data: Data) => { ... },
   *   ...run.defer(async (run) => {
   *     await run(notifyPeers);
   *     return ok();
   *   }),
   * };
   * // connection[Symbol.asyncDispose] is now defined
   * ```
   */
  readonly defer: (onDisposeAsync: Task<void, any, D>) => AsyncDisposable;

  /**
   * Creates an {@link AsyncDisposableStack} bound to the root runner.
   *
   * ### Example
   *
   * ```ts
   * await using stack = run.stack();
   * stack.defer(task);
   * const conn = await stack.use(openConnection);
   * ```
   */
  readonly stack: () => AsyncDisposableStack<D>;

  /**
   * {@link Time}.
   *
   * Used by {@link sleep}, {@link timeout}. Exposed for custom needs.
   */
  readonly time: Time;

  /**
   * {@link Random}.
   *
   * Used by {@link retry} for jitter. Exposed for custom needs.
   */
  readonly random: Random;
}

/**
 * Abort mask depth for a {@link Runner} or {@link Fiber}.
 *
 * - `0` — abortable (default)
 * - `>= 1` — inside {@link unabortable}, abort requests are ignored
 *
 * The mask tracks nested unabortable regions. When abort is requested, the
 * signal only propagates if `mask === 0`.
 *
 * - {@link unabortable} increments the mask — task becomes protected
 * - {@link unabortableMask} provides `restore` to restore the previous mask
 * - Tasks inherit their parent's mask by default
 *
 * This enables nested acquire/use/release patterns where each level can have
 * its own abortable section while outer acquisitions remain protected.
 *
 * UI/debugging tools can use this to visually distinguish protected tasks
 * (e.g., different icon or color) and explain why abort requests are ignored.
 *
 * @group Abort Masking
 */
export const AbortMask = brand("AbortMask", NonNegativeInt);
export type AbortMask = typeof AbortMask.Type;

/**
 * The lifecycle state of a {@link Runner}.
 *
 * - `active` — accepts new tasks
 * - `disposing` — no new tasks accepted, waits for in-flight fibers
 * - `disposed` — all fibers completed, disposal finished
 *
 * @group Core Types
 */
export const RunnerState = union("active", "disposing", "disposed");
export type RunnerState = typeof RunnerState.Type;

/**
 * `Fiber` is a handle to a running {@link Task} that can be awaited, aborted, or
 * disposed.
 *
 * ### Example
 *
 * ```ts
 * await using run = createRunner();
 *
 * // Await to get Result
 * const result = await run(fetchData);
 *
 * // Abort manually
 * const fiber = run(longRunningTask);
 * fiber.abort();
 * const aborted = await fiber; // Result contains AbortError (unless unabortable)
 *
 * // Auto-abort with `using`
 * {
 *   using fiber = run(backgroundSync);
 *   await someOtherWork();
 * } // fiber.abort() called automatically here
 *
 * // Run child tasks in fiber's scope
 * fiber.run(childTask);
 *
 * // Monitor via the Runner
 * fiber.run.onEvent = (event) => {
 *   console.log(event);
 * };
 * ```
 *
 * Because `Fiber` is a {@link PromiseLike} object, fibers can be composed with
 * `Promise.all`, `Promise.race`, etc.
 *
 * Microtask timing: Runner wraps the task's promise with `.then` and
 * `.finally`, which adds microtasks between task completion and fiber
 * settlement. Do not write code that relies on a specific number of microtask
 * yields between tasks. Use explicit synchronization primitives instead.
 *
 * @group Core Types
 */
export class Fiber<T = unknown, E = unknown, D = unknown>
  implements PromiseLike<Result<T, E | AbortError>>, Disposable
{
  readonly then: PromiseLike<Result<T, E | AbortError>>["then"];

  /**
   * A {@link Runner} whose lifetime is tied to this fiber.
   *
   * Tasks run via this runner are aborted when the fiber ends.
   *
   * ### Example
   *
   * ```ts
   * const fiber = run(longRunningTask);
   *
   * // helperTask is aborted when longRunningTask ends
   * fiber.run(helperTask);
   *
   * // Monitor this fiber's runner
   * fiber.run.onEvent = (event) => {
   *   console.log(event);
   * };
   * ```
   */
  readonly run: Runner<D>;

  constructor(run: Runner<D>, promise: Promise<Result<T, E | AbortError>>) {
    this.then = promise.then.bind(promise);
    this.run = run;
  }

  /**
   * Requests abort for this fiber (and any child it started).
   *
   * ### Example
   *
   * ```ts
   * const fiber = run(fetchData);
   * fiber.abort();
   * const result = await fiber; // err(AbortError)
   * ```
   *
   * When abort is requested, the fiber's result becomes {@link AbortError} even
   * if the task completed successfully. This keeps behavior predictable —
   * calling `abort()` always yields `AbortError`.
   *
   * The optional reason is stored in `AbortError.reason`. Since any value can
   * be passed, abort reasons are `unknown` — use typed errors for business
   * logic. To inspect the reason, use type guards like
   * `RaceLostError.is(reason)`.
   *
   * Abort is idempotent — calling multiple times has no additional effect
   * beyond the first call.
   */
  abort(reason?: unknown): void {
    (this.run as RunnerInternal<RunnerDeps & D>).requestAbort(
      createAbortError(reason),
    );
  }

  /**
   * Returns the fiber's completion value.
   *
   * `null` while pending. If abort was requested, this is {@link AbortError}
   * even if the task completed successfully — see {@link Fiber.getOutcome} for
   * what the task actually returned.
   */
  getResult(): Result<T, E | AbortError> | null {
    return this.run.getResult() as Result<T, E | AbortError> | null;
  }

  /**
   * Returns what the task actually returned.
   *
   * `null` while pending. Unlike {@link Fiber.getResult}, not overridden by
   * abort.
   */
  getOutcome(): Result<T, E | AbortError> | null {
    return this.run.getOutcome() as Result<T, E | AbortError> | null;
  }

  [Symbol.dispose](): void {
    this.abort();
  }
}

/**
 * Extracts the value type from a {@link Fiber}.
 *
 * @group Type Utilities
 */
export type InferFiberOk<F extends Fiber<any, any, any>> =
  F extends Fiber<infer T, any, any> ? T : never;

/**
 * Extracts the error type from a {@link Fiber}.
 *
 * @group Type Utilities
 */
export type InferFiberErr<F extends Fiber<any, any, any>> =
  F extends Fiber<any, infer E, any> ? E : never;

/**
 * Extracts the deps type from a {@link Fiber}.
 *
 * @group Type Utilities
 */
export type InferFiberDeps<F extends Fiber<any, any, any>> =
  F extends Fiber<any, any, infer D> ? D : never;

/**
 * A recursive snapshot of a {@link Runner} tree.
 *
 * Snapshots use structural sharing — unchanged subtrees return the same object
 * reference. This is useful for UI libraries like React that leverage
 * referential transparency to skip re-rendering unchanged parts. Snapshots are
 * computed on demand rather than pushed on every change. Push would require
 * O(depth) new snapshot objects per mutation.
 *
 * @group Core Types
 * @see {@link Runner.snapshot}
 */
export interface FiberSnapshot {
  /** The {@link Runner.id} of the {@link Fiber} this snapshot represents. */
  readonly id: Id;

  /** The current lifecycle state. */
  readonly state: RunnerState;

  /**
   * The fiber's completion value.
   *
   * `null` while pending. If abort was requested, this is {@link AbortError}
   * even if the task completed successfully — see {@link FiberSnapshot.outcome}
   * for what the task actually returned.
   */
  readonly result: Result<unknown, unknown> | null;

  /**
   * What the task actually returned.
   *
   * `null` while pending. Unlike {@link FiberSnapshot.result}, not overridden by
   * abort.
   */
  readonly outcome: Result<unknown, unknown> | null;

  /** Child snapshots in spawn (start) order. */
  readonly children: ReadonlyArray<FiberSnapshot>;

  /** The abort mask depth. `0` means abortable, `>= 1` means unabortable. */
  readonly abortMask: AbortMask;
}

/**
 * Emitted when a child {@link Fiber} is added to a {@link Runner}.
 *
 * @group Monitoring
 */
export const RunnerEventChildAdded = typed("childAdded", {
  runnerId: Id,
  childId: Id,
  timestamp: Millis,
});
export interface RunnerEventChildAdded extends InferType<
  typeof RunnerEventChildAdded
> {}

/**
 * Emitted when a child {@link Fiber} is removed from a {@link Runner}.
 *
 * @group Monitoring
 */
export const RunnerEventChildRemoved = typed("childRemoved", {
  runnerId: Id,
  childId: Id,
  timestamp: Millis,
});
export interface RunnerEventChildRemoved extends InferType<
  typeof RunnerEventChildRemoved
> {}

/**
 * Emitted when a {@link Runner}'s state changes.
 *
 * @group Monitoring
 */
export const RunnerEventStateChanged = typed("stateChanged", {
  runnerId: Id,
  state: RunnerState,
  timestamp: Millis,
});
export interface RunnerEventStateChanged extends InferType<
  typeof RunnerEventStateChanged
> {}

/**
 * Emitted when a {@link Runner}'s result is set.
 *
 * @group Monitoring
 */
export const RunnerEventResultSet = typed("resultSet", {
  runnerId: Id,
  result: UnknownResult,
  outcome: UnknownResult,
  timestamp: Millis,
});
export interface RunnerEventResultSet extends InferType<
  typeof RunnerEventResultSet
> {}

/**
 * Events emitted by a {@link Runner} for monitoring and debugging.
 *
 * Events bubble up through parent runners, enabling centralized monitoring at
 * the root. Use with {@link Runner.onEvent} to track task lifecycle.
 *
 * @group Monitoring
 */
export const RunnerEvent = union(
  RunnerEventChildAdded,
  RunnerEventChildRemoved,
  RunnerEventStateChanged,
  RunnerEventResultSet,
);
export type RunnerEvent = typeof RunnerEvent.Type;

/**
 * Task-aware wrapper around native
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncDisposableStack | AsyncDisposableStack}.
 *
 * All tasks run via this stack are {@link unabortable} and run with
 * {@link Runner.daemon}, ensuring acquisition and cleanup complete even if abort
 * is requested.
 *
 * ### Example
 *
 * ```ts
 * const task: Task<void, Error> = async (run) => {
 *   await using stack = run.stack();
 *
 *   const a = await stack.use(acquireA);
 *   if (!a.ok) return a;
 *
 *   const b = await stack.use(acquireB);
 *   if (!b.ok) return b; // a released
 *
 *   stack.defer(sendAnalytics);
 *
 *   // work with a.value, b.value...
 *   return ok();
 * }; // b released, then a released, then analytics sent
 * ```
 *
 * @group Resource Management
 */
export class AsyncDisposableStack<D = unknown> implements AsyncDisposable {
  readonly #stack = new globalThis.AsyncDisposableStack();
  readonly #daemon: Runner<D>["daemon"];

  constructor(run: Runner<D>) {
    this.#daemon = run.daemon;
  }

  #run<T, E>(task: Task<T, E, D>): Fiber<T, E, D> {
    return this.#daemon(unabortable(task));
  }

  #runVoid(task: Task<void, any, D>): PromiseLike<void> {
    return this.#run(task).then(lazyVoid);
  }

  /**
   * Registers a {@link Task} to run when the stack is disposed.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncDisposableStack/defer
   */
  defer(onDisposeAsync: Task<void, any, D>): void {
    this.#stack.defer(() => this.#runVoid(onDisposeAsync));
  }

  /**
   * Registers a disposable resource and returns it.
   *
   * Accepts either a direct value (sync) or a {@link Task} (async acquisition).
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncDisposableStack/use
   */
  use<T extends AsyncDisposable | Disposable | null | undefined>(value: T): T;
  use<T extends AsyncDisposable | Disposable | null | undefined, E>(
    acquire: Task<T, E, D>,
  ): PromiseLike<Result<T, E | AbortError>>;
  use<T extends AsyncDisposable | Disposable | null | undefined, E>(
    valueOrAcquire: T | Task<T, E, D>,
  ): T | PromiseLike<Result<T, E | AbortError>> {
    if (
      valueOrAcquire == null ||
      Symbol.dispose in valueOrAcquire ||
      Symbol.asyncDispose in valueOrAcquire
    ) {
      return this.#stack.use(valueOrAcquire as T);
    }
    return this.#run(valueOrAcquire).then((result) => {
      if (result.ok) this.#stack.use(result.value);
      return result;
    });
  }

  /**
   * Adopts a value with a {@link Task}-based disposal.
   *
   * For values that don't implement {@link AsyncDisposable} and need disposal.
   * If the value is already disposable, use {@link use} instead.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncDisposableStack/adopt
   */
  async adopt<T, E = never>(
    acquire: Task<T, E, D>,
    release: (value: T) => Task<void, any, D>,
  ): Promise<Result<T, E | AbortError>> {
    const result = await this.#run(acquire);
    if (result.ok) {
      this.#stack.adopt(result.value, (v) => this.#runVoid(release(v)));
    }
    return result;
  }

  /**
   * Transfers disposal responsibility to a new stack, marking this one
   * disposed.
   *
   * Enables transferring ownership out of the current scope — if an error
   * occurs, resources are disposed; if successful, the caller takes ownership.
   *
   * ### Example
   *
   * ```ts
   * const createBundle: Task<Bundle, CreateBundleError> = async (run) => {
   *   await using stack = run.stack();
   *
   *   const a = await stack.use(createResource("a"));
   *   if (!a.ok) return a;
   *
   *   const b = await stack.use(createResource("b"));
   *   if (!b.ok) return b;
   *
   *   const moved = stack.move();
   *   return ok({
   *     a: a.value,
   *     b: b.value,
   *     [Symbol.asyncDispose]: () => moved.disposeAsync(),
   *   });
   * };
   * ```
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DisposableStack/move
   */
  move(): globalThis.AsyncDisposableStack {
    return this.#stack.move();
  }

  /** Whether this stack has been disposed. */
  get disposed(): boolean {
    return this.#stack.disposed;
  }

  disposeAsync(): Promise<void> {
    return this.#stack.disposeAsync();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.#stack.disposeAsync();
  }
}

/**
 * Configuration for {@link Runner} behavior.
 *
 * @group Monitoring
 */
export interface RunnerConfig {
  /**
   * Whether to emit {@link RunnerEvent}s.
   *
   * Use a {@link Ref} to enable/disable at runtime without recreating the
   * runner. Disabled by default for zero overhead in production.
   */
  readonly eventsEnabled: Ref<boolean>;
}

export interface RunnerConfigDep {
  readonly runnerConfig: RunnerConfig;
}

export type RunnerDeps = RandomBytesDep &
  RandomDep &
  TimeDep &
  Partial<RunnerConfigDep> &
  Partial<TracerConfigDep> & // TODO:
  Partial<TracerDep>; // TODO:

const defaultDeps: RunnerDeps = {
  random: createRandom(),
  randomBytes: createRandomBytes(),
  time: createTime(),
};

/**
 * Creates a root {@link Runner}.
 *
 * Call once per entry point (main thread, worker, etc.) and dispose on
 * shutdown. All tasks run as descendants of this root runner.
 *
 * ### Example
 *
 * ```ts
 * // App entry point
 * await using run = createRunner();
 *
 * const result = await run(fetchData);
 * ```
 *
 * ### Example with custom dependencies
 *
 * ```ts
 * // Define dependency interfaces
 * interface Config {
 *   readonly apiUrl: string;
 * }
 *
 * interface ConfigDep {
 *   readonly config: Config;
 * }
 *
 * // Task declares its dependencies via the D type parameter
 * const fetchUser =
 *   (id: string): Task<User, FetchError, ConfigDep> =>
 *   async (run, deps) => {
 *     const response = await fetch(`${deps.config.apiUrl}/users/${id}`);
 *     // ...
 *   };
 *
 * // Composition root: create runner with custom deps
 * type AppDeps = RunnerDeps & ConfigDep;
 *
 * const appDeps: AppDeps = {
 *   ...createTestDeps(), // or spread individual deps
 *   config: { apiUrl: "https://api.example.com" },
 * };
 *
 * await using run = createRunner(appDeps);
 *
 * // Runner type is inferred from deps argument
 * const result = await run(fetchUser("123"));
 *
 * // TypeScript catches missing deps at compile time:
 * // await using run2 = createRunner(); // Runner<RunnerDeps>
 * // run2(fetchUser("123")); // Error: Property 'config' is missing
 * ```
 *
 * @group Creating Runners
 */
export function createRunner(): Runner;
export function createRunner<D extends RunnerDeps>(deps: D): Runner<D>;
export function createRunner<D extends RunnerDeps>(deps?: D): Runner<D> {
  const mergedDeps = {
    ...defaultDeps,
    ...deps,
  } as D;

  return createRunnerInternal(mergedDeps)();
}

/** Internal Runner properties, hidden from public API via TypeScript types. */
interface RunnerInternal<D extends RunnerDeps = RunnerDeps> extends Runner<D> {
  readonly requestAbort: (abortError: AbortError) => void;
  readonly requestSignal: AbortSignal;
  readonly setResultAndOutcome: (
    result: Result<unknown, unknown>,
    outcome: Result<unknown, unknown>,
  ) => void;
}

const createRunnerInternal =
  <D extends RunnerDeps>(deps: D) =>
  (
    parent?: RunnerInternal<D>,
    daemon?: RunnerInternal<D>,
    behavior?: AbortBehavior,
  ): RunnerInternal<D> => {
    const parentMask = parent?.abortMask ?? isAbortable;

    let abortMask: AbortMask;
    switch (behavior) {
      case undefined:
        abortMask = parentMask;
        break;
      case "unabortable":
        abortMask = increment(parentMask) as AbortMask;
        break;
      default:
        assert(
          behavior <= parentMask,
          "restore used outside its unabortableMask",
        );
        abortMask = behavior;
    }

    const requestController = new AbortController();
    const signalController = new AbortController();

    let state: RunnerState = "active";
    let children: ReadonlySet<Fiber<any, any, D>> = emptySet;

    const requestAbort = (abortError: AbortError) => {
      requestController.abort(abortError);
      if (abortMask === isAbortable) signalController.abort(abortError);
    };

    if (parent) {
      const handleParentAbort = () => {
        assertType(AbortError, parent.requestSignal.reason);
        requestAbort(parent.requestSignal.reason);
      };
      if (parent.requestSignal.aborted) {
        handleParentAbort();
      } else {
        parent.requestSignal.addEventListener("abort", handleParentAbort, {
          signal: requestController.signal,
        });
      }
    }

    const emitEvent = (
      event: DistributiveOmit<RunnerEvent, "runnerId" | "timestamp">,
    ) => {
      if (!deps.runnerConfig?.eventsEnabled.get()) return;
      const e = { ...event, runnerId: self.id, timestamp: deps.time.now() };
      for (let node: Runner<D> | null = self; node; node = node.parent)
        node.onEvent?.(e);
    };

    const run = <T, E>(task: Task<T, E, D>): Fiber<T, E, D> => {
      const runner = createRunnerInternal(deps)(
        self,
        daemon ?? self,
        getAbortBehavior(task),
      );

      if (state !== "active") {
        runner.requestAbort(runnerClosingError);
        task = () => err(runnerClosingError);
      } else if (
        signalController.signal.aborted &&
        runner.abortMask === isAbortable
      ) {
        assertType(AbortError, signalController.signal.reason);
        runner.requestAbort(signalController.signal.reason);
        task = () => err(signalController.signal.reason);
      }

      // Promise.try is polyfilled
      const promise = Promise.try(task, runner, deps)
        .then((taskOutcome) => {
          const childResult = runner.signal.aborted
            ? err(runner.signal.reason)
            : taskOutcome;
          runner.setResultAndOutcome(childResult, taskOutcome);
          return childResult;
        })
        .finally(runner[Symbol.asyncDispose])
        .finally(() => {
          children = deleteFromSet(children, fiber);
          emitEvent({ type: "childRemoved", childId: runner.id });
        });

      const fiber = new Fiber<T, E, D>(runner, promise);

      children = addToSet(children, fiber);
      emitEvent({ type: "childAdded", childId: runner.id });

      return fiber;
    };

    const self = run as RunnerInternal<D>;

    {
      const run = self as Mutable<RunnerInternal<D>>;
      const id = createId(deps);

      let result: Result<unknown, unknown> | null = null;
      let outcome: Result<unknown, unknown> | null = null;
      let snapshot: FiberSnapshot | null = null;
      let disposing: Promise<void> | null = null;

      run.id = id;
      run.parent = parent ?? null;

      run.signal = signalController.signal;
      run.abortMask = abortMask;
      run.onAbort = (fn) => {
        signalController.signal.addEventListener(
          "abort",
          () => {
            assertType(AbortError, signalController.signal.reason);
            fn(signalController.signal.reason.reason);
          },
          { once: true },
        );
      };

      run.getState = () => state;
      run.getResult = () => result;
      run.getOutcome = () => outcome;
      run.getChildren = () => children;

      run.snapshot = () => {
        const childSnapshots = Array.from(children).map((fiber) =>
          fiber.run.snapshot(),
        );
        if (
          snapshot?.state !== state ||
          snapshot.result !== result ||
          // No need to check outcome — it's set together with result
          !eqArrayStrict(snapshot.children, childSnapshots)
        ) {
          snapshot = {
            id,
            state,
            result,
            outcome,
            children: childSnapshots,
            abortMask,
          };
        }
        return snapshot;
      };
      run.onEvent = undefined;

      run.daemon = (task) => (daemon ?? self)(task);
      run.defer = (task) => ({
        [Symbol.asyncDispose]: () =>
          run.daemon(unabortable(task)).then(lazyVoid),
      });
      run.stack = () => new AsyncDisposableStack(self);

      run.time = deps.time;
      run.random = deps.random;

      run[Symbol.asyncDispose] = () => {
        if (disposing) return disposing;

        state = "disposing";
        emitEvent({ type: "stateChanged", state });

        requestAbort(runnerClosingError);

        disposing = Promise.allSettled(children)
          .then(lazyVoid)
          .finally(() => {
            state = "disposed";
            emitEvent({ type: "stateChanged", state });
          });

        return disposing;
      };

      // Internal properties (hidden from public Runner type)
      run.requestAbort = requestAbort;
      run.requestSignal = requestController.signal;
      run.setResultAndOutcome = (fiberResult, taskOutcome) => {
        result = fiberResult;
        outcome = taskOutcome;
        emitEvent({
          type: "resultSet",
          result: fiberResult,
          outcome: taskOutcome,
        });
      };
    }

    return self;
  };

/** Mask value indicating the task is abortable. */
const isAbortable = AbortMask.orThrow(0);

/**
 * Error used as {@link AbortError} reason when a {@link Runner} is disposed.
 *
 * @group Creating Runners
 */
export const RunnerClosingError = typed("RunnerClosingError");
export interface RunnerClosingError extends InferType<
  typeof RunnerClosingError
> {}

const createAbortError = (reason: unknown): AbortError => ({
  type: "AbortError",
  reason,
});

/**
 * The {@link AbortError} used when a {@link Runner} is disposed.
 *
 * Tasks run on a disposing or disposed runner receive this error.
 *
 * @group Creating Runners
 */
export const runnerClosingError = createAbortError({
  type: "RunnerClosingError",
} satisfies RunnerClosingError);

type AbortBehavior = "unabortable" | AbortMask;

interface MaybeAbortBehavior {
  [_abortBehavior]?: AbortBehavior;
}

const getAbortBehavior = (
  task: Task<any, any, any>,
): AbortBehavior | undefined => (task as MaybeAbortBehavior)[_abortBehavior];

const abortBehavior =
  (behavior: AbortBehavior) =>
  <T, E, D>(task: Task<T, E, D>): Task<T, E, D> => {
    const wrapper: Task<T, E, D> = (run) => run(task);
    (wrapper as MaybeAbortBehavior)[_abortBehavior] = behavior;
    return wrapper;
  };

const _abortBehavior = Symbol("evolu.Task.abortBehavior");

/**
 * Makes a {@link Task} unabortable.
 *
 * Once started, an unabortable task always completes — abort requests are
 * ignored and `signal.aborted` remains `false`.
 *
 * ### Example
 *
 * ```ts
 * await using run = createRunner();
 *
 * const events: Array<string> = [];
 * const canComplete = Promise.withResolvers<void>();
 * let signalAbortedInAnalytics = true;
 *
 * // Simulate async analytics API (abortable by default)
 * const sendToAnalytics =
 *   (event: number): Task<void, never> =>
 *   async ({ signal }) => {
 *     await canComplete.promise;
 *     signalAbortedInAnalytics = signal.aborted;
 *     events.push(`sent ${event}`);
 *     return ok();
 *   };
 *
 * // Important events must be sent even if the user navigates away
 * const trackImportantEvent = (event: number) =>
 *   unabortable(sendToAnalytics(event));
 *
 * // User clicks, we start tracking (task runs until first await)
 * const fiber = run(trackImportantEvent(123));
 *
 * // User navigates away (abort requested while task is running)
 * fiber.abort();
 * canComplete.resolve();
 *
 * const result = await fiber;
 *
 * expect(signalAbortedInAnalytics).toBe(false);
 * // Analytics was sent despite abort
 * expect(events).toEqual(["sent 123"]);
 * expect(result).toEqual(ok());
 * ```
 *
 * @group Abort Masking
 */
export const unabortable = abortBehavior("unabortable");

/**
 * Like {@link unabortable}, but provides `restore` to restore abortability for
 * specific tasks.
 *
 * Tasks inherit abort masking from their parent. This means:
 *
 * - Tasks run inside `unabortableMask` are unabortable by default
 * - Tasks wrapped with `restore()` restore the previous abortability
 *
 * @group Abort Masking
 */
export const unabortableMask = <T, E, D = unknown>(
  fn: (
    restore: <T2, E2>(task: Task<T2, E2, D>) => Task<T2, E2, D>,
  ) => Task<T, E, D>,
): Task<T, E, D> =>
  unabortable((run, deps) =>
    fn(abortBehavior(AbortMask.orThrow(decrement(run.abortMask))))(run, deps),
  );

/**
 * Yields execution to allow other work to proceed.
 *
 * Long-running JavaScript blocks the main thread. In browsers, this makes the
 * UI unresponsive (user interactions, animations). In Node.js, it prevents I/O
 * callbacks, timers, and other requests from being handled. Inserting yield
 * points lets the runtime process high-priority work between chunks of code.
 *
 * Uses `scheduler.yield()` in browsers for optimal main thread scheduling,
 * falls back to `setImmediate` in Node.js, or `setTimeout` elsewhere.
 *
 * ### Example
 *
 * ```ts
 * const processLargeArray: Task<void, never> = async (run) => {
 *   let lastYield = run.time.now();
 *
 *   for (const item of largeArray) {
 *     processItem(item);
 *
 *     // Yield periodically to keep UI responsive
 *     if (run.time.now() - lastYield > msLongTask) {
 *       const r = await run(yieldNow);
 *       if (!r.ok) return r;
 *       lastYield = run.time.now();
 *     }
 *   }
 *
 *   return ok();
 * };
 * ```
 *
 * Recursive tasks also benefit from periodic yields — without them, deep
 * recursion overflows the call stack:
 *
 * ```ts
 * const processRecursive =
 *   (count: number, index: number, sum: number): Task<number> =>
 *   async (run) => {
 *     if (index >= count) return ok(sum);
 *
 *     // Yield periodically to break synchronous call chains.
 *     if (index > 0 && index % 1000 === 0) {
 *       const y = await run(yieldNow);
 *       if (!y.ok) return y;
 *     }
 *
 *     // Direct tail-call: no fiber overhead, stack-safe thanks to yieldNow.
 *     return await processRecursive(count, index + 1, sum + index)(run);
 *   };
 * ```
 *
 * @group Composition
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield
 * @see https://web.dev/articles/optimize-long-tasks
 */
export const yieldNow: Task<void> = () =>
  tryAsync(
    () => yieldImpl(), // TODO: yieldImpl(run.signal)
    (error): AbortError => ({ type: "AbortError", reason: error }),
  );

const yieldImpl: () => Promise<void> =
  "scheduler" in globalThis && "yield" in globalThis.scheduler
    ? () => globalThis.scheduler.yield()
    : typeof setImmediate !== "undefined"
      ? () => new Promise<void>(setImmediate)
      : () => new Promise<void>((r) => setTimeout(r, 0)); // Safari

/**
 * Pauses execution for a specified duration.
 *
 * ### Example
 *
 * ```ts
 * const task: Task<void> = async (run) => {
 *   console.log("Starting...");
 *   await run(sleep("1s"));
 *   console.log("Done after 1 second");
 *   return ok();
 * };
 * ```
 *
 * @group Composition
 */
export const sleep =
  (duration: Duration): Task<void> =>
  (run) =>
    new Promise((resolve) => {
      const id = run.time.setTimeout(() => {
        resolve(ok());
      }, durationToMillis(duration));

      run.onAbort((reason) => {
        run.time.clearTimeout(id);
        resolve(err({ type: "AbortError", reason }));
      });
    });

/**
 * Returns a {@link Task} that completes first.
 *
 * Like
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race | Promise.race},
 * the first task to complete (whether success or failure) wins. All other tasks
 * are aborted.
 *
 * Unlike `Promise.race`, this requires a non-empty array instead of an
 * `Iterable`. This enables compile-time enforcement that at least one task is
 * provided — `Promise.race([])` hangs forever, which is rarely intended. For
 * tasks from an `Iterable`, spread and use {@link isNonEmptyArray}:
 *
 * ```ts
 * const tasksArray = [...tasksIterable];
 * if (isNonEmptyArray(tasksArray)) {
 *   await run(race(tasksArray));
 * }
 * ```
 *
 * ### Example
 *
 * ```ts
 * const fast: Task<string, never> = async () => ok("fast");
 * const slow: Task<string, never> = async () => {
 *   await new Promise((r) => setTimeout(r, 10));
 *   return ok("slow");
 * };
 *
 * // First wins, others are aborted.
 * const result = await run(race([fast, slow])); // ok("fast")
 * ```
 *
 * @group Composition
 */
export const race =
  <
    T extends readonly [
      Task<any, any, any>,
      ...ReadonlyArray<Task<any, any, any>>,
    ],
  >(
    tasks: T,
    {
      abortReason = raceLostError,
    }: {
      /** Abort reason for losing tasks. Defaults to {@link raceLostError}. */
      abortReason?: unknown;
    } = {},
  ): Task<
    InferTaskOk<T[number]>,
    InferTaskErr<T[number]>,
    InferTaskDeps<T[number]>
  > =>
  async (run) => {
    const fibers = tasks.map(run.daemon);
    const abortPending = (reason: unknown) => {
      for (const fiber of fibers)
        if (fiber.getResult() === null) fiber.abort(reason);
      return ok();
    };
    run.onAbort(abortPending);
    await using _ = run.defer(() => abortPending(abortReason));
    return await Promise.race(fibers);
  };

/**
 * Abort reason for tasks that lose a {@link race}.
 *
 * @group Composition
 */
export const RaceLostError = typed("RaceLostError");
export interface RaceLostError extends InferType<typeof RaceLostError> {}

/**
 * {@link RaceLostError} used as abort reason in {@link race}.
 *
 * @group Composition
 */
export const raceLostError: RaceLostError = { type: "RaceLostError" };

/**
 * Wraps a {@link Task} with a time limit.
 *
 * Returns {@link TimeoutError} if the task doesn't complete within the specified
 * duration. The original task is aborted when the timeout fires.
 *
 * ### Example
 *
 * ```ts
 * const fetchWithTimeout = timeout(fetchData, "5s");
 *
 * const result = await run(fetchWithTimeout);
 * if (!result.ok && result.error.type === "TimeoutError") {
 *   console.log("Request timed out");
 * }
 * ```
 *
 * @group Composition
 */
export const timeout = <T, E, D = unknown>(
  task: Task<T, E, D>,
  duration: Duration,
  {
    abortReason = timeoutError,
  }: {
    /**
     * Abort reason for the task when timeout fires. Defaults to
     * {@link timeoutError}.
     */
    abortReason?: unknown;
  } = {},
): Task<T, E | TimeoutError, D> =>
  race(
    [
      task,
      async (run) => {
        await run(sleep(duration));
        return err(timeoutError);
      },
    ],
    { abortReason },
  );

/**
 * Typed error returned by {@link timeout} when a task exceeds its time limit.
 *
 * @group Composition
 */
export const TimeoutError = typed("TimeoutError");
export interface TimeoutError extends InferType<typeof TimeoutError> {}

/**
 * {@link TimeoutError} used as abort reason in {@link timeout}.
 *
 * @group Composition
 */
export const timeoutError: TimeoutError = { type: "TimeoutError" };

/**
 * Options for {@link retry}.
 *
 * @group Composition
 */
export interface RetryOptions<E, Output> {
  /** Predicate to determine if error is retryable. Defaults to all errors. */
  readonly retryable?: Predicate<E>;

  /**
   * Callback invoked before each retry attempt with error, retry attempt
   * number, schedule output, and delay.
   */
  readonly onRetry?: (attempt: RetryAttempt<E, Output>) => void;
}

/**
 * Info passed to {@link retry} {@link RetryOptions.onRetry} callback.
 *
 * @group Composition
 */
export interface RetryAttempt<E, Output> extends ScheduleStep<Output> {
  readonly error: E;
}

/**
 * Error returned when all retry attempts are exhausted.
 *
 * @group Composition
 */
export interface RetryError<E> extends Typed<"RetryError"> {
  /** The error from the final attempt. */
  readonly cause: E;

  /** Total attempts made (initial + retries). */
  readonly attempts: PositiveInt;
}

/**
 * Wraps a {@link Task} with retry logic controlled by a {@link Schedule}.
 *
 * Retries the task according to the schedule's timing and termination rules.
 * The schedule receives the error as input, enabling error-aware retry
 * strategies.
 *
 * {@link AbortError} is never retried — abort always propagates immediately.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   exponential,
 *   jitter,
 *   maxDelay,
 *   retry,
 *   take,
 * } from "@evolu/common";
 *
 * const fetchWithRetry = retry(
 *   fetchData,
 *   // A jittered, capped, limited exponential backoff.
 *   jitter(1)(maxDelay("20s")(take(2)(exponential("100ms")))),
 * );
 *
 * const result = await run(fetchWithRetry);
 * if (!result.ok && result.error.type === "RetryError") {
 *   console.log(`Failed after ${result.error.attempts} attempts`);
 * }
 * ```
 *
 * @group Composition
 */
export const retry =
  <T, E, D = unknown, Output = unknown>(
    task: Task<T, E, D>,
    schedule: Schedule<Output, E>,
    {
      retryable = lazyTrue as Predicate<E>,
      onRetry,
    }: RetryOptions<E, Output> = {},
  ): Task<T, E | RetryError<E>, D> =>
  async (run) => {
    const step = schedule(run);
    let attempt = minPositiveInt;
    let error: E | undefined;

    for (;;) {
      if (error !== undefined) {
        const scheduleResult = step(error);
        if (!scheduleResult.ok) {
          return err<RetryError<E>>({
            type: "RetryError",
            cause: error,
            attempts: PositiveInt.orThrow(decrement(attempt)),
          });
        }

        const [output, delay] = scheduleResult.value;
        onRetry?.({
          error,
          attempt: PositiveInt.orThrow(decrement(attempt)),
          output,
          delay,
        });
        if (delay > 0) {
          const sleepResult = await run(sleep(delay));
          if (!sleepResult.ok) return sleepResult;
        }
      }

      const result = await run(task);
      if (result.ok) return result;

      if (AbortError.is(result.error)) return result;

      error = result.error;
      if (!retryable(error)) {
        return err<RetryError<E>>({
          type: "RetryError",
          cause: error,
          attempts: attempt,
        });
      }

      attempt = PositiveInt.orThrow(increment(attempt));
    }
  };

/**
 * Options for {@link repeat}.
 *
 * @group Composition
 */
export interface RepeatOptions<T, Output> {
  /** Predicate to determine if value is repeatable. Defaults to all values. */
  readonly repeatable?: Predicate<T>;
  /**
   * Callback invoked before each repeat with value, repeat attempt number,
   * schedule output, and delay.
   */
  readonly onRepeat?: (attempt: RepeatAttempt<T, Output>) => void;
}

/**
 * Info passed to {@link repeat} {@link RepeatOptions.onRepeat} callback.
 *
 * @group Composition
 */
export interface RepeatAttempt<T, Output> extends ScheduleStep<Output> {
  readonly value: T;
}

/**
 * Repeats a {@link Task} according to a {@link Schedule}.
 *
 * Runs the task, then checks the schedule to determine if it should repeat. The
 * schedule controls how many repetitions occur and the delay between them.
 * Continues until the schedule returns `Err(Done<void>)` or the task fails.
 *
 * With `take(n)`, the task runs n+1 times (initial run plus n repetitions).
 *
 * Also works with {@link NextTask} — when the task returns `Err(Done<D>)`,
 * repeat stops and propagates the done signal.
 *
 * ### Example
 *
 * ```ts
 * import { fixed, take } from "@evolu/common/schedule";
 * import { repeat } from "@evolu/common";
 *
 * // Heartbeat every 30 seconds (runs forever until aborted)
 * const heartbeat = repeat(sendHeartbeat, fixed("30s"));
 *
 * // Poll 4 times total (initial + 3 repetitions), 1 second apart
 * const poll = repeat(checkStatus, take(3)(fixed("1s")));
 *
 * // Process queue items until empty (NextTask pattern)
 * const processQueue: NextTask<Item, ProcessError, void> = async (run) => {
 *   const item = queue.dequeue();
 *   if (!item) return err(done()); // Queue empty, stop
 *   await process(item);
 *   return ok(item);
 * };
 *
 * const result = await run(repeat(processQueue, fixed("100ms")));
 * if (!result.ok && result.error.type === "Done") {
 *   console.log("Queue exhausted");
 * }
 * ```
 *
 * @group Composition
 */
export const repeat =
  <T, E, D = unknown, Output = unknown>(
    task: Task<T, E, D>,
    schedule: Schedule<Output, T>,
    {
      repeatable = lazyTrue as Predicate<T>,
      onRepeat,
    }: RepeatOptions<T, Output> = {},
  ): Task<T, E, D> =>
  async (run) => {
    const step = schedule(run);
    let lastResult: Result<T, E>;
    let attempt = minPositiveInt;

    for (;;) {
      const result = await run(task);
      if (!result.ok) return result;
      lastResult = result;

      if (!repeatable(result.value)) return lastResult;

      const next = step(result.value);
      if (!next.ok) break;

      const [output, delay] = next.value;
      onRepeat?.({
        value: result.value,
        attempt,
        output,
        delay,
      });
      attempt = PositiveInt.orThrow(increment(attempt));
      if (delay > 0) {
        const sleepResult = await run(sleep(delay));
        if (!sleepResult.ok) return sleepResult;
      }
    }

    return lastResult;
  };

/**
 * A value that can be resolved later.
 *
 * Similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers | Promise.withResolvers},
 * but integrated with {@link Task} and {@link Runner} for cancellation support.
 *
 * Use for bridging callback-based APIs or coordinating between tasks.
 *
 * Disposing aborts all waiting tasks with an {@link AbortError} whose cause is
 * {@link deferredDisposedError}.
 *
 * @group Concurrency Primitives
 * @see {@link createDeferred}
 */
export interface Deferred<T, E = never> extends Disposable {
  /** A {@link Task} that waits until {@link Deferred.resolve} is called. */
  readonly task: Task<T, E | DeferredDisposedError>;

  /**
   * Resolves the value. Returns `true` on first call, `false` if already
   * resolved.
   */
  readonly resolve: (result: Result<T, E | DeferredDisposedError>) => boolean;
}

/**
 * Creates a {@link Deferred}.
 *
 * ### Example
 *
 * ```ts
 * const deferred = createDeferred<string, MyError>();
 *
 * // Start waiting for the value
 * const fiber = run(deferred.task);
 *
 * // Resolve from elsewhere (callback, another task, etc.)
 * deferred.resolve(ok("value"));
 *
 * const result = await fiber; // ok("value")
 * ```
 *
 * @group Concurrency Primitives
 */
export const createDeferred = <T, E = never>(): Deferred<T, E> => {
  let resolved: Result<T, E | DeferredDisposedError> | null = null;
  const resolvers = new Set<
    (result: Result<T, E | DeferredDisposedError>) => void
  >();

  const resolve = (result: Result<T, E | DeferredDisposedError>) => {
    if (resolved !== null) return false;
    resolved = result;
    for (const resolver of resolvers) resolver(result);
    resolvers.clear();
    return true;
  };

  return {
    task: (run) => {
      if (resolved !== null) return resolved;

      return new Promise((resolvePromise) => {
        const resolve = (
          result: Result<T, E | AbortError | DeferredDisposedError>,
        ) => {
          resolvers.delete(resolve);
          resolvePromise(result);
        };

        resolvers.add(resolve);

        run.onAbort((reason) => {
          resolve(err(createAbortError(reason)));
        });
      });
    },

    resolve,

    [Symbol.dispose]: () => {
      resolve(err(deferredDisposedError));
    },
  };
};

/**
 * Abort reason used when a {@link Deferred} is disposed.
 *
 * @group Concurrency Primitives
 */
export const DeferredDisposedError = typed("DeferredDisposedError");
export interface DeferredDisposedError extends InferType<
  typeof DeferredDisposedError
> {}

/**
 * {@link DeferredDisposedError} used as abort reason in {@link createDeferred}.
 *
 * @group Concurrency Primitives
 */
export const deferredDisposedError: DeferredDisposedError = {
  type: "DeferredDisposedError",
};

/**
 * A blocking {@link Task} — like a gate.
 *
 * - **Closed**: Tasks wait.
 * - **Open**: Tasks proceed.
 *
 * Use it to pause execution based on a condition. Unlike a {@link Deferred}
 * (which triggers once), a {@link Gate} can be opened and closed repeatedly.
 *
 * Disposing aborts all waiting tasks with {@link deferredDisposedError}.
 *
 * @group Concurrency Primitives
 * @see {@link createGate}
 */
export interface Gate<D = unknown> extends Disposable {
  readonly wait: Task<void, DeferredDisposedError, D>;
  readonly open: () => void;
  readonly close: () => void;
  readonly isOpen: () => boolean;
}

/**
 * Creates a {@link Gate} that starts closed.
 *
 * Useful for "stop/go" logic where multiple tasks need to wait for a state
 * change.
 *
 * ### Example
 *
 * ```ts
 * const networkGate = createGate();
 *
 * // Pause processing when offline
 * const onOffline = () => networkGate.close();
 *
 * // Resume processing when online
 * const onOnline = () => networkGate.open();
 *
 * const syncLoop = async (run) => {
 *   while (true) {
 *     // Blocks here whenever the gate is closed
 *     await run(networkGate.wait);
 *     await run(uploadNextItem);
 *   }
 * };
 * ```
 *
 * @group Concurrency Primitives
 */
export const createGate = <D = unknown>(): Gate<D> => {
  let isOpen = false;
  let disposed = false;
  let deferred = createDeferred<void>();

  return {
    wait: (run) => {
      if (disposed) return err(deferredDisposedError);
      if (isOpen) return ok();
      return run(deferred.task);
    },

    open: () => {
      if (disposed || isOpen) return;
      isOpen = true;
      deferred.resolve(ok());
    },

    close: () => {
      if (disposed || !isOpen) return;
      isOpen = false;
      deferred = createDeferred<void>();
    },

    isOpen: () => isOpen,

    [Symbol.dispose]: () => {
      if (disposed) return;
      disposed = true;
      deferred[Symbol.dispose]();
    },
  };
};

/**
 * A semaphore that limits the number of concurrent {@link Task}s.
 *
 * For mutual exclusion (limiting to exactly one {@link Task}), use {@link Mutex}
 * instead.
 *
 * @group Concurrency Primitives
 */
export interface Semaphore extends Disposable {
  /**
   * Executes a {@link Task} while holding a semaphore permit.
   *
   * The task waits until a permit is available. If the semaphore is disposed
   * while waiting or running, the task is aborted with an {@link AbortError}
   * whose reason is {@link semaphoreDisposedError}.
   */
  readonly withPermit: <T, E, D>(task: Task<T, E, D>) => Task<T, E, D>;
}

/**
 * Creates a {@link Semaphore} that limits concurrent {@link Task}s.
 *
 * @group Concurrency Primitives
 */
export const createSemaphore = (maxConcurrent: PositiveInt): Semaphore => {
  let disposed = false;
  let availablePermits: number = maxConcurrent;
  const queue = new Set<(result: Result<void, AbortError>) => void>();
  const runningFibers = new Set<Fiber<any, any, any>>();

  const abortResult = (reason: unknown): Result<never, AbortError> =>
    err(createAbortError(reason));

  const release = (): void => {
    const next = queue.values().next();
    if (!next.done) {
      queue.delete(next.value);
      next.value(ok());
      return;
    }
    availablePermits += 1;
  };

  const abortWaiting = (reason: unknown): void => {
    for (const resolve of queue) resolve(abortResult(reason));
    queue.clear();
  };

  return {
    withPermit:
      <T, E, D>(task: Task<T, E, D>): Task<T, E, D> =>
      async (run) => {
        if (disposed) return abortResult(semaphoreDisposedError);
        if (run.signal.aborted) return err(run.signal.reason);

        if (availablePermits === 0) {
          const acquired = await new Promise<Result<void, AbortError>>(
            (resolve) => {
              queue.add(resolve);
              run.onAbort((reason) => {
                queue.delete(resolve);
                resolve(abortResult(reason));
              });
            },
          );
          if (!acquired.ok) return acquired;
        } else {
          availablePermits -= 1;
        }

        const fiber = run(task);
        runningFibers.add(fiber);

        try {
          return await fiber;
        } finally {
          runningFibers.delete(fiber);
          release();
        }
      },

    [Symbol.dispose]: () => {
      if (disposed) return;
      disposed = true;

      for (const fiber of runningFibers) {
        fiber.abort(semaphoreDisposedError);
      }

      abortWaiting(semaphoreDisposedError);
    },
  };
};

/**
 * Abort reason used when a {@link Semaphore} is disposed.
 *
 * @group Concurrency Primitives
 */
export const SemaphoreDisposedError = typed("SemaphoreDisposedError");
export interface SemaphoreDisposedError extends InferType<
  typeof SemaphoreDisposedError
> {}

/**
 * {@link SemaphoreDisposedError} used as abort reason in {@link createSemaphore}.
 *
 * @group Concurrency Primitives
 */
export const semaphoreDisposedError: SemaphoreDisposedError = {
  type: "SemaphoreDisposedError",
};

/**
 * A mutex (mutual exclusion) that ensures only one {@link Task} runs at a time.
 *
 * This is a specialized version of a {@link Semaphore} with a permit count of 1.
 *
 * @group Concurrency Primitives
 */
export interface Mutex extends Disposable {
  /**
   * Executes a {@link Task} while holding the mutex lock.
   *
   * Only one task can hold the lock at a time. Other tasks wait until the lock
   * is released.
   */
  readonly withLock: <T, E, D>(task: Task<T, E, D>) => Task<T, E, D>;
}

/** @group Concurrency Primitives */
export const createMutex = (): Mutex => {
  const semaphore = createSemaphore(minPositiveInt);

  return {
    withLock: semaphore.withPermit,
    [Symbol.dispose]: semaphore[Symbol.dispose],
  };
};

/** @group Composition */
export const all = (): never => {
  throw new Error("TODO: later");
};

// TODO: Implement `all` and `any` with concurrency option:
//   all(tasks)                     // Unbounded concurrent (like Promise.all)
//   all(tasks, { concurrency: 5 }) // Max 5 at a time (uses Semaphore)
//   all(tasks, { concurrency: 1 }) // Sequential
//   any(tasks)                     // Unbounded concurrent (like Promise.any)
//   any(tasks, { concurrency: 1 }) // Sequential fallback ("first" pattern)
// Both accept Iterable<Task> - lazy iteration useful for bounded concurrency.
// race stays array-only and unbounded (bounded race doesn't make sense).

// TODO: Implement `fetch` - Task wrapper around globalThis.fetch.
// Add once retry is implemented to show composition (fetch + timeout + retry).

// TODO: Prioritized Task Scheduling API integration
// https://developer.mozilla.org/en-US/docs/Web/API/Prioritized_Task_Scheduling_API
//
// - `run(task, { priority })` - Fiber-level priority via TaskController
//   (extends AbortController), so the fiber's signal gets priority and all
//   nested work inherits it.
// - `fiber.setPriority(priority)` - Dynamic priority changes mid-flight via
//   TaskController.setPriority().
//
// Note: scheduler.yield() inherits priority from enclosing postTask, so
// yieldNow doesn't need a priority argument — just run the fiber at priority.
//
// Safari doesn't support it yet, Node.js probably never will (use setImmediate).
// For Safari, scheduler-polyfill can be used.
// https://www.npmjs.com/package/scheduler-polyfill
