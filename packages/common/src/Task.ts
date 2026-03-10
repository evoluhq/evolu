/**
 * JavaScript-native structured concurrency.
 *
 * @module
 */

import {
  arrayFrom,
  emptyArray,
  isNonEmptyArray,
  mapArray,
  type NonEmptyReadonlyArray,
} from "./Array.js";
import { assert } from "./Assert.js";
import { type Console, type ConsoleDep, createConsole } from "./Console.js";
import type { RandomBytes, RandomBytesDep } from "./Crypto.js";
import { createRandomBytes } from "./Crypto.js";
import { eqArrayStrict } from "./Eq.js";
import { lazyTrue, lazyVoid } from "./Function.js";
import { decrement, increment } from "./Number.js";
import {
  createRecord,
  emptyRecord,
  isFunction,
  isIterable,
  mapObject,
} from "./Object.js";
import type { Random, RandomDep, RandomNumber } from "./Random.js";
import { createRandom } from "./Random.js";
import { createRef, type Ref } from "./Ref.js";
import type { Done, NextResult, Ok, Result } from "./Result.js";
import { err, getOrThrow, ok, tryAsync } from "./Result.js";
import type { Schedule, ScheduleStep } from "./Schedule.js";
import { addToSet, deleteFromSet, emptySet } from "./Set.js";
import type { testCreateRun } from "./Test.js";
import type { Duration, Time, TimeDep } from "./Time.js";
import { createTime, durationToMillis, Millis } from "./Time.js";
import type { TracerConfigDep, TracerDep } from "./Tracer.js";
import {
  brand,
  createId,
  Id,
  type InferType,
  maxPositiveInt,
  minPositiveInt,
  type Name,
  NonNegativeInt,
  object,
  PositiveInt,
  type Typed,
  typed,
  union,
  Unknown,
  UnknownResult,
} from "./Type.js";
import type { isPromiseLike } from "./Types.js";
import {
  type Awaitable,
  type Callback,
  type CallbackWithCleanup,
  type Int1To100,
  type Mutable,
  type NewKeys,
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
 * - **{@link Task}** — a function that takes Run and returns {@link Awaitable}
 *   (sync or async) {@link Result}
 * - **{@link Run}** — a callable object that runs Tasks, manages their lifecycle,
 *   provides dependencies, and creates Fibers
 * - **{@link Fiber}** — awaitable, abortable/disposable handle to a running Task
 * - **{@link AsyncDisposableStack}** — Task-aware resource management that
 *   completes even when aborted
 *
 * Evolu's structured concurrency core is minimal — one function with a several
 * flags and helper methods using native APIs.
 *
 * ### Example
 *
 * ```ts
 * // A dependency — wraps native fetch for testability.
 * interface NativeFetchDep {
 *   readonly fetch: typeof globalThis.fetch;
 * }
 *
 * interface FetchError extends Typed<"FetchError"> {
 *   readonly error: unknown;
 * }
 *
 * // A Task wrapping native fetch — adds abortability.
 * const fetch =
 *   (url: string): Task<Response, FetchError, NativeFetchDep> =>
 *   ({ deps, signal }) =>
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
 * // Create a Run with dependencies.
 * await using run = createRun(deps);
 *
 * // Running a Task returns a Fiber that can be awaited.
 * const result = await run(fetch("/users/123"));
 * expectTypeOf(result).toEqualTypeOf<
 *   Result<Response, FetchError | AbortError>
 * >();
 *
 * // A Fiber can also be aborted (or disposed with `using`).
 * const fiber = run(fetch("/users/456"));
 * fiber.abort();
 *
 * // When this block ends, `await using` disposes the Run — aborting all Fibers.
 * ```
 *
 * In composition roots, prefer Evolu platform `createRun` adapters when one
 * exists. `@evolu/web`, `@evolu/nodejs`, and `@evolu/react-native` build on the
 * common {@link createRun} and add platform-specific global error handling.
 *
 * ## Composition
 *
 * | Category   | Helper             | Description                         |
 * | ---------- | ------------------ | ----------------------------------- |
 * | Collection | {@link all}        | fail-fast on first error            |
 * |            | {@link allSettled} | complete all regardless of failures |
 * |            | {@link map}        | values to Tasks, fail-fast          |
 * |            | {@link mapSettled} | values to Tasks, complete all       |
 * | Timing     | {@link sleep}      | pause execution                     |
 * |            | {@link timeout}    | time-bounded execution              |
 * |            | {@link repeat}     | repeat with schedule                |
 * |            | {@link yieldNow}   | yield to event loop                 |
 * | Racing     | {@link race}       | first to complete wins              |
 * |            | {@link any}        | first success wins                  |
 * | Resilience | {@link retry}      | retry with backoff                  |
 * | Interop    | {@link callback}   | wrap callback APIs                  |
 * |            | {@link fetch}      | HTTP requests with abort handling   |
 *
 * Collection helpers run sequentially by default. Use {@link concurrently} to
 * run Tasks concurrently. Note helpers like {@link race} always run
 * concurrently; sequential execution wouldn't make sense for their semantics.
 *
 * ## Style
 *
 * Imperative code is the preferred way to compose sequential {@link Task}
 * operations inside another Task.
 *
 * ```ts
 * const user = await run(fetchUser(id));
 * if (!user.ok) return user;
 *
 * const profile = await run(fetchProfile(user.value.id));
 * if (!profile.ok) return profile;
 *
 * return ok({ user: user.value, profile: profile.value });
 * ```
 *
 * This is an intentional style choice. Evolu keeps helpers for operations with
 * distinct semantics that plain control flow does not express well, such as
 * concurrency, racing, retries, timeouts, and collection processing. It
 * intentionally does not provide generic chain, flatMap, or pipe-style helpers
 * for ordinary sequential Task composition, because that would duplicate plain
 * control flow and create API ambiguity. While this can look verbose, it is
 * explicit, transparent, debuggable, and avoids pipes and nested helper
 * chains.
 *
 * ### Building a better fetch
 *
 * Use {@link timeout} to prevent hanging:
 *
 * ```ts
 * const fetchWithTimeout = (url: string) => timeout(fetch(url), "30s");
 *
 * expectTypeOf(fetchWithTimeout).toEqualTypeOf<
 *   (
 *     url: string,
 *   ) => Task<Response, FetchError | TimeoutError, NativeFetchDep>
 * >();
 * ```
 *
 * Add {@link retry} for resilience:
 *
 * ```ts
 * const fetchWithRetry = (url: string) =>
 *   retry(
 *     fetchWithTimeout(url),
 *     // A jittered, capped, limited exponential backoff.
 *     jitter(1)(maxDelay("20s")(take(2)(exponential("100ms")))),
 *   );
 *
 * expectTypeOf(fetchWithRetry).toEqualTypeOf<
 *   (
 *     url: string,
 *   ) => Task<
 *     Response,
 *     RetryError<FetchError | TimeoutError>,
 *     NativeFetchDep
 *   >
 * >();
 * ```
 *
 * Run composed tasks with {@link concurrently} and {@link map}:
 *
 * ```ts
 * await using run = createRun();
 *
 * const urls = [
 *   "https://api.example.com/users",
 *   "https://api.example.com/posts",
 *   "https://api.example.com/comments",
 * ];
 *
 * // At most 2 concurrent requests
 * const result = await run(concurrently(2, map(urls, fetchWithRetry)));
 *
 * expectTypeOf(result).toEqualTypeOf<
 *   Result<
 *     readonly Response[],
 *     AbortError | RetryError<TimeoutError | FetchError>
 *   >
 * >();
 * ```
 *
 * ## Dependency Injection
 *
 * Assumes familiarity with
 * {@link https://www.evolu.dev/docs/dependency-injection | Evolu Pure DI}. Task
 * DI is the same but without manually passing deps.
 *
 * Tasks declare dependencies via the `D` type parameter and access them via
 * `run.deps`:
 *
 * ```ts
 * const fetchUser =
 *   (id: UserId): Task<User, FetchUserError, FetchDep> =>
 *   async (run) => {
 *     const { fetch } = run.deps;
 *     // ...
 *   };
 * ```
 *
 * Provide dependencies when creating a Run:
 *
 * ```ts
 * const deps: FetchDep = {
 *   fetch: globalThis.fetch.bind(globalThis),
 * };
 *
 * await using run = createRun(deps);
 * await run(fetchUser(123));
 * ```
 *
 * For runtime-created dependencies, use {@link Run#addDeps}.
 *
 * ### Built-in dependencies
 *
 * {@link createRun} provides default {@link RunDeps} available to all Tasks
 * without declaring `D`:
 *
 * - {@link Console} — logging with hierarchical context via `child()`
 * - {@link Time} — current time
 * - {@link Random} — random number generation
 * - {@link RandomBytes} — cryptographic random bytes
 *
 * For example, using `Console`:
 *
 * ```ts
 * const myTask: Task<void> = async (run) => {
 *   const { console } = run.deps;
 *   console.log("started");
 *   // ...
 * };
 * ```
 *
 * Custom Console with formatted output:
 *
 * ```ts
 * const deps = {
 *   console: createConsole({
 *     formatter: createConsoleFormatter()({
 *       timestampFormat: "absolute",
 *     }),
 *   }),
 * };
 *
 * await using run = createRun(deps);
 *
 * const console = run.deps.console.child("main");
 *
 * console.log("started");
 * // 21:20:25.588 [main] started
 * ```
 *
 * For testing, use {@link testCreateRun} to get deterministic, controllable
 * implementations of all RunDeps.
 *
 * ## Resource management
 *
 * Evolu uses standard JavaScript
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management | resource management}.
 *
 * For Task-based disposal, Evolu provides {@link AsyncDisposableStack} — a
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
 * Even though {@link Task} returns {@link Awaitable} (allowing sync or async
 * results), the {@link Run} itself is always async. This is a deliberate design
 * choice:
 *
 * - **Sync** → {@link Result}, native `using` / `DisposableStack`
 * - **Async** → {@link Task}, {@link Run}, {@link Fiber}, `await using` /
 *   `AsyncDisposableStack`
 *
 * Benefits:
 *
 * - **No API ambiguity** — Task means async, Result means sync
 * - **Zero overhead** — sync code stays with zero overhead
 *
 * While a unified sync/async API is technically possible — with
 * {@link isPromiseLike} detection and two-phase disposal (sync first, async if
 * needed, and a flag for callers) — Evolu prefers plain functions for sync code
 * because most operations involve I/O, which is inherently async, and when we
 * need sync, it's for simplicity (no dependencies) and performance (zero
 * abstraction).
 *
 * Sync functions should be fast, so there's no need to monitor them. They
 * should take values, not dependencies — following the
 * {@link https://blog.ploeh.dk/2017/02/02/dependency-rejection/ | impure/pure/impure sandwich}
 * pattern where impure code gathers data, pure functions process it, and impure
 * code performs effects with the result. Sync functions taking deps often
 * indicate a design that could be improved — for example, a function taking
 * {@link Random} could instead accept {@link RandomNumber} as a value.
 *
 * Slow sync operations (parsing large JSON, sorting millions of items, complex
 * cryptography) belong in workers. The async boundary to the worker is a
 * {@link Task} with full monitoring — timeout, cancellation, tracing. The sync
 * code inside the worker needs no monitoring; the async call to the worker
 * provides it.
 *
 * ## FAQ
 *
 * ### Where is fork and join?
 *
 * For those familiar with other structured concurrency implementations:
 *
 * - **Fork** — `run(task)` creates a {@link Fiber}
 * - **Join** — `await fiber` waits for completion
 *
 * @group Core Types
 */
export type Task<T, E = never, D = unknown> = (
  run: Run<D>,
) => Awaitable<Result<T, E | AbortError>>;

/**
 * Shorthand for a {@link Task} with `any` type parameters.
 *
 * @group Type utilities
 */
export type AnyTask = Task<any, any, any>;

/**
 * Extracts the value type from a {@link Task}.
 *
 * @group Type utilities
 */
export type InferTaskOk<R extends AnyTask> =
  R extends Task<infer T, any, any> ? T : never;

/**
 * Extracts the error type from a {@link Task}.
 *
 * @group Type utilities
 */
export type InferTaskErr<R extends AnyTask> =
  R extends Task<any, infer E, any> ? E : never;

/**
 * Extracts the deps type from a {@link Task}.
 *
 * @group Type utilities
 */
export type InferTaskDeps<R extends AnyTask> =
  R extends Task<any, any, infer D> ? D : never;

/**
 * A {@link Task} that can complete with a value, signal done, or fail.
 *
 * Forms a pair with {@link NextResult}:
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
 * @group Type utilities
 */
export type InferTaskDone<T extends AnyTask> =
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
 * In most code, treat `AbortError` as control flow rather than business logic.
 * Propagate it unchanged and handle domain errors separately. Inspect
 * `AbortError.reason` only when you need reason-specific behavior.
 *
 * @group Core Types
 */
export const AbortError = /*#__PURE__*/ typed("AbortError", {
  reason: Unknown,
});
export interface AbortError extends InferType<typeof AbortError> {}

/**
 * Runs a {@link Task} with
 * {@link https://en.wikipedia.org/wiki/Structured_concurrency | structured concurrency}
 * semantics.
 *
 * Each `Run` forms a Task tree: child Tasks are bound to it, abort propagates
 * through that tree, and state is observable via snapshots and events.
 *
 * `Run` is a callable object — callable because it's convenient to run Tasks as
 * `run(task)`, and an object because it holds state.
 *
 * Calling `run(task)` creates a child `Run`, passes it to the Task, and returns
 * a {@link Fiber}. The child is tracked in `getChildren()`/events while running,
 * then disposed and removed when settled.
 *
 * Before Task execution, `run(task)` applies two short-circuit checks:
 *
 * - If this Run is not `Running`, the child is aborted with
 *   {@link runStoppedError} and the Task is replaced with `err(AbortError)`.
 * - If this Run's signal is already aborted and the child is abortable
 *   (`abortMask === 0`), the child is aborted with the same reason and the Task
 *   is replaced with `err(AbortError)`.
 *
 * After execution, the child stores both values: `outcome` (what the Task
 * returned) and `result` (what callers observe). If the child signal is aborted
 * at settlement time, `result` is forced to `err(AbortError)` even when
 * `outcome` is `ok(...)`.
 *
 * That's the whole mechanism: {@link Task} is a function that takes a `Run` and
 * returns an {@link Awaitable} {@link Result}. `run(task)` runs the Task via
 * `Promise.try(task, run)` with aforementioned logic.
 *
 * @group Core Types
 * @see {@link createRun}
 * @see {@link Task}
 */
export interface Run<D = unknown> extends AsyncDisposable {
  /** Runs a {@link Task} and returns a {@link Fiber} handle. */
  <T, E>(task: Task<T, E, D>): Fiber<T, E, D>;

  /** Runs a {@link Task} and throws if the returned {@link Result} is an error. */
  readonly orThrow: <T, E>(task: Task<T, E, D>) => Promise<T>;

  /** Unique {@link Id} for this Run. */
  readonly id: Id;

  /** The parent {@link Run}, if this Run was created as a child. */
  readonly parent: Run<D> | null;

  /** @see https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal */
  readonly signal: AbortSignal;

  /** The abort mask depth. `0` means abortable, `>= 1` means unabortable. */
  readonly abortMask: AbortMask;

  /**
   * Registers a callback to run when abort is requested.
   *
   * The callback receives the abort reason (extracted from {@link AbortError}).
   * If already aborted, the callback is invoked immediately. For
   * {@link unabortable} Tasks, the callback is never invoked.
   *
   * Intentionally synchronous — abort is signal propagation, not cleanup. Use
   * {@link Run.defer} for async cleanup that must run regardless of abort.
   */
  readonly onAbort: (callback: Callback<unknown>) => void;

  /** Returns the current {@link RunState}. */
  readonly getState: () => RunState;

  /** Returns the current child {@link Fiber}s. */
  readonly getChildren: () => ReadonlySet<Fiber<any, any, D>>;

  /**
   * Creates a memoized {@link RunSnapshot} of this Run.
   *
   * Use for monitoring, debugging, or building UI that visualizes Task trees.
   *
   * ### Example
   *
   * ```ts
   * // React integration with useSyncExternalStore
   * const useRunSnapshot = (run: Run) =>
   *   useSyncExternalStore(
   *     (callback) => {
   *       run.onEvent = callback;
   *       return () => {
   *         run.onEvent = undefined;
   *       };
   *     },
   *     () => run.snapshot(),
   *   );
   * ```
   */
  readonly snapshot: () => RunSnapshot;

  /**
   * Callback for monitoring Run events.
   *
   * Called when this Run or any descendant emits a {@link RunEvent}. Events
   * bubble up through parent runs, enabling centralized monitoring. Only
   * emitted when {@link RunConfig.eventsEnabled} is `true`.
   */
  onEvent: ((event: RunEvent) => void) | undefined;

  /**
   * The root daemon {@link Run}.
   *
   * The daemon is the root Run of the Task tree. Tasks started with
   * `run.daemon(task)` are attached to that root Run instead of the current
   * Run, so they can outlive the current Task and keep running until the root
   * Run is disposed.
   *
   * ### Example
   *
   * ```ts
   * const myTask: Task<void, never> = async (run) => {
   *   // Aborted when myTask ends
   *   run(helperTask);
   *
   *   // Outlives myTask, aborted when the root Run is disposed
   *   run.daemon(backgroundSync);
   *
   *   return ok();
   * };
   * ```
   */
  readonly daemon: Run<D>;

  /**
   * Creates a {@link Run} from this Run.
   *
   * Like {@link createRun}, the returned Run is daemon: it stays running until
   * disposed. Unlike {@link createRun}, it shares the same Deps as this Run.
   *
   * Useful for running Tasks with one reusable Run that can be disposed
   * manually. Disposing it aborts all running child Tasks and causes later
   * calls through it to be aborted as well.
   *
   * To run a single Task as daemon, use {@link Run.daemon}.
   */
  readonly create: () => Run<D>;

  /**
   * Creates an {@link AsyncDisposable} that runs a cleanup callback or
   * {@link Task} when disposed.
   *
   * Use for a one-off Task; for multiple, use {@link Run.stack} instead.
   *
   * ### Example
   *
   * ```ts
   * // One-off Task with defer
   * await using _ = run.defer(task);
   *
   * // For more Tasks, a stack is more practical
   * await using stack = run.stack();
   * stack.defer(taskA);
   * stack.defer(taskB);
   *
   * // Spread to make any object disposable with Task
   * const connection = {
   *   send: (data: Data) => {
   *     //
   *   },
   *   ...run.defer(async (run) => {
   *     await run(notifyPeers);
   *     return ok();
   *   }),
   * };
   * // connection[Symbol.asyncDispose] is now defined
   * ```
   */
  readonly defer: (
    onDisposeAsync: Task<void, never, D> | (() => Awaitable<void>),
  ) => AsyncDisposable;

  /**
   * Creates an {@link AsyncDisposableStack}.
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

  /** Returns the dependencies passed to {@link createRun}. */
  readonly deps: RunDeps & D;

  /**
   * @see {@link Concurrency}
   * @see {@link concurrently}
   */
  readonly concurrency: Concurrency;

  /**
   * Adds additional dependencies to this Run and returns it.
   *
   * Use for runtime-created dependencies — dependencies that cannot be created
   * in the composition root (e.g., app start).
   *
   * ### Example
   *
   * ```ts
   * // One-shot
   * await run.addDeps({ db })(getUser(123));
   *
   * // Multiple deps at once
   * await run.addDeps({ db, cache })(task);
   *
   * // Reusable — config comes from outside (message, file, etc.)
   * type DbWorkerDeps = DbDep; // or DbDep & CacheDep & ...
   *
   * const init =
   *   (config: Config): Task<void, InitError, CreateDbDep> =>
   *   async (run) => {
   *     const { createDb } = run.deps;
   *     await using stack = run.stack();
   *
   *     const db = await stack.use(createDb(config.connectionString));
   *     if (!db.ok) return db;
   *
   *     const runWithDb = run.addDeps({ db: db.value });
   *
   *     await runWithDb(getUser(123));
   *     await runWithDb(insertUser(user));
   *     return ok();
   *   };
   * ```
   *
   * ## FAQ
   *
   * ### How does it work?
   *
   * This is the whole implementation:
   *
   * ```ts
   * run.addDeps = <E extends NewKeys<E, D>>(newDeps: E): Run<D & E> => {
   *   depsRef.modify((currentDeps) => {
   *     const duplicate = Object.keys(newDeps).find(
   *       (k) => k in currentDeps,
   *     );
   *     assert(!duplicate, `Dependency '${duplicate}' already added.`);
   *     return [undefined, { ...currentDeps, ...newDeps }];
   *   });
   *   return self as unknown as Run<D & E>;
   * };
   * ```
   *
   * Dependencies are stored in a shared {@link Ref}, so `addDeps` propagates to
   * all runs. The runtime assertion ensures dependencies are created once —
   * automatic deduplication would mask poor design (dependencies should have a
   * single, clear point of creation).
   */
  readonly addDeps: <E extends NewKeys<E, D>>(extraDeps: E) => Run<D & E>;
}

/**
 * `Fiber` is a handle to a running {@link Task} that can be awaited, aborted, or
 * disposed.
 *
 * ### Example
 *
 * ```ts
 * await using run = createRun();
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
 *   using background = run(backgroundSync);
 *   await someOtherWork();
 * } // background.abort() called automatically here
 *
 * // Run child tasks in fiber's scope
 * fiber.run(childTask);
 *
 * // Monitor via the Run
 * fiber.run.onEvent = (event) => {
 *   // handle event
 * };
 * ```
 *
 * Because `Fiber` is a {@link PromiseLike} object, Fibers can be composed with
 * `Promise.all`, `Promise.race`, etc.
 *
 * Microtask timing: Run wraps the Task's promise with `.then` and `.finally`,
 * which adds microtasks between Task completion and Fiber settlement. Do not
 * write code that relies on a specific number of microtask yields between
 * Tasks. Use explicit synchronization primitives instead.
 *
 * @group Core Types
 */
export class Fiber<T = unknown, E = unknown, D = unknown>
  implements PromiseLike<Result<T, E | AbortError>>, Disposable
{
  readonly then: PromiseLike<Result<T, E | AbortError>>["then"];

  /**
   * A {@link Run} of this Fiber.
   *
   * Tasks run via this Run are aborted when the Fiber ends.
   *
   * ### Example
   *
   * ```ts
   * const fiber = run(longRunningTask);
   *
   * // helperTask is aborted when longRunningTask ends
   * fiber.run(helperTask);
   *
   * // Monitor this Fiber's Run
   * fiber.run.onEvent = (event) => {
   *   console.log(event);
   * };
   * ```
   */
  readonly run: Run<D>;

  constructor(run: Run<D>, promise: Promise<Result<T, E>>) {
    this.then = promise.then.bind(promise);
    this.run = run;
  }

  /**
   * Requests abort for this Fiber (and any child it started).
   *
   * ### Example
   *
   * ```ts
   * const fiber = run(fetchData);
   * fiber.abort();
   * const result = await fiber; // err(AbortError)
   * ```
   *
   * When abort is requested, the Fiber's result becomes {@link AbortError} even
   * if the Task completed successfully. This keeps behavior predictable —
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
    (this.run as RunInternal<RunDeps & D>).requestAbort(
      createAbortError(reason),
    );
  }

  /** Returns the current {@link RunState} of this Fiber's {@link Run}. */
  getState(): RunState<T, E> {
    return this.run.getState() as RunState<T, E>;
  }

  [Symbol.dispose](): void {
    this.abort();
  }
}

/**
 * Extracts the value type from a {@link Fiber}.
 *
 * @group Type utilities
 */
export type InferFiberOk<F extends Fiber<any, any, any>> =
  F extends Fiber<infer T, any, any> ? T : never;

/**
 * Extracts the error type from a {@link Fiber}.
 *
 * @group Type utilities
 */
export type InferFiberErr<F extends Fiber<any, any, any>> =
  F extends Fiber<any, infer E, any> ? E : never;

/**
 * Extracts the deps type from a {@link Fiber}.
 *
 * @group Type utilities
 */
export type InferFiberDeps<F extends Fiber<any, any, any>> =
  F extends Fiber<any, any, infer D> ? D : never;

/**
 * Abort mask depth for a {@link Run} or {@link Fiber}.
 *
 * - `0` — abortable (default)
 * - `>= 1` — inside {@link unabortable}, abort requests are ignored
 *
 * The mask tracks nested unabortable regions. When abort is requested, the
 * signal only propagates if `mask === 0`.
 *
 * - {@link unabortable} increments the mask — Task becomes protected
 * - {@link unabortableMask} provides `restore` to restore the previous mask
 * - Tasks inherit their parent's mask by default
 *
 * This enables nested acquire/use/release patterns where each level can have
 * its own abortable section while outer acquisitions remain protected.
 *
 * UI/debugging tools can use this to visually distinguish protected Tasks
 * (e.g., different icon or color) and explain why abort requests are ignored.
 *
 * @group Abort masking
 */
export const AbortMask = /*#__PURE__*/ brand("AbortMask", NonNegativeInt);
export type AbortMask = typeof AbortMask.Type;

/**
 * Maximum number of concurrent Tasks.
 *
 * Default is 1 (sequential). Use 1-100 as a literal or {@link PositiveInt} for
 * larger values.
 *
 * @group Concurrency primitives
 * @see {@link concurrently}
 * @see {@link createSemaphore}
 */
export type Concurrency = Int1To100 | PositiveInt;

/**
 * The lifecycle state of a {@link Run}.
 *
 * - `Running` — Task running, no result yet
 * - `Disposing` — abort requested, waiting for children to settle
 * - `Settled` — settled with result and outcome
 *
 * @group Core Types
 */
export type RunState<T = unknown, E = unknown> =
  | RunStateRunning
  | RunStateDisposing
  | RunStateSettled<T, E>;

export interface RunStateRunning extends Typed<"Running"> {}

export interface RunStateDisposing extends Typed<"Disposing"> {}

export interface RunStateSettled<
  T = unknown,
  E = unknown,
> extends Typed<"Settled"> {
  /**
   * The Run's completion value.
   *
   * If abort was requested, this is {@link AbortError} even if the Task
   * completed successfully — see `outcome` for what the Task actually
   * returned.
   */
  readonly result: Result<T, E>;

  /**
   * What the Task actually returned.
   *
   * Unlike `result`, not overridden by abort.
   */
  readonly outcome: Result<T, E>;
}

/**
 * {@link RunSnapshot} state Type.
 *
 * @group Monitoring
 */
export const RunSnapshotState = /*#__PURE__*/ union(
  /*#__PURE__*/ typed("Running"),
  /*#__PURE__*/ typed("Disposing"),
  /*#__PURE__*/ typed("Settled", {
    result: UnknownResult,
    outcome: UnknownResult,
  }),
);
export type RunSnapshotState = typeof RunSnapshotState.Type;

/**
 * A recursive snapshot of a {@link Run} tree.
 *
 * Snapshots use structural sharing — unchanged subtrees return the same object
 * reference. This is useful for UI libraries like React that leverage
 * referential transparency to skip re-rendering unchanged parts. Snapshots are
 * computed on demand rather than pushed on every change. Push would require
 * O(depth) new snapshot objects per mutation.
 *
 * @group Core Types
 * @see {@link Run.snapshot}
 */
export interface RunSnapshot {
  /** The {@link Run.id} this snapshot represents. */
  readonly id: Id;

  /** The current lifecycle state. */
  readonly state: RunSnapshotState;

  /** Child snapshots in run order. */
  readonly children: ReadonlyArray<RunSnapshot>;

  /** The abort mask depth. `0` means abortable, `>= 1` means unabortable. */
  readonly abortMask: AbortMask;
}

/**
 * The event-specific payload of a {@link RunEvent}.
 *
 * @group Monitoring
 */
export const RunEventData = /*#__PURE__*/ union(
  /*#__PURE__*/ typed("ChildAdded", { childId: Id }),
  /*#__PURE__*/ typed("ChildRemoved", { childId: Id }),
  /*#__PURE__*/ typed("StateChanged", { state: RunSnapshotState }),
);
export type RunEventData = typeof RunEventData.Type;

/**
 * Events emitted by a {@link Run} for monitoring and debugging.
 *
 * Events bubble up through parent runs, enabling centralized monitoring at the
 * root. Use with {@link Run.onEvent} to track Run lifecycle.
 *
 * @group Monitoring
 */
export const RunEvent = /*#__PURE__*/ object({
  id: Id,
  timestamp: Millis,
  data: RunEventData,
});
export interface RunEvent extends InferType<typeof RunEvent> {}

/**
 * Task-aware wrapper around native
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncDisposableStack | AsyncDisposableStack}.
 *
 * All Tasks run via this stack are {@link unabortable} and run with
 * {@link Run.daemon}, ensuring acquisition and cleanup complete even if abort is
 * requested.
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
 * @group Resource management
 */
export class AsyncDisposableStack<D = unknown> implements AsyncDisposable {
  readonly #stack = new globalThis.AsyncDisposableStack();
  readonly #daemon: Run<D>["daemon"];

  constructor(run: Run<D>) {
    this.#daemon = run.daemon;
  }

  #run<T, E>(task: Task<T, E, D>): Fiber<T, E, D> {
    return this.#daemon(unabortable(task));
  }

  #runVoid(
    task: Task<void, any, D> | (() => Awaitable<void>),
  ): PromiseLike<void> {
    return this.#run(task as Task<void, any, D>).then(lazyVoid);
  }

  /**
   * Registers a cleanup callback or {@link Task} to run when the stack is
   * disposed.
   *
   * Deferred Tasks run in LIFO order and are unabortable.
   *
   * ### Example
   *
   * ```ts
   * const task: Task<void> = async (run) => {
   *   await using stack = run.stack();
   *
   *   stack.defer(() => {
   *     console.log("cleanup");
   *     return ok();
   *   });
   *
   *   // ... do work
   *   return ok();
   * };
   * // "cleanup" logs when stack is disposed
   * ```
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncDisposableStack/defer
   */
  defer(onDisposeAsync: Task<void, never, D> | (() => Awaitable<void>)): void {
    this.#stack.defer(() => this.#runVoid(onDisposeAsync));
  }

  /**
   * Registers a disposable resource and returns it.
   *
   * Accepts either a direct value (sync) or a {@link Task} (async acquisition).
   * Resources are disposed in LIFO order. Acquisition is unabortable.
   *
   * ### Example
   *
   * ```ts
   * const task: Task<void> = async (run) => {
   *   await using stack = run.stack();
   *
   *   const db = await stack.use(createDatabase());
   *   if (!db.ok) return db;
   *
   *   const conn = await stack.use(createConnection(db.value));
   *   if (!conn.ok) return conn;
   *
   *   // Use conn.value...
   *   return ok();
   * };
   * // conn and db disposed automatically in LIFO order
   * ```
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
   * Acquires a resource and registers a custom release {@link Task}.
   *
   * Runs `acquire` to get a resource and registers `release` to run when the
   * stack is disposed. Use for resources that need cleanup but don't implement
   * {@link Disposable} or {@link AsyncDisposable}. If the resource is disposable,
   * use {@link use} instead.
   *
   * ### Example
   *
   * ```ts
   * await using stack = run.stack();
   *
   * const session = await stack.adopt(login(credentials), (session) =>
   *   logout(session),
   * );
   * if (!session.ok) return session;
   *
   * // Use session.value...
   * // logout(session.value) runs automatically when stack is disposed
   * ```
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncDisposableStack/adopt
   */
  async adopt<T, E = never>(
    acquire: Task<T, E, D>,
    release: (resource: T) => Task<void, never, D>,
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
 * Configuration for {@link Run} behavior.
 *
 * @group Monitoring
 */
export interface RunConfig {
  /**
   * Whether to emit {@link RunEvent}s.
   *
   * Use a {@link Ref} to enable/disable at runtime without recreating the Run.
   * Disabled by default for zero overhead in production.
   */
  readonly eventsEnabled: Ref<boolean>;
}

export interface RunConfigDep {
  readonly runConfig: RunConfig;
}

export type RunDeps = ConsoleDep &
  RandomBytesDep &
  RandomDep &
  TimeDep &
  Partial<RunConfigDep> &
  Partial<TracerConfigDep> & // TODO:
  Partial<TracerDep>; // TODO:

const defaultDeps: RunDeps = {
  console: createConsole(),
  randomBytes: createRandomBytes(),
  random: createRandom(),
  time: createTime(),
};

/**
 * Factory type for creating root {@link Run} instances.
 *
 * @group Creating Run
 */
export interface CreateRun<BaseDeps> {
  (): Run<BaseDeps>;
  <D>(deps: D): Run<BaseDeps & D>;
}

/**
 * Creates root {@link Run}.
 *
 * The root Run is also the daemon Run: it stays running until disposed. Child
 * Runs created by `run(task)` are disposed by their parent once they settle.
 *
 * Call once per entry point (main thread, worker, etc.) and dispose on
 * shutdown. All Tasks run as descendants of this root Run.
 *
 * This common {@link createRun} is platform-agnostic. At application entry
 * points, prefer the platform adapter when one exists. `@evolu/web` adds
 * browser `error` and `unhandledrejection` handlers, `@evolu/nodejs` adds
 * Node.js `uncaughtException`, `unhandledRejection`, and graceful shutdown
 * handling, and `@evolu/react-native` adds React Native global error handling.
 *
 * {@link RunDeps} provides default dependencies:
 *
 * - {@link Time}
 * - {@link Console}
 * - {@link Random}
 * - {@link RandomBytes}
 *
 * ### Example
 *
 * ```ts
 * // App entry point
 * await using run = createRun();
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
 *   async (run) => {
 *     const { config } = run.deps;
 *     const response = await fetch(`${config.apiUrl}/users/${id}`);
 *     // ...
 *   };
 *
 * // Composition root: create a Run with custom deps
 * type AppDeps = RunDeps & ConfigDep;
 *
 * const appDeps: AppDeps = {
 *   ...testCreateDeps(), // or spread individual deps
 *   config: { apiUrl: "https://api.example.com" },
 * };
 *
 * await using run = createRun(appDeps);
 *
 * // Run type is inferred from the deps argument
 * const result = await run(fetchUser("123"));
 *
 * // TypeScript catches missing deps at compile time:
 * // await using run2 = createRun(); // Run<RunDeps>
 * // run2(fetchUser("123")); // Error: Property 'config' is missing
 * ```
 *
 * @group Creating Run
 */
export const createRun: CreateRun<RunDeps> = <D>(
  deps?: D,
): Run<RunDeps & D> => {
  const mergedDeps = { ...defaultDeps, ...deps } as RunDeps & D;
  return createRunInternal(createRef(mergedDeps))();
};

/** Internal Run properties, hidden from public API via TypeScript types. */
interface RunInternal<D extends RunDeps = RunDeps> extends Run<D> {
  readonly requestAbort: (reason: unknown) => void;
  readonly requestSignal: AbortSignal;
  readonly complete: (result: UnknownResult, outcome: UnknownResult) => void;
}

const createRunInternal =
  <D extends RunDeps>(depsRef: Ref<D>) =>
  (
    parent?: RunInternal<D>,
    daemon?: RunInternal<D>,
    abortBehavior?: AbortBehavior,
    concurrencyBehavior?: Concurrency,
  ): RunInternal<D> => {
    const parentMask = parent?.abortMask ?? isAbortable;

    let abortMask: AbortMask;
    switch (abortBehavior) {
      case undefined:
        abortMask = parentMask;
        break;
      case "unabortable":
        abortMask = increment(parentMask) as AbortMask;
        break;
      default:
        assert(
          abortBehavior <= parentMask,
          "restore used outside its unabortableMask",
        );
        abortMask = abortBehavior;
    }

    const requestController = new AbortController();
    const signalController = new AbortController();

    let state: RunState = running;
    let result: UnknownResult | undefined;
    let outcome: UnknownResult | undefined;
    let children: ReadonlySet<Fiber<any, any, D>> = emptySet;

    const requestAbort = (reason: unknown) => {
      const abortError = reason as AbortError;
      if (abortMask === isAbortable) signalController.abort(abortError);
      requestController.abort(abortError);
    };

    if (parent) {
      subscribeToAbort(
        parent.requestSignal,
        () => requestAbort(parent.requestSignal.reason),
        { signal: requestController.signal },
      );
    }

    const emitEvent = (data: RunEventData) => {
      const deps = depsRef.get();
      if (!deps.runConfig?.eventsEnabled.get()) return;
      const e: RunEvent = { id: self.id, timestamp: deps.time.now(), data };
      for (let node: Run<D> | null = self; node; node = node.parent) {
        node.onEvent?.(e);
      }
    };

    const run = <T, E>(task: Task<T, E, D>): Fiber<T, E, D> => {
      const run = createRunInternal(depsRef)(
        self,
        daemon ?? self,
        getAbortBehavior(task),
        getConcurrencyBehavior(task),
      );

      if (state !== running) {
        run.requestAbort(runStoppedAbortError);
        task = () => err(runStoppedAbortError);
      } else if (
        signalController.signal.aborted &&
        run.abortMask === isAbortable
      ) {
        run.requestAbort(signalController.signal.reason);
        task = () => err(signalController.signal.reason);
      }

      const promise = Promise.try(task, run)
        .then((taskOutcome) => {
          const taskResult = run.signal.aborted
            ? err(run.signal.reason)
            : taskOutcome;
          run.complete(taskResult, taskOutcome);
          return taskResult;
        })
        .finally(run[Symbol.asyncDispose])
        .finally(() => {
          children = deleteFromSet(children, fiber);
          emitEvent({ type: "ChildRemoved", childId: run.id });
        });

      const fiber = new Fiber<T, E, D>(run, promise);

      children = addToSet(children, fiber);
      emitEvent({ type: "ChildAdded", childId: run.id });

      return fiber;
    };

    const self = run as RunInternal<D>;

    {
      const run = self as Mutable<RunInternal<D>>;
      const id = createId(depsRef.get());

      let snapshot: RunSnapshot | null = null;
      let disposingPromise: Promise<void> | null = null;

      run.orThrow = async (task) => getOrThrow(await self(task));
      run.id = id;
      run.parent = parent ?? null;

      run.signal = signalController.signal;
      run.abortMask = abortMask;
      run.onAbort = (callback) => {
        if (abortMask !== isAbortable) return;
        subscribeToAbort(
          signalController.signal,
          () => callback((signalController.signal.reason as AbortError).reason),
          { once: true, signal: requestController.signal },
        );
      };
      run.getState = () => state;
      run.getChildren = () => children;

      run.snapshot = () => {
        const childSnapshots = Array.from(children).map((fiber) =>
          fiber.run.snapshot(),
        );
        if (
          snapshot?.state !== state ||
          !eqArrayStrict(snapshot.children, childSnapshots)
        ) {
          snapshot = {
            id,
            state: state as RunSnapshotState,
            children: childSnapshots,
            abortMask,
          };
        }
        return snapshot;
      };

      run.daemon = daemon ?? self;
      run.create = () => run.daemon(createDeferred().task).run;
      run.defer = (task) => ({
        [Symbol.asyncDispose]: () =>
          self.daemon(unabortable(task as Task<void, never, D>)).then(lazyVoid),
      });
      run.stack = () => new AsyncDisposableStack(self);

      Object.defineProperty(run, "deps", { get: depsRef.get });

      run.concurrency =
        concurrencyBehavior ?? parent?.concurrency ?? defaultConcurrency;

      run.addDeps = <E extends NewKeys<E, D>>(newDeps: E): Run<D & E> => {
        depsRef.modify((currentDeps) => {
          const duplicate = Object.keys(newDeps).find((k) => k in currentDeps);
          assert(
            !duplicate,
            `Dependency '${duplicate}' already added. ` +
              `This assert ensures dependencies are created once. ` +
              `Automatic deduplication would mask bugs.`,
          );
          return [undefined, { ...currentDeps, ...newDeps }];
        });
        return self as unknown as Run<D & E>;
      };

      run[Symbol.asyncDispose] = () => {
        if (disposingPromise) return disposingPromise;

        state = { type: "Disposing" };
        emitEvent({ type: "StateChanged", state });
        requestAbort(runStoppedAbortError);

        disposingPromise = Promise.allSettled(children)
          .then(lazyVoid)
          .finally(() => {
            [result, outcome] = [result ?? ok(), outcome ?? ok()];
            state = { type: "Settled", result, outcome };
            emitEvent({ type: "StateChanged", state });
          });

        return disposingPromise;
      };

      // Internal
      run.requestAbort = requestAbort;
      run.requestSignal = requestController.signal;
      run.complete = (taskResult, taskOutcome) => {
        result = taskResult;
        outcome = taskOutcome;
      };
    }

    return self;
  };

const running: RunState = { type: "Running" };

/**
 * Abort reason indicating a {@link Run} can no longer start new Tasks.
 *
 * Covers both disposing and settled Runs.
 *
 * @group Creating Run
 */
export const RunStoppedError = /*#__PURE__*/ typed("RunStoppedError");
export interface RunStoppedError extends InferType<typeof RunStoppedError> {}

/**
 * Shared {@link RunStoppedError} instance used as the default
 * {@link AbortError.reason} when a Task is started on a non-running {@link Run}.
 *
 * @group Creating Run
 */
export const runStoppedError: RunStoppedError = {
  type: "RunStoppedError",
};

const createAbortError = (reason: unknown): AbortError => ({
  type: "AbortError",
  reason,
});

const subscribeToAbort = (
  signal: AbortSignal,
  handler: () => void,
  options: AddEventListenerOptions,
): void => {
  if (signal.aborted) handler();
  else signal.addEventListener("abort", handler, options);
};

const runStoppedAbortError: AbortError = createAbortError(runStoppedError);

const isAbortable = AbortMask.orThrow(0);
type AbortBehavior = "unabortable" | AbortMask;
const abortBehaviorSymbol = Symbol("evolu.Task.abortBehavior");

const getAbortBehavior = (task: AnyTask): AbortBehavior | undefined =>
  (task as never)[abortBehaviorSymbol];

const abortBehavior =
  (behavior: AbortBehavior) =>
  <T, E, D>(task: Task<T, E, D>): Task<T, E, D> =>
    Object.assign((run: Run<D>) => run(task), {
      [abortBehaviorSymbol]: behavior,
    });

/**
 * Makes a {@link Task} unabortable.
 *
 * Once started, an unabortable Task always completes — abort requests are
 * ignored and `signal.aborted` remains `false`.
 *
 * If the parent {@link Run} is already disposing or settled, `run(task)`
 * short-circuits before task execution and returns `err(AbortError)` with
 * {@link runStoppedError} as reason.
 *
 * ### Example
 *
 * ```ts
 * await using run = createRun();
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
 * // User clicks, we start tracking (Task runs until first await)
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
 * @group Abort masking
 */
// TODO: Clear AbortError from unabortable task results.
export const unabortable = /*#__PURE__*/ abortBehavior("unabortable");

/**
 * Like {@link unabortable}, but provides `restore` to restore abortability for
 * specific tasks.
 *
 * Tasks inherit abort masking from their parent. This means:
 *
 * - Tasks run inside `unabortableMask` are unabortable by default
 * - Tasks wrapped with `restore()` restore the previous abortability
 *
 * @group Abort masking
 */
export const unabortableMask = <T, E, D = unknown>(
  fn: (
    restore: <T2, E2>(task: Task<T2, E2, D>) => Task<T2, E2, D>,
  ) => Task<T, E, D>,
): Task<T, E, D> =>
  unabortable((run) =>
    fn(abortBehavior(AbortMask.orThrow(decrement(run.abortMask))))(run),
  );

const defaultConcurrency: Concurrency = 1;

const concurrencyBehaviorSymbol = Symbol("evolu.Task.concurrencyBehavior");

const getConcurrencyBehavior = (task: AnyTask): Concurrency | undefined =>
  (task as never)[concurrencyBehaviorSymbol];

/**
 * Runs tasks concurrently instead of sequentially.
 *
 * Sets the {@link Concurrency} level for a {@link Task}, which helpers like
 * {@link all}, {@link map}, etc. use to control how many tasks run at once.
 *
 * By default, tasks run sequentially (one at a time) to encourage thinking
 * about concurrency explicitly.
 *
 * For tuple-based calls like `all([taskA, taskB, taskC])` with a known small
 * number of tasks, omit the limit (runs unlimited). For arrays of unknown
 * length, always specify a limit.
 *
 * Concurrency is inherited by child tasks and can be overridden at any level.
 * Composition helpers should respect inherited concurrency — they should not
 * override it with a fixed number unless semantically required (like
 * {@link race}). Helpers with a recommended concurrency should export it for use
 * with `concurrently`.
 *
 * ### Example
 *
 * ```ts
 * // Unlimited (omit the limit)
 * run(concurrently(all([fetchA, fetchB, fetchC])));
 *
 * // Limited — at most 5 tasks run at a time
 * run(concurrently(5, all(tasks)));
 * run(concurrently(5, map(userIds, fetchUser)));
 *
 * // Inherited — inner all() uses parent's limit
 * const pipeline = concurrently(5, async (run) => {
 *   const users = await run(map(userIds, fetchUser)); // uses 5
 *   if (!users.ok) return users;
 *   return run(map(users.value, enrichUser)); // also uses 5
 * });
 * ```
 *
 * @group Composition
 */
export function concurrently<T, E, D = unknown>(
  concurrency: Concurrency,
  task: Task<T, E, D>,
): Task<T, E, D>;
/** Unlimited. */
export function concurrently<T, E, D = unknown>(
  task: Task<T, E, D>,
): Task<T, E, D>;
export function concurrently<T, E, D = unknown>(
  concurrencyOrTask: Concurrency | Task<T, E, D>,
  taskOrFallback?: Task<T, E, D>,
): Task<T, E, D> {
  const isTask = isFunction(concurrencyOrTask);
  const task = isTask ? concurrencyOrTask : taskOrFallback!;
  return Object.assign((run: Run<D>) => run(task), {
    [concurrencyBehaviorSymbol]: isTask ? maxPositiveInt : concurrencyOrTask,
  });
}

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
 *   const { time } = run.deps;
 *   let lastYield = time.now();
 *
 *   for (const item of largeArray) {
 *     processItem(item);
 *
 *     // Yield periodically to keep UI responsive
 *     if (time.now() - lastYield > msLongTask) {
 *       const r = await run(yieldNow);
 *       if (!r.ok) return r;
 *       lastYield = time.now();
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
    (reason): AbortError => createAbortError(reason),
  );

const scheduler = (
  globalThis as unknown as {
    readonly scheduler?: { readonly yield?: unknown };
  }
).scheduler;

const yieldImpl: () => Promise<void> =
  typeof scheduler?.yield === "function"
    ? () => (scheduler.yield as () => Promise<void>)()
    : typeof setImmediate !== "undefined"
      ? () => new Promise<void>((resolve) => setImmediate(resolve))
      : () => new Promise<void>((r) => setTimeout(r, 0)); // Safari

/**
 * Creates a {@link Task} from a callback-based API.
 *
 * Use this to wrap callback-style APIs (event listeners, Node.js callbacks,
 * etc.) into Tasks with proper abort handling.
 *
 * Optionally return a cleanup function that runs on abort.
 *
 * ### Example
 *
 * ```ts
 * // The sleep helper is implemented using callback:
 * const sleep = (duration: Duration): Task<void> =>
 *   callback(({ ok, deps: { time } }) => {
 *     const id = time.setTimeout(ok, durationToMillis(duration));
 *     return () => time.clearTimeout(id);
 *   });
 *
 * // Wrap an event listener — use signal directly
 * const waitForClick = (element: HTMLElement): Task<MouseEvent> =>
 *   callback(({ ok, signal }) => {
 *     element.addEventListener("click", ok, { once: true, signal });
 *   });
 *
 * // Wrap Node.js callback API
 * const readFile = (path: string): Task<string, NodeJS.ErrnoException> =>
 *   callback(({ ok, err }) => {
 *     fs.readFile(path, "utf8", (error, data) => {
 *       if (error) err(error);
 *       else ok(data);
 *     });
 *   });
 * ```
 *
 * @group Composition
 */
export const callback =
  <T, E = never>(
    callback: CallbackWithCleanup<{
      ok: Callback<T>;
      err: Callback<E>;
      signal: AbortSignal;
      deps: RunDeps;
    }>,
  ): Task<T, E> =>
  (run) =>
    new Promise((resolve) => {
      const cleanup = callback({
        ok: (value) => resolve(ok(value)),
        err: (error) => resolve(err(error)),
        signal: run.signal,
        deps: run.deps,
      });

      run.onAbort((reason) => {
        if (cleanup) cleanup();
        resolve(err(createAbortError(reason)));
      });
    });

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
export const sleep = (duration: Duration): Task<void> =>
  callback(({ ok, deps: { time } }) => {
    const id = time.setTimeout(ok, durationToMillis(duration));
    return () => time.clearTimeout(id);
  });

/**
 * Returns a {@link Task} that completes first.
 *
 * Like
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race | Promise.race},
 * the first Task to complete (whether success or failure) wins. All other Tasks
 * are aborted. Use {@link any} if you need the first Task to succeed instead.
 *
 * Requires a non-empty array — racing zero Tasks has no meaningful result
 * (there's no "first to complete" without participants). This is enforced at
 * compile time for non-empty tuple types. For other arrays, guard with
 * {@link isNonEmptyArray}:
 *
 * ```ts
 * if (isNonEmptyArray(tasks)) {
 *   await run(race(tasks));
 * }
 * ```
 *
 * ### Example
 *
 * ```ts
 * const fast: Task<string> = () => ok("fast");
 * const slow: Task<string> = async (run) => {
 *   await run(sleep("10ms"));
 *   return ok("slow");
 * };
 *
 * // First wins, others are aborted.
 * const result = await run(race([fast, slow])); // ok("fast")
 * ```
 *
 * Always runs with unlimited concurrency — a sequential race makes no sense
 * since the first Task would always "win".
 *
 * @group Composition
 */
export const race = <T extends readonly [AnyTask, ...ReadonlyArray<AnyTask>]>(
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
  concurrently(pool(tasks, { stopOn: "first", collect: false, abortReason }));
/**
 * Abort reason for tasks that lose a {@link race}.
 *
 * @group Composition
 */
export const RaceLostError = /*#__PURE__*/ typed("RaceLostError");
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
 * Returns {@link TimeoutError} if the Task doesn't complete within the specified
 * duration. The original Task is aborted when the timeout fires.
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
export const TimeoutError = /*#__PURE__*/ typed("TimeoutError");
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
 * Wraps a {@link Task} with retry logic.
 *
 * Retries the Task according to the {@link Schedule}'s rules. Use
 * {@link RetryOptions.retryable} to filter which errors should trigger retries.
 *
 * All non-abort errors are wrapped in {@link RetryError}:
 *
 * - Task succeeds → `ok(value)`
 * - Task returns {@link AbortError} → `err(AbortError)` — passed through, no
 *   retry, no wrapping
 * - Task returns any other error → retry until schedule exhausted or `retryable`
 *   returns false → `err(RetryError)` with `cause` = the last error
 *
 * The `RetryError` is informative: "I tried N times, here's why I finally gave
 * up" — and `cause` contains the actual underlying error.
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
 * if (!result.ok) {
 *   if (AbortError.is(result.error)) {
 *     // Was aborted externally
 *   } else {
 *     // RetryError — failed after retrying
 *     console.log(`Failed after ${result.error.attempts} attempts`);
 *     console.log(`Last error:`, result.error.cause);
 *   }
 * }
 * ```
 *
 * The schedule receives the error as input, enabling error-aware strategies
 * like stopping on fatal errors:
 *
 * ```ts
 * import { whileScheduleInput } from "@evolu/common";
 *
 * // Don't retry fatal errors
 * const smartRetry = retry(
 *   fetchData,
 *   whileScheduleInput((e: FetchError) => e.type !== "FatalError")(
 *     take(5)(spaced("1s")),
 *   ),
 * );
 * ```
 *
 * @group Composition
 * @see {@link RetryOptions}
 */
export const retry =
  <T, E, D = unknown, Output = unknown>(
    task: Task<T, E, D>,
    schedule: Schedule<Output, E>,
    {
      retryable = lazyTrue as Predicate<E>,
      onRetry,
    }: RetryOptions<E, Output> = {},
  ): Task<T, RetryError<E>, D> =>
  async (run) => {
    const step = schedule(run.deps);
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

      if (AbortError.is(result.error)) return err(result.error);

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
 * Runs the Task, then checks the schedule to determine if it should repeat. The
 * schedule controls how many repetitions occur and the delay between them.
 * Continues until the schedule returns `Err(Done<void>)` or the Task fails.
 *
 * With `take(n)`, the task runs n+1 times (initial run plus n repetitions).
 *
 * Also works with {@link NextTask} — when the Task returns `Err(Done<D>)`,
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
    const step = schedule(run.deps);
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
 * but integrated with {@link Task} and {@link Run} for cancellation support.
 *
 * Use for bridging callback-based APIs or coordinating between Tasks.
 *
 * Disposing aborts all waiting Tasks with an {@link AbortError} with
 * {@link deferredDisposedError} reason.
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
 * @group Concurrency primitives
 * @see {@link createDeferred}
 */
export interface Deferred<T, E = never> extends Disposable {
  /** A {@link Task} that waits until {@link Deferred.resolve} is called. */
  readonly task: Task<T, E | DeferredDisposedError>;

  /** Resolves the value. Returns `true` once, then `false`. */
  readonly resolve: (
    result: Result<T, E | AbortError | DeferredDisposedError>,
  ) => boolean;
}

/**
 * Creates a {@link Deferred}.
 *
 * @group Concurrency primitives
 */
export const createDeferred = <T, E = never>(): Deferred<T, E> => {
  let resolved: Result<T, E | AbortError | DeferredDisposedError> | null = null;
  const resolvers = new Set<
    (result: Result<T, E | AbortError | DeferredDisposedError>) => void
  >();

  const resolve = (
    result: Result<T, E | AbortError | DeferredDisposedError>,
  ) => {
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
 * @group Concurrency primitives
 */
export const DeferredDisposedError = /*#__PURE__*/ typed(
  "DeferredDisposedError",
);
export interface DeferredDisposedError extends InferType<
  typeof DeferredDisposedError
> {}

/**
 * {@link DeferredDisposedError} used as abort reason in {@link createDeferred}.
 *
 * @group Concurrency primitives
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
 * Disposing aborts all waiting Tasks with {@link deferredDisposedError}.
 *
 * @group Concurrency primitives
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
 * Useful for "stop/go" logic where multiple Tasks need to wait for a state
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
 * @group Concurrency primitives
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
 * @group Concurrency primitives
 */
export interface Semaphore extends Disposable {
  /**
   * Executes a {@link Task} while holding a semaphore permit.
   *
   * The Task waits until a permit is available. If the semaphore is disposed
   * while waiting or running, the Task is aborted with an {@link AbortError}
   * whose reason is {@link semaphoreDisposedError}.
   */
  readonly withPermit: <T, E, D>(task: Task<T, E, D>) => Task<T, E, D>;

  /**
   * Executes a {@link Task} while holding a specified number of permits.
   *
   * If insufficient permits are available, waits in FIFO order until permits
   * become available. If disposed while waiting or running, the Task is aborted
   * with {@link semaphoreDisposedError}.
   *
   * Use this for weighted concurrency where a Task represents a resource
   * demand, not just "one more Task". One permit is one resource unit.
   *
   * Example: with capacity `10`, a lightweight operation can reserve `1` permit
   * while a heavy operation reserves `4` permits. This models shared budgets
   * such as DB connections, API credits, memory/CPU buckets, or batch
   * processing slots.
   *
   * {@link Semaphore.withPermit} is equivalent to `withPermits(1)`.
   */
  readonly withPermits: <T, E, D>(
    permits: Concurrency,
  ) => (task: Task<T, E, D>) => Task<T, E, D>;

  /** Returns the current semaphore state for monitoring/debugging. */
  readonly snapshot: () => SemaphoreSnapshot;
}

/** Snapshot returned by {@link Semaphore.snapshot}. */
export interface SemaphoreSnapshot {
  /** Total permits configured at creation. */
  readonly permits: Concurrency;

  /** Currently held permits. */
  readonly taken: NonNegativeInt;

  /** Number of currently waiting Tasks. */
  readonly waiting: NonNegativeInt;

  /** Currently available permits. */
  readonly available: NonNegativeInt;

  /** Whether the semaphore has been disposed. */
  readonly disposed: boolean;
}

/**
 * Creates a {@link Semaphore} that limits concurrent {@link Task}s.
 *
 * ### Example
 *
 * ```ts
 * await using run = createRun();
 *
 * const semaphore = createSemaphore(PositiveInt.orThrow(2));
 *
 * const fetchUser =
 *   (id: string): Task<string> =>
 *   async (run) => {
 *     const { console } = run.deps;
 *     console.log("[demo]", "start", id);
 *     const slept = await run(sleep("10ms"));
 *     if (!slept.ok) return slept;
 *     console.log("[demo]", "end", id);
 *     return ok(`user:${id}`);
 *   };
 *
 * const fetchWithPermit = (id: string) =>
 *   semaphore.withPermit(fetchUser(id));
 *
 * await Promise.all([
 *   run(fetchWithPermit("1")),
 *   run(fetchWithPermit("2")),
 *   run(fetchWithPermit("3")),
 * ]);
 *
 * // [demo] start 1
 * // [demo] start 2
 * // [demo] end 1
 * // [demo] start 3
 * // [demo] end 2
 * // [demo] end 3
 * ```
 *
 * @group Concurrency primitives
 */
export const createSemaphore = (permits: Concurrency): Semaphore => {
  interface Waiter {
    readonly permits: PositiveInt;
    readonly resolve: Callback<Result<void, AbortError>>;
  }

  const fibers = new Set<Fiber>();
  const waiters: Array<Waiter> = [];
  let taken = NonNegativeInt.orThrow(0);
  let disposed = false;

  const withPermits =
    <T, E, D>(requestedPermits: Concurrency) =>
    (task: Task<T, E, D>): Task<T, E, D> =>
    async (run) => {
      const requested = PositiveInt.orThrow(requestedPermits);

      assert(
        requested <= permits,
        "Requested permits must not exceed semaphore capacity.",
      );

      if (disposed) return err(semaphoreDisposedAbortError);

      if (waiters.length > 0 || taken + requested > permits) {
        const waiter = Promise.withResolvers<Result<void, AbortError>>();
        const waiting: Waiter = {
          permits: requested,
          resolve: waiter.resolve,
        };
        waiters.push(waiting);
        run.onAbort((reason) => {
          const i = waiters.indexOf(waiting);
          if (i >= 0) waiters.splice(i, 1);
          waiter.resolve(err(createAbortError(reason)));
        });

        const permit = await waiter.promise;
        if (!permit.ok) return permit;
      } else {
        taken = NonNegativeInt.orThrow(taken + requested);
      }

      let fiber: Fiber<T, E, D> | null = null;
      using _ = {
        [Symbol.dispose]: () => {
          if (fiber) fibers.delete(fiber);

          taken = NonNegativeInt.orThrow(taken - requested);

          while (waiters.length > 0) {
            const waiter = waiters[0];
            if (taken + waiter.permits > permits) break;
            waiters.shift();
            taken = NonNegativeInt.orThrow(taken + waiter.permits);
            waiter.resolve(ok());
          }
        },
      };

      fiber = run(task);
      fibers.add(fiber);
      return await fiber;
    };

  return {
    withPermits,

    withPermit: <T, E, D>(task: Task<T, E, D>): Task<T, E, D> =>
      withPermits<T, E, D>(1)(task),

    snapshot: () => ({
      permits,
      taken,
      waiting: NonNegativeInt.orThrow(waiters.length),
      available: NonNegativeInt.orThrow(permits - taken),
      disposed,
    }),

    [Symbol.dispose]: () => {
      if (disposed) return;
      disposed = true;

      using stack = new DisposableStack();
      for (const fiber of fibers) {
        stack.adopt(fiber, (fiber) => {
          fiber.abort(semaphoreDisposedError);
        });
      }

      for (const waiter of waiters) {
        waiter.resolve(err(semaphoreDisposedAbortError));
      }
      waiters.length = 0;
    },
  };
};

/**
 * Abort reason used when a {@link Semaphore} is disposed.
 *
 * @group Concurrency primitives
 */
export const SemaphoreDisposedError = /*#__PURE__*/ typed(
  "SemaphoreDisposedError",
);
export interface SemaphoreDisposedError extends InferType<
  typeof SemaphoreDisposedError
> {}

/**
 * {@link SemaphoreDisposedError} used as abort reason in {@link createSemaphore}.
 *
 * @group Concurrency primitives
 */
export const semaphoreDisposedError: SemaphoreDisposedError = {
  type: "SemaphoreDisposedError",
};

const semaphoreDisposedAbortError: AbortError = createAbortError(
  semaphoreDisposedError,
);

/**
 * A keyed {@link Semaphore} registry.
 *
 * Provides semaphore operations per key while preserving the same API shape as
 * {@link Semaphore}.
 *
 * @group Concurrency primitives
 */
export interface SemaphoreByKey<K extends string = string> extends Disposable {
  /**
   * Executes a {@link Task} while holding one permit for a specific key.
   *
   * Behaves like {@link Semaphore.withPermit}, scoped to `key`.
   */
  readonly withPermit: <T, E, D>(key: K, task: Task<T, E, D>) => Task<T, E, D>;

  /**
   * Executes a {@link Task} while holding permits for a specific key.
   *
   * Behaves like {@link Semaphore.withPermits}, scoped to `key`.
   */
  readonly withPermits: <T, E, D>(
    key: K,
    permits: Concurrency,
  ) => (task: Task<T, E, D>) => Task<T, E, D>;

  /** Returns current semaphore state for a key, or `null` if absent. */
  readonly snapshot: (key: K) => SemaphoreSnapshot | null;
}

/**
 * Creates a {@link SemaphoreByKey}.
 *
 * Each key gets its own semaphore with the same permit capacity.
 *
 * @group Concurrency primitives
 */
export const createSemaphoreByKey = <K extends string = string>(
  permits: Concurrency,
): SemaphoreByKey<K> => {
  const semaphoresByKey = new Map<K, Semaphore>();
  let disposed = false;

  const withPermits =
    <T, E, D>(key: K, requestedPermits: Concurrency) =>
    (task: Task<T, E, D>): Task<T, E, D> =>
    async (run: Run<D>) => {
      if (disposed) return err(semaphoreDisposedAbortError);

      let semaphore = semaphoresByKey.get(key);
      if (!semaphore) {
        semaphore = createSemaphore(permits);
        semaphoresByKey.set(key, semaphore);
      }

      using _ = {
        [Symbol.dispose]: () => {
          const snapshot = semaphore.snapshot();
          if (snapshot.taken === 0 && snapshot.waiting === 0) {
            semaphoresByKey.delete(key);
            semaphore[Symbol.dispose]();
          }
        },
      };

      return await run(semaphore.withPermits<T, E, D>(requestedPermits)(task));
    };

  return {
    withPermit: <T, E, D>(key: K, task: Task<T, E, D>): Task<T, E, D> =>
      withPermits<T, E, D>(key, 1)(task),

    withPermits,

    snapshot: (key) => semaphoresByKey.get(key)?.snapshot() ?? null,

    [Symbol.dispose]: () => {
      if (disposed) return;
      disposed = true;

      using stack = new DisposableStack();
      for (const semaphore of semaphoresByKey.values()) {
        stack.use(semaphore);
      }
      semaphoresByKey.clear();
    },
  };
};

/**
 * A mutex (mutual exclusion) that ensures only one {@link Task} runs at a time.
 *
 * This is a specialized version of a {@link Semaphore} with a permit count of 1.
 *
 * ### Example
 *
 * ```ts
 * await using run = createRun();
 *
 * const mutex = createMutex();
 *
 * const task =
 *   (id: string): Task<void> =>
 *   async (run) => {
 *     const { console } = run.deps;
 *     console.log("start", id);
 *     await run(sleep("10ms"));
 *     console.log("end", id);
 *     return ok();
 *   };
 *
 * await Promise.all([
 *   run(mutex.withLock(task("1"))),
 *   run(mutex.withLock(task("2"))),
 * ]);
 *
 * // start 1
 * // end 1
 * // start 2
 * // end 2
 * ```
 *
 * @group Concurrency primitives
 */
export interface Mutex extends Disposable {
  /**
   * Executes a {@link Task} while holding the mutex lock.
   *
   * Only one Task can hold the lock at a time. Other Tasks wait until the lock
   * is released.
   */
  readonly withLock: <T, E, D>(task: Task<T, E, D>) => Task<T, E, D>;

  /** Returns the current mutex state for monitoring/debugging. */
  readonly snapshot: () => SemaphoreSnapshot;
}

/**
 * Creates a {@link Mutex}.
 *
 * @group Concurrency primitives
 */
export const createMutex = (): Mutex => {
  const semaphore = createSemaphore(minPositiveInt);

  return {
    withLock: semaphore.withPermit,
    snapshot: semaphore.snapshot,
    [Symbol.dispose]: semaphore[Symbol.dispose],
  };
};

/**
 * A keyed {@link Mutex} registry.
 *
 * Provides mutex operations per key.
 *
 * @group Concurrency primitives
 */
export interface MutexByKey<K extends string = string> extends Disposable {
  /**
   * Executes a {@link Task} while holding the mutex lock for a specific key.
   *
   * Behaves like {@link Mutex.withLock}, scoped to `key`.
   */
  readonly withLock: <T, E, D>(key: K, task: Task<T, E, D>) => Task<T, E, D>;

  /** Returns the current mutex state for `key`, or `null` if absent. */
  readonly snapshot: (key: K) => SemaphoreSnapshot | null;
}

/**
 * Creates a {@link MutexByKey}.
 *
 * @group Concurrency primitives
 */
export const createMutexByKey = <
  K extends string = string,
>(): MutexByKey<K> => {
  const semaphoreByKey = createSemaphoreByKey<K>(minPositiveInt);

  return {
    withLock: <T, E, D>(key: K, task: Task<T, E, D>): Task<T, E, D> =>
      semaphoreByKey.withPermit(key, task),
    snapshot: semaphoreByKey.snapshot,
    [Symbol.dispose]: semaphoreByKey[Symbol.dispose],
  };
};

/**
 * {@link Ref} protected by a {@link Mutex}.
 *
 * `MutexRef` stores mutable state and serializes all operations through an
 * internal {@link Mutex}. Reads, writes, and updates observe one consistent
 * state transition at a time. If the update fails or is aborted, the previous
 * state is preserved.
 *
 * Typical use cases are small stateful coordinators such as caches, session
 * state, in-memory registries, and counters whose transitions need to run
 * {@link Task}s atomically.
 *
 * @group Concurrency primitives
 */
export interface MutexRef<T> extends Disposable {
  /** Returns the current state. */
  readonly get: Task<T>;

  /** Sets the state. */
  readonly set: (state: T) => Task<void>;

  /** Sets the state and returns the previous state. */
  readonly getAndSet: (state: T) => Task<T>;

  /** Sets the state and returns the current state after the update. */
  readonly setAndGet: (state: T) => Task<T>;

  /** Updates the state. */
  readonly update: <E = never, D = unknown>(
    updater: (current: T) => Task<T, E, D>,
  ) => Task<void, E, D>;

  /** Updates the state and returns the previous state. */
  readonly getAndUpdate: <E = never, D = unknown>(
    updater: (current: T) => Task<T, E, D>,
  ) => Task<T, E, D>;

  /** Updates the state and returns the current state after the update. */
  readonly updateAndGet: <E = never, D = unknown>(
    updater: (current: T) => Task<T, E, D>,
  ) => Task<T, E, D>;

  /** Modifies the state and returns a computed result from the transition. */
  readonly modify: <R, E = never, D = unknown>(
    updater: (current: T) => Task<readonly [result: R, nextState: T], E, D>,
  ) => Task<R, E, D>;
}

/**
 * Creates a {@link MutexRef} with the given initial state.
 *
 * @group Concurrency primitives
 */
export const createMutexRef = <T>(initialState: T): MutexRef<T> => {
  let currentState = initialState;
  const mutex = createMutex();

  return {
    get: mutex.withLock(() => ok(currentState)),

    set: (state) =>
      mutex.withLock(() => {
        currentState = state;
        return ok();
      }),

    getAndSet: (state) =>
      mutex.withLock(() => {
        const previousState = currentState;
        currentState = state;
        return ok(previousState);
      }),

    setAndGet: (state) =>
      mutex.withLock(() => {
        currentState = state;
        return ok(currentState);
      }),

    update: (updater) =>
      mutex.withLock(async (run) => {
        const nextState = await run(updater(currentState));
        if (!nextState.ok) return nextState;
        currentState = nextState.value;
        return ok();
      }),

    getAndUpdate: (updater) =>
      mutex.withLock(async (run) => {
        const previousState = currentState;
        const nextState = await run(updater(currentState));
        if (!nextState.ok) return nextState;
        currentState = nextState.value;
        return ok(previousState);
      }),

    updateAndGet: (updater) =>
      mutex.withLock(async (run) => {
        const nextState = await run(updater(currentState));
        if (!nextState.ok) return nextState;
        currentState = nextState.value;
        return ok(currentState);
      }),

    modify: (updater) =>
      mutex.withLock(async (run) => {
        const nextState = await run(updater(currentState));
        if (!nextState.ok) return nextState;
        const [result, updatedState] = nextState.value;
        currentState = updatedState;
        return ok(result);
      }),

    [Symbol.dispose]: mutex[Symbol.dispose],
  };
};

/**
 * Cross-platform leader lock abstraction.
 *
 * `acquire` blocks until leadership is acquired.
 *
 * Returns {@link Disposable} lease. Dispose it to release leadership.
 *
 * @group Concurrency primitives
 */
export interface LeaderLock {
  readonly acquire: (name: Name) => Task<Disposable>;
}

/** @group Concurrency primitives */
export interface LeaderLockDep {
  readonly leaderLock: LeaderLock;
}

/**
 * Creates an in-process {@link LeaderLock}.
 *
 * Uses one {@link Mutex} per {@link Name}. Suitable for runtimes without a
 * cross-process lock manager (for example in-memory worker tests or React
 * Native).
 *
 * @group Concurrency primitives
 */
export const createInMemoryLeaderLock = (): LeaderLock => {
  const mutexByName = createMutexByKey<Name>();

  return {
    acquire: (name) => async (run) => {
      // Two gates are needed: one to wait until lock acquisition and one to
      // keep the lock held until lease disposal.
      const onAcquired = Promise.withResolvers<void>();
      const onRelease = Promise.withResolvers<void>();

      void run.daemon(
        mutexByName.withLock(name, async () => {
          onAcquired.resolve();
          await onRelease.promise;
          return ok();
        }),
      );

      await onAcquired.promise;

      return ok({
        [Symbol.dispose]: () => {
          onRelease.resolve();
        },
      });
    },
  };
};

/**
 * Options for {@link all}, {@link allSettled}, {@link map}, and {@link mapSettled}.
 *
 * @group Composition
 */
export interface CollectOptions<Collect extends boolean = true> {
  /**
   * Whether to collect results. When `false`, returns `Task<void, E, D>`.
   *
   * @default true
   */
  readonly collect?: Collect;

  /**
   * Custom reason for aborting remaining tasks on failure.
   *
   * By default, uses the helper's default abort error.
   */
  readonly abortReason?: unknown;
}

/**
 * Fails fast on first error across multiple {@link Task}s.
 *
 * Sequential by default — use {@link concurrently} to run concurrently.
 *
 * ### Example
 *
 * ```ts
 * const result = await run(all([fetchUser, fetchPosts, fetchComments]));
 * if (!result.ok) return result;
 * const [user, posts, comments] = result.value;
 * ```
 *
 * @group Composition
 * @see {@link CollectOptions}
 */
export function all<
  const T extends readonly [AnyTask, ...ReadonlyArray<AnyTask>],
>(
  tasks: T,
  options?: CollectOptions,
): Task<
  { [K in keyof T]: InferTaskOk<T[K]> },
  InferTaskErr<T[number]>,
  InferTaskDeps<T[number]>
>;

/**
 * Returns object with same keys.
 *
 * ```ts
 * const result = await run(all({ user: fetchUser, posts: fetchPosts }));
 * if (!result.ok) return result;
 * const { user, posts } = result.value;
 * ```
 */
export function all<T extends Readonly<Record<string, AnyTask>>>(
  tasks: T,
  options?: CollectOptions,
): Task<
  { [P in keyof T]: InferTaskOk<T[P]> },
  [keyof T] extends [never] ? never : InferTaskErr<T[keyof T]>,
  [keyof T] extends [never] ? unknown : InferTaskDeps<T[keyof T]>
>;

/**
 * For dynamic or generated task lists.
 *
 * ```ts
 * const urls: ReadonlyArray<string> = getUrls();
 * const result = await run(map(urls, fetchUrl));
 * if (!result.ok) return result;
 * // result.value: ReadonlyArray<Response>
 * ```
 */
export function all<T, E, D>(
  tasks: Iterable<Task<T, E, D>>,
  options?: CollectOptions,
): Task<ReadonlyArray<T>, E, D>;

/**
 * Guarantees non-empty result.
 *
 * ```ts
 * const tasks: NonEmptyReadonlyArray<Task<Response, FetchError>> = [
 *   fetchUrl("/a"),
 *   fetchUrl("/b"),
 * ];
 * const result = await run(all(tasks));
 * if (!result.ok) return result;
 * // result.value: NonEmptyReadonlyArray<Response>
 * ```
 */
export function all<T, E, D>(
  tasks: NonEmptyReadonlyArray<Task<T, E, D>>,
  options?: CollectOptions,
): Task<NonEmptyReadonlyArray<T>, E, D>;

/**
 * Run for side effects only.
 *
 * ```ts
 * const result = await run(all(tasks, { collect: false }));
 * // result.value: void
 * ```
 */
export function all<T, E, D>(
  tasks: Iterable<Task<T, E, D>> | Readonly<Record<string, Task<T, E, D>>>,
  options: CollectOptions<false>,
): Task<void, E, D>;

export function all(
  input: CollectInput,
  options?: CollectOptions<boolean>,
): Task<unknown, unknown> {
  return collect("all", input, options);
}

/**
 * Abort reason used by {@link all} when aborting remaining tasks.
 *
 * Used when a Task fails and other Tasks need to be aborted.
 *
 * @group Composition
 */
export const AllAbortError = /*#__PURE__*/ typed("AllAbortError");
export interface AllAbortError extends InferType<typeof AllAbortError> {}

/**
 * {@link AllAbortError} used as abort reason in {@link all}.
 *
 * @group Composition
 */
export const allAbortError: AllAbortError = { type: "AllAbortError" };

/**
 * Completes all {@link Task}s regardless of individual failures.
 *
 * Like
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled | Promise.allSettled},
 * all Tasks run to completion regardless of individual failures. Returns an
 * array of {@link Result}s preserving the original order.
 *
 * Sequential by default. Use {@link concurrently} for concurrent execution.
 *
 * ### Example
 *
 * ```ts
 * const results = await run(
 *   allSettled([fetchUser, fetchPosts, fetchComments]),
 * );
 * if (!results.ok) return results; // Only AbortError
 *
 * for (const result of results.value) {
 *   if (result.ok) {
 *     console.log("Success:", result.value);
 *   } else {
 *     console.log("Failed:", result.error);
 *   }
 * }
 * ```
 *
 * @group Composition
 * @see {@link CollectOptions}
 */
export function allSettled<
  const T extends readonly [AnyTask, ...ReadonlyArray<AnyTask>],
>(
  tasks: T,
  options?: CollectOptions,
): Task<
  {
    [K in keyof T]: Result<InferTaskOk<T[K]>, InferTaskErr<T[K]> | AbortError>;
  },
  never,
  InferTaskDeps<T[number]>
>;

/**
 * Returns object with same keys.
 *
 * ```ts
 * const results = await run(
 *   allSettled({ user: fetchUser, posts: fetchPosts }),
 * );
 * if (!results.ok) return results;
 * const { user, posts } = results.value; // Each is Result<T, E>
 * ```
 */
export function allSettled<T extends Readonly<Record<string, AnyTask>>>(
  tasks: T,
  options?: CollectOptions,
): Task<
  {
    [P in keyof T]: Result<InferTaskOk<T[P]>, InferTaskErr<T[P]> | AbortError>;
  },
  never,
  [keyof T] extends [never] ? unknown : InferTaskDeps<T[keyof T]>
>;

/**
 * For dynamic or generated task lists.
 *
 * ```ts
 * const urls: ReadonlyArray<string> = getUrls();
 * const results = await run(allSettled(tasks));
 * if (!results.ok) return results;
 * // results.value: ReadonlyArray<Result<Response, FetchError | AbortError>>
 * ```
 */
export function allSettled<T, E, D>(
  tasks: Iterable<Task<T, E, D>>,
  options?: CollectOptions,
): Task<ReadonlyArray<Result<T, E | AbortError>>, never, D>;

/**
 * Guarantees non-empty result.
 *
 * ```ts
 * const tasks: NonEmptyReadonlyArray<Task<Response, FetchError>> = [
 *   fetchUrl("/a"),
 *   fetchUrl("/b"),
 * ];
 * const results = await run(allSettled(tasks));
 * if (!results.ok) return results;
 * // results.value: NonEmptyReadonlyArray<Result<Response, FetchError | AbortError>>
 * ```
 */
export function allSettled<T, E, D>(
  tasks: NonEmptyReadonlyArray<Task<T, E, D>>,
  options?: CollectOptions,
): Task<NonEmptyReadonlyArray<Result<T, E | AbortError>>, never, D>;

/**
 * Run for side effects only.
 *
 * ```ts
 * const result = await run(allSettled(tasks, { collect: false }));
 * // result.value: void
 * ```
 */
export function allSettled<T, E, D>(
  tasks: Iterable<Task<T, E, D>> | Readonly<Record<string, Task<T, E, D>>>,
  options: CollectOptions<false>,
): Task<void, never, D>;

export function allSettled(
  input: Iterable<AnyTask> | Readonly<Record<string, AnyTask>>,
  options?: CollectOptions<boolean>,
): Task<unknown> {
  return collect("allSettled", input, options) as Task<unknown>;
}

/**
 * Abort reason used by {@link allSettled} when aborted externally.
 *
 * @group Composition
 */
export const AllSettledAbortError = /*#__PURE__*/ typed("AllSettledAbortError");
export interface AllSettledAbortError extends InferType<
  typeof AllSettledAbortError
> {}

/**
 * {@link AllSettledAbortError} used as abort reason in {@link allSettled}.
 *
 * @group Composition
 */
export const allSettledAbortError: AllSettledAbortError = {
  type: "AllSettledAbortError",
};

/**
 * Maps values to {@link Task}s, failing fast on first error.
 *
 * Sequential by default — use {@link concurrently} for concurrent execution.
 *
 * ### Example
 *
 * ```ts
 * const result = await run(map(userIds, fetchUser));
 * if (!result.ok) return result;
 * // result.value: ReadonlyArray<User>
 * ```
 *
 * @group Composition
 * @see {@link CollectOptions}
 */
export function map<A, T, E, D>(
  items: Iterable<A>,
  task: (a: A) => Task<T, E, D>,
  options?: CollectOptions,
): Task<ReadonlyArray<T>, E, D>;

/**
 * Returns object with same keys.
 *
 * ```ts
 * const result = await run(map({ a: 1, b: 2 }, (n) => double(n)));
 * if (!result.ok) return result;
 * // result.value: { a: number, b: number }
 * ```
 */
export function map<A, T, E, D, K extends string>(
  items: Readonly<Record<K, A>>,
  task: (a: A) => Task<T, E, D>,
  options?: CollectOptions,
): Task<Readonly<Record<K, T>>, E, D>;

/**
 * Guarantees non-empty result.
 *
 * ```ts
 * const ids: NonEmptyReadonlyArray<UserId> = [id1, id2];
 * const result = await run(map(ids, fetchUser));
 * if (!result.ok) return result;
 * // result.value: NonEmptyReadonlyArray<User>
 * ```
 */
export function map<A, T, E, D>(
  items: NonEmptyReadonlyArray<A>,
  task: (a: A) => Task<T, E, D>,
  options?: CollectOptions,
): Task<NonEmptyReadonlyArray<T>, E, D>;

/**
 * Run for side effects only.
 *
 * ```ts
 * const result = await run(map(userIds, sendEmail, { collect: false }));
 * // result.value: void
 * ```
 */
export function map<A, T, E, D>(
  items: Iterable<A> | Readonly<Record<string, A>>,
  task: (a: A) => Task<T, E, D>,
  options: CollectOptions<false>,
): Task<void, E, D>;

export function map<A, T, E, D>(
  items: MapInput<A>,
  fn: (a: A) => Task<T, E, D>,
  { abortReason = mapAbortError, ...options }: CollectOptions<boolean> = {},
): Task<ReadonlyArray<T> | Record<string, T> | void, E, D> {
  const mapped = mapInput(items, fn);
  return all(
    mapped as Iterable<Task<T, E, D>>,
    {
      ...options,
      abortReason,
    } as CollectOptions,
  );
}

/**
 * Abort reason used by {@link map} when aborting remaining tasks.
 *
 * @group Composition
 */
export const MapAbortError = /*#__PURE__*/ typed("MapAbortError");
export interface MapAbortError extends InferType<typeof MapAbortError> {}

/**
 * {@link MapAbortError} used as abort reason in {@link map}.
 *
 * @group Composition
 */
export const mapAbortError: MapAbortError = {
  type: "MapAbortError",
};

/**
 * Maps values to {@link Task}s, completing all regardless of failures.
 *
 * Returns an array of {@link Result}s preserving the original order. Sequential
 * by default — use {@link concurrently} for concurrent execution.
 *
 * ### Example
 *
 * ```ts
 * const results = await run(mapSettled(userIds, fetchUser));
 * if (!results.ok) return results; // Only AbortError
 *
 * for (const result of results.value) {
 *   if (result.ok) {
 *     console.log("Success:", result.value);
 *   } else {
 *     console.log("Failed:", result.error);
 *   }
 * }
 * ```
 *
 * @group Composition
 * @see {@link CollectOptions}
 */
export function mapSettled<A, T, E, D>(
  items: Iterable<A>,
  task: (a: A) => Task<T, E, D>,
  options?: CollectOptions,
): Task<ReadonlyArray<Result<T, E | AbortError>>, never, D>;

/**
 * Returns object with same keys.
 *
 * ```ts
 * const results = await run(mapSettled({ a: 1, b: 2 }, (n) => double(n)));
 * if (!results.ok) return results;
 * // results.value: { a: Result<number, E>, b: Result<number, E> }
 * ```
 */
export function mapSettled<A, T, E, D, K extends string>(
  items: Readonly<Record<K, A>>,
  task: (a: A) => Task<T, E, D>,
  options?: CollectOptions,
): Task<Readonly<Record<K, Result<T, E | AbortError>>>, never, D>;

/**
 * Guarantees non-empty result.
 *
 * ```ts
 * const ids: NonEmptyReadonlyArray<UserId> = [id1, id2];
 * const results = await run(mapSettled(ids, fetchUser));
 * if (!results.ok) return results;
 * // results.value: NonEmptyReadonlyArray<Result<User, FetchError | AbortError>>
 * ```
 */
export function mapSettled<A, T, E, D>(
  items: NonEmptyReadonlyArray<A>,
  task: (a: A) => Task<T, E, D>,
  options?: CollectOptions,
): Task<NonEmptyReadonlyArray<Result<T, E | AbortError>>, never, D>;

/**
 * Run for side effects only.
 *
 * ```ts
 * const result = await run(
 *   mapSettled(userIds, sendEmail, { collect: false }),
 * );
 * // result.value: void
 * ```
 */
export function mapSettled<A, T, E, D>(
  items: Iterable<A> | Readonly<Record<string, A>>,
  task: (a: A) => Task<T, E, D>,
  options: CollectOptions<false>,
): Task<void, never, D>;

export function mapSettled<A, T, E, D>(
  items: MapInput<A>,
  task: (a: A) => Task<T, E, D>,
  options?: CollectOptions<boolean>,
): Task<
  | ReadonlyArray<Result<T, E | AbortError>>
  | Record<string, Result<T, E | AbortError>>
  | void,
  never,
  D
> {
  const mapped = mapInput(items, task);
  return allSettled(
    mapped as Iterable<Task<T, E, D>>,
    options as CollectOptions,
  );
}

/**
 * Returns the first {@link Task} that succeeds.
 *
 * Like
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any | Promise.any},
 * the first Task to succeed wins. All other Tasks are aborted. If all Tasks
 * fail, returns the last error (by input order).
 *
 * Sequential by default. Use {@link concurrently} for concurrent execution.
 *
 * Think of it like `Array.prototype.some()` — it stops on the first success.
 * This is in contrast to {@link race}, which returns the first task to complete
 * (whether success or failure).
 *
 * ### Example
 *
 * ```ts
 * // Try multiple endpoints concurrently, first success wins
 * const result = await run(
 *   concurrently(
 *     any([fetchFromPrimary, fetchFromSecondary, fetchFromTertiary]),
 *   ),
 * );
 * ```
 *
 * @group Composition
 */
export function any<T, E, D>(
  tasks: NonEmptyReadonlyArray<Task<T, E, D>>,
  options?: {
    /** How to choose an error if all tasks fail. */
    allFailed?: AnyAllFailed;
  },
): Task<T, E, D>;

export function any<T, E, D>(
  tasks: NonEmptyReadonlyArray<Task<T, E, D>>,
  options?: {
    allFailed?: AnyAllFailed;
  },
): Task<T, E, D> {
  const { allFailed = "input" } = options ?? {};
  return pool(tasks, {
    stopOn: "success",
    collect: false,
    abortReason: anyAbortError,
    allFailed,
  });
}

/**
 * Tie-breaker for {@link any} when all tasks fail.
 *
 * Used only when no task succeeds.
 *
 * - `"input"` returns the error from the last task in the input array. This is
 *   stable under concurrency and generally produces deterministic tests.
 * - `"completion"` returns the error from the Task that finished last. This
 *   reflects timing but can vary across runs when task timing varies.
 *
 * ### Example
 *
 * ```ts
 * await using run = createRun();
 * const result = await run(
 *   concurrently(any([a, b, c], { allFailed: "completion" })),
 * );
 * ```
 */
export type AnyAllFailed = "input" | "completion";

/**
 * Abort reason used by {@link any} when aborting remaining tasks.
 *
 * @group Composition
 */
export const AnyAbortError = /*#__PURE__*/ typed("AnyAbortError");
export interface AnyAbortError extends InferType<typeof AnyAbortError> {}

/**
 * {@link AnyAbortError} used as abort reason in {@link any}.
 *
 * @group Composition
 */
export const anyAbortError: AnyAbortError = { type: "AnyAbortError" };

type CollectInput =
  | Iterable<Task<unknown, unknown>>
  | Readonly<Record<string, AnyTask>>;

/** Shared implementation for {@link all} and {@link allSettled}. */
const collect = (
  type: "all" | "allSettled",
  input: CollectInput,
  {
    collect = true,
    abortReason = type === "all" ? allAbortError : allSettledAbortError,
  }: CollectOptions<boolean> = {},
): Task<unknown, unknown> => {
  const stopOn = type === "all" ? ("error" as const) : null;

  if (isIterable(input)) {
    const array = arrayFrom(input as Iterable<unknown>);
    if (!isNonEmptyArray(array)) return () => ok(emptyArray);

    return pool(array as ReadonlyArray<Task<unknown, unknown>>, {
      stopOn,
      collect,
      abortReason,
    });
  }

  const keys: Array<string> = [];
  const taskArray: Array<AnyTask> = [];
  for (const key in input) {
    keys.push(key);
    taskArray.push((input as Record<string, AnyTask>)[key]);
  }
  if (keys.length === 0) return () => ok(emptyRecord);

  return async (run) => {
    const result = await run(pool(taskArray, { stopOn, collect, abortReason }));
    if (!result.ok) return result;
    if (!collect) return ok();
    const record = createRecord();
    for (let i = 0; i < keys.length; i++) {
      record[keys[i]] = (result.value as Array<unknown>)[i];
    }
    return ok(record);
  };
};

/**
 * When to stop processing Tasks in {@link pool}.
 *
 * - `"first"` — stop on first result (success or error), used by {@link race}
 * - `"error"` — stop on first error, used by {@link all} and {@link map}
 * - `"success"` — stop on first success, used by {@link any}
 * - `null` — never stop early, used by {@link allSettled} and {@link mapSettled}
 */
type StopOn = "first" | "error" | "success";

type MapInput<A> = Iterable<A> | Readonly<Record<string, A>>;

const mapInput = <A, T, E, D>(
  input: MapInput<A>,
  fn: (a: A) => Task<T, E, D>,
): ReadonlyArray<Task<T, E, D>> | Readonly<Record<string, Task<T, E, D>>> =>
  isIterable(input) ? mapArray(arrayFrom(input), fn) : mapObject(input, fn);

/**
 * Worker pool respecting {@link Run.concurrency}.
 *
 * Spawns only as many workers as allowed, avoiding idle Fibers waiting for
 * permits.
 *
 * Workers run as daemons so callers don't block on unabortable Tasks. When
 * abort is requested, pool returns immediately. Structured concurrency is
 * preserved because the root {@link Run} still waits for all daemons.
 *
 * The `stopOn` option determines when to stop:
 *
 * - `"first"` — stop on any result
 * - `"error"` — stop on first error
 * - `"success"` — stop on first success
 * - `null` — never stop early
 */
function pool<T, E, D>(
  tasks: Iterable<Task<T, E, D>>,
  options: {
    stopOn: StopOn;
    collect: true;
    abortReason: unknown;
  },
): Task<ReadonlyArray<T>, E, D>;

function pool<T, E, D>(
  tasks: Iterable<Task<T, E, D>>,
  options: {
    stopOn: StopOn;
    collect: false;
    abortReason: unknown;
    allFailed?: AnyAllFailed;
  },
): Task<T, E, D>;

function pool<T, E, D>(
  tasks: Iterable<Task<T, E, D>>,
  options: {
    stopOn: null;
    collect: true;
    abortReason: unknown;
  },
): Task<ReadonlyArray<Result<T, E>>, never, D>;

function pool<D>(
  tasks: Iterable<Task<unknown, unknown, D>>,
  options: {
    stopOn: null;
    collect: false;
    abortReason: unknown;
  },
): Task<void, never, D>;

/** Internal overload for {@link collect} with dynamic stopOn/collect. */
function pool(
  tasks: Iterable<Task<unknown, unknown>>,
  options: {
    stopOn: StopOn | null;
    collect: boolean;
    abortReason: unknown;
  },
): Task<unknown, unknown>;

function pool<T, E>(
  tasksIterable: Iterable<AnyTask>,
  {
    stopOn = null,
    collect,
    abortReason,
    allFailed,
  }: {
    stopOn?: StopOn | null;
    collect: boolean;
    abortReason: unknown;
    allFailed?: AnyAllFailed;
  },
): Task<ReadonlyArray<unknown> | T | void, E> {
  const tasks = arrayFrom(tasksIterable);
  const { length } = tasks;
  if (length === 0) return () => ok(emptyArray);

  return async (run) => {
    const results = collect ? new Array<unknown>(length) : null;
    const aborted = Promise.withResolvers<void>();
    const stopSignal = stopOn ? Promise.withResolvers<void>() : null;

    let index = 0;
    let stopped = null as Result<T, E> | null;
    let lastResult = null as Result<T, E> | null;
    let lastIndexResult = null as Result<T, E> | null;

    const worker: Task<void> = async (run) => {
      while (index < length && (stopOn ? !stopped : true)) {
        const i = index++;

        const result = (await run(tasks[i])) as Result<T, E>;
        lastResult = result;
        if (i === length - 1) lastIndexResult = result;

        if (!stopOn) {
          if (results) results[i] = result;
          continue;
        }

        const stop =
          stopOn === "first" ||
          (stopOn === "error" && !result.ok) ||
          (stopOn === "success" && result.ok);

        if (!stop) {
          if (results) results[i] = (result as Ok<T>).value;
          continue;
        }

        if (!stopped) {
          stopped = result;
          abortWorkers(
            !result.ok && AbortError.is(result.error)
              ? result.error.reason
              : abortReason,
          );
          stopSignal?.resolve();
        }
        break;
      }
      return ok();
    };

    let workersAborted = false;

    const abortWorkers = (reason: unknown) => {
      if (workersAborted) return;
      workersAborted = true;
      for (const worker of workers) worker.abort(reason);
    };

    const workerCount = Math.min(run.concurrency, length);
    const workers = arrayFrom(workerCount, () => run.daemon(worker));

    await using _ = run.defer(() => {
      abortWorkers(abortReason);
      return ok();
    });

    run.onAbort((reason) => {
      abortWorkers(reason);
      aborted.resolve();
    });

    const waitFor = [Promise.all(workers), aborted.promise];
    if (stopSignal) waitFor.push(stopSignal.promise);
    await Promise.race(waitFor);

    if (run.signal.aborted) {
      return err(run.signal.reason as AbortError);
    }

    if (!stopOn) return results ? ok(results) : ok();
    if (stopped) return stopped;
    if (results) return ok(results);
    // For all/allSettled/map/mapSettled with collect: false (no allFailed handler)
    if (!allFailed) return ok();

    return allFailed === "completion" ? lastResult! : lastIndexResult!;
  };
}

/**
 * Error returned when a {@link fetch} {@link Task} fails.
 *
 * @group Composition
 */
export const FetchError = /*#__PURE__*/ typed("FetchError", { error: Unknown });
export interface FetchError extends InferType<typeof FetchError> {}

/**
 * Creates a {@link Task} that wraps the native
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API | Fetch API}.
 *
 * Handles cross-browser abort behavior — WebKit throws a `DOMException` with
 * message "Fetch is aborted" instead of propagating `signal.reason`. This
 * helper normalizes the behavior to always return {@link AbortError}.
 *
 * ### Example
 *
 * ```ts
 * await using run = createRun();
 *
 * const result = await run(fetch("https://api.example.com/users"));
 *
 * if (!result.ok) {
 *   // Handle FetchError or AbortError
 * }
 *
 * // Compose with timeout and retry
 * const fetchWithRetry = (url: string) =>
 *   retry(timeout(fetch(url), "10s"), retryStrategyAws);
 * ```
 *
 * @group Composition
 */
export const fetch =
  (input: RequestInfo | URL, init?: RequestInit): Task<Response, FetchError> =>
  ({ signal }) =>
    tryAsync(
      () => globalThis.fetch(input, { ...init, signal }),
      (error): FetchError | AbortError => {
        if (AbortError.is(error)) return error;
        // WebKit throws DOMException with message "Fetch is aborted" instead of
        // propagating signal.reason. Detect this and create AbortError.
        if (
          signal.aborted &&
          error instanceof Error &&
          error.message === "Fetch is aborted"
        ) {
          return createAbortError(signal.reason);
        }
        return { type: "FetchError", error };
      },
    );

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

// TODO: Do we really need specialized aborts?
