/**
 * JavaScript-native structured concurrency.
 *
 * @module
 */
import {
  emptyArray,
  isNonEmptyArray,
  mapArray,
  type NonEmptyReadonlyArray,
} from "./Array.ts";
import {
  assert,
  assertNonEmptyReadonlyArray,
  assertNonNullable,
  assertNotDisposed,
} from "./Assert.ts";
import type { Brand } from "./Brand.ts";
import {
  createConsole,
  testCreateConsole,
  type Console,
  type ConsoleDep,
  type TestConsole,
  type TestConsoleDep,
} from "./Console.ts";
import {
  createRandomBytes,
  testCreateRandomBytes,
  type RandomBytes,
  type RandomBytesDep,
} from "./Crypto.ts";
import { eqArrayStrict } from "./Eq.ts";
import { constTrue, constVoid, identity } from "./Function.ts";
import type { fetch, NativeFetch, NativeFetchDep } from "./Http.ts";
import {
  createLeakDetector,
  noopLeakDetector,
  testCreateLeakDetector,
  type LeakDetector,
  type LeakDetectorDep,
  type TestLeakDetectorDep,
} from "./LeakDetector.ts";
import { createLookupMap, type Lookup, type LookupOption } from "./Lookup.ts";
import { decrement, increment, incrementPositiveInt } from "./Number.ts";
import {
  emptyRecord,
  mapObject,
  objectFromEntries,
  objectToEntries,
} from "./Object.ts";
import { none, some, type Option } from "./Option.ts";
import { isDev } from "./Platform.ts";
import {
  createRandom,
  testCreateRandom,
  testCreateRandomLib,
  type Random,
  type RandomDep,
  type RandomLibDep,
  type RandomNumber,
} from "./Random.ts";
import { createRef, type Ref } from "./Ref.ts";
import {
  err,
  getOk,
  getOrThrow,
  ok,
  type AnyResult,
  type Done,
  type Err,
  type Ok,
  type Result,
  type tryAsync,
  type trySync,
} from "./Result.ts";
import type { Schedule, ScheduleStep } from "./Schedule.ts";
import { emptySet } from "./Set.ts";
import {
  createTime,
  PositiveMillis,
  testCreateTime,
  type Millis,
  type PositiveDuration,
  type Time,
  type TimeDep,
  type TestTimeDep,
} from "./Time.ts";
import {
  assertType,
  createId,
  type InferType,
  maxPositiveInt,
  NonNegativeInt,
  object,
  onePositiveInt,
  PositiveInt,
  record,
  String,
  typed,
  Unknown,
  UnknownResult,
  type Id,
  type Int1To100OrPositiveInt,
  type ObjectType,
  type RecordType,
  type Typed,
  type TypedType,
} from "./Type.ts";
import type {
  Awaitable,
  isPromiseLike,
  Writable,
  ParameterIntersection,
  Predicate,
} from "./Types.ts";

// Core

/**
 * JavaScript-native structured concurrency.
 *
 * A Task is a function that receives a {@link Run} and returns an
 * {@link Awaitable | awaitable} {@link Result}.
 *
 * Structured concurrency is a simple idea: asynchronous operations form a tree
 * where every child belongs to a parent. A parent waits for its children before
 * it completes, and abort follows the tree: aborting a parent requests abort of
 * all its descendants, while races and fail-fast operations also abort
 * remaining sibling branches. This prevents detached work and gives
 * cancellation, failure, and cleanup explicit ownership. The tree also makes
 * running work and its ownership observable.
 *
 * With plain {@link AbortController} code, these guarantees depend on call-site
 * discipline: someone must remember the `finally` that aborts started work and
 * the await that waits for its cleanup. Run makes them structural — `run(task)`
 * registers every child before it starts, and the parent settles only after
 * child cleanup finishes, so the wait cannot be forgotten.
 *
 * Evolu keeps the programming model close to idiomatic JavaScript: Tasks are
 * ordinary functions, Fibers are Promise-backed handles, abort uses
 * {@link AbortSignal}, and lifetimes compose with `using` and `await using`. The
 * core abstractions are:
 *
 * - {@link Task}: a function that receives a {@link Run} and returns an awaitable
 *   {@link Result}
 * - {@link Run}: a callable object that starts Tasks, owns their lifetimes,
 *   provides dependencies, and exposes monitoring state
 * - {@link Fiber}: a Promise-backed handle returned by a Run when it starts a Task
 * - {@link AbortableFiber}: a Fiber with explicit abort and async disposal
 *
 * Calling `run(task)` creates a child Run for that Task. Calling `task(run)`
 * directly reuses the current Run and bypasses those child lifetime
 * boundaries.
 *
 * Tasks return domain success or failure as a Result. Abort is control flow: a
 * Fiber from `run(task)` rejects with {@link AbortError} when the Task is
 * aborted, while `run.abortable(task)` catches abort and returns it as an
 * {@link Err}. If the Task itself throws or rejects, that is a defect. A defect
 * panics the Run tree, and a Fiber rejects with AbortError whose reason is
 * {@link PanicAbortReason}; an AbortableFiber returns that AbortError as an
 * Err.
 *
 * The core is intentionally small: ordinary Task functions, a callable Run with
 * closed-over state, Promise-backed Fibers, AbortSignal propagation, and
 * JavaScript resource management. That minimal model still covers abort,
 * cleanup, panic, dependency injection, monitoring, concurrency, and resource
 * bracketing. The code is covered by carefully written, readable tests, so they
 * serve as documentation too.
 *
 * ## Example
 *
 * This intentionally naive wrapper is useful for learning Task dependencies,
 * Result errors, and native AbortSignal interop. Do not copy it as a production
 * fetch helper: a Response is not a plain value — its unread body is tied to
 * the request signal, which aborts when the Task settles. The returned Response
 * escapes the scope that keeps it alive. Evolu's {@link fetch} exists to close
 * this gap.
 *
 * `nativeFetch` is already a {@link RunDefaultDeps | default dependency}; this
 * example declares the same shape locally to demonstrate how Tasks declare
 * capabilities, and passes it to {@link createRun} to show that default
 * dependencies can be replaced like custom ones.
 *
 * ```ts
 * import {
 *   AbortError,
 *   createRun,
 *   err,
 *   ok,
 *   type AbortableFiber,
 *   type Result,
 *   type Task,
 * } from "@evolu/common";
 *
 * // A dependency - wraps native fetch for testability.
 * interface NativeFetchDep {
 *   readonly nativeFetch: typeof globalThis.fetch;
 * }
 *
 * interface NaiveFetchError {
 *   readonly type: "NaiveFetchError";
 *   readonly error: unknown;
 * }
 *
 * // A naive Task wrapping native fetch - adds abortability.
 * const naiveFetch =
 *   (url: string): Task<Response, NaiveFetchError, NativeFetchDep> =>
 *   async ({ deps, signal }) => {
 *     try {
 *       const response = await deps.nativeFetch(url, { signal });
 *       return ok(response);
 *     } catch (error) {
 *       if (AbortError.is(error)) throw error;
 *       return err({ type: "NaiveFetchError", error });
 *     }
 *   };
 *
 * const nativeFetch: typeof globalThis.fetch = async (input, init) => {
 *   if (String(input).endsWith("/123")) {
 *     return new Response(null, { status: 204 });
 *   }
 *
 *   return new Promise<Response>((_resolve, reject) => {
 *     const { signal } = init ?? {};
 *     if (signal?.aborted) {
 *       reject(signal.reason);
 *       return;
 *     }
 *     signal?.addEventListener("abort", () => reject(signal.reason), {
 *       once: true,
 *     });
 *   });
 * };
 *
 * // Provide dependencies at the composition root.
 * const deps: NativeFetchDep = {
 *   nativeFetch,
 * };
 *
 * // Create a Run with those dependencies.
 * await using run = createRun(deps);
 *
 * // Running a Task returns a Fiber; awaiting it gives a Result.
 * const result = await run(naiveFetch("/users/123"));
 * expectTypeOf(result).toEqualTypeOf<Result<Response, NaiveFetchError>>();
 * assert(result.ok);
 * expect(result.value.status).toBe(204);
 *
 * // So what is naive about it? The Response ok value.
 * // Wrong: the Task settled, so its Run disposed and aborted `signal`.
 * // The Response body is a live resource tied to that signal. Whether
 * // this read fails immediately or appears to work depends on the
 * // runtime and on how much of the body was already buffered — it is
 * // timing-dependent behavior, not an API you can rely on.
 * // await result.value.json();
 *
 * // Abort works when native fetch rejects with signal.reason. Some hosts use
 * // their own abort error, which this naive wrapper does not normalize.
 * const fiber = run.abortable(naiveFetch("/users/456"));
 * fiber.abort();
 * const abortResult = await fiber;
 * expectTypeOf(fiber).toEqualTypeOf<
 *   AbortableFiber<Response, NaiveFetchError, NativeFetchDep>
 * >();
 * assert(!abortResult.ok);
 * expect(AbortError.is(abortResult.error)).toBe(true);
 * ```
 *
 * Evolu's {@link fetch} is not fancier than the naive wrapper; it is correctly
 * bounded. It consumes the Response body inside the Task, while the request
 * signal is still alive, and returns a plain value:
 *
 * ```ts
 * import {
 *   createRun,
 *   fetch,
 *   type FetchError,
 *   type Result,
 * } from "@evolu/common";
 *
 * const nativeFetch: typeof globalThis.fetch = async () =>
 *   new Response("readme");
 * await using run = createRun({ nativeFetch });
 *
 * const text = await run(fetch("/readme.txt", "text"));
 * expectTypeOf(text).toEqualTypeOf<Result<string, FetchError>>();
 * expectOk(text, "readme");
 * ```
 *
 * In composition roots, prefer the lifecycle API from the matching Evolu
 * platform package:
 *
 * - Node.js: `@evolu/nodejs`
 * - Web: `@evolu/web`
 * - React Native: `@evolu/react-native`
 *
 * ## Composition
 *
 * | Category     | Helper                    | Description                            |
 * | ------------ | ------------------------- | -------------------------------------- |
 * | Collection   | {@link all}               | Return Ok values or stop on first Err  |
 * |              | {@link allSettled}        | Return every Task Result               |
 * |              | {@link each}              | Handle each Task Result                |
 * | Interop      | {@link callback}          | Wrap callback APIs                     |
 * |              | {@link fetch}             | Native fetch with bounded Response use |
 * | Timing       | {@link sleep}             | Pause execution                        |
 * |              | {@link timeout}           | Time-bounded execution                 |
 * | Resilience   | {@link retry}             | Retry domain errors with a schedule    |
 * | Repetition   | {@link repeat}            | Repeat successes with a schedule       |
 * | Racing       | {@link any}               | First Ok wins                          |
 * |              | {@link race}              | First settled Result wins              |
 * |              | {@link firstN}            | First n Ok values win                  |
 * |              | {@link firstNSettled}     | First n Results win                    |
 * | Scheduling   | {@link prioritized}       | Assign scheduler priority              |
 * |              | {@link yieldNow}          | Yield to the host scheduler            |
 * | Lifetime     | {@link daemon}            | Run under root ownership               |
 * | Abortability | {@link unabortable}       | Mask abort after a Task starts         |
 * |              | {@link unabortableMask}   | Mask acquire/release and restore use   |
 * |              | {@link acquireUseRelease} | Bracket acquire, use, and release      |
 *
 * Helpers that process multiple Tasks run sequentially by default. Use a
 * `concurrency` option to run more than one Task at a time.
 *
 * For ordinary sequential composition, use imperative code:
 *
 * ```ts
 * import { createRun, ok, type Result, type Task } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 *   readonly profileId: string;
 * }
 * interface Profile {
 *   readonly id: string;
 * }
 *
 * const loadUser =
 *   (id: string): Task<User, "UserError"> =>
 *   () =>
 *     ok({ id, profileId: "profile-1" });
 * const loadProfile =
 *   (id: string): Task<Profile, "ProfileError"> =>
 *   () =>
 *     ok({ id });
 *
 * const loadUserWithProfile =
 *   (
 *     id: string,
 *   ): Task<
 *     { readonly user: User; readonly profile: Profile },
 *     "UserError" | "ProfileError"
 *   > =>
 *   async (run) => {
 *     const user = await run(loadUser(id));
 *     if (!user.ok) return user;
 *
 *     const profile = await run(loadProfile(user.value.profileId));
 *     if (!profile.ok) return profile;
 *
 *     return ok({ user: user.value, profile: profile.value });
 *   };
 *
 * await using run = createRun();
 * const result = await run(loadUserWithProfile("user-1"));
 * expectTypeOf(result).toEqualTypeOf<
 *   Result<
 *     { readonly user: User; readonly profile: Profile },
 *     "UserError" | "ProfileError"
 *   >
 * >();
 * expectOk(result, {
 *   user: { id: "user-1", profileId: "profile-1" },
 *   profile: { id: "profile-1" },
 * });
 * ```
 *
 * Evolu intentionally avoids pipe APIs, chainable methods, and generator-based
 * effect DSLs. Plain async/await with early returns is easier to read, review,
 * and debug, and it lets TypeScript narrow Result values through ordinary
 * control flow. For the tradeoffs behind that choice, see “Why not generators?”
 * in the {@link Result} FAQ.
 *
 * ### Building a Resilient Fetch Task
 *
 * {@link fetch} with a body mode already returns a plain value, so resilience is
 * ordinary Task composition. Use {@link timeout} to limit how long a request may
 * run:
 *
 * ```ts
 * import {
 *   fetch,
 *   timeout,
 *   type FetchError,
 *   type Task,
 *   type TimeoutError,
 * } from "@evolu/common";
 *
 * const fetchWithTimeout = (url: string) =>
 *   timeout(fetch(url, "text"), "30s");
 *
 * expectTypeOf(fetchWithTimeout).returns.toEqualTypeOf<
 *   Task<string, FetchError | TimeoutError>
 * >();
 * ```
 *
 * Add {@link retry} for recoverable domain failures:
 *
 * ```ts
 * import {
 *   exponential,
 *   fetch,
 *   jitter,
 *   maxDelay,
 *   retry,
 *   take,
 *   timeout,
 *   type FetchError,
 *   type RetryTaskError,
 *   type Task,
 *   type TimeoutError,
 * } from "@evolu/common";
 *
 * const fetchWithTimeout = (url: string) =>
 *   timeout(fetch(url, "text"), "30s");
 *
 * const fetchWithRetry = (url: string) =>
 *   retry(
 *     fetchWithTimeout(url),
 *     // A jittered, capped, limited exponential backoff.
 *     jitter("100%")(maxDelay("20s")(take(2)(exponential("100ms")))),
 *   );
 *
 * expectTypeOf(fetchWithRetry).returns.toEqualTypeOf<
 *   Task<string, RetryTaskError<FetchError | TimeoutError>>
 * >();
 * ```
 *
 * Run composed Tasks with a concurrency limit and {@link all}:
 *
 * ```ts
 * import { all, createRun, ok, sleep, type Task } from "@evolu/common";
 *
 * await using run = createRun();
 *
 * const urls = [
 *   "https://api.example.com/users",
 *   "https://api.example.com/posts",
 *   "https://api.example.com/comments",
 * ];
 * let activeRequests = 0;
 * let maxActiveRequests = 0;
 * const fetchUrl =
 *   (url: string): Task<string> =>
 *   async (run) => {
 *     activeRequests += 1;
 *     maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
 *     await run.ok(sleep("1ms"));
 *     activeRequests -= 1;
 *     return ok(url);
 *   };
 *
 * // At most 2 concurrent requests.
 * const result = await run(all(urls, fetchUrl, { concurrency: 2 }));
 * expectOk(result, urls);
 * expect(maxActiveRequests).toBe(2);
 * ```
 *
 * ## Concurrency Primitives
 *
 * Task helpers compose Tasks; concurrency primitives are stateful objects that
 * coordinate Tasks across call sites. Create them with their `createX`
 * factories and share them where coordination is needed.
 *
 * | Primitive              | Description                            |
 * | ---------------------- | -------------------------------------- |
 * | {@link Deferred}       | One-shot value resolved from outside   |
 * | {@link Gate}           | Block and release Tasks repeatedly     |
 * | {@link Semaphore}      | Limit concurrent Tasks with permits    |
 * | {@link Mutex}          | Run Tasks one at a time                |
 * | {@link SemaphoreByKey} | Per-key permits with automatic cleanup |
 * | {@link MutexByKey}     | Per-key one-at-a-time execution        |
 * | {@link MutexRef}       | Ref with serialized Task transitions   |
 *
 * ## Dependency Injection
 *
 * Task DI is
 * {@link https://www.evolu.dev/docs/dependency-injection | Evolu Pure DI}
 * applied to {@link Run}. A {@link Task} declares required capabilities with its
 * `D` type parameter and reads them from {@link Run.deps}.
 *
 * {@link createRun} supplies dependencies to the root Run and its children. A
 * Run can also start one child Task with runtime-created dependencies by
 * calling `run(task, deps)`, where `deps` is checked as {@link RunCustomDeps}.
 *
 * Use normal Task arguments for per-call values and `D` for capabilities,
 * resources, or services shared by all code running inside a Run.
 *
 * ### Default Dependencies
 *
 * {@link createRun} provides default {@link RunDefaultDeps} available to all
 * Tasks without declaring `D`:
 *
 * - {@link Console} — logging with hierarchical context via `child()`
 * - {@link LeakDetector} — development-time leaked-handle detection
 * - {@link NativeFetch} — WHATWG-compatible native fetch
 * - {@link Random} — random number generation
 * - {@link RandomBytes} — cryptographic random bytes
 * - {@link ReportDefect} — defect reporting
 * - {@link Time} — current time
 *
 * For example, using Console:
 *
 * ```ts
 * import { createRun, ok, type Task } from "@evolu/common";
 *
 * const myTask: Task<void> = async (run) => {
 *   const { console } = run.deps;
 *   console.log("started");
 *   return ok();
 * };
 *
 * expectTypeOf(myTask).toEqualTypeOf<Task<void>>();
 * await using run = createRun();
 * expectOk(await run(myTask), undefined);
 * ```
 *
 * Custom Console with formatted output:
 *
 * ```ts
 * import {
 *   createConsoleArrayOutput,
 *   createConsole,
 *   createConsoleFormatter,
 *   createRun,
 *   type ConsoleEntry,
 * } from "@evolu/common";
 *
 * const entries: Array<ConsoleEntry> = [];
 * const formatter = createConsoleFormatter()({
 *   timestampFormat: "absolute",
 * });
 * const deps = {
 *   console: createConsole({
 *     output: createConsoleArrayOutput(entries),
 *     formatter,
 *   }),
 * };
 *
 * await using run = createRun(deps);
 * const console = run.deps.console.child("main");
 *
 * console.log("started");
 * expect(console.name).toBe("main");
 * expect(entries).toHaveLength(1);
 * expect(entries[0]?.path).toEqual(["main"]);
 * assert(entries[0]);
 * const formattedArgs = formatter(entries[0]);
 * // 21:20:25.588 [main] started
 * expect(formattedArgs[0]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} \[main\]$/);
 * expect(formattedArgs[1]).toBe("started");
 * ```
 *
 * For testing, use {@link testCreateRun} to get deterministic, controllable
 * implementations of all RunDefaultDeps.
 *
 * ## Resource Management
 *
 * JavaScript provides standard
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management | resource management}.
 * Evolu adds {@link DisposableRun.defer} for closure-held state owned by a
 * reusable Run.
 *
 * Choose the ownership primitive by where the resource is reachable:
 *
 * - Synchronous stack frame: `using` or {@link DisposableStack}
 * - Async Task stack frame: `await using` or {@link AsyncDisposableStack}
 * - Closure-held state bounded by a reusable {@link DisposableRun}:
 *   {@link DisposableRun.defer}
 *
 * ### Returning Resources from Tasks
 *
 * A Task that successfully returns a disposable resource transfers ownership of
 * a live resource to its caller. The resource must remain live after the Task
 * settles. Do not register its disposal with the creating Task's
 * {@link DisposableRun.defer}, because that child Run is disposed when the Task
 * settles.
 *
 * Use {@link AsyncDisposableStack} while creating a resource. On a Result error,
 * abort, or defect, stack unwinding disposes partially created resources. On
 * success, {@link AsyncDisposableStack.move} transfers ownership to the returned
 * resource. A recoverable creation failure should be a typed Result error;
 * `undefined` should represent valid absence, not failure.
 *
 * ```ts
 * import { createRun, ok, type Task } from "@evolu/common";
 *
 * interface ConnectionError {
 *   readonly type: "ConnectionError";
 * }
 * interface Socket extends AsyncDisposable {
 *   readonly send: (message: string) => string;
 * }
 * interface Connection extends AsyncDisposable {
 *   readonly send: (message: string) => string;
 * }
 *
 * let socketDisposed = false;
 * const openSocket: Task<Socket, ConnectionError> = () =>
 *   ok({
 *     send: (message) => message,
 *     [Symbol.asyncDispose]: async () => {
 *       socketDisposed = true;
 *     },
 *   });
 * const handshake =
 *   (_socket: Socket): Task<void, ConnectionError> =>
 *   () =>
 *     ok();
 *
 * const createConnection: Task<Connection, ConnectionError> = async (
 *   run,
 * ) => {
 *   await using disposer = new AsyncDisposableStack();
 *
 *   const socketResult = await run(openSocket);
 *   if (!socketResult.ok) return socketResult;
 *   const socket = disposer.use(socketResult.value);
 *
 *   const handshakeResult = await run(handshake(socket));
 *   if (!handshakeResult.ok) return handshakeResult;
 *
 *   const disposables = disposer.move();
 *   return ok({
 *     send: (message) => socket.send(message),
 *     [Symbol.asyncDispose]: () => disposables.disposeAsync(),
 *   });
 * };
 *
 * await using run = createRun();
 * const result = await run(createConnection);
 * assert(result.ok);
 * expect(socketDisposed).toBe(false);
 * expect(result.value.send("hello")).toBe("hello");
 * await result.value[Symbol.asyncDispose]();
 * expect(socketDisposed).toBe(true);
 * ```
 *
 * Factories that return disposable values and do not fail can be used directly
 * with {@link Run.ok} and `await using`:
 *
 * ```ts
 * import { createRun, ok, type Task } from "@evolu/common";
 *
 * interface Foo extends AsyncDisposable {
 *   readonly value: string;
 * }
 *
 * let disposed = false;
 * const createFoo = (): Task<Foo> => () =>
 *   ok({
 *     value: "foo",
 *     [Symbol.asyncDispose]: async () => {
 *       disposed = true;
 *     },
 *   });
 *
 * await using run = createRun();
 * {
 *   await using foo = await run.ok(createFoo());
 *   expect(foo.value).toBe("foo");
 * }
 * expect(disposed).toBe(true);
 * ```
 *
 * Use {@link acquireUseRelease} when acquisition and release are separate
 * operations rather than a disposable value:
 *
 * ```ts
 * import {
 *   acquireUseRelease,
 *   createRun,
 *   ok,
 *   type Task,
 * } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 *   readonly name: string;
 * }
 *
 * interface Connection {
 *   readonly loadUser: (id: string) => User;
 * }
 *
 * const openConnection: Task<Connection> = () =>
 *   ok({ loadUser: (id) => ({ id, name: "Ada" }) });
 *
 * const loadUser =
 *   (connection: Connection): Task<User> =>
 *   () =>
 *     ok(connection.loadUser("user-1"));
 *
 * let connectionClosed = false;
 * const closeConnection =
 *   (_connection: Connection): Task<void> =>
 *   () => {
 *     connectionClosed = true;
 *     return ok();
 *   };
 *
 * const queryUser = acquireUseRelease(
 *   openConnection,
 *   loadUser,
 *   closeConnection,
 * );
 *
 * await using run = createRun();
 * const result = await run(queryUser);
 * expectOk(result, { id: "user-1", name: "Ada" });
 * expect(connectionClosed).toBe(true);
 * ```
 *
 * ## Awaitable
 *
 * ```ts
 * import type { Awaitable as EvoluAwaitable } from "@evolu/common";
 *
 * type Awaitable<T> = T | PromiseLike<T>;
 *
 * expectTypeOf<Awaitable<number>>().toEqualTypeOf<
 *   EvoluAwaitable<number>
 * >();
 * ```
 *
 * Even though {@link Task} returns {@link Awaitable}, allowing sync or async
 * results, {@link Run} is always async. This is a deliberate design choice:
 *
 * - **Sync** → {@link Result}, native `using` / `DisposableStack`
 * - **Async** → Task, Run, {@link Fiber}, `await using` / `AsyncDisposableStack`
 *
 * A Task is an async ownership boundary, not a general unit of program
 * decomposition. Calling `run(task)` always creates a child Run by design. Use
 * ordinary promises when an async operation does not need its own Run.
 *
 * Benefits:
 *
 * - **No API ambiguity** — Task is async, Result is sync
 * - **No Task overhead for sync code** — plain sync functions can return Result
 *
 * While a unified sync/async API is technically possible — with
 * {@link isPromiseLike} detection and two-phase disposal (sync first, async if
 * needed, and a flag for callers) — Evolu prefers plain functions for sync code
 * because most operations involve I/O, which is inherently async, and when sync
 * is needed, it is for simplicity (ideally no dependencies) and performance
 * (zero abstraction overhead).
 *
 * Sync functions should be fast, so there is no need to monitor them. They
 * should take values, not dependencies — following the
 * {@link https://blog.ploeh.dk/2017/02/02/dependency-rejection/ | impure/pure/impure sandwich}
 * pattern where impure code gathers data, pure functions process it, and impure
 * code performs effects with the result. Sync functions taking deps often
 * indicate a design that could be improved. For example, a function taking
 * {@link Random} could instead accept {@link RandomNumber} as a value.
 *
 * Slow sync operations such as parsing large JSON, sorting millions of items,
 * or complex cryptography belong in workers. The async boundary to the worker
 * is a Task with full Run lifetime control: timeout, abort, cleanup, and
 * monitoring. The sync code inside the worker needs no monitoring; the async
 * call to the worker provides it.
 *
 * ## Glossary
 *
 * - **Defect** — a thrown exception or rejected Promise from a Task body.
 * - **Outcome** — a Fiber's settlement: resolution with the Task {@link Result},
 *   or rejection with {@link AbortError}. Defects are not outcomes; they are
 *   reported through {@link ReportDefectDep} whether or not the Fiber is
 *   observed.
 * - **Create** — construct a new value or a resource.
 * - **Acquire** — obtain a usable resource. Acquisition may create a new
 *   resource, borrow one, open one, or take a lease/lock.
 * - **Release** — relinquish a previously acquired resource or lease. Release
 *   pairs with acquire and need not mean disposal; examples include unlock,
 *   logout, or returning a pooled resource.
 * - **Dispose / disposal** — owner-driven resource finalization via JavaScript
 *   management (`Symbol.dispose`, `Symbol.asyncDispose`, `using`,
 *   `AsyncDisposableStack`).
 *
 * ## FAQ
 *
 * ### Why is AbortError not part of every Task error type?
 *
 * The `E` type parameter represents declared domain errors. Abort is
 * structured-concurrency control flow, not a domain error. A direct `run(task)`
 * rejects with {@link AbortError} when the Task observes abort. Use
 * `run.abortable(task)` when abort should be handled as an ordinary
 * {@link Result} error at the Fiber boundary, or `daemon(task)` when waiting for
 * a Task should stop immediately after abort.
 *
 * ### Do I have to await every Fiber?
 *
 * No. Awaiting a Fiber is join: it makes the child outcome part of the current
 * control flow. When the outcome does not matter — a fire-and-forget side
 * effect — discard the Fiber explicitly with `void run(task)`.
 *
 * That is safe because the Run tree supervises every Fiber it creates. A
 * discarded Fiber whose Task observes abort (for example during Run disposal)
 * never surfaces as an unhandled rejection, and cleanup is not lost — disposal
 * already aborts and awaits the child. Defects are different: they still panic
 * the root Run and are reported through {@link ReportDefectDep}, so discarding a
 * Fiber never hides bugs.
 *
 * Choose the boundary explicitly:
 *
 * - `void run(task)` — the outcome does not matter. Abort is silent; defects are
 *   still reported.
 * - `await run(task)` — the continuation depends on the Result, so abort rejects
 *   into the awaiter and the boundary must handle it.
 * - `run.abortable(task)` — abort is an expected outcome handled as a
 *   {@link Result} error.
 *
 * ### What should Task code do with defects?
 *
 * Nothing. Once a defect happens, it is too late: the root Run panics, running
 * Tasks are aborted, and the Run tree shuts down. If a defect is recoverable,
 * wrap the code that throws or rejects with {@link trySync} or {@link tryAsync}
 * so it becomes a typed {@link Result} error. Do not wrap every defect;
 * unrecoverable defects should remain defects because an {@link Err} would not
 * be useful anyway.
 *
 * ### Why does a defect panic the whole Run tree?
 *
 * The obvious alternative is partial recovery: only the failing subtree shuts
 * down or restarts while the rest keeps running. Erlang/OTP made this "let it
 * crash" model with supervisors the benchmark for fault-tolerant runtime
 * design.
 *
 * Erlang can recover partially because of process isolation: each process owns
 * its heap, so a crashed process cannot leave another process's state
 * corrupted. JavaScript Tasks share a heap. A defect may throw after partially
 * updating shared state, and the Run cannot prove which invariants are still
 * valid. A subtree panic would stop the failing Task while leaving any
 * corrupted shared state available to surviving Tasks. Locks make it worse: a
 * defect inside a critical section may leave protected invariants half-updated.
 * In-process restart is not a reliable recovery boundary either, because the
 * restarted code may still share the same module state, closures, caches, or
 * resources.
 *
 * JavaScript does have a boundary with Erlang-like isolation: workers. A worker
 * has its own heap and structured-clone messaging, so corruption cannot cross
 * the boundary, and respawning a worker starts from clean state. A defect can
 * panic the worker's Run tree, the worker boundary can be torn down, and the
 * supervising side decides whether to respawn — {@link retry} with a
 * {@link Schedule} around a "spawn worker, run until exit" Task is a one-for-one
 * supervisor. Multiple root Runs that share no mutable state are a lighter
 * alternative, but the share-nothing guarantee is then architectural discipline
 * rather than enforced isolation, so keep it opt-in and rare.
 *
 * ### Why imperative code instead of monadic effect composition?
 *
 * Monads give pure functional languages a way to sequence effects while keeping
 * functions pure. JavaScript already has native effect sequencing: loops, early
 * returns, `try`/`finally`, exceptions, and `async`/`await`.
 *
 * A monadic effect wrapper moves that control flow into a library DSL. The
 * wrapper type becomes viral, and ordinary debugging, profiling, stack traces,
 * and TypeScript narrowing have to work through the DSL instead of the
 * language.
 *
 * Task follows the opposite approach: Tasks are ordinary async functions, Run
 * owns lifetimes and scoped context, {@link Result} carries expected domain
 * errors, and defects keep real exceptions with real stacks.
 *
 * ### Are recursive Tasks stack-safe?
 *
 * Tasks have native JavaScript stack behavior. A deeply recursive Task can
 * exceed the call stack when each step starts the next step synchronously.
 * `await` alone does not prevent this: JavaScript evaluates its operand before
 * suspending, and `run(nextTask)` starts the child Task immediately.
 *
 * Implement deep recursive algorithms with a loop and an explicit worklist so
 * each iteration reuses the same stack frame:
 *
 * ```ts
 * import { createRun, ok, type Task } from "@evolu/common";
 *
 * interface TreeNode {
 *   readonly value: string;
 *   readonly children: ReadonlyArray<TreeNode>;
 * }
 *
 * const visited: Array<string> = [];
 * const visit = (node: TreeNode): void => {
 *   visited.push(node.value);
 * };
 *
 * const visitTree =
 *   (root: TreeNode): Task<void> =>
 *   () => {
 *     const remaining = [root];
 *
 *     while (remaining.length > 0) {
 *       const node = remaining.pop();
 *       if (!node) continue;
 *       visit(node);
 *       for (const child of node.children) remaining.push(child);
 *     }
 *
 *     return ok();
 *   };
 *
 * const tree: TreeNode = {
 *   value: "root",
 *   children: [{ value: "child", children: [] }],
 * };
 * await using run = createRun();
 * expectOk(await run(visitTree(tree)), undefined);
 * expect(visited).toEqual(["root", "child"]);
 * ```
 *
 * Task favors direct native execution, `async`/`await`, and native tooling over
 * interpreted control flow. The trade-off is no transparent stack safety or
 * automatic scheduling fairness. Use loops or worklists for deep algorithms,
 * periodically await {@link yieldNow} for cooperative scheduling, and move
 * CPU-bound work to a worker.
 *
 * ### Why does Task use explicit Result handling?
 *
 * Task uses native TypeScript control flow so each async boundary and error
 * propagation point is visible.
 *
 * ```ts
 * import { createRun, ok, type Task } from "@evolu/common";
 *
 * const loadUser: Task<string, "LoadUserError"> = () => ok("Ada");
 * const greetUser: Task<string, "LoadUserError"> = async (run) => {
 *   const user = await run(loadUser);
 *   if (!user.ok) return user;
 *   return ok(`Hello, ${user.value}`);
 * };
 *
 * await using run = createRun();
 * expectOk(await run(greetUser), "Hello, Ada");
 * ```
 *
 * This is slightly more verbose than fluent or generator-based syntax, but it's
 * simple to read, easy to debug, friendly to TypeScript narrowing, and works
 * well with generated code.
 *
 * ### Can a Task be called directly?
 *
 * Yes. A direct call, `task(run)`, uses the current Run instead of creating a
 * child Run, so it bypasses child lifetime tracking, scheduling metadata, and
 * child disposal boundaries. It is reserved for Task internals that explicitly
 * need same-Run execution; use `run(task)` in application code.
 *
 * ### Where are fork and join?
 *
 * Calling `run(task)` is fork: it starts a child Task and returns a
 * {@link Fiber}. Awaiting or returning that Fiber is join: it makes the child
 * Result or rejection part of the parent Task control flow.
 *
 * ### What runtime features does Task require?
 *
 * Task uses modern JavaScript APIs such as `Promise.withResolvers`,
 * `AbortSignal.throwIfAborted`, `Symbol.dispose`, `Symbol.asyncDispose`,
 * `DisposableStack`, and `AsyncDisposableStack`. Evolu provides polyfills for
 * supported runtimes that need them: call `installPolyfills` from
 * `@evolu/common/polyfills`, or from the platform package such as
 * `@evolu/react-native/polyfills`. The `using` and `await using` syntax is
 * emitted by TypeScript; the polyfills provide the runtime resource-management
 * globals.
 *
 * @group Core
 */
export type Task<T, E = never, D = unknown> = (
  run: Run<D>,
) => Awaitable<Result<T, E>>;

/**
 * Shorthand for a {@link Task} with `any` type parameters.
 *
 * @group Type utilities
 */
export type AnyTask = Task<any, any, any>;

/**
 * Extracts the Ok value type from a {@link Task}.
 *
 * @group Type utilities
 */
export type InferTaskOk<TTask extends AnyTask> =
  TTask extends Task<infer T, any, any> ? T : never;

/**
 * Extracts the Result error type from a {@link Task}.
 *
 * @group Type utilities
 */
export type InferTaskErr<TTask extends AnyTask> =
  TTask extends Task<any, infer E, any> ? E : never;

/**
 * Extracts the dependency type from a {@link Task}.
 *
 * @group Type utilities
 */
export type InferTaskDeps<TTask extends AnyTask> =
  TTask extends Task<any, any, infer D> ? D : never;

/**
 * A {@link Task} that can return a value, signal done, or return a Result error.
 *
 * Use for pull-based protocols where `Done<D>` signals normal completion rather
 * than an error.
 *
 * @group Core
 */
export type NextTask<T, E = never, DoneValue = void, Deps = unknown> = Task<
  T,
  E | Done<DoneValue>,
  Deps
>;

/**
 * Extracts the done value type from a {@link NextTask}.
 *
 * @group Type utilities
 */
export type InferTaskDone<TTask extends AnyTask> =
  InferTaskErr<TTask> extends infer Errors
    ? Errors extends Done<infer D>
      ? D
      : never
    : never;

/**
 * A {@link Task} whose error type is not `never`.
 *
 * Used by {@link Run.orThrow} to accept only Tasks that can return a declared
 * {@link Err}. Tasks without declared Result errors should use {@link Run.ok}
 * instead.
 *
 * @group Type utilities
 */
export type TaskWithError<TTask extends AnyTask> = TTask &
  ([InferTaskErr<TTask>] extends [never] ? never : unknown);

/**
 * A callable object that starts {@link Task}s and owns their lifetimes.
 *
 * A Run is both a function and an object. Calling `run(task)` starts the Task
 * in a child Run and returns a {@link Fiber}. The object exposes the Run's
 * dependencies, abort signal, abort state, snapshots, and monitoring events.
 *
 * Each Task started with `run(task)` gets its own child Run. The child is
 * tracked while the Task runs. When the Task settles, the child Run is
 * disposed: its signal aborts for cleanup, unfinished descendants are requested
 * to stop and awaited, and the child is closed so later starts throw
 * synchronously. The parent removes the child only after that cleanup
 * finishes.
 *
 * To make a child Task failure part of a parent Task result, await or return
 * the child Fiber from the parent. If a parent Task returns before awaiting or
 * returning a child Fiber, cleanup still waits for the child. A child defect
 * during that cleanup panics and aborts the root Run, but the parent Fiber
 * keeps the Result already returned by the parent Task.
 *
 * Disposing a Run requests abort and prevents new child Tasks from starting.
 * Async disposal waits for current children to settle. Abort requests propagate
 * through the Run tree. Abort masking helpers such as {@link unabortable} keep
 * `run.signal` un-aborted while masked Tasks run.
 *
 * A Task that returns a {@link Result} resolves its Fiber with that Result. A
 * Task that observes abort and throws {@link AbortError} rejects a direct
 * `run(task)` Fiber. Use {@link Run.abortable} when abort should be handled as
 * an ordinary Result error; do not catch AbortError from `run(task)` to model
 * expected cancellation. A Task that throws or rejects with anything else is a
 * defect: the root Run panics, all running Tasks are aborted, and later Tasks
 * are prevented from starting. A Fiber rejects with AbortError whose reason is
 * {@link PanicAbortReason}; an {@link AbortableFiber} returns that AbortError as
 * an {@link Err}.
 *
 * Runs also provide dependency injection. `run.deps` contains default
 * dependencies plus the current custom dependencies. Child Runs inherit custom
 * deps by default; `run(task, deps)` replaces custom deps for that Task while
 * default deps are inherited unless replaced with assignable alternatives.
 *
 * @group Core
 * @see {@link createRun}
 * @see {@link Task}
 * @see {@link Fiber}
 */
export interface Run<D = unknown> {
  /**
   * Starts a {@link Task}, invokes it with a child {@link Run}, and returns a
   * {@link Fiber}.
   *
   * The Fiber resolves with the Task {@link Result}. Await or return the Fiber
   * to make the child outcome part of the current Task result. Discard it with
   * `void` when the outcome does not matter; the Run tree supervises the Fiber,
   * so a discarded Fiber's abort never surfaces as an unhandled rejection while
   * defects are still reported. Use {@link Run.daemon} for work that should
   * outlive the current Task.
   *
   * The optional deps argument replaces the custom deps available to the Task.
   * Default deps ({@link RunDefaultDeps}) are inherited unless replaced with
   * assignable alternatives.
   *
   * The Fiber rejects when the Task observes abort by throwing
   * {@link AbortError}. It also rejects with AbortError whose reason is
   * {@link PanicAbortReason} when the Task defects and panics the Run tree. Use
   * {@link Run.abortable} when abort or panic should be returned as an
   * {@link Err}; do not catch AbortError from `run(task)` to model expected
   * cancellation.
   *
   * Calling a disposed Run is a programmer error and throws synchronously
   * before a Fiber is created.
   *
   * ### Example
   *
   * ```ts
   * import { createRun, ok, type Task } from "@evolu/common";
   *
   * interface Db {
   *   readonly name: string;
   * }
   * interface DbDep {
   *   readonly db: Db;
   * }
   *
   * const db: Db = { name: "main" };
   * const loadUser: Task<string> = () => ok("Ada");
   * const saveUser: Task<void, never, DbDep> = ({ deps }) => {
   *   expect(deps.db).toBe(db);
   *   return ok();
   * };
   *
   * await using run = createRun();
   * const userResult = await run(loadUser);
   * const savedResult = await run(saveUser, { db });
   * expectOk(userResult, "Ada");
   * expectOk(savedResult, undefined);
   * ```
   */
  <T, E>(task: Task<T, E, D>): Fiber<T, E, D>;

  <T, E, Deps extends object>(
    task: Task<T, E, Deps>,
    deps: RunCustomDeps<Deps>,
  ): Fiber<T, E, Deps>;

  /**
   * Runs a {@link Task} whose error type is not `never` and throws if the
   * returned {@link Result} is an error.
   *
   * This is the Task equivalent of {@link getOrThrow}. Use it where a declared
   * Result error should crash the current flow instead of being handled
   * locally.
   */
  readonly orThrow: {
    <TTask extends Task<any, any, D>>(
      task: TaskWithError<TTask>,
    ): Promise<InferTaskOk<TTask>>;
    <Deps extends object, TTask extends Task<any, any, Deps>>(
      task: TaskWithError<TTask>,
      deps: RunCustomDeps<Deps>,
    ): Promise<InferTaskOk<TTask>>;
  };

  /**
   * Runs a {@link Task} whose error type is `never` and returns its Ok value.
   *
   * This is the Task equivalent of {@link getOk}.
   */
  readonly ok: {
    <T>(task: Task<T, never, D>): Promise<T>;
    <T, Deps extends object>(
      task: Task<T, never, Deps>,
      deps: RunCustomDeps<Deps>,
    ): Promise<T>;
  };

  /**
   * Runs a {@link Task} and returns an {@link AbortableFiber}.
   *
   * An AbortableFiber is a {@link Fiber} that can request abort with `.abort()`
   * or async disposal. If the Task throws or rejects with {@link AbortError},
   * the Fiber catches it and returns it as a {@link Result} error. Use this API
   * instead of catching AbortError from `run(task)` when abort is an expected
   * outcome. Check `AbortError.reason` to distinguish explicit abort, normal
   * Run disposal, and panic-driven shutdown.
   *
   * Use deps to replace the custom deps available to the Task. Default deps
   * ({@link RunDefaultDeps}) are inherited unless explicitly replaced with
   * assignable alternatives.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   AbortError,
   *   createRun,
   *   ok,
   *   sleep,
   *   type AbortableFiber,
   *   type Task,
   * } from "@evolu/common";
   *
   * interface DbDep {
   *   readonly db: { readonly name: string };
   * }
   * const db = { name: "main" };
   * const loadUser: Task<string, "LoadUserError", DbDep> = async (run) => {
   *   await run.ok(sleep("1s"));
   *   return ok(run.deps.db.name);
   * };
   *
   * await using run = createRun();
   * const fiber = run.abortable(loadUser, { db });
   * expectTypeOf(fiber).toEqualTypeOf<
   *   AbortableFiber<string, "LoadUserError", DbDep>
   * >();
   * fiber.abort();
   * const userResult = await fiber;
   * assert(!userResult.ok);
   * expect(AbortError.is(userResult.error)).toBe(true);
   * ```
   */
  readonly abortable: {
    <T, E>(task: Task<T, E, D>): AbortableFiber<T, E, D>;
    <T, E, Deps extends object>(
      task: Task<T, E, Deps>,
      deps: RunCustomDeps<Deps>,
    ): AbortableFiber<T, E, Deps>;
  };

  /**
   * Runs a {@link Task} as daemon and returns an {@link AbortableFiber}.
   *
   * Normal child Runs are disposed after their Task settles. Tasks started by
   * `run.daemon` detach their lifetime from the current Task and attach to the
   * root Run, so they keep running until they settle or the root Run is
   * disposed. Calling `.abort()` or async-disposing the returned Fiber requests
   * abort. Keep the returned Fiber for lifetime control.
   *
   * The daemon receives deps derived from the Run that starts it, not from the
   * root Run: `deps` replace that Run's custom deps for the daemon Task, while
   * lifetime is attached to the root Run. Default deps ({@link RunDefaultDeps})
   * are inherited unless explicitly replaced with assignable alternatives.
   *
   * The caller's abort mask is not inherited. A daemon detaches to the root, so
   * a mask-inheriting daemon could never observe abort and would hang root
   * disposal. Wrap the daemon Task with {@link unabortable} when it must finish
   * once started.
   *
   * A recorded abort request prevents starting a daemon: `run.daemon` throws
   * {@link AbortError} even while the caller's abort mask keeps `run.signal`
   * un-aborted, because detached work must not spawn under a scope that is
   * shutting down.
   *
   * ### Example
   *
   * ```ts
   * import { createRun, ok, unabortable, type Task } from "@evolu/common";
   *
   * const syncUsers: Task<string> = () => ok("synced");
   * const syncParent = unabortable(async (run) => {
   *   expect(run.snapshot().abortMask).toBe(1);
   *
   *   // Plain daemon — the caller's mask does not follow it, so abort
   *   // requests are observed.
   *   const fiber = run.daemon(syncUsers);
   *   expect(fiber.run.snapshot().abortMask).toBe(0);
   *
   *   // Explicitly masked daemon — finishes once started.
   *   const maskedFiber = run.daemon(unabortable(syncUsers));
   *   expect(maskedFiber.run.snapshot().abortMask).toBe(1);
   *   const firstResult = await fiber;
   *   const secondResult = await maskedFiber;
   *   assert(firstResult.ok);
   *   assert(secondResult.ok);
   *   return ok([firstResult.value, secondResult.value] as const);
   * });
   *
   * await using run = createRun();
   * expectOk(await run(syncParent), ["synced", "synced"]);
   * ```
   *
   * For a long-lived reusable {@link Run}, use {@link Run.create}.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   AbortError,
   *   createRun,
   *   ok,
   *   sleep,
   *   type Task,
   * } from "@evolu/common";
   *
   * interface DbDep {
   *   readonly db: { readonly name: string };
   * }
   * const db = { name: "main" };
   * const syncUsers: Task<void, never, DbDep> = async (run) => {
   *   await run.ok(sleep("1s"));
   *   return ok();
   * };
   *
   * await using run = createRun();
   * const fiber = run.daemon(syncUsers, { db });
   * fiber.abort();
   * const syncResult = await fiber;
   * assert(!syncResult.ok);
   * expect(AbortError.is(syncResult.error)).toBe(true);
   * ```
   *
   * ```ts
   * import { createRun, ok, waitForAbort, type Task } from "@evolu/common";
   *
   * let syncStopped = false;
   * const syncUsers: Task<never> = async (run) => {
   *   using _ = run.onAbort(() => {
   *     syncStopped = true;
   *   });
   *   return await run(waitForAbort);
   * };
   * const loadUser: Task<string> = () => ok("Ada");
   *
   * await using run = createRun();
   * {
   *   // Async disposal requests abort and waits for the daemon to stop.
   *   await using _syncFiber = run.daemon(syncUsers);
   *   expectOk(await run(loadUser), "Ada");
   * }
   * expect(syncStopped).toBe(true);
   * ```
   */
  readonly daemon: {
    <T, E>(task: Task<T, E, D>): AbortableFiber<T, E, D>;
    <T, E, Deps extends object>(
      task: Task<T, E, Deps>,
      deps: RunCustomDeps<Deps>,
    ): AbortableFiber<T, E, Deps>;
  };

  /**
   * Creates a {@link DisposableRun} attached to the root Run with this Run's
   * deps.
   *
   * Use it when you need a Run that can be reused across multiple operations.
   * For a single long-lived Task, use {@link Run.daemon}.
   *
   * Use deps to replace the created Run's custom deps. Default deps
   * ({@link RunDefaultDeps}) are inherited unless explicitly replaced with
   * assignable alternatives.
   *
   * A recorded abort request prevents creating a Run: `run.create` throws
   * {@link AbortError} even while the caller's abort mask keeps `run.signal`
   * un-aborted, because a detached Run must not start under a scope that is
   * shutting down.
   *
   * ### Example
   *
   * ```ts
   * import { createRun, ok, type Task } from "@evolu/common";
   *
   * interface DbDep {
   *   readonly db: { readonly users: Array<string> };
   * }
   * const db = { users: ["Ada"] };
   * const loadUser: Task<string, never, DbDep> = ({ deps }) =>
   *   ok(deps.db.users[0] ?? "Unknown");
   * const saveUser: Task<void, never, DbDep> = ({ deps }) => {
   *   deps.db.users.push("Grace");
   *   return ok();
   * };
   *
   * await using run = createRun();
   * await using createdRun = run.create({ db });
   * const userResult = await createdRun(loadUser);
   * const savedResult = await createdRun(saveUser);
   * expectOk(userResult, "Ada");
   * expectOk(savedResult, undefined);
   * expect(db.users).toEqual(["Ada", "Grace"]);
   * ```
   */
  readonly create: {
    (): DisposableRun<D>;
    <Deps extends object>(deps: RunCustomDeps<Deps>): DisposableRun<Deps>;
  };

  /** Unique {@link Id} for this Run. */
  readonly id: Id;

  /** The parent {@link Run}, if this Run was created as a child. */
  readonly parent: Run | null;

  /** Dependencies available to the Task, including {@link RunDefaultDeps}. */
  readonly deps: RunDefaultDeps & D;

  /**
   * Abort signal for the {@link Task}.
   *
   * Aborts when this Run is disposed. While the Task is running, it also aborts
   * when a parent abort request reaches this Run and the Task is not wrapped
   * with {@link unabortable}.
   *
   * After the Task settles, this Run is disposed. If the signal has not already
   * aborted, disposal aborts it with the recorded abort error for aborted or
   * panicked exits, and with {@link runDisposedAbortReason} after successful
   * completion.
   *
   * In masked Tasks, an abort request can be recorded in {@link Run.getState}
   * without being observed by this signal. If the masked Task completes
   * successfully, this signal still aborts with `runDisposedAbortReason` during
   * disposal.
   *
   * Pass this signal to cancellation-aware APIs such as `fetch`. For cleanup
   * callbacks, use {@link Run.onAbort} instead of `addEventListener`. Run's
   * internal cleanup also listens on this signal, so abort listeners must not
   * call `stopImmediatePropagation` — it would suppress later-registered
   * listeners, including {@link Run.onAbort} callbacks.
   */
  readonly signal: AbortSignal;

  /**
   * Registers a synchronous callback for observed `run.signal` aborts.
   *
   * The callback runs when this Run observes abort, including normal Run
   * disposal. Masked Runs can record an abort request without aborting
   * `run.signal`, so this callback does not run for every recorded request. If
   * this Run is already aborted, the callback runs immediately and no callback
   * is registered. Dispose the returned registration to release the callback
   * before abort. Returns null when already aborted, which is safe in a using
   * declaration.
   *
   * ### Example
   *
   * ```ts
   * import { AbortError, createRun, ok, sleep } from "@evolu/common";
   *
   * let socketClosed = false;
   * const openSocket = () => ({
   *   close: () => {
   *     socketClosed = true;
   *   },
   *   read: async () => "message",
   * });
   *
   * await using run = createRun();
   * const fiber = run.abortable(async (run) => {
   *   const socket = openSocket();
   *   using closeOnAbort = run.onAbort(() => {
   *     socket.close();
   *   });
   *
   *   await run.ok(sleep("1s"));
   *   const message = await socket.read();
   *   return ok(message);
   * });
   * fiber.abort();
   * const result = await fiber;
   * assert(!result.ok);
   * expect(AbortError.is(result.error)).toBe(true);
   * expect(socketClosed).toBe(true);
   * ```
   */
  readonly onAbort: (
    callback: (abortError: AbortError) => void,
  ) => Disposable | null;

  /** Returns the current {@link RunState} of this {@link Run}. */
  readonly getState: () => RunState;

  /** Creates a memoized recursive {@link RunSnapshot} of the current Run tree. */
  readonly snapshot: () => RunSnapshot;

  /**
   * Callback for monitoring Run events emitted by this Run or descendants.
   *
   * Event handlers are observers, not part of Task control flow. Handler
   * defects are reported via {@link ReportDefectDep.reportDefect}; they do not
   * panic the root Run or change Run state.
   *
   * Do not call {@link Run} APIs or {@link Fiber} control methods from event
   * handlers. Event handlers must only observe and report.
   */
  onEvent: ((event: RunEvent) => void) | undefined;
}

/**
 * Custom deps accepted by {@link Run} APIs.
 *
 * Runs always expose {@link RunDefaultDeps}. Custom deps may use a default key
 * only when the replacement is assignable to the default dependency type.
 *
 * @group Core
 */
export type RunCustomDeps<D extends object> = D & {
  readonly [K in keyof D]: K extends keyof RunDefaultDeps
    ? D[K] extends RunDefaultDeps[K] | undefined
      ? D[K]
      : never
    : D[K];
};

/**
 * A {@link Run} with explicit disposal.
 *
 * {@link createRun} creates a root DisposableRun. {@link Run.create} creates one
 * attached to that root, typically to give a reusable resource its own
 * lifetime. A DisposableRun owns its child Tasks and closure-held cleanup
 * registered with {@link DisposableRun.defer}; disposing it shuts down both.
 *
 * Sync disposal starts shutdown without waiting. Async disposal waits for child
 * Tasks and registered cleanup to finish.
 *
 * Use {@link createRun} at composition roots such as app, server, worker, or
 * test entry points. The common factory is platform-agnostic; platform adapters
 * can wrap it to add global error handling or shutdown integration.
 *
 * ### Example
 *
 * ```ts
 * import { createRun, ok, type Task } from "@evolu/common";
 *
 * await using run = createRun();
 * const loadData: Task<string> = () => ok("data");
 *
 * expectOk(await run(loadData), "data");
 * ```
 *
 * ### Example with custom dependencies
 *
 * ```ts
 * import { createRun, type DisposableRun } from "@evolu/common";
 *
 * interface ConfigDep {
 *   readonly config: { readonly apiUrl: string };
 * }
 *
 * await using run = createRun<ConfigDep>({
 *   config: { apiUrl: "https://api.example.com" },
 * });
 *
 * expectTypeOf(run).toEqualTypeOf<DisposableRun<ConfigDep>>();
 * expect(run.deps.config.apiUrl).toBe("https://api.example.com");
 * ```
 *
 * @group Core
 */
export interface DisposableRun<D = unknown>
  extends Run<D>, Disposable, AsyncDisposable {
  /**
   * Registers closure-held cleanup owned by this Run.
   *
   * Finalizers run in LIFO order after child Tasks settle and are awaited by
   * async disposal. The Run is in `Aborted` state while they run and
   * transitions to `Settled` afterward, so a finalizer cannot start Tasks on
   * it. Use `using` for resources owned by a Task stack frame; use `defer` for
   * closure-held state whose lifetime is bounded by a reusable DisposableRun.
   *
   * Sync disposal starts cleanup without waiting and does not throw finalizer
   * defects synchronously. Async disposal awaits cleanup. If a finalizer
   * defects, the defect is reported once, and every async disposal call rejects
   * with the same already-reported {@link AbortError}.
   *
   * Calling `defer` after disposal starts is a programmer error.
   */
  readonly defer: (finalizer: () => Awaitable<void>) => void;

  /**
   * Requests abort with an optional {@link AbortReason} and starts sync
   * disposal.
   */
  readonly abort: (reason?: AbortReason) => void;

  /**
   * Shuts down the Run tree because of a defect.
   *
   * Panic creates a {@link PanicAbortReason} from the defect, wraps it in an
   * {@link AbortError}, and reports that AbortError through
   * {@link ReportDefectDep}. The original defect is available as
   * `abortError.reason.defect` for diagnostics. The first panic records the
   * AbortError as the root Run's aborted exit and starts root disposal, which
   * aborts running Tasks, prevents new Tasks from starting, and waits for
   * running Tasks to settle. Later panics still report and return their own
   * AbortError, but do not replace the root Run exit.
   */
  readonly panic: (defect: unknown) => AbortError;
}

/**
 * A Promise-backed handle to a {@link Task} started by a {@link Run}.
 *
 * Await a Fiber to use the Task Result in the current control flow. The Fiber
 * resolves with the Task {@link Result} when the Task returns normally. A Fiber
 * returned by `run(task)` rejects with {@link AbortError} when the Task observes
 * abort or when a defect panics the Run tree. Panic uses
 * {@link PanicAbortReason}; the original defect is available on the reason for
 * diagnostics. Use {@link Run.abortable} when abort or panic should be returned
 * as an {@link Err}; do not catch AbortError from `run(task)` to model expected
 * cancellation.
 *
 * Prefer `await fiber` over `fiber.then()`. Zero-cost async stack traces are
 * reconstructed from `await` suspension points and selected native Promise
 * combinators such as `Promise.all`, `Promise.any`, and `Promise.race`, not
 * from arbitrary `then`/`catch` reaction chains. Awaiting a Fiber preserves the
 * async-function boundary that links cross-Run defect stack traces; attaching
 * `then` reactions can lose those frames. See
 * {@link https://mathiasbynens.be/notes/async-stack-traces | Asynchronous stack traces: why await beats Promise#then()}
 * and {@link https://v8.dev/docs/stack-trace-api | V8: Stack trace API}.
 * Hermes/React Native currently expose only child throw sites, so this
 * diagnostic stack-linking benefit is unavailable there; use Run monitoring
 * state, snapshots, and events for cross-Run diagnostics.
 *
 * Child Fiber results are not implicitly aggregated into parent results. If a
 * Task starts a child Fiber and returns before awaiting or returning it, the
 * parent Run still waits for the child during cleanup. A later child defect
 * panics the root Run and is reported, but the already-returned parent Result
 * is preserved.
 *
 * The {@link Fiber.run | run} property exposes the child Run used to execute the
 * Task. Use it for monitoring state, snapshots, events, and child lifetime
 * inspection.
 *
 * Plain Fibers do not provide abort or disposal controls. Use
 * {@link AbortableFiber}, returned by `Run.abortable` or {@link Run.daemon}, for
 * explicit abort and async disposal.
 *
 * ### Example
 *
 * ```ts
 * import { createRun, ok, type Fiber, type Task } from "@evolu/common";
 *
 * await using run = createRun();
 *
 * const loadUser: Task<string> = () => ok("Ada");
 *
 * const fiber = run<string, never>(loadUser);
 * const userResult = await fiber;
 * const snapshot = fiber.run.snapshot();
 *
 * expectTypeOf(fiber).toEqualTypeOf<Fiber<string, never>>();
 * expectOk(userResult, "Ada");
 * expect(snapshot.id).toBe(fiber.run.id);
 * ```
 *
 * @group Core
 */
export interface Fiber<T = unknown, E = unknown, D = unknown> extends Promise<
  Result<T, E>
> {
  readonly run: Run<D>;
}

/**
 * Shorthand for a {@link Fiber} with `any` type parameters.
 *
 * @group Type utilities
 */
export type AnyFiber = Fiber<any, any, any>;

/**
 * Extracts the Ok value type from a {@link Fiber}.
 *
 * @group Type utilities
 */
export type InferFiberOk<TFiber extends AnyFiber> =
  TFiber extends Fiber<infer T, any, any> ? T : never;

/**
 * Extracts the Result error type from a {@link Fiber}.
 *
 * @group Type utilities
 */
export type InferFiberErr<TFiber extends AnyFiber> =
  TFiber extends Fiber<any, infer E, any> ? E : never;

/**
 * Extracts the dependency type from a {@link Fiber}.
 *
 * @group Type utilities
 */
export type InferFiberDeps<TFiber extends AnyFiber> =
  TFiber extends Fiber<any, any, infer D> ? D : never;

/**
 * A {@link Fiber} with explicit abort and async-disposal controls.
 *
 * Calling `.abort()` requests abort for the Fiber's child {@link Run}. If the
 * Task observes abort or a defect panics the Run tree, the Fiber resolves with
 * an {@link Err} containing the {@link AbortError}. Panic uses
 * {@link PanicAbortReason}; the original defect is available on the reason for
 * diagnostics.
 *
 * Use `.abort()` plus `await fiber` for manual lifetime control, or `await
 * using` for a lifetime bounded by the using block. Async disposal calls
 * `.abort()` and waits for the Fiber to settle.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   AbortError,
 *   createRun,
 *   ok,
 *   sleep,
 *   type AbortableFiber,
 *   type Task,
 * } from "@evolu/common";
 *
 * await using run = createRun();
 *
 * const fetchData: Task<string> = async (run) => {
 *   await run.ok(sleep("1s"));
 *   return ok("data");
 * };
 *
 * const fiber = run.abortable<string, never>(fetchData);
 * expectTypeOf(fiber).toEqualTypeOf<AbortableFiber<string, never>>();
 * fiber.abort();
 * const result = await fiber;
 * assert(!result.ok);
 * expect(AbortError.is(result.error)).toBe(true);
 * ```
 *
 * @group Core
 */
export interface AbortableFiber<T = unknown, E = unknown, D = unknown>
  extends Fiber<T, E | AbortError, D>, AsyncDisposable {
  readonly abort: (reason?: AbortReason) => void;
}

/**
 * Abort mask depth for a {@link Run}.
 *
 * `0` means the Run observes abort requests immediately. `>= 1` means the Run
 * is protected by one or more {@link unabortable} or {@link unabortableMask}
 * scopes. Abort requests are still recorded, but the Run's observed abort
 * signal is aborted only when the mask is `0`.
 *
 * Plain child Tasks inherit their parent's mask. `unabortable` increments the
 * mask for the wrapped Task, and `unabortableMask` provides `restore` to run
 * selected child Tasks with the previous mask.
 *
 * @group Abortability
 */
export type AbortMask = NonNegativeInt & Brand<"AbortMask">;

/**
 * Typed object explaining why a {@link Run} was aborted.
 *
 * A reason has a `type` discriminant and optional structured data, so abort
 * causes can carry typed domain data. Well-known reasons are
 * {@link explicitAbortReason}, {@link runDisposedAbortReason}, and
 * {@link PanicAbortReason}.
 *
 * @group Core
 */
export const AbortReason: ObjectType<
  { readonly type: typeof String },
  RecordType<typeof String, typeof Unknown>
> = /*#__PURE__*/ object(
  { type: String },
  /*#__PURE__*/ record(String, Unknown),
);
export interface AbortReason extends InferType<typeof AbortReason> {}

/**
 * Typed object representing structured-concurrency abort control flow.
 *
 * AbortError is thrown to stop Task execution when a Run observes an abort
 * request. AbortableFiber catches AbortError and returns it as a {@link Result}
 * error, so abort can be handled as an ordinary Task outcome.
 *
 * The reason explains why the Run was aborted. It can be an explicit abort
 * reason, {@link runDisposedAbortReason} for normal Run cleanup, or
 * {@link PanicAbortReason} when a defect panicked the Run tree. The original
 * defect is available as `panicAbortReason.defect` for diagnostics.
 *
 * AbortError is reserved for Task abort control flow. Do not throw or reject
 * with AbortError for domain errors; return a Result error instead.
 *
 * Helpers that abort their own child Tasks should catch or normalize AbortError
 * before it escapes the helper boundary. The reason carries typed domain data.
 *
 * WebKit fetch rejects with its own abort error instead of `signal.reason`.
 * Native wrappers should treat `signal.reason` as the source of truth and
 * normalize aborts to AbortError.
 *
 * @group Core
 */
export const AbortError: TypedType<
  "AbortError",
  { readonly reason: typeof AbortReason }
> = /*#__PURE__*/ typed("AbortError", {
  reason: AbortReason,
});
export interface AbortError extends InferType<typeof AbortError> {}

/**
 * Creates an {@link AbortError} from an {@link AbortReason}.
 *
 * @group Core
 */
export const createAbortError = (reason: AbortReason): AbortError => ({
  type: "AbortError",
  reason,
});

/**
 * Final outcome recorded by a {@link Run}.
 *
 * A Run exit is an outer {@link Result}. {@link Ok} means the Task returned a
 * Result; {@link Err} means the Run aborted with {@link AbortError}. Panic is
 * recorded as an AbortError whose reason is {@link PanicAbortReason}.
 *
 * @group Core
 */
export type RunExit = Result<UnknownResult, AbortError>;

/**
 * {@link Run} lifetime states.
 *
 * @group Core
 */
export type RunState = RunStateRunning | RunStateAborted | RunStateSettled;

/**
 * The {@link Run} has no abort request, observed abort, or exit.
 *
 * @group Core
 */
export interface RunStateRunning extends Typed<"Running"> {}

/**
 * {@link Run} abort state.
 *
 * @group Core
 */
export interface RunAbortState {
  readonly abort: {
    /** Abort request propagated through the {@link Run} tree before masking. */
    readonly request: AbortReason;

    /** Abort observed after abort masks are applied. */
    readonly observed: AbortReason | null;
  };
}

/**
 * The {@link Run} has an abort request and may still be running or disposing.
 *
 * @group Core
 */
export interface RunStateAborted extends Typed<"Aborted">, RunAbortState {}

/**
 * The {@link Run} has recorded its final outcome and all descendants have
 * settled.
 *
 * Disposal can request abort with {@link runDisposedAbortReason} before a defect
 * happens during cleanup. In that case `abort.request` stays as the disposal
 * reason, while `exit` records the cleanup defect as a
 * {@link PanicAbortReason}.
 *
 * @group Core
 */
export interface RunStateSettled extends Typed<"Settled">, RunAbortState {
  /** The final outcome recorded by the {@link Run}. */
  readonly exit: RunExit;
}

/**
 * Recursive snapshot of a {@link Run} tree.
 *
 * Snapshots are memoized and structurally shared: unchanged subtrees reuse the
 * same object reference. This lets UI and debugging tools compare snapshots by
 * identity and skip unchanged branches.
 *
 * @group Core
 * @see {@link Run.snapshot}
 */
export interface RunSnapshot {
  /** The {@link Run} id this snapshot represents. */
  readonly id: Id;

  /** The current state of the {@link Run} this snapshot represents. */
  readonly state: RunState;

  /** Child snapshots in start order. */
  readonly children: ReadonlyArray<RunSnapshot>;

  /** The abort mask depth. `0` means abortable, `>= 1` means unabortable. */
  readonly abortMask: AbortMask;
}

/**
 * Event-specific payload of a {@link RunEvent}.
 *
 * @group Monitoring
 */
export type RunEventData =
  RunEventDataChildAdded | RunEventDataChildRemoved | RunEventDataStateChanged;

/**
 * A child Run was added to the emitting Run.
 *
 * @group Monitoring
 */
export interface RunEventDataChildAdded extends Typed<"ChildAdded"> {
  /** The id of the added child Run. */
  readonly childId: Id;
}

/**
 * A child Run was removed from the emitting Run.
 *
 * @group Monitoring
 */
export interface RunEventDataChildRemoved extends Typed<"ChildRemoved"> {
  /** The id of the removed child Run. */
  readonly childId: Id;
}

/**
 * The emitting {@link Run} changed state.
 *
 * @group Monitoring
 */
export interface RunEventDataStateChanged extends Typed<"StateChanged"> {
  /** The committed state. */
  readonly state: RunState;
}

/**
 * Event emitted by a {@link Run} for monitoring and debugging.
 *
 * Events bubble through parent Runs, so monitoring can be attached at a root
 * Run. Event emission is controlled by {@link RunConfig.eventsEnabled}.
 *
 * @group Monitoring
 */
export interface RunEvent {
  /** The id of the Run that emitted the event. */
  readonly id: Id;

  /** The event timestamp from the root Run's {@link Time} dependency. */
  readonly timestamp: Millis;

  /** The event-specific payload. */
  readonly data: RunEventData;
}

/**
 * Shared abort reason used for ordinary {@link Run} cleanup.
 *
 * Disposal requests abort so child Tasks stop while the Run waits for them to
 * settle. This reason distinguishes that cleanup path from explicit abort and
 * {@link PanicAbortReason}.
 *
 * @group Run
 */
export const runDisposedAbortReason = {
  type: "RunDisposedAbortReason",
} as const satisfies AbortReason;

const runDisposedAbortError = createAbortError(runDisposedAbortReason);

/**
 * Shared abort reason used when callers explicitly request abort without a more
 * specific reason.
 *
 * @group Run
 */
export const explicitAbortReason = {
  type: "ExplicitAbortReason",
} as const satisfies AbortReason;

/**
 * Shared abort reason for tests that need a non-production abort reason.
 *
 * @group Run
 */
export const testAbortReason = {
  type: "TestAbortReason",
} as const satisfies AbortReason;

/**
 * Shared {@link AbortError} for tests, created from {@link testAbortReason}.
 *
 * @group Run
 */
export const testAbortError = /*#__PURE__*/ createAbortError(testAbortReason);

/**
 * A root-level abort caused by a defect.
 *
 * Panic is a root-level abort caused by a defect: a thrown exception or
 * rejected Promise. Recoverable domain errors belong in Result. Unexpected or
 * unrecoverable conditions, such as storage engine errors the Task cannot
 * usefully handle, may throw or reject. {@link AbortError} is abort control
 * flow, not a defect.
 *
 * {@link Run.onEvent} handler defects are different: event handlers are
 * monitoring code, so their defects are reported globally but do not panic the
 * root Run.
 *
 * When Run observes a defect, it aborts the root Run and starts disposal
 * immediately. This prevents later Tasks from starting after the defect. A
 * Fiber rejects with AbortError whose reason is PanicAbortReason; an
 * {@link AbortableFiber} returns that AbortError as an {@link Err}.
 *
 * @group Core
 */
export interface PanicAbortReason extends AbortReason {
  readonly type: "PanicAbortReason";
  readonly defect: unknown;
}

/**
 * Creates a {@link PanicAbortReason} from a defect.
 *
 * @group Core
 */
export const createPanicAbortReason = (defect: unknown): PanicAbortReason => ({
  type: "PanicAbortReason",
  defect,
});

/**
 * Configuration for {@link Run} monitoring behavior.
 *
 * @group Monitoring
 */
export interface RunConfig {
  /**
   * Whether to emit {@link RunEvent}s.
   *
   * Use a {@link Ref} to enable or disable events at runtime without recreating
   * the Run. Events are disabled by default for zero overhead when monitoring
   * is not needed.
   */
  readonly eventsEnabled: Ref<boolean>;
}

/**
 * Dependency wrapper for {@link RunConfig}.
 *
 * @group Monitoring
 */
export interface RunConfigDep {
  readonly runConfig: RunConfig;
}

/**
 * Reports a defect.
 *
 * Run uses this dependency in two cases: {@link DisposableRun.panic} reports the
 * {@link AbortError} whose reason is {@link PanicAbortReason}, and event
 * monitoring reports observer defects without panicking the Run. The original
 * panic defect is available at `abortError.reason.defect`.
 *
 * @group Run
 */
export type ReportDefect = (reported: unknown) => void;

/**
 * Dependency wrapper for {@link ReportDefect}.
 *
 * @group Run
 */
export interface ReportDefectDep {
  readonly reportDefect: ReportDefect;
}

/**
 * Default {@link ReportDefect} for platform-independent {@link createRun}.
 *
 * Throws the reported defect from a queued microtask. This is a fallback for
 * platforms without native global error reporting. Browser adapters use the
 * native
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/reportError | reportError}
 * API; other platform adapters can use platform-specific reporting and preserve
 * nested panic defects as cause or detail data.
 *
 * @group Run
 */
export const reportDefectAfterMicrotask: ReportDefect = (defect) => {
  queueMicrotask(() => {
    throw defect;
  });
};

/**
 * Default dependencies provided by {@link createRun}.
 *
 * Root Runs include platform-independent implementations for console, leak
 * detection, native fetch, randomness, error reporting, time, and optional Run
 * monitoring configuration.
 *
 * The {@link LeakDetector} is enabled only in development builds; production
 * uses a no-op implementation.
 *
 * @group Run
 */
export type RunDefaultDeps = ConsoleDep &
  LeakDetectorDep &
  NativeFetchDep &
  RandomBytesDep &
  RandomDep &
  ReportDefectDep &
  TimeDep &
  Partial<RunConfigDep>;

/**
 * Creates {@link RunDefaultDeps}.
 *
 * @group Run
 */
export const createRunDefaultDeps = (): RunDefaultDeps => {
  const console = createConsole();
  return {
    console,
    leakDetector: isDev ? createLeakDetector({ console }) : noopLeakDetector,
    nativeFetch: globalThis.fetch.bind(globalThis),
    randomBytes: createRandomBytes(),
    random: createRandom(),
    reportDefect: reportDefectAfterMicrotask,
    time: createTime(),
  };
};

/**
 * Factory type for creating root {@link DisposableRun} instances.
 *
 * @group Run
 */
export interface CreateRun {
  /** Creates a root Run with only {@link RunDefaultDeps}. */
  (): DisposableRun;

  /** Creates a root Run with custom deps merged over {@link RunDefaultDeps}. */
  <D extends object>(deps: RunCustomDeps<D>): DisposableRun<D>;
}

/**
 * Creates a root {@link DisposableRun}.
 *
 * @group Run
 */
export const createRun: CreateRun = <D extends object>(
  deps?: RunCustomDeps<D>,
): DisposableRun<D> =>
  createRunInternal<D>({
    ...createRunDefaultDeps(),
    ...deps,
  } as RunDefaultDeps & D);

/**
 * Deterministic test variants of {@link RunDefaultDeps}.
 *
 * The omitted `console`, `leakDetector`, `reportDefect`, and `time` are
 * replaced with test variants that add test controls such as
 * `console.getEntriesSnapshot()`, `leakDetector.collect()`,
 * `reportDefect.next()`, and `time.advance()`. `nativeFetch`, `random`, and
 * `randomBytes` keep their production types because their test implementations
 * add no extra API; they are just seeded or test-only fallbacks.
 *
 * {@link RandomLibDep} is an addition, not a replacement. It is not part of
 * {@link RunDefaultDeps}; it exposes the seeded random library that drives all
 * test randomness. Tests use it directly as a deterministic random toolkit —
 * shuffling inputs and generating reproducible random data — and
 * `testCreateRandomBytes` derives random bytes from it, so everything flows
 * from one seed.
 *
 * @group Testing
 */
export type TestRunDefaultDeps = Omit<
  RunDefaultDeps,
  "console" | "leakDetector" | "reportDefect" | "time"
> &
  TestConsoleDep &
  TestLeakDetectorDep &
  TestReportDefectDep &
  TestTimeDep &
  RandomLibDep;

/** Provides a test {@link Run} with deterministic default dependencies. */
export interface TestRunDep<D = unknown> {
  readonly run: Run<TestRunDefaultDeps & D>;
}

/**
 * Test {@link ReportDefect} that records reported defects.
 *
 * @group Testing
 */
export interface TestReportDefect extends ReportDefect {
  /** Gets all reported defects without clearing the internal buffer. */
  readonly getDefects: () => ReadonlyArray<unknown>;

  /** Waits for the next reported defect. */
  readonly next: () => Promise<unknown>;

  /**
   * Gets all reported defects and clears the internal buffer.
   *
   * Destructive, like {@link TestConsole.getEntriesSnapshot}.
   */
  readonly getDefectsSnapshot: () => ReadonlyArray<unknown>;

  /** Clears all reported defects. */
  readonly clearDefects: () => void;
}

/**
 * Dependency wrapper for {@link TestReportDefect}.
 *
 * @group Testing
 */
export interface TestReportDefectDep extends ReportDefectDep {
  readonly reportDefect: TestReportDefect;
}

/**
 * Creates {@link TestReportDefect}.
 *
 * @group Testing
 */
export const testCreateReportDefect = (): TestReportDefect => {
  const defects: Array<unknown> = [];
  const nextWaiters: Array<(defect: unknown) => void> = [];
  let nextIndex = 0;

  const next = (): Promise<unknown> => {
    if (nextIndex < defects.length) {
      const defect = defects[nextIndex];
      nextIndex += 1;
      return Promise.resolve(defect);
    }

    const nextDefect = Promise.withResolvers<unknown>();
    nextWaiters.push(nextDefect.resolve);
    return nextDefect.promise;
  };

  const getDefects = (): ReadonlyArray<unknown> => [...defects];

  const getDefectsSnapshot = (): ReadonlyArray<unknown> => {
    assert(
      nextWaiters.length === 0,
      "getDefectsSnapshot must not be called while reportDefect.next() is pending",
    );
    const snapshot = [...defects];
    defects.length = 0;
    nextIndex = 0;
    return snapshot;
  };

  const clearDefects = (): void => {
    assert(
      nextWaiters.length === 0,
      "clearDefects must not be called while reportDefect.next() is pending",
    );
    defects.length = 0;
    nextIndex = 0;
  };

  return Object.assign(
    (defect: unknown): void => {
      defects.push(defect);
      const resolveNext = nextWaiters.shift();
      if (!resolveNext) return;

      nextIndex += 1;
      resolveNext(defect);
    },
    { getDefects, next, getDefectsSnapshot, clearDefects },
  );
};

/**
 * Creates {@link TestRunDefaultDeps}.
 *
 * @group Testing
 */
export const testCreateDeps = (options?: {
  readonly seed?: string;
}): TestRunDefaultDeps => {
  const seed = options?.seed ?? "evolu";
  const console = testCreateConsole();
  const leakDetector = testCreateLeakDetector({ console });
  const random = testCreateRandom(seed);
  const randomLib = testCreateRandomLib(seed);
  const randomBytes = testCreateRandomBytes({ randomLib });
  const nativeFetch: NativeFetch = () => {
    throw new Error("Provide a nativeFetch test double");
  };
  const reportDefect = testCreateReportDefect();
  const time = testCreateTime();
  return {
    console,
    leakDetector,
    nativeFetch,
    randomBytes,
    random,
    randomLib,
    reportDefect,
    time,
  };
};

/**
 * Creates a root {@link DisposableRun} with {@link TestRunDefaultDeps}.
 *
 * @group Testing
 */
export function testCreateRun(
  deps?: TestRunDefaultDeps,
): DisposableRun<TestRunDefaultDeps>;

export function testCreateRun<D extends object>(
  deps: RunCustomDeps<D>,
): DisposableRun<TestRunDefaultDeps & D>;

export function testCreateRun<D extends object>(
  deps?: TestRunDefaultDeps | RunCustomDeps<D>,
): DisposableRun<TestRunDefaultDeps & D> {
  return createRunInternal<TestRunDefaultDeps & D>({
    ...testCreateDeps(),
    ...deps,
  } as TestRunDefaultDeps & D);
}

type RunInternal<D extends object> = Writable<DisposableRun<D>> & {
  (
    task: TaskInternal,
    taskDeps?: object,
    options?: { abortable?: boolean },
  ): Writable<Fiber<any, any, any>>;

  // Internal
  abortMask: AbortMask;
  restoreTokens: ReadonlySet<RestoreToken>;
  requestAbort: (reason?: AbortReason) => void;
  requestAbortSignal: AbortSignal;
  dispose: (exit?: RunExit) => Promise<RunExit>;
};

type TaskInternal<T = any, E = any, D = any> = Task<T, E, D> & {
  [taskMetaSymbol]?: TaskMeta;
};

interface TaskMeta {
  readonly abortBehavior?: AbortBehavior;
  readonly priority?: TaskPriority;
}

type AbortBehavior = "unabortable" | RestoreAbortBehavior;

type RestoreToken = symbol & Brand<"RestoreToken">;

interface RestoreAbortBehavior {
  readonly abortMask: AbortMask;
  readonly restoreToken: RestoreToken;
}

interface SchedulerLike {
  readonly postTask?: <T>(
    callback: () => Awaitable<T>,
    options?: {
      readonly priority?: TaskPriority;
      readonly signal?: AbortSignal;
    },
  ) => Promise<T>;
  readonly yield?: () => Promise<void>;
}

const globalWithScheduler = globalThis as {
  readonly scheduler?: SchedulerLike;
};

const globalWithSetImmediate = globalThis as {
  readonly setImmediate?: (callback: () => void) => void;
};

const taskMetaSymbol = Symbol("evolu.Task.meta");

const abortableMask = 0 as AbortMask;

const runningRunState: RunStateRunning = { type: "Running" };

const createRunInternal = <D extends object>(
  deps: RunDefaultDeps & D,
  parent?: RunInternal<any>,
  rootRun?: RunInternal<any>,
  taskMeta?: TaskMeta,
): RunInternal<D> => {
  const abortBehavior = taskMeta?.abortBehavior;

  if (abortBehavior !== undefined && abortBehavior !== "unabortable") {
    assert(
      parent?.restoreTokens.has(abortBehavior.restoreToken) === true,
      "restore is only valid inside the unabortableMask that created it",
    );
  }

  // Plain Tasks inherit the parent's mask. `unabortable` increments at start
  // time because its concrete mask is relative to that parent. `restore` is
  // validated by its token above, then uses its captured concrete mask.
  const parentAbortMask = parent?.abortMask ?? abortableMask;
  const abortMask =
    abortBehavior === undefined
      ? parentAbortMask
      : abortBehavior === "unabortable"
        ? (increment(parentAbortMask) as AbortMask)
        : abortBehavior.abortMask;

  let state: RunState = runningRunState;
  let exit: RunExit | undefined;
  let snapshot: RunSnapshot | undefined;

  // Keyed by the child Run for snapshot() and removal; the value is the done
  // promise disposal waits on.
  const children = new Map<RunInternal<any>, Promise<void>>();

  // Invariant: requestController records every abort request immediately;
  // signalController only exposes an abort when this Run's mask allows it.
  // Code that must reject new work after shutdown reads requestAbortSignal.
  const requestController = new AbortController();
  const signalController = new AbortController();

  let disposePromise: Promise<RunExit> | undefined;
  let finalizers: AsyncDisposableStack | undefined;
  let finalizerAbortError: AbortError | undefined;

  const reportDefect = (reported: unknown): void => {
    try {
      deps.reportDefect(reported);
    } catch (reporterDefect) {
      reportDefectAfterMicrotask(
        new AggregateError(
          [reported, reporterDefect],
          "ReportDefect failed while reporting a defect",
        ),
      );
    }
  };

  const emitEvent = (data: RunEventData): void => {
    // Run events are observability-only. Handler and event-construction defects
    // are reported, but must not panic the Run or interrupt Task settlement.
    try {
      if (!deps.runConfig?.eventsEnabled.get()) return;
      const event: RunEvent = {
        id: run.id,
        timestamp: (root.deps as TimeDep).time.now(),
        data,
      };
      for (let node: Run | null = run; node; node = node.parent) {
        try {
          node.onEvent?.(event);
        } catch (error) {
          reportDefect(error);
        }
      }
    } catch (error) {
      reportDefect(error);
    }
  };

  // Reads abort reasons from the Run-owned controllers, which are only
  // aborted with AbortError.
  const currentAbort = (): RunAbortState["abort"] => ({
    request: (requestController.signal.reason as AbortError).reason,
    observed: signalController.signal.aborted
      ? (signalController.signal.reason as AbortError).reason
      : null,
  });

  const commitState = (nextState: RunState): void => {
    state = nextState;
    emitEvent({ type: "StateChanged", state });
  };

  const requestAbort = (reason: AbortReason = explicitAbortReason): void => {
    if (requestController.signal.aborted) return;
    const abortError = createAbortError(reason);
    requestController.abort(abortError);
    if (abortMask === abortableMask) signalController.abort(abortError);
    commitState({ type: "Aborted", abort: currentAbort() });
  };

  // The first provided exit claims the Run exit; later exits are ignored. A
  // Run disposed without an exit stays claimable (e.g. by a panic during
  // disposal) until children settle, then the exit defaults to ok(ok()) —
  // root and Run.create Runs have no parent Task to supply one, and a settled
  // Run must record an exit. A panic that claims the exit during disposal is
  // not reflected in the already-aborted controllers, so RunStateSettled.abort
  // can keep runDisposedAbortReason while exit records the panic.
  const dispose = (nextExit?: RunExit): Promise<RunExit> => {
    exit ??= nextExit;

    if (disposePromise) return disposePromise;

    const settle = (): RunExit => {
      exit ??= ok(ok());
      commitState({ type: "Settled", abort: currentAbort(), exit });
      return exit;
    };

    const finalizersToDispose = finalizers;
    if (finalizersToDispose) {
      disposePromise = Promise.all(children.values()).then(async () => {
        try {
          await finalizersToDispose.disposeAsync();
        } catch (error: unknown) {
          finalizerAbortError = root.panic(error);
          exit ??= err(finalizerAbortError);
        }
        return settle();
      });
    } else {
      disposePromise = Promise.all(children.values()).then(settle);
    }

    const abortError = exit?.ok === false ? exit.error : runDisposedAbortError;

    const { aborted } = signalController.signal;
    requestController.abort(abortError);
    signalController.abort(abortError);
    if (!aborted) commitState({ type: "Aborted", abort: currentAbort() });

    return disposePromise;
  };

  // Custom deps replace parent custom deps, so defaults must be picked from
  // the merged deps by key. `satisfies RunDefaultDeps` fails to compile when
  // a newly added required default dep is missing here; optional ones like
  // runConfig must be added manually.
  const createChildDeps = (taskDeps: object | undefined) =>
    taskDeps === undefined
      ? deps
      : {
          ...({
            console: deps.console,
            leakDetector: deps.leakDetector,
            nativeFetch: deps.nativeFetch,
            randomBytes: deps.randomBytes,
            random: deps.random,
            reportDefect: deps.reportDefect,
            time: deps.time,
            ...(deps.runConfig && { runConfig: deps.runConfig }),
          } satisfies RunDefaultDeps),
          ...taskDeps,
        };

  const run = ((
    task: TaskInternal,
    taskDeps?: object,
    { abortable = false }: { abortable?: boolean } = {},
  ) => {
    assertNotDisposed({ disposed: !!disposePromise });

    const taskMeta = task[taskMetaSymbol];

    const taskRun = createRunInternal(
      createChildDeps(taskDeps),
      run,
      root,
      taskMeta,
    );

    // Disposal uses a separate promise because the Fiber starts immediately and
    // gets its rejection handler only after the Task stack is captured.
    const done = Promise.withResolvers<void>();

    children.set(taskRun, done.promise);
    emitEvent({ type: "ChildAdded", childId: taskRun.id });

    // Wired before the Task starts so an already-aborted parent prevents the
    // start via startSignal.throwIfAborted below.
    const abortFromParent = (): void => {
      taskRun.requestAbort(
        (run.requestAbortSignal.reason as AbortError).reason,
      );
    };
    if (run.requestAbortSignal.aborted) abortFromParent();
    else {
      run.requestAbortSignal.addEventListener("abort", abortFromParent, {
        once: true,
        signal: taskRun.requestAbortSignal,
      });
    }

    // The Fiber is runTask's native async-function promise. Keep runTask named:
    // async stack traces use it as the visible Run boundary frame.
    const runTask = async (): Promise<AnyResult> => {
      let exit: RunExit;
      try {
        const startSignal =
          taskMeta?.abortBehavior === "unabortable"
            ? taskRun.requestAbortSignal
            : taskRun.signal;

        const scheduler = globalWithScheduler.scheduler;
        let result: unknown;

        if (taskMeta?.priority && scheduler?.postTask) {
          result = await scheduler.postTask(
            () => {
              startSignal.throwIfAborted();
              // eslint-disable-next-line evolu/no-direct-task-call -- The executor invokes the Task with its child Run.
              return task(taskRun);
            },
            {
              priority: taskMeta.priority,
              signal: startSignal,
            },
          );
        } else {
          startSignal.throwIfAborted();
          // eslint-disable-next-line evolu/no-direct-task-call -- The executor invokes the Task with its child Run.
          result = await task(taskRun);
        }

        // Full Result validation is dev-only; production checks only the
        // boolean `ok` discriminant. This catches common malformed returns
        // without full validation cost.
        assert(
          isDev
            ? UnknownResult.is(result)
            : typeof (result as { readonly ok?: unknown } | null | undefined)
                ?.ok === "boolean",
          "Task must return Result.",
        );

        exit = ok(result as UnknownResult);
      } catch (error: unknown) {
        exit = err(AbortError.is(error) ? error : root.panic(error));
      }

      // Internal Child Run disposal cannot reject; finalizer defects become Err
      // exits. Plain Task Runs settle from the Task exit; only a DisposableRun
      // from Run.create can record an earlier exit.
      const taskExit = await taskRun.dispose(exit);

      // The child is removed once its Run has disposed. Parent bookkeeping
      // tracks internal lifetime, not Fiber observers.
      children.delete(taskRun);
      emitEvent({ type: "ChildRemoved", childId: taskRun.id });
      done.resolve();

      if (taskExit.ok) return taskExit.value;
      if (abortable) return err(taskExit.error);
      // Invariant: the Run tree is every Fiber's final handler: defects are
      // reported, aborts are control flow, and forgotten Fibers are a lint
      // concern. Attach this late so V8 captures the defect stack before any
      // catch observes the Fiber.
      void fiber.catch(constVoid);
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- AbortError is Task abort control flow; aborts intentionally carry no stack.
      throw taskExit.error;
    };

    const fiber = runTask() as Writable<AnyFiber>;

    fiber.run = taskRun;

    if (abortable) {
      const abortableFiber = fiber as Writable<AbortableFiber>;
      abortableFiber.abort = taskRun.requestAbort;
      abortableFiber[Symbol.asyncDispose] = async () => {
        abortableFiber.abort();
        await abortableFiber;
      };
    }

    return fiber;
  }) as RunInternal<D>;

  const root = rootRun ?? run;

  /* eslint-disable @typescript-eslint/no-unsafe-return -- Internal overload assignments implement public generics via TaskInternal. */
  run.orThrow = (async (task: TaskInternal, taskDeps?: object) =>
    getOrThrow(await run(task, taskDeps))) as Run<D>["orThrow"];

  run.ok = (async (task: TaskInternal, taskDeps?: object) =>
    getOk((await run(task, taskDeps)) as Result<any, never>)) as Run<D>["ok"];
  /* eslint-enable @typescript-eslint/no-unsafe-return */

  run.abortable = ((task: TaskInternal, deps?: object) =>
    run(task, deps, { abortable: true })) as Run<D>["abortable"];

  run.daemon = ((task: TaskInternal, taskDeps?: object) => {
    assertNotDisposed({ disposed: !!disposePromise });
    // Invariant: daemons detach to the root lifetime, so they must never start
    // after this Run records abort, even if a mask hides it from run.signal.
    run.requestAbortSignal.throwIfAborted();
    return root.abortable(task, createChildDeps(taskDeps));
  }) as Run<D>["daemon"];

  run.create = ((runDeps) =>
    run.daemon(async (run) => {
      await run.abortable(waitForAbort);
      return ok();
    }, runDeps).run) as Run<D>["create"];

  run.id = createId(deps);
  run.parent = parent ?? null;
  run.deps = deps;
  run.signal = signalController.signal;
  run.requestAbortSignal = requestController.signal;

  run.onAbort = (callback) => {
    const onAbort = (): void => {
      try {
        callback(run.signal.reason as AbortError);
      } catch (error) {
        // Abort callbacks run outside a Fiber result channel.
        root.panic(error);
      }
    };

    if (run.signal.aborted) {
      onAbort();
      return null;
    }

    // A user listener on run.signal calling stopImmediatePropagation could
    // suppress this listener (see the run.signal JSDoc). Switch to
    // addAbortCallback if/when https://github.com/whatwg/dom/pull/1425 lands
    // (free structural fix); use a private signal exposed via AbortSignal.any
    // only if a real-world report ever surfaces (per-Run cost).
    run.signal.addEventListener("abort", onAbort, { once: true });

    return {
      [Symbol.dispose]: () => {
        run.signal.removeEventListener("abort", onAbort);
      },
    };
  };

  run.getState = () => state;

  run.snapshot = () => {
    const childSnapshots = Array.from(children.keys(), (childRun) =>
      childRun.snapshot(),
    );

    if (
      snapshot?.state !== state ||
      !eqArrayStrict(snapshot.children, childSnapshots)
    ) {
      snapshot = {
        id: run.id,
        state,
        children: childSnapshots,
        abortMask,
      };
    }

    return snapshot;
  };

  run.onEvent = undefined;

  run.defer = (finalizer): void => {
    assertNotDisposed({ disposed: !!disposePromise });
    (finalizers ??= new AsyncDisposableStack()).defer(finalizer);
  };

  run.abort = (reason = explicitAbortReason): void => {
    // Unlike panic, abort cannot claim the exit after disposal starts.
    if (disposePromise) return;
    void dispose(err(createAbortError(reason)));
  };

  run.panic = (defect: unknown): AbortError => {
    const abortError = createAbortError(createPanicAbortReason(defect));
    reportDefect(abortError);

    // Internal disposal waits for Run children and does not reject. The first
    // disposal wins, so a later panic does not replace the root Run exit.
    void root.dispose(err(abortError));

    return abortError;
  };

  run[Symbol.dispose] = (): void => {
    void dispose();
  };

  run[Symbol.asyncDispose] = async (): Promise<void> => {
    await dispose();
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- AbortError is Task abort control flow; rethrowing it avoids reporting the finalizer defect twice in Task code.
    if (finalizerAbortError) throw finalizerAbortError;
  };

  // Internal
  run.abortMask = abortMask;
  run.restoreTokens = parent?.restoreTokens ?? emptySet;
  run.requestAbort = requestAbort;
  run.dispose = dispose;

  return run;
};

const withTaskMeta =
  (meta: TaskMeta) =>
  <T, E, D>(task: Task<T, E, D>): Task<T, E, D> => {
    const taskInternal = task as TaskInternal<T, E, D>;
    assert(
      meta.abortBehavior === undefined ||
        taskInternal[taskMetaSymbol]?.abortBehavior === undefined,
      "abort behavior helpers cannot wrap the same Task",
    );
    // eslint-disable-next-line evolu/no-direct-task-call -- Preserve the wrapped Task's child Run.
    const wrapped: TaskInternal<T, E, D> = (run) => task(run);
    const taskMeta = taskInternal[taskMetaSymbol];
    wrapped[taskMetaSymbol] = taskMeta ? { ...taskMeta, ...meta } : meta;
    return wrapped;
  };

// Task helpers

/**
 * A readonly record whose values are {@link Task}s.
 *
 * @group Type utilities
 */
export type TaskRecord = Readonly<Record<string, AnyTask>>;

/**
 * Extracts the dependency intersection required by a readonly Task array.
 *
 * @group Type utilities
 */
export type InferTasksDeps<TTasks extends ReadonlyArray<AnyTask>> =
  ParameterIntersection<
    TTasks[number] extends infer TTask
      ? TTask extends AnyTask
        ? (deps: InferTaskDeps<TTask>) => void
        : never
      : never
  >;

/**
 * Extracts the dependency intersection required by a Task record.
 *
 * @group Type utilities
 */
export type InferTaskRecordDeps<TTasks extends TaskRecord> = InferTasksDeps<
  ReadonlyArray<TTasks[keyof TTasks]>
>;

/**
 * Options shared by Task collection helpers.
 *
 * `concurrency` controls how many Tasks run at once. It defaults to `1`. A
 * platform `availableParallelism()` result is often a good limit for CPU-bound
 * Tasks. For network or database Tasks, choose a limit based on the transport,
 * server, connection pool, and rate limits.
 *
 * Keep concurrency bounded. In rare cases where running every Task concurrently
 * is safe, use {@link maxPositiveInt}.
 *
 * @group Collection
 */
export interface TaskCollectionOptions {
  readonly concurrency?: Int1To100OrPositiveInt;
}

/**
 * Options for {@link all}.
 *
 * @group Collection
 */
export interface AllOptions extends TaskCollectionOptions {
  /** Disables collecting Ok values. */
  readonly collect: false;
}

/**
 * Maps a Task array or record to the Ok values produced by its Tasks.
 *
 * The mapped type is homomorphic, so tuples preserve their shape and records
 * preserve their keys.
 *
 * @group Type utilities
 */
export type InferTasksOk<TTasks> = {
  readonly [K in keyof TTasks]: TTasks[K] extends AnyTask
    ? InferTaskOk<TTasks[K]>
    : never;
};

/**
 * Runs Tasks until all return {@link Ok} or one returns {@link Err}.
 *
 * Returns Ok with all values when every Task returns Ok. Stops on the first
 * Err; remaining running Tasks are aborted. Sequential by default; pass a
 * `concurrency` option to run more than one Task at a time.
 *
 * Pass `{ collect: false }` when only collective success or failure matters.
 * The returned Task produces `void` on success and does not store the Ok
 * values.
 *
 * With a mapping function, maps input values to Tasks before running them. The
 * mapper runs immediately when `all` is called, before the returned Task
 * starts. Array mappers receive `(value, index)`. Record mappers receive
 * `(value, key)`. Mapper defects happen at construction time, so keep mappers
 * pure and cheap.
 *
 * Similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all | Promise.all},
 * but runs Tasks, returns Result values, and aborts remaining Tasks on the
 * first Err.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   all,
 *   createRun,
 *   err,
 *   ok,
 *   type Result,
 *   type Task,
 * } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 * interface Post {
 *   readonly id: string;
 * }
 * const fetchUser: Task<User> = () => ok({ id: "user-1" });
 * const fetchPosts: Task<ReadonlyArray<Post>> = () =>
 *   ok([{ id: "post-1" }]);
 * await using run = createRun();
 *
 * const dashboard = await run(all([fetchUser, fetchPosts]));
 * expectTypeOf(dashboard).toEqualTypeOf<
 *   Result<readonly [User, ReadonlyArray<Post>]>
 * >();
 * expectOk(dashboard, [{ id: "user-1" }, [{ id: "post-1" }]]);
 *
 * // Skip collecting Ok values when they aren't needed.
 * interface SaveUserError {
 *   readonly type: "SaveUserError";
 *   readonly userId: string;
 * }
 * const savedUserIds: Array<string> = [];
 * const saveUser =
 *   (id: string): Task<number, SaveUserError> =>
 *   () => {
 *     if (id === "missing") {
 *       return err({ type: "SaveUserError", userId: id });
 *     }
 *     savedUserIds.push(id);
 *     return ok(1);
 *   };
 * const saveResult = await run(
 *   all(["user-1", "missing", "user-3"], saveUser, {
 *     collect: false,
 *   }),
 * );
 * expectTypeOf(saveResult).toEqualTypeOf<Result<void, SaveUserError>>();
 * expectErr(saveResult, {
 *   type: "SaveUserError",
 *   userId: "missing",
 * });
 * expect(savedUserIds).toEqual(["user-1"]);
 * ```
 *
 * @group Collection
 */
export function all<const TTasks extends ReadonlyArray<AnyTask>>(
  tasks: TTasks,
  options: AllOptions,
): Task<void, InferTaskErr<TTasks[number]>, InferTasksDeps<TTasks>>;

/** Runs a Task record without collecting its Ok values. */
export function all<const TTasks extends TaskRecord>(
  tasks: TTasks,
  options: AllOptions,
): Task<void, InferTaskErr<TTasks[keyof TTasks]>, InferTaskRecordDeps<TTasks>>;

export function all<const TTasks extends ReadonlyArray<AnyTask>>(
  tasks: TTasks,
  options?: TaskCollectionOptions,
): Task<
  InferTasksOk<TTasks>,
  InferTaskErr<TTasks[number]>,
  InferTasksDeps<TTasks>
>;

/**
 * Runs a Task record and preserves its keys.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   all,
 *   createRun,
 *   ok,
 *   type Result,
 *   type Task,
 * } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 * interface Post {
 *   readonly id: string;
 * }
 *
 * const fetchUser: Task<User> = () => ok({ id: "user-1" });
 * const fetchPosts: Task<ReadonlyArray<Post>> = () =>
 *   ok([{ id: "post-1" }]);
 *
 * await using run = createRun();
 * const result = await run(all({ user: fetchUser, posts: fetchPosts }));
 *
 * expectTypeOf(result).toEqualTypeOf<
 *   Result<{ readonly user: User; readonly posts: ReadonlyArray<Post> }>
 * >();
 * expectOk(result, {
 *   user: { id: "user-1" },
 *   posts: [{ id: "post-1" }],
 * });
 * ```
 */
export function all<const TTasks extends TaskRecord>(
  tasks: TTasks,
  options?: TaskCollectionOptions,
): Task<
  InferTasksOk<TTasks>,
  InferTaskErr<TTasks[keyof TTasks]>,
  InferTaskRecordDeps<TTasks>
>;

/**
 * Maps an array to Tasks and preserves its shape.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   all,
 *   createRun,
 *   ok,
 *   type Result,
 *   type Task,
 * } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 * const loadUser =
 *   (id: string): Task<User> =>
 *   () =>
 *     ok({ id });
 *
 * const userIds = ["user-1", "user-2"] as const;
 * const indexes: Array<number> = [];
 * const loadUsers = all(userIds, (id, index) => {
 *   indexes.push(index);
 *   return loadUser(id);
 * });
 *
 * // Mapping is eager: it happens before the returned Task starts.
 * expect(indexes).toEqual([0, 1]);
 *
 * await using run = createRun();
 * const result = await run(loadUsers);
 * expectTypeOf(result).toEqualTypeOf<Result<readonly [User, User]>>();
 * expectOk(result, [{ id: "user-1" }, { id: "user-2" }]);
 * ```
 */
export function all<
  const TValues extends ReadonlyArray<unknown>,
  TTask extends AnyTask,
>(
  values: TValues,
  fn: (value: TValues[number], index: number) => TTask,
  options: AllOptions,
): Task<void, InferTaskErr<TTask>, InferTasksDeps<ReadonlyArray<TTask>>>;

/** Maps record values to Tasks without collecting their Ok values. */
export function all<
  const TValues extends Readonly<Record<string, unknown>>,
  TTask extends AnyTask,
>(
  values: TValues,
  // eslint-disable-next-line @typescript-eslint/unified-signatures -- Separate array and record overloads keep callback parameter inference precise.
  fn: (value: TValues[keyof TValues], key: keyof TValues) => TTask,
  options: AllOptions,
): Task<void, InferTaskErr<TTask>, InferTasksDeps<ReadonlyArray<TTask>>>;

export function all<
  const TValues extends ReadonlyArray<unknown>,
  TTask extends AnyTask,
>(
  values: TValues,
  fn: (value: TValues[number], index: number) => TTask,
  options?: TaskCollectionOptions,
): Task<
  { readonly [K in keyof TValues]: InferTaskOk<TTask> },
  InferTaskErr<TTask>,
  InferTasksDeps<ReadonlyArray<TTask>>
>;

/**
 * Maps record values to Tasks and preserves its keys.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   all,
 *   createRun,
 *   ok,
 *   type Result,
 *   type Task,
 * } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 * const loadUser =
 *   (id: string): Task<User> =>
 *   () =>
 *     ok({ id });
 *
 * const userIdsByRole = {
 *   admin: "user-1",
 *   reviewer: "user-2",
 * } as const;
 * const roles: Array<keyof typeof userIdsByRole> = [];
 * const loadUsersByRole = all(userIdsByRole, (id, role) => {
 *   roles.push(role);
 *   return loadUser(id);
 * });
 *
 * // Mapping is eager: it happens before the returned Task starts.
 * expect(roles).toEqual(["admin", "reviewer"]);
 *
 * await using run = createRun();
 * const result = await run(loadUsersByRole);
 * expectTypeOf(result).toEqualTypeOf<
 *   Result<{ readonly admin: User; readonly reviewer: User }>
 * >();
 * expectOk(result, {
 *   admin: { id: "user-1" },
 *   reviewer: { id: "user-2" },
 * });
 * ```
 */
export function all<
  const TValues extends Readonly<Record<string, unknown>>,
  TTask extends AnyTask,
>(
  values: TValues,
  // eslint-disable-next-line @typescript-eslint/unified-signatures -- Separate array and record overloads keep callback parameter inference precise.
  fn: (value: TValues[keyof TValues], key: keyof TValues) => TTask,
  options?: TaskCollectionOptions,
): Task<
  { readonly [K in keyof TValues]: InferTaskOk<TTask> },
  InferTaskErr<TTask>,
  InferTasksDeps<ReadonlyArray<TTask>>
>;
export function all(
  input: ReadonlyArray<unknown> | Readonly<Record<string, unknown>>,
  fnOrOptions?:
    | ((value: any, indexOrKey: any) => AnyTask)
    | AllOptions
    | TaskCollectionOptions,
  options?: AllOptions | TaskCollectionOptions,
): Task<unknown, unknown> {
  const fn = typeof fnOrOptions === "function" ? fnOrOptions : undefined;
  const collectionOptions =
    typeof fnOrOptions === "function" ? options : fnOrOptions;
  const collectValues =
    collectionOptions === undefined ||
    !("collect" in collectionOptions) ||
    collectionOptions.collect !== false;

  return collect(
    "all",
    fn ? mapInput(input, fn) : (input as ReadonlyArray<AnyTask> | TaskRecord),
    collectionOptions,
    collectValues,
  );
}

/**
 * Maps a Task array or record to the Result values produced by its Tasks.
 *
 * The mapped type is homomorphic, so tuples preserve their shape and records
 * preserve their keys.
 *
 * @group Type utilities
 */
export type InferTasksSettled<TTasks> = {
  readonly [K in keyof TTasks]: TTasks[K] extends AnyTask
    ? Result<InferTaskOk<TTasks[K]>, InferTaskErr<TTasks[K]>>
    : never;
};

/**
 * Runs all Tasks and returns every Task {@link Result}.
 *
 * Unlike {@link all}, {@link Err} Results do not stop later Tasks.
 *
 * With a mapping function, maps input values to Tasks before running them. The
 * mapper runs immediately when `allSettled` is called, before the returned Task
 * starts. Array mappers receive `(value, index)`. Record mappers receive
 * `(value, key)`. Mapper defects happen at construction time, so keep mappers
 * pure and cheap.
 *
 * Sequential by default; pass a `concurrency` option to run more than one Task
 * at a time.
 *
 * Similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled | Promise.allSettled},
 * but runs Tasks and returns Result values.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   allSettled,
 *   createRun,
 *   err,
 *   ok,
 *   type Result,
 *   type Task,
 * } from "@evolu/common";
 *
 * interface LoadError {
 *   readonly type: "LoadError";
 * }
 *
 * const loadProfile: Task<string, LoadError> = () =>
 *   err({ type: "LoadError" });
 * let activityLoaded = false;
 * const loadActivity: Task<ReadonlyArray<string>> = () => {
 *   activityLoaded = true;
 *   return ok(["signed-in"]);
 * };
 *
 * await using run = createRun();
 * const results = await run(allSettled([loadProfile, loadActivity]));
 * expectTypeOf(results).toEqualTypeOf<
 *   Result<
 *     readonly [Result<string, LoadError>, Result<ReadonlyArray<string>>]
 *   >
 * >();
 * expectOk(results, [
 *   { ok: false, error: { type: "LoadError" } },
 *   { ok: true, value: ["signed-in"] },
 * ]);
 * // Unlike all, a later Task still runs after an Err.
 * expect(activityLoaded).toBe(true);
 * ```
 *
 * @group Collection
 */
export function allSettled<const TTasks extends ReadonlyArray<AnyTask>>(
  tasks: TTasks,
  options?: TaskCollectionOptions,
): Task<InferTasksSettled<TTasks>, never, InferTasksDeps<TTasks>>;

/**
 * Runs a Task record and preserves its keys.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   allSettled,
 *   createRun,
 *   err,
 *   ok,
 *   type Result,
 *   type Task,
 * } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 * interface LoadError {
 *   readonly type: "LoadError";
 * }
 * const fetchUser: Task<User> = () => ok({ id: "user-1" });
 * const fetchProfile: Task<string, LoadError> = () =>
 *   err({ type: "LoadError" });
 *
 * await using run = createRun();
 * const results = await run(
 *   allSettled({ user: fetchUser, profile: fetchProfile }),
 * );
 *
 * expectTypeOf(results).toEqualTypeOf<
 *   Result<{
 *     readonly user: Result<User>;
 *     readonly profile: Result<string, LoadError>;
 *   }>
 * >();
 * expectOk(results, {
 *   user: { ok: true, value: { id: "user-1" } },
 *   profile: { ok: false, error: { type: "LoadError" } },
 * });
 * ```
 */
export function allSettled<const TTasks extends TaskRecord>(
  tasks: TTasks,
  options?: TaskCollectionOptions,
): Task<InferTasksSettled<TTasks>, never, InferTaskRecordDeps<TTasks>>;

/**
 * Maps an array to Tasks and preserves its shape.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   allSettled,
 *   createRun,
 *   err,
 *   ok,
 *   type Result,
 *   type Task,
 * } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 * interface LoadError {
 *   readonly type: "LoadError";
 * }
 * const loadUser =
 *   (id: string): Task<User, LoadError> =>
 *   () =>
 *     id === "missing" ? err({ type: "LoadError" }) : ok({ id });
 *
 * const userIds = ["user-1", "missing"] as const;
 * const indexes: Array<number> = [];
 * const loadUsers = allSettled(userIds, (id, index) => {
 *   indexes.push(index);
 *   return loadUser(id);
 * });
 *
 * // Mapping is eager: it happens before the returned Task starts.
 * expect(indexes).toEqual([0, 1]);
 *
 * await using run = createRun();
 * const results = await run(loadUsers);
 * expectTypeOf(results).toEqualTypeOf<
 *   Result<readonly [Result<User, LoadError>, Result<User, LoadError>]>
 * >();
 * expectOk(results, [
 *   { ok: true, value: { id: "user-1" } },
 *   { ok: false, error: { type: "LoadError" } },
 * ]);
 * ```
 */
export function allSettled<
  const TValues extends ReadonlyArray<unknown>,
  TTask extends AnyTask,
>(
  values: TValues,
  fn: (value: TValues[number], index: number) => TTask,
  options?: TaskCollectionOptions,
): Task<
  {
    readonly [K in keyof TValues]: Result<
      InferTaskOk<TTask>,
      InferTaskErr<TTask>
    >;
  },
  never,
  InferTasksDeps<ReadonlyArray<TTask>>
>;

/**
 * Maps record values to Tasks and preserves its keys.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   allSettled,
 *   createRun,
 *   err,
 *   ok,
 *   type Result,
 *   type Task,
 * } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 * interface LoadError {
 *   readonly type: "LoadError";
 * }
 * const loadUser =
 *   (id: string): Task<User, LoadError> =>
 *   () =>
 *     id === "missing" ? err({ type: "LoadError" }) : ok({ id });
 *
 * const userIdsByRole = { admin: "user-1", reviewer: "missing" } as const;
 * const roles: Array<keyof typeof userIdsByRole> = [];
 * const loadUsersByRole = allSettled(userIdsByRole, (id, role) => {
 *   roles.push(role);
 *   return loadUser(id);
 * });
 *
 * // Mapping is eager: it happens before the returned Task starts.
 * expect(roles).toEqual(["admin", "reviewer"]);
 *
 * await using run = createRun();
 * const results = await run(loadUsersByRole);
 * expectTypeOf(results).toEqualTypeOf<
 *   Result<{
 *     readonly admin: Result<User, LoadError>;
 *     readonly reviewer: Result<User, LoadError>;
 *   }>
 * >();
 * expectOk(results, {
 *   admin: { ok: true, value: { id: "user-1" } },
 *   reviewer: { ok: false, error: { type: "LoadError" } },
 * });
 * ```
 */
export function allSettled<
  const TValues extends Readonly<Record<string, unknown>>,
  TTask extends AnyTask,
>(
  values: TValues,
  // eslint-disable-next-line @typescript-eslint/unified-signatures -- Separate array and record overloads keep callback parameter inference precise.
  fn: (value: TValues[keyof TValues], key: keyof TValues) => TTask,
  options?: TaskCollectionOptions,
): Task<
  {
    readonly [K in keyof TValues]: Result<
      InferTaskOk<TTask>,
      InferTaskErr<TTask>
    >;
  },
  never,
  InferTasksDeps<ReadonlyArray<TTask>>
>;
export function allSettled(
  input: ReadonlyArray<unknown> | Readonly<Record<string, unknown>>,
  fnOrOptions?:
    ((value: any, indexOrKey: any) => AnyTask) | TaskCollectionOptions,
  options?: TaskCollectionOptions,
): Task<unknown, unknown> {
  const fn = typeof fnOrOptions === "function" ? fnOrOptions : undefined;
  return collect(
    "allSettled",
    fn ? mapInput(input, fn) : (input as ReadonlyArray<AnyTask> | TaskRecord),
    typeof fnOrOptions === "function" ? options : fnOrOptions,
  );
}

const collect =
  (
    type: "all" | "allSettled",
    input: ReadonlyArray<AnyTask> | TaskRecord,
    options?: TaskCollectionOptions,
    collectValues = true,
  ): Task<unknown, unknown> =>
  async (run) => {
    let tasks: NonEmptyReadonlyArray<AnyTask>;
    let getValue: (values: ReadonlyArray<unknown>) => unknown;

    if (Array.isArray(input)) {
      if (!isNonEmptyArray(input)) {
        return collectValues ? ok(emptyArray) : ok();
      }

      tasks = input;
      getValue = identity;
    } else {
      const entries = objectToEntries(input as TaskRecord);
      if (!isNonEmptyArray(entries)) {
        return collectValues ? ok(emptyRecord) : ok();
      }

      tasks = mapArray(entries, ([, task]) => task);
      getValue = (values) =>
        objectFromEntries(entries.map(([key], index) => [key, values[index]]));
    }

    const values: Array<unknown> | undefined = collectValues ? [] : undefined;
    let firstErr: Err<unknown> | undefined;

    await run(
      each(
        tasks,
        (result, index) => {
          if (type === "allSettled") {
            values![index] = result;
            return "continue";
          }

          if (!result.ok) {
            firstErr = result;
            return "stop";
          }

          if (values) values[index] = result.value;
          return "continue";
        },
        options,
      ),
    );

    return firstErr ?? (values ? ok(getValue(values)) : ok());
  };

const mapInput = (
  input: ReadonlyArray<unknown> | Readonly<Record<string, unknown>>,
  fn: (value: any, indexOrKey: any) => AnyTask,
): ReadonlyArray<AnyTask> | TaskRecord =>
  Array.isArray(input)
    ? mapArray(input, (value, index) => fn(value, index))
    : mapObject(input as Readonly<Record<string, unknown>>, fn);

/**
 * Creates a {@link Task} from a callback-based API.
 *
 * Use this to wrap callback-style APIs such as event listeners and Node.js
 * callbacks. Resolve with `ok(value)` or `err(error)`, or reject with a defect,
 * to complete the Task. Settlement is one-shot: the first `resolve` or `reject`
 * wins, and later settlement calls are ignored, matching Promise semantics.
 * When `reject` wins settlement, the defect panics the Run tree and is observed
 * at Fiber boundaries as {@link AbortError} with {@link PanicAbortReason}.
 * Rejecting AbortError is reserved for Task abort control flow: direct
 * `run(task)` rejects with it, and `run.abortable(task)` returns it as an Err.
 *
 * This helper is a callback bridge. If `reject` forwards an Error created in a
 * separate async chain, V8 cannot reconstruct the caller's zero-cost async
 * stack through this bridge. Prefer native promise APIs and `await` when the
 * wrapped operation already has a promise-shaped API.
 *
 * One-shot settlement applies only to `resolve` and `reject`. A synchronous
 * throw from the setup function is a defect that panics the Run tree even after
 * `resolve` was called — setup throws are bugs and must not be masked by an
 * earlier resolution.
 *
 * Optionally return a synchronous cleanup callback. It runs when the Task Run
 * signal aborts, including normal completion and explicit abort. The callback
 * must not throw. Cleanup defects panic the root Run; if the callback Task
 * already settled, its Fiber keeps the original Result while the root still
 * reports the panic. Cleanup must be synchronous; returned promises are not
 * awaited. For async cleanup, prefer {@link acquireUseRelease}, `await using`
 * with {@link AsyncDisposableStack}, or a Task that owns the resource
 * explicitly.
 *
 * If setup can throw after acquiring any resource, use a local
 * {@link DisposableStack} before returning cleanup. Register each cleanup as
 * soon as the resource is acquired, then move the disposer and return a cleanup
 * callback. If setup throws before cleanup is returned, the local `using`
 * disposal releases already-acquired resources.
 *
 * ### Example
 *
 * ```ts
 * import { callback, createRun, ok, type Task } from "@evolu/common";
 *
 * const listeners = new Set<(message: string) => void>();
 * const subscribe = (
 *   listener: (message: string) => void,
 * ): (() => void) => {
 *   listeners.add(listener);
 *   return () => listeners.delete(listener);
 * };
 * const nextMessage: Task<string> = callback(({ resolve }) =>
 *   subscribe((message) => resolve(ok(message))),
 * );
 *
 * await using run = createRun();
 * const fiber = run(nextMessage);
 * expect(listeners.size).toBe(1);
 * for (const listener of listeners) listener("ready");
 * expectOk(await fiber, "ready");
 * // The callback cleanup unsubscribes after settlement.
 * expect(listeners.size).toBe(0);
 * ```
 *
 * @group Interop
 */
export const callback =
  <T, E = never, D = unknown>(
    fn: (options: {
      readonly run: Run<D>;
      readonly resolve: (result: Result<T, E>) => void;
      readonly reject: (defect: unknown) => void;
    }) => (() => void) | void,
  ): Task<T, E, D> =>
  (run) => {
    const { promise, resolve, reject } = Promise.withResolvers<Result<T, E>>();
    const cleanup = fn({ run, resolve, reject });

    // The Task Run aborts during disposal, so this also runs callback cleanup
    // after normal settlement. The abort listener is once-only.
    run.onAbort((abortError) => {
      reject(abortError);
      cleanup?.();
    });

    return promise;
  };

/**
 * Pauses execution for a specified {@link PositiveDuration}.
 *
 * Aborting the Task clears the scheduled timeout.
 *
 * @group Timing
 */
export const sleep = (duration: PositiveDuration): Task<void> =>
  callback(({ run: { deps }, resolve }) => {
    const id = deps.time.setTimeout(() => resolve(ok()), duration);
    return () => deps.time.clearTimeout(id);
  });

/**
 * Typed error returned by {@link timeout} when a Task exceeds its duration.
 *
 * @group Timing
 */
export const TimeoutError: TypedType<"TimeoutError"> =
  /*#__PURE__*/ typed("TimeoutError");
export interface TimeoutError extends InferType<typeof TimeoutError> {}

/**
 * The {@link TimeoutError} instance returned by {@link timeout}.
 *
 * @group Timing
 */
export const timeoutError: TimeoutError = { type: "TimeoutError" };

/**
 * Limits how long a {@link Task} may run.
 *
 * Returns the Task {@link Result} when it settles within the duration.
 * Otherwise, the Task is aborted and {@link TimeoutError} is returned. A Task
 * that doesn't observe abort delays the TimeoutError until it settles; when
 * that wait is unacceptable, wrap the Task with {@link daemon}:
 * `timeout(daemon(task), duration)`.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createRun,
 *   timeout,
 *   timeoutError,
 *   waitForAbort,
 *   type Result,
 *   type TimeoutError,
 * } from "@evolu/common";
 *
 * await using run = createRun();
 *
 * const result = await run(timeout(waitForAbort, "1ms"));
 * expectTypeOf(result).toEqualTypeOf<Result<never, TimeoutError>>();
 * expectErr(result, timeoutError);
 * ```
 *
 * @group Timing
 */
export const timeout = <T, E, D = unknown>(
  task: Task<T, E, D>,
  duration: PositiveDuration,
): Task<T, E | TimeoutError, D> =>
  race([
    task,
    async (run) => {
      await run.ok(sleep(duration));
      return err(timeoutError);
    },
  ]);

/**
 * Options for {@link retry}.
 *
 * @group Resilience
 */
export interface RetryOptions<E, Output> {
  /**
   * Decides whether a domain error should schedule another attempt.
   *
   * Returning `false` stops retrying and returns {@link RetryError}. The
   * original error is stored as `lastError` instead of returned directly. The
   * predicate must not throw: a thrown exception is a defect that panics the
   * Run tree.
   */
  readonly shouldRetry?: Predicate<E>;

  /**
   * Runs before each scheduled retry.
   *
   * `attempt` is the failed attempt that caused this retry, not the upcoming
   * attempt number. The callback runs after {@link RetryOptions.shouldRetry} and
   * the {@link Schedule} approve a retry, and before the retry delay. The
   * callback must not throw: a thrown exception is a defect that panics the Run
   * tree.
   */
  readonly onRetry?: (attempt: RetryAttempt<E, Output>) => void;
}

/**
 * Information passed to {@link RetryOptions.onRetry}.
 *
 * @group Resilience
 */
export interface RetryAttempt<E, Output> extends ScheduleStep<Output> {
  /** The domain error returned by the failed attempt. */
  readonly error: E;
}

/**
 * Error returned by {@link retry} when retrying stops after a domain error.
 *
 * @group Resilience
 */
export interface RetryError<E> extends Typed<"RetryError"> {
  /** The final domain error that stopped retrying. */
  readonly lastError: E;
  /** The number of attempts that were started. */
  readonly attempts: PositiveInt;
}

/**
 * Error type returned by {@link retry}.
 *
 * @group Resilience
 */
export type RetryTaskError<E> =
  // Wrap all non-abort errors in one RetryError, preserving their union.
  | ([Exclude<E, AbortError>] extends [never]
      ? never
      : RetryError<Exclude<E, AbortError>>)
  // AbortError is control flow, so retry returns it unchanged.
  | Extract<E, AbortError>;

/**
 * Retries a Task according to a {@link Schedule}.
 *
 * Use `retry` for failure recovery: it repeats after {@link Err} and wraps the
 * final domain error. Use {@link repeat} for success-driven loops: it repeats
 * after {@link Ok} and returns the Task's natural Result.
 *
 * {@link AbortError} passes through unchanged when returned as a Result error,
 * such as from {@link daemon}. Abort from `run(task)` remains Fiber control
 * flow. Other errors are domain errors: retrying continues while the schedule
 * yields another delay and {@link RetryOptions.shouldRetry} returns `true`. When
 * retrying stops, `retry` returns {@link RetryError} with the final domain error
 * as `lastError`.
 *
 * AbortError recognition is structural. Domain errors, especially values parsed
 * from untrusted input, must not use the reserved AbortError shape.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createRun,
 *   err,
 *   recurs,
 *   retry,
 *   type Result,
 *   type RetryTaskError,
 *   type Task,
 * } from "@evolu/common";
 *
 * await using run = createRun();
 *
 * interface FetchDataError {
 *   readonly type: "FetchDataError";
 * }
 *
 * const fetchData: Task<string, FetchDataError> = () =>
 *   err({ type: "FetchDataError" });
 *
 * const fetchWithRetry = retry(fetchData, recurs(2));
 *
 * const result = await run(fetchWithRetry);
 * expectTypeOf(result).toEqualTypeOf<
 *   Result<string, RetryTaskError<FetchDataError>>
 * >();
 * expectErr(result, {
 *   type: "RetryError",
 *   attempts: 3,
 *   lastError: { type: "FetchDataError" },
 * });
 * ```
 *
 * ### Example
 *
 * ```ts
 * import { createRun, err, recurs, retry, type Task } from "@evolu/common";
 *
 * interface FetchDataError {
 *   readonly type: "RecoverableError" | "FatalError";
 * }
 *
 * const fetchData: Task<string, FetchDataError> = () =>
 *   err({ type: "FatalError" });
 *
 * const fetchWithRetry = retry(fetchData, recurs(5), {
 *   shouldRetry: (error) => error.type !== "FatalError",
 * });
 *
 * await using run = createRun();
 * expectErr(await run(fetchWithRetry), {
 *   type: "RetryError",
 *   attempts: 1,
 *   lastError: { type: "FatalError" },
 * });
 * ```
 *
 * @group Resilience
 */
export const retry =
  <T, E, D = unknown, Output = unknown>(
    task: Task<T, E, D>,
    schedule: Schedule<Output, Exclude<E, AbortError>>,
    {
      shouldRetry = constTrue,
      onRetry,
    }: RetryOptions<Exclude<E, AbortError>, Output> = {},
  ): Task<T, RetryTaskError<E>, D> =>
  async (run) => {
    const step = schedule(run.deps);
    let attempt = onePositiveInt;

    const createRetryError = (
      lastError: Exclude<E, AbortError>,
    ): RetryTaskError<E> =>
      ({
        type: "RetryError",
        lastError,
        attempts: attempt,
      }) as RetryTaskError<E>;

    for (;;) {
      const result = await run(task);
      if (result.ok) return result;

      if (AbortError.is(result.error))
        return result as Result<T, RetryTaskError<E>>;

      const error = result.error as Exclude<E, AbortError>;
      if (!shouldRetry(error)) return err(createRetryError(error));

      const next = step(error);
      if (!next.ok) return err(createRetryError(error));

      const [output, delay] = next.value;
      onRetry?.({ error, attempt, output, delay });
      attempt = incrementPositiveInt(attempt);
      if (delay > 0) await run.ok(sleep(PositiveMillis.orThrow(delay)));
    }
  };

/**
 * Options for {@link repeat}.
 *
 * @group Repetition
 */
export interface RepeatOptions<T, Output> {
  /**
   * Decides whether an Ok value should schedule another repeat.
   *
   * The predicate must not throw: a thrown exception is a defect that panics
   * the Run tree.
   */
  readonly shouldRepeat?: Predicate<T>;

  /**
   * Runs before each scheduled repeat.
   *
   * `attempt` is the completed attempt that caused this repeat, not the
   * upcoming attempt number. The callback runs after
   * {@link RepeatOptions.shouldRepeat} and the {@link Schedule} approve a repeat,
   * and before the repeat delay. The callback must not throw: a thrown
   * exception is a defect that panics the Run tree.
   */
  readonly onRepeat?: (attempt: RepeatAttempt<T, Output>) => void;
}

/**
 * Information passed to {@link RepeatOptions.onRepeat}.
 *
 * @group Repetition
 */
export interface RepeatAttempt<T, Output> extends ScheduleStep<Output> {
  /** The Ok value returned by the completed attempt. */
  readonly value: T;
}

/**
 * Repeats a Task according to a {@link Schedule}.
 *
 * Runs the Task once, then repeats while the Task returns {@link Ok}, the
 * schedule yields another delay, and {@link RepeatOptions.shouldRepeat} returns
 * `true`. When repeating stops, `repeat` returns the last successful Result. If
 * the Task returns {@link Err}, including {@link Done} from a {@link NextTask},
 * `repeat` returns that error without scheduling another attempt.
 *
 * Use `repeat` for success-driven loops such as polling or consuming a
 * NextTask: it repeats after Ok and returns the Task's natural Result. Use
 * {@link retry} for failure recovery: it repeats after Err and wraps the final
 * domain error in {@link RetryError}.
 *
 * With `take(n)`, the Task runs n+1 times: the initial attempt plus n repeats.
 *
 * ### Example
 *
 * ```ts
 * import { createRun, ok, recurs, repeat, type Task } from "@evolu/common";
 *
 * let attempts = 0;
 * const checkStatus: Task<string> = () => {
 *   attempts += 1;
 *   return ok("pending");
 * };
 *
 * const poll = repeat(checkStatus, recurs(3));
 *
 * await using run = createRun();
 * expectOk(await run(poll), "pending");
 * expect(attempts).toBe(4);
 * ```
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createRun,
 *   done,
 *   err,
 *   ok,
 *   repeat,
 *   spaced,
 *   type NextTask,
 * } from "@evolu/common";
 *
 * await using run = createRun();
 *
 * interface Item {
 *   readonly id: string;
 * }
 *
 * const queue: Array<Item> = [{ id: "item-1" }];
 *
 * const processQueue: NextTask<Item> = () => {
 *   const item = queue.shift();
 *   return item ? ok(item) : err(done());
 * };
 *
 * const result = await run(repeat(processQueue, spaced("1ms")));
 * expectErr(result, done());
 * expect(queue).toEqual([]);
 * ```
 *
 * @group Repetition
 */
export const repeat =
  <T, E, D = unknown, Output = unknown>(
    task: Task<T, E, D>,
    schedule: Schedule<Output, T>,
    { shouldRepeat = constTrue, onRepeat }: RepeatOptions<T, Output> = {},
  ): Task<T, E, D> =>
  async (run) => {
    const step = schedule(run.deps);
    let attempt = onePositiveInt;

    for (;;) {
      const result = await run(task);
      if (!result.ok) return result;

      if (!shouldRepeat(result.value)) return result;

      const next = step(result.value);
      if (!next.ok) return result;

      const [output, delay] = next.value;
      onRepeat?.({ value: result.value, attempt, output, delay });
      attempt = incrementPositiveInt(attempt);
      if (delay > 0) await run.ok(sleep(PositiveMillis.orThrow(delay)));
    }
  };

/**
 * Extracts the Result type produced by one Task in a non-empty Task array.
 *
 * @internal
 */
export type InferTasksResult<TTasks extends NonEmptyReadonlyArray<AnyTask>> =
  Result<InferTaskOk<TTasks[number]>, InferTaskErr<TTasks[number]>>;

/**
 * Runs Tasks until one returns {@link Ok} or all return {@link Err}.
 *
 * Use {@link race} to return the first settled Result instead, whether Ok or
 * {@link Err}.
 *
 * Returns the first {@link Ok} Result. Losing Tasks are aborted. If no Task
 * returns Ok, returns the last Err by input order, regardless of completion
 * order. Other Err results are discarded; use {@link allSettled} when you need
 * every error.
 *
 * Sequential by default; pass a `concurrency` option to run more than one Task
 * at a time.
 *
 * Similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/any | Promise.any},
 * but races Tasks, returns Result values, and aborts losers.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   any,
 *   createRun,
 *   err,
 *   ok,
 *   type Result,
 *   type Task,
 * } from "@evolu/common";
 *
 * const unavailable: Task<string, "Unavailable"> = () =>
 *   err("Unavailable");
 * let fallbackStarted = false;
 * const fallback: Task<string> = () => {
 *   fallbackStarted = true;
 *   return ok("fallback");
 * };
 *
 * await using run = createRun();
 * const result = await run(any([unavailable, fallback]));
 *
 * expectTypeOf(result).toEqualTypeOf<Result<string, "Unavailable">>();
 * expectOk(result, "fallback");
 * expect(fallbackStarted).toBe(true);
 * ```
 *
 * @group Racing
 */
export const any =
  <TTasks extends NonEmptyReadonlyArray<AnyTask>>(
    tasks: TTasks,
    options?: TaskCollectionOptions,
  ): Task<
    InferTaskOk<TTasks[number]>,
    InferTaskErr<TTasks[number]>,
    InferTasksDeps<TTasks>
  > =>
  async (run) => {
    let firstOk: InferTasksResult<TTasks> | undefined;
    let lastErr: InferTasksResult<TTasks> | undefined;
    let lastErrIndex = -1;

    await run(
      each(
        tasks,
        (result, index) => {
          if (result.ok) {
            firstOk = result;
            return "stop";
          }

          if (index > lastErrIndex) {
            lastErrIndex = index;
            lastErr = result;
          }

          return "continue";
        },
        options,
      ),
    );

    if (firstOk) return firstOk;

    assertNonNullable(lastErr);
    return lastErr;
  };

/**
 * Runs Tasks until the first Task settles.
 *
 * Returns the first Task {@link Result} to settle, whether {@link Ok} or
 * {@link Err}.
 *
 * Use {@link any} to wait for the first Ok instead.
 *
 * Losing Tasks are aborted.
 *
 * Tasks always run concurrently because racing sequentially would be
 * meaningless.
 *
 * Similar to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race | Promise.race},
 * but races Tasks, returns Result values, and aborts losers.
 *
 * Requires a non-empty array: zero Tasks have no meaningful first settled
 * Result. This is enforced at compile time for non-empty tuple types. For
 * arrays whose emptiness is only known at runtime, guard with
 * {@link isNonEmptyArray}:
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createRun,
 *   isNonEmptyArray,
 *   ok,
 *   race,
 *   type Task,
 * } from "@evolu/common";
 *
 * const tasks: ReadonlyArray<Task<string>> = [() => ok("first")];
 * await using run = createRun();
 * if (isNonEmptyArray(tasks)) {
 *   const result = await run(race(tasks));
 *   expectOk(result, "first");
 * }
 * ```
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createRun,
 *   ok,
 *   race,
 *   sleep,
 *   type Result,
 *   type Task,
 * } from "@evolu/common";
 *
 * await using run = createRun();
 *
 * const fast: Task<string> = () => ok("fast");
 * let slowCompleted = false;
 * const slow: Task<string> = async (run) => {
 *   await run.ok(sleep("10ms"));
 *   slowCompleted = true;
 *   return ok("slow");
 * };
 *
 * // Input order does not matter: the first settled Result wins, and the
 * // still-running loser is aborted.
 * const result = await run(race([slow, fast]));
 * expectTypeOf(result).toEqualTypeOf<Result<string>>();
 * expectOk(result, "fast");
 * expect(slowCompleted).toBe(false);
 * ```
 *
 * @group Racing
 */
export const race =
  <TTasks extends NonEmptyReadonlyArray<AnyTask>>(
    tasks: TTasks,
  ): Task<
    InferTaskOk<TTasks[number]>,
    InferTaskErr<TTasks[number]>,
    InferTasksDeps<TTasks>
  > =>
  async (run) => {
    assertNonEmptyReadonlyArray(tasks);

    let firstResult: InferTasksResult<TTasks> | undefined;

    await run(
      each(
        tasks,
        (result) => {
          firstResult = result;
          return "stop";
        },
        { concurrency: tasks.length as PositiveInt },
      ),
    );

    assertNonNullable(firstResult);
    return firstResult;
  };

/**
 * Runs Tasks until `count` Tasks return {@link Ok} or all Tasks settle.
 *
 * Returns {@link Ok} with Ok values in settlement order, not input order.
 * {@link Err} Results are ignored. When `count` Ok values have settled,
 * remaining Tasks are aborted. If fewer than `count` Tasks return Ok, returns
 * the Ok values that did settle.
 *
 * Sequential by default; pass a `concurrency` option to run more than one Task
 * at a time. The count uses {@link Int1To100OrPositiveInt}: pass `1` to `100` as
 * a literal, or a validated {@link PositiveInt} for larger values.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createRun,
 *   err,
 *   firstN,
 *   ok,
 *   sleep,
 *   type Task,
 * } from "@evolu/common";
 *
 * let slowCompleted = false;
 * const slow: Task<string, "Failed"> = async (run) => {
 *   await run.ok(sleep("10ms"));
 *   slowCompleted = true;
 *   return ok("slow");
 * };
 * const tasks = [
 *   slow,
 *   () => err("Failed" as const),
 *   () => ok("fast-1"),
 *   () => ok("fast-2"),
 * ] as const;
 * await using run = createRun();
 *
 * // Errs do not count. After two Ok values settle, the slow Task is aborted.
 * const result = await run(firstN(tasks, 2, { concurrency: 4 }));
 * expectOk(result, ["fast-1", "fast-2"]);
 * expect(slowCompleted).toBe(false);
 * ```
 *
 * @group Racing
 */
export const firstN =
  <TTasks extends NonEmptyReadonlyArray<AnyTask>>(
    tasks: TTasks,
    count: Int1To100OrPositiveInt,
    options?: TaskCollectionOptions,
  ): Task<
    ReadonlyArray<InferTaskOk<TTasks[number]>>,
    never,
    InferTasksDeps<TTasks>
  > =>
  async (run) => {
    assertType(PositiveInt, count);

    const values: Array<InferTaskOk<TTasks[number]>> = [];
    await run(
      each(
        tasks,
        (result) => {
          if (result.ok) values.push(result.value);
          return values.length < count ? "continue" : "stop";
        },
        options,
      ),
    );
    return ok(values);
  };

/**
 * Runs Tasks until `count` Tasks settle or all Tasks settle.
 *
 * Returns {@link Ok} with Task {@link Result}s in settlement order, not input
 * order. When `count` Results have settled, remaining Tasks are aborted. If
 * fewer than `count` Tasks settle, returns the Results that did settle.
 *
 * Sequential by default; pass a `concurrency` option to run more than one Task
 * at a time. The count uses {@link Int1To100OrPositiveInt}: pass `1` to `100` as
 * a literal, or a validated {@link PositiveInt} for larger values.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createRun,
 *   err,
 *   firstNSettled,
 *   ok,
 *   sleep,
 *   type Task,
 * } from "@evolu/common";
 *
 * let slowCompleted = false;
 * const slow: Task<string, "Failed"> = async (run) => {
 *   await run.ok(sleep("10ms"));
 *   slowCompleted = true;
 *   return ok("slow");
 * };
 * const tasks = [
 *   slow,
 *   () => err("Failed" as const),
 *   () => ok("fast"),
 * ] as const;
 * await using run = createRun();
 *
 * // Err and Ok both count, and Results use settlement order.
 * const result = await run(firstNSettled(tasks, 2, { concurrency: 3 }));
 * expectOk(result, [
 *   { ok: false, error: "Failed" },
 *   { ok: true, value: "fast" },
 * ]);
 * expect(slowCompleted).toBe(false);
 * ```
 *
 * @group Racing
 */
export const firstNSettled =
  <TTasks extends NonEmptyReadonlyArray<AnyTask>>(
    tasks: TTasks,
    count: Int1To100OrPositiveInt,
    options?: TaskCollectionOptions,
  ): Task<
    ReadonlyArray<InferTasksResult<TTasks>>,
    never,
    InferTasksDeps<TTasks>
  > =>
  async (run) => {
    assertType(PositiveInt, count);

    const results: Array<InferTasksResult<TTasks>> = [];
    await run(
      each(
        tasks,
        (result) => {
          results.push(result);
          return results.length < count ? "continue" : "stop";
        },
        options,
      ),
    );
    return ok(results);
  };

/**
 * Decision returned by an {@link each} result handler.
 *
 * `continue` allows queued Tasks to start when concurrency capacity is
 * available. `stop` prevents queued Tasks from starting and aborts already
 * running Tasks through structured Run disposal.
 *
 * @group Concurrency
 */
export type EachDecision = "continue" | "stop";

/**
 * Handles one settled Task Result from {@link each}.
 *
 * The index is the original input index. Callback order follows settlement
 * order, not input order.
 *
 * @group Concurrency
 */
export type EachCallback<TTasks extends NonEmptyReadonlyArray<AnyTask>> = (
  result: InferTasksResult<TTasks>,
  index: number,
) => EachDecision;

/**
 * Runs Tasks under a concurrency limit and calls `onResult` for each Task
 * {@link Result} as it settles.
 *
 * `onResult` receives the Result and the original input index; call order is
 * settlement order, not input order. Returning `continue` lets queued Tasks
 * start when capacity is available. Returning `stop` prevents queued Tasks from
 * starting and aborts already-running Tasks through structured Run disposal —
 * `each` still waits for them to settle before returning.
 *
 * `each` is the scheduling primitive under the collection helpers. Each one is
 * a small `onResult` policy:
 *
 * | Helper                | Policy                                |
 * | --------------------- | ------------------------------------- |
 * | {@link all}           | Collect values, stop on the first Err |
 * | {@link allSettled}    | Collect every Result, never stop      |
 * | {@link any}           | Stop on the first Ok                  |
 * | {@link race}          | Stop on the first settled Result      |
 * | {@link firstN}        | Stop after n Ok values                |
 * | {@link firstNSettled} | Stop after n Results                  |
 *
 * Use `each` directly to build a collection policy the helpers don't cover. For
 * example, keep the first successful value together with its original input
 * index:
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createRun,
 *   each,
 *   err,
 *   ok,
 *   sleep,
 *   type Task,
 * } from "@evolu/common";
 *
 * let slowCompleted = false;
 * const slow: Task<string> = async (run) => {
 *   await run.ok(sleep("10ms"));
 *   slowCompleted = true;
 *   return ok("slow");
 * };
 * const tasks = [
 *   slow,
 *   () => err("Unavailable" as const),
 *   () => ok("fast"),
 * ] as const;
 * let first: readonly [string, number] | undefined;
 * await using run = createRun();
 * const result = await run(
 *   each(
 *     tasks,
 *     (result, index) => {
 *       if (!result.ok) return "continue";
 *       first = [result.value, index];
 *       return "stop";
 *     },
 *     { concurrency: 2 },
 *   ),
 * );
 *
 * expectOk(result, undefined);
 * expect(first).toEqual(["fast", 2]);
 * expect(slowCompleted).toBe(false);
 * ```
 *
 * `onResult` is a synchronous scheduling decision, not a place to do work. It
 * runs in the scheduler's own continuation, bracketed by abort checks, and its
 * return value gates whether queued Tasks may start. For async work per result,
 * put it inside the Task itself — the Task is the async slot — or start a
 * supervised side effect with `void run(task)` from inside the callback and
 * keep the decision synchronous. Like {@link RetryOptions.shouldRetry} and
 * {@link RetryOptions.onRetry}, `onResult` must not throw: a thrown exception is
 * a defect that panics the Run tree.
 *
 * Sequential by default; pass a `concurrency` option to run more than one Task
 * at a time. Defects from child Tasks keep caller-linked async stack traces;
 * building on `each` preserves diagnostics that a hand-rolled scheduling loop
 * typically loses.
 *
 * @group Concurrency
 */
export const each =
  <TTasks extends NonEmptyReadonlyArray<AnyTask>>(
    tasks: TTasks,
    onResult: EachCallback<TTasks>,
    options: TaskCollectionOptions = {},
  ): Task<void, never, InferTasksDeps<TTasks>> =>
  async (run) => {
    // Guard against hanging on an empty array.
    assertNonEmptyReadonlyArray(tasks);

    const parked = new Promise<never>(constVoid);
    const wake = Promise.withResolvers<void>();
    using _ = run.onAbort(wake.reject);

    let stopped = false;
    let nextIndex = 0;
    const workerCount = Math.min(
      options.concurrency ?? onePositiveInt,
      tasks.length,
    );
    let active = workerCount;

    // This topology is measured by StackTrace.test.ts ("pool parked" and
    // "pool parked wake reject"). Defects and stacks must travel await/
    // combinator edges, not resolver/then bridges; V8 drops parent frames when
    // a started worker is re-raced, JSC drops them through nested combinators.
    // Workers are direct race arms and never resolve — non-panic child
    // AbortErrors reject a worker arm; panics and caller abort reject the wake
    // via run.onAbort; drain and stop resolve it. `parked` must stay per-call:
    // a shared never-settling promise would retain worker reactions forever.
    const eachWorker = async (): Promise<never> => {
      try {
        while (!stopped && nextIndex < tasks.length) {
          const index = nextIndex;
          nextIndex += 1;

          const result = await run(tasks[index]);
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- stopped can flip across the await via sibling workers
          if (stopped) break;
          run.signal.throwIfAborted();
          const decision = onResult(result, index);
          run.signal.throwIfAborted();

          if (decision === "stop") {
            stopped = true;
            wake.resolve();
          }
        }
      } catch (error) {
        stopped = true;
        throw error;
      }

      active -= 1;
      if (active === 0) wake.resolve();
      return await parked;
    };

    await Promise.race([
      ...Array.from({ length: workerCount }, eachWorker),
      wake.promise,
    ]);
    return ok();
  };

/**
 * Scheduler priority for Tasks started through a native scheduler.
 *
 * Only static priorities are supported. Mutable scheduler priorities will be
 * added in a future release.
 *
 * @group Scheduling
 */
export type TaskPriority = "user-blocking" | "user-visible" | "background";

/**
 * Assigns static scheduler priority to a {@link Task}.
 *
 * {@link Run} uses the priority with native `scheduler.postTask` when available.
 * Platforms without the Scheduler API run the Task normally. Use a Scheduler
 * API polyfill such as
 * {@link https://github.com/GoogleChromeLabs/scheduler-polyfill | scheduler-polyfill}
 * for hosts like Safari and React Native when priority-aware scheduling is
 * needed.
 *
 * `scheduler.postTask` must reject queued aborts with `AbortSignal.reason`.
 * Other host-specific abort objects are treated as defects.
 *
 * ### Example
 *
 * ```ts
 * import { createRun, ok, prioritized, type Task } from "@evolu/common";
 *
 * const rebuildSearchIndex: Task<string> = () => ok("indexed");
 * const backgroundIndexing = prioritized("background", rebuildSearchIndex);
 *
 * await using run = createRun();
 * expectOk(await run(backgroundIndexing), "indexed");
 * ```
 *
 * @group Scheduling
 */
export const prioritized = <T, E, D = unknown>(
  priority: TaskPriority,
  task: Task<T, E, D>,
): Task<T, E, D> => withTaskMeta({ priority })(task);

/**
 * Yields execution to the host scheduler.
 *
 * Uses native `scheduler.yield()` when available, `setImmediate` when
 * available, and `setTimeout` elsewhere. Because this is a Task, `await
 * run(yieldNow)` is an explicit abortable checkpoint and is visible in Run
 * monitoring.
 *
 * For example, call it periodically in a long-running synchronous loop to let
 * the host process rendering, input, and other scheduled work.
 *
 * ### Example
 *
 * ```ts
 * import { createRun, ok, yieldNow, type Task } from "@evolu/common";
 *
 * const sumTo =
 *   (count: number): Task<number> =>
 *   async (run) => {
 *     let sum = 0;
 *
 *     for (let index = 0; index < count; index++) {
 *       if (index > 0 && index % 1000 === 0) await run.ok(yieldNow);
 *       sum += index;
 *     }
 *
 *     return ok(sum);
 *   };
 *
 * await using run = createRun();
 * expectOk(await run(sumTo(1001)), 500500);
 * ```
 *
 * @group Scheduling
 */
export const yieldNow: Task<void> = async (run) => {
  const scheduler = globalWithScheduler.scheduler;

  if (scheduler?.yield) {
    await scheduler.yield();
  } else {
    // Intentionally bypasses deps.time: yielding is a host-scheduler concern,
    // not logical time, and fake time would block awaiting code in tests. The
    // timer is not cleared on abort; throwIfAborted below observes abort after
    // the tick, delaying settlement by at most one timer tick.
    await new Promise<void>((resolve) => {
      const immediate = globalWithSetImmediate.setImmediate;
      if (immediate) immediate(resolve);
      else setTimeout(resolve, 0);
    });
  }

  run.signal.throwIfAborted();
  return ok();
};

// Abortability

/**
 * Waits until the current {@link Run} aborts, then rejects with its
 * {@link AbortError}.
 *
 * Use it to keep long-running services and Run-owned resources alive until
 * their owning Run shuts down.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   AbortError,
 *   createRun,
 *   ok,
 *   waitForAbort,
 *   type Task,
 * } from "@evolu/common";
 *
 * interface ServerDep {
 *   readonly port: number;
 * }
 * interface Server extends AsyncDisposable {}
 *
 * const serverStarted = Promise.withResolvers<void>();
 * let serverStopped = false;
 * const startServer: Task<Server, never, ServerDep> = ({ deps }) => {
 *   expect(deps.port).toBe(3000);
 *   serverStarted.resolve();
 *   return ok({
 *     [Symbol.asyncDispose]: async () => {
 *       serverStopped = true;
 *     },
 *   });
 * };
 *
 * const serve = (): Task<never, never, ServerDep> => async (run) => {
 *   await using server = await run.ok(startServer);
 *   return await run(waitForAbort);
 * };
 *
 * expectTypeOf(serve).returns.toEqualTypeOf<
 *   Task<never, never, ServerDep>
 * >();
 *
 * await using run = createRun();
 * const fiber = run.abortable(serve(), { port: 3000 });
 * await serverStarted.promise;
 * fiber.abort();
 *
 * const result = await fiber;
 * assert(!result.ok);
 * expect(AbortError.is(result.error)).toBe(true);
 * expect(serverStopped).toBe(true);
 * ```
 *
 * @group Abortability
 */
export const waitForAbort: Task<never> = async (run) => {
  const aborted = Promise.withResolvers<never>();
  using _ = run.onAbort(aborted.reject);
  return await aborted.promise;
};

/**
 * Starts a {@link Task} with {@link Run.daemon} and waits until it settles or the
 * current Run aborts.
 *
 * When the current Run aborts, this helper requests abort for the daemon Task
 * and returns {@link AbortError} without waiting for that daemon Task to observe
 * abort, clean up, or settle. This makes the wait abortable, not the underlying
 * execution. The daemon Task continues under root Run ownership until it
 * settles, observes abort, or the root Run is disposed.
 *
 * This is not a replacement for direct {@link AbortSignal} support in operations
 * that can observe abort, such as {@link fetch}, timers that accept a signal, or
 * callback APIs that accept a signal. Use it as an escape hatch for Tasks that
 * ignore abort when an abort request must stop waiting immediately.
 *
 * Do not wrap a Task that keeps using a resource the caller may release after
 * this wrapper returns, unless the Task reliably observes abort before using
 * that resource. The daemon Task can continue after the caller stops waiting.
 * Later domain `Err` results from the daemon Task are discarded after the
 * caller stops waiting. Defects from the daemon Task remain visible to the root
 * Run: if it later throws or rejects, the root Run still panics and reports the
 * defect.
 *
 * Compose with {@link race} or {@link timeout} when the losing Task must not
 * delay the winner. Those helpers normally abort losing Tasks and wait for them
 * to settle, keeping cleanup and late defects inside the caller's lifetime. A
 * Task that ignores abort can keep them waiting.
 *
 * `run.abortable(task)` returns an owned child Fiber and requests abort through
 * that Fiber; `daemon(task)` starts a daemon child and stops waiting when the
 * current Run aborts. {@link unabortable} masks abort for a Task that must
 * finish once started; daemon lets a Task outlive the caller.
 *
 * Because the Task starts with {@link Run.daemon}, a recorded abort request
 * returns AbortError before the Task starts — including a request masked by
 * {@link unabortable}, even though `run.signal` stays un-aborted inside the
 * mask. Inside a masked body, wrapping a Task with `daemon` opts the wait back
 * into abort observation; omit the wrapper when the mask should keep the Task
 * running.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createRun,
 *   daemon,
 *   ok,
 *   timeout,
 *   type Task,
 * } from "@evolu/common";
 *
 * let finished = false;
 * let finishTask = (): void => {};
 * const taskNotUsingAbort: Task<string> = () =>
 *   new Promise((resolve) => {
 *     finishTask = () => {
 *       finished = true;
 *       resolve(ok("done"));
 *     };
 *   });
 *
 * {
 *   await using run = createRun();
 *   const result = await run(timeout(daemon(taskNotUsingAbort), "1ms"));
 *   assert(!result.ok);
 *   expect(result.error.type).toBe("TimeoutError");
 *   expect(finished).toBe(false);
 *   finishTask();
 * }
 * expect(finished).toBe(true);
 * ```
 *
 * Promise-producing operations should start inside the Task, not before it.
 *
 * ```ts
 * import { createRun, ok, type Result, type Task } from "@evolu/common";
 *
 * type ResultValue = string;
 * interface MyError {
 *   readonly type: "MyError";
 * }
 * const createPromiseReturningResult = (): Promise<
 *   Result<ResultValue, MyError>
 * > => Promise.resolve(ok("value"));
 *
 * const task: Task<ResultValue, MyError> = () =>
 *   createPromiseReturningResult();
 *
 * await using run = createRun();
 * expectOk(await run(task), "value");
 * ```
 *
 * Do not reuse an already-running Promise. It started outside the Task, so the
 * Run cannot own its lifetime or request abort before it begins.
 *
 * ```ts
 * import { ok, type Result, type Task } from "@evolu/common";
 *
 * type ResultValue = string;
 * interface MyError {
 *   readonly type: "MyError";
 * }
 * let promiseStarted = false;
 * const createPromiseReturningResult = (): Promise<
 *   Result<ResultValue, MyError>
 * > => {
 *   promiseStarted = true;
 *   return Promise.resolve(ok("value"));
 * };
 *
 * // Wrong: the Promise starts now, before a Run starts the Task.
 * const promise = createPromiseReturningResult();
 * const task: Task<ResultValue, MyError> = () => promise;
 *
 * expect(promiseStarted).toBe(true);
 * expectTypeOf(task).toEqualTypeOf<Task<ResultValue, MyError>>();
 * ```
 *
 * @group Lifetime
 */
export const daemon =
  <T, E, D = unknown>(task: Task<T, E, D>): Task<T, E | AbortError, D> =>
  async (run) => {
    let fiber: AbortableFiber<T, E, D>;
    try {
      fiber = run.daemon(task);
    } catch (error) {
      if (AbortError.is(error)) return err(error);
      throw error;
    }
    const aborted = Promise.withResolvers<Result<never, AbortError>>();
    using _ = run.onAbort((abortError): void => {
      fiber.abort(abortError.reason);
      aborted.resolve(err(abortError));
    });
    return await Promise.race([fiber, aborted.promise]);
  };

/**
 * Makes a {@link Task} unabortable after it starts.
 *
 * Abort requests are masked while the Task runs, so `run.signal.aborted`
 * remains false inside the Task. This does not force the Task to start after an
 * abort request has already reached its Run; unabortable means the Task is not
 * interrupted once it has started. Disposing the enclosing Run still waits for
 * the Task to settle.
 *
 * Apply at most one abort behavior helper to a Task: do not wrap the same Task
 * with both unabortable and restore, or apply either helper more than once.
 *
 * ### Example
 *
 * ```ts
 * import { createRun, ok, unabortable, type Task } from "@evolu/common";
 *
 * const commitStarted = Promise.withResolvers<void>();
 * const finishCommit = Promise.withResolvers<void>();
 * const commit: Task<string> = unabortable(async ({ signal }) => {
 *   commitStarted.resolve();
 *   await finishCommit.promise;
 *   expect(signal.aborted).toBe(false);
 *   return ok("committed");
 * });
 *
 * await using run = createRun();
 * const fiber = run.abortable(commit);
 * await commitStarted.promise;
 * fiber.abort();
 * finishCommit.resolve();
 *
 * expectOk(await fiber, "committed");
 * ```
 *
 * @group Abortability
 */
export const unabortable = /*#__PURE__*/ withTaskMeta({
  abortBehavior: "unabortable",
});

/**
 * Like {@link unabortable}, but provides `restore` for child Tasks that should
 * run with the previous abort mask.
 *
 * Use this for acquire/use/release flows where acquire and release must finish
 * once started, while use should remain abortable. Child Tasks inherit the mask
 * unless they are wrapped with `restore()` before scheduling.
 *
 * An abort request before the mask Task starts prevents entering the mask. Once
 * the body starts, plain child Tasks inherit the mask, so acquire and release
 * can run after abort. Put release operations directly in the original mask's
 * `finally`; do not wrap release in a nested `unabortableMask`, which is a new
 * critical-section entry and may not start after abort.
 *
 * {@link AsyncDisposableStack} is often enough for ordinary acquire/release. Use
 * it inside `unabortableMask` when masked acquire/release spans multiple or
 * conditional resources.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   AbortError,
 *   createRun,
 *   ok,
 *   unabortableMask,
 *   waitForAbort,
 *   type Task,
 * } from "@evolu/common";
 *
 * await using run = createRun();
 *
 * interface Resource {
 *   readonly id: string;
 * }
 *
 * const acquire: Task<Resource> = () => ok({ id: "resource-1" });
 * const operationStarted = Promise.withResolvers<void>();
 * const operate =
 *   (resource: Resource): Task<never> =>
 *   async (run) => {
 *     expect(resource.id).toBe("resource-1");
 *     operationStarted.resolve();
 *     return await run(waitForAbort);
 *   };
 * let released = false;
 * const release =
 *   (_resource: Resource): Task<void> =>
 *   ({ signal }) => {
 *     // Release inherits the mask even after abort was requested.
 *     expect(signal.aborted).toBe(false);
 *     released = true;
 *     return ok();
 *   };
 *
 * const fiber = run.abortable(
 *   unabortableMask((restore) => async (run) => {
 *     // Acquire with abort masked.
 *     const resource = await run.ok(acquire);
 *
 *     try {
 *       // Use with the previous abort mask restored.
 *       return await run(restore(operate(resource)));
 *     } finally {
 *       // Release with abort masked.
 *       await run.ok(release(resource));
 *     }
 *   }),
 * );
 *
 * await operationStarted.promise;
 * fiber.abort();
 * const result = await fiber;
 * assert(!result.ok);
 * expect(AbortError.is(result.error)).toBe(true);
 * expect(released).toBe(true);
 * ```
 *
 * @group Abortability
 */
export const unabortableMask = <T, E, D = unknown>(
  fn: (
    restore: <T2, E2, D2 = D>(task: Task<T2, E2, D2>) => Task<T2, E2, D2>,
  ) => Task<T, E, D>,
): Task<T, E, D> =>
  unabortable((run) => {
    const runInternal = run as RunInternal<any>;
    // Only verifies the Run is masked. A direct call inside an already masked
    // Run passes undetected; direct calls bypass Run semantics by design.
    assert(
      runInternal.abortMask > abortableMask,
      "unabortableMask requires a masked Run; use run(task), not a direct call",
    );
    const restoreToken = Symbol() as RestoreToken;

    // The token is local to this Task Run; descendant Runs inherit the token
    // set so helpers can receive restore while the mask Task is alive.
    // Each set is bounded by its Run lifetime and is intentionally not pruned.
    runInternal.restoreTokens = new Set(runInternal.restoreTokens).add(
      restoreToken,
    );

    return run(
      fn(
        withTaskMeta({
          abortBehavior: {
            abortMask: decrement(runInternal.abortMask) as AbortMask,
            restoreToken,
          },
        }),
      ) as TaskInternal<T, E, D>,
    );
  });

/**
 * Runs acquire, use, and release as one bracketed {@link Task}.
 *
 * Acquire and release are masked once the helper starts, while use runs with
 * the previous abort mask restored. If acquire returns an error, release is not
 * run. Release must not return recoverable errors; handle expected cleanup
 * failures inside the release Task.
 *
 * Use this when a resource, lease, lock, or session must always be released
 * after it is acquired, even when use fails or is aborted.
 *
 * Prefer native `using`, `await using`, or {@link AsyncDisposableStack} for
 * owned values that implement {@link Disposable} or {@link AsyncDisposable}. Use
 * `acquireUseRelease` when acquisition must be balanced with a separate release
 * operation, such as unlocking, returning a pooled value, releasing a lease, or
 * logging out of a session.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   acquireUseRelease,
 *   createRun,
 *   err,
 *   ok,
 *   type Task,
 * } from "@evolu/common";
 *
 * interface Connection {
 *   readonly user: string;
 *   readonly isAvailable: boolean;
 * }
 *
 * const openConnection: Task<Connection> = () =>
 *   ok({ user: "Ada", isAvailable: false });
 * const loadUser =
 *   (connection: Connection): Task<string, "Unavailable"> =>
 *   () =>
 *     connection.isAvailable ? ok(connection.user) : err("Unavailable");
 * let connectionClosed = false;
 * const closeConnection =
 *   (_connection: Connection): Task<void> =>
 *   () => {
 *     connectionClosed = true;
 *     return ok();
 *   };
 *
 * const queryUser = acquireUseRelease(
 *   openConnection,
 *   loadUser,
 *   (connection) => closeConnection(connection),
 * );
 *
 * await using run = createRun();
 * expectErr(await run(queryUser), "Unavailable");
 * // Release still runs when use returns a domain error.
 * expect(connectionClosed).toBe(true);
 * ```
 *
 * @group Abortability
 */
export const acquireUseRelease = <
  Resource,
  T,
  EAcquire,
  EUse,
  DAcquire = unknown,
  DUse = unknown,
  DRelease = unknown,
>(
  acquire: Task<Resource, EAcquire, DAcquire>,
  use: (resource: Resource) => Task<T, EUse, DUse>,
  release: (resource: Resource) => Task<void, never, DRelease>,
): Task<T, EAcquire | EUse, DAcquire & DUse & DRelease> =>
  unabortableMask<T, EAcquire | EUse, DAcquire & DUse & DRelease>(
    (restore) => async (run) => {
      const resourceResult = await run(acquire);
      if (!resourceResult.ok) return resourceResult;

      try {
        // eslint-disable-next-line react-hooks/rules-of-hooks -- `use` is an acquireUseRelease callback, not a React Hook.
        return await run(restore(use(resourceResult.value)));
      } finally {
        await run.ok(release(resourceResult.value));
      }
    },
  );

// Concurrency primitives

/**
 * A one-shot value resolved from outside the waiting {@link Task}.
 *
 * Use Deferred when Task code must wait for a Result completed by an external
 * callback or another Task. Deferred is `Promise.withResolvers` with Task
 * semantics: each waiter uses its waiting Run lifetime, can abort
 * independently, appears in Run observability, and settles with Result-based
 * errors.
 *
 * The Deferred resolves once. Later calls to {@link Deferred.resolve} return
 * `false` and do not change the Result.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createDeferred,
 *   createRun,
 *   ok,
 *   type Result,
 * } from "@evolu/common";
 *
 * await using run = createRun();
 * const deferred = createDeferred<string>();
 *
 * const fiber = run(deferred.task);
 * expect(deferred.resolve(ok("ready"))).toBe(true);
 *
 * const result = await fiber;
 * expectTypeOf(result).toEqualTypeOf<Result<string>>();
 * expectOk(result, "ready");
 *
 * // A Deferred is one-shot: later resolutions are ignored, and future
 * // waiters receive the original Result.
 * expect(deferred.resolve(ok("late"))).toBe(false);
 * expectOk(await run(deferred.task), "ready");
 * ```
 *
 * ### Example
 *
 * ```ts
 * import { AbortError, createDeferred, createRun } from "@evolu/common";
 *
 * await using run = createRun();
 * const deferred = createDeferred<string>();
 *
 * const fiber = run.abortable(deferred.task);
 * fiber.abort({ type: "NoLongerNeeded" });
 *
 * const result = await fiber;
 * assert(!result.ok);
 * expect(AbortError.is(result.error)).toBe(true);
 * ```
 *
 * @group Concurrency primitives
 * @see {@link createDeferred}
 */
export interface Deferred<T, E = never> {
  /** Waits until {@link Deferred.resolve} resolves the Deferred. */
  readonly task: Task<T, E>;

  /** Resolves the Deferred, returning whether this call completed it. */
  readonly resolve: (result: Result<T, E>) => boolean;
}

/**
 * Creates a {@link Deferred}.
 *
 * @group Concurrency primitives
 */
export const createDeferred = <T, E = never>(): Deferred<T, E> => {
  let resolvedResult: Result<T, E> | undefined;
  const waiters = new Set<(result: Result<T, E>) => void>();

  return {
    task: callback<T, E>(({ resolve }) => {
      if (resolvedResult) {
        resolve(resolvedResult);
        return;
      }

      waiters.add(resolve);
      return () => {
        waiters.delete(resolve);
      };
    }),

    resolve: (result) => {
      if (resolvedResult) return false;
      resolvedResult = result;
      for (const wait of waiters) wait(result);
      waiters.clear();
      return true;
    },
  };
};

/**
 * A reusable gate for blocking and releasing Tasks.
 *
 * - **Closed**: Tasks wait.
 * - **Open**: Tasks proceed.
 *
 * Use it to pause execution based on a condition. Unlike a {@link Deferred},
 * which resolves once, a Gate can be opened and closed repeatedly. Opening
 * releases all current waiters and allows future waiters to pass immediately.
 * Closing only affects future waiters. Releasing allows current waiters to pass
 * while keeping future waiters blocked.
 *
 * {@link createGate} creates a closed Gate by default. Pass `isOpen: true` when
 * work should proceed immediately.
 *
 * ### Example
 *
 * ```ts
 * import { createGate, createRun, ok, type Task } from "@evolu/common";
 *
 * await using run = createRun();
 * const networkGate = createGate();
 *
 * const uploadedItems: Array<string> = [];
 * const syncOnce =
 *   (item: string): Task<void> =>
 *   async (run) => {
 *     await run.ok(networkGate.wait);
 *     uploadedItems.push(item);
 *     return ok();
 *   };
 *
 * const first = run(syncOnce("first"));
 * const second = run(syncOnce("second"));
 * expect(uploadedItems).toEqual([]);
 *
 * networkGate.open();
 * expectOk(await first, undefined);
 * expectOk(await second, undefined);
 * expect(uploadedItems).toEqual(["first", "second"]);
 * expect(networkGate.isOpen()).toBe(true);
 * ```
 *
 * @group Concurrency primitives
 * @see {@link createGate}
 */
export interface Gate {
  /** Waits while the gate is closed. */
  readonly wait: Task<void>;

  /** Opens the gate, releasing all waiters. Returns false when already open. */
  readonly open: () => boolean;

  /** Closes the gate. Returns false when already closed. */
  readonly close: () => boolean;

  /** Releases the current closed wait cycle. Returns false when already open. */
  readonly release: () => boolean;

  /** Returns whether the gate is open. */
  readonly isOpen: () => boolean;
}

/**
 * Creates a {@link Gate}.
 *
 * @group Concurrency primitives
 */
export const createGate = ({
  isOpen = false,
}: {
  isOpen?: boolean;
} = {}): Gate => {
  let deferred = createDeferred<void>();
  if (isOpen) deferred.resolve(ok());

  return {
    // Direct same-Run delegation is intentional so wait observes the current deferred.
    // eslint-disable-next-line evolu/no-direct-task-call
    wait: (run) => deferred.task(run),
    open: () => {
      if (isOpen) return false;
      isOpen = true;
      deferred.resolve(ok());
      return true;
    },
    close: () => {
      if (!isOpen) return false;
      isOpen = false;
      deferred = createDeferred<void>();
      return true;
    },
    release: () => {
      if (isOpen) return false;
      deferred.resolve(ok());
      deferred = createDeferred<void>();
      return true;
    },
    isOpen: () => isOpen,
  };
};

/**
 * Coordinates concurrent Tasks by acquiring and releasing permits.
 *
 * Use {@link Semaphore.withPermit} or {@link Semaphore.withPermits} to acquire
 * permits for one Task and release them when it settles. Use
 * {@link Semaphore.take} when permits must be held across multiple operations;
 * the returned {@link SemaphorePermit} owns release and is disposable.
 *
 * Requests are not capped by the current permit count because
 * {@link Semaphore.resize} can increase it later.
 *
 * Acquisition uses the `"fifo"` {@link SemaphorePolicy} by default.
 *
 * Capacity is always positive. Use {@link Gate} when work should start closed
 * and be released later.
 *
 * `Semaphore` is permit-counting, not owner tracking. Acquiring permits while
 * already holding permits consumes additional permits and can wait if not
 * enough permits are available.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createRun,
 *   createSemaphore,
 *   getOk,
 *   ok,
 *   sleep,
 *   type Task,
 * } from "@evolu/common";
 *
 * await using run = createRun();
 *
 * const semaphore = createSemaphore(2);
 * let activeSaves = 0;
 * let maxActiveSaves = 0;
 *
 * const saveUser =
 *   (id: string): Task<string> =>
 *   async (run) => {
 *     activeSaves += 1;
 *     maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
 *     await run.ok(sleep("10ms"));
 *     activeSaves -= 1;
 *     return ok(`saved:${id}`);
 *   };
 *
 * const results = await Promise.all([
 *   run(semaphore.withPermit(saveUser("1"))),
 *   run(semaphore.withPermit(saveUser("2"))),
 *   run(semaphore.withPermit(saveUser("3"))),
 * ]);
 *
 * const savedUsers = results.map(getOk);
 * expect(savedUsers).toEqual(["saved:1", "saved:2", "saved:3"]);
 * expect(maxActiveSaves).toBe(2);
 * ```
 *
 * @group Concurrency primitives
 * @see {@link createSemaphore}
 */
export interface Semaphore {
  /** Runs a {@link Task} while holding one permit. */
  readonly withPermit: <T, E, D>(task: Task<T, E, D>) => Task<T, E, D>;

  /** Runs a {@link Task} while holding the requested permits. */
  readonly withPermits: (
    permits: Int1To100OrPositiveInt,
  ) => <T, E, D>(task: Task<T, E, D>) => Task<T, E, D>;

  /**
   * Runs a {@link Task} only when the requested permits are immediately
   * available.
   *
   * Returns {@link none} without running the Task when the request cannot be
   * granted immediately.
   */
  readonly withPermitsIfAvailable: (
    permits: Int1To100OrPositiveInt,
  ) => <T, E, D>(task: Task<T, E, D>) => Task<Option<T>, E, D>;

  /**
   * Acquires permits and returns an owned {@link SemaphorePermit}.
   *
   * The Task waits until enough permits are available. Dispose or release the
   * returned permit to make them available again.
   *
   * When the request exceeds the current total permit count, the Task remains
   * pending until {@link Semaphore.resize} increases capacity or the Task is
   * aborted.
   */
  readonly take: (permits: Int1To100OrPositiveInt) => Task<SemaphorePermit>;

  /**
   * Changes the total permit count without revoking held permits.
   *
   * Permit count must stay positive; resizing to 0 is not supported. Use
   * {@link Gate} for closed/open coordination.
   *
   * If the total permit count is reduced below currently held permits, new
   * acquisitions wait until enough permits are released.
   */
  readonly resize: (permits: Int1To100OrPositiveInt) => void;

  /** Returns the current semaphore state for monitoring and debugging. */
  readonly snapshot: () => SemaphoreSnapshot;

  /** Whether no permits are held and no requests are queued. */
  readonly isIdle: () => boolean;
}

/**
 * An owned semaphore acquisition returned by {@link Semaphore.take}.
 *
 * @group Concurrency primitives
 */
export interface SemaphorePermit extends Disposable {
  /** Number of permits held by this permit. */
  readonly permits: Int1To100OrPositiveInt;

  /** Releases held permits. Returns `true` once, then `false`. */
  readonly release: () => boolean;
}

/**
 * Scheduling policy for semaphore acquisition.
 *
 * The policy changes behavior only when requests acquire different numbers of
 * permits. If every request acquires one permit, both policies admit requests
 * in the same order.
 *
 * `"fifo"` is the default fair policy. Requests are served in arrival order.
 * Once a request is queued, later requests cannot acquire permits before it.
 * This prevents starvation, but can leave permits unused while the oldest
 * queued request waits for enough permits.
 *
 * `"greedy"` is the throughput-oriented policy. A request may acquire permits
 * as soon as it fits, even when older larger requests are waiting. This keeps
 * more permits in use and avoids head-of-line blocking, but larger requests can
 * starve indefinitely if smaller requests keep arriving.
 *
 * Greedy scheduling is first-fit, not optimal-fit: queued requests are scanned
 * in arrival order, and grantable requests are admitted as they are found. The
 * semaphore does not reorder requests to maximize utilization.
 *
 * Use `"fifo"` when fairness and predictable progress matter, such as tenant
 * sync, API quota, or database operations where large requests must not be
 * starved by a stream of smaller requests.
 *
 * Use `"greedy"` when permits represent a shared budget and smaller or
 * latency-sensitive requests should proceed around larger queued requests. For
 * example, dashboard queries can run while analytics exports wait, thumbnail
 * jobs can run while video transcodes wait, and small transfers can use
 * bandwidth while large transfers are queued.
 *
 * @group Concurrency primitives
 */
export type SemaphorePolicy = "fifo" | "greedy";

/**
 * Snapshot returned by {@link Semaphore.snapshot}.
 *
 * @group Concurrency primitives
 */
export interface SemaphoreSnapshot {
  /** Acquisition scheduling policy. */
  readonly policy: SemaphorePolicy;

  /** Total configured permits. */
  readonly permits: Int1To100OrPositiveInt;

  /** Currently held permits. */
  readonly taken: NonNegativeInt;

  /** Queued acquisition requests. */
  readonly waiters: ReadonlyArray<{
    /** Requested permits. */
    readonly permits: Int1To100OrPositiveInt;
  }>;

  /**
   * Permits available for immediate acquisition.
   *
   * In `"fifo"` mode, this is `0` while requests are queued because later
   * acquisitions cannot bypass them.
   *
   * When the total permit count is resized below currently held permits, this
   * is `0` until enough permits are released.
   */
  readonly available: NonNegativeInt;

  /** Whether no permits are held and no requests are queued. */
  readonly isIdle: boolean;
}

/**
 * Creates a {@link Semaphore}.
 *
 * @group Concurrency primitives
 */
export const createSemaphore = (
  initialPermits: Int1To100OrPositiveInt,
  {
    policy = "fifo",
  }: {
    /**
     * Acquisition scheduling policy.
     *
     * @default "fifo"
     */
    policy?: SemaphorePolicy;
  } = {},
): Semaphore => {
  const isGreedy = policy === "greedy";
  let permits = PositiveInt.orThrow(initialPermits);
  let taken = NonNegativeInt.orThrow(0);

  const waiters = new Set<{
    readonly permits: PositiveInt;
    readonly leakDetector: LeakDetector;
    readonly resolve: (result: Result<SemaphorePermit>) => void;
  }>();

  const hasFreePermits = (requested: PositiveInt): boolean =>
    taken + requested <= permits;

  const canTake = (requested: PositiveInt): boolean =>
    hasFreePermits(requested) && (isGreedy || waiters.size === 0);

  const grant = (
    requested: PositiveInt,
    leakDetector: LeakDetector,
  ): SemaphorePermit => {
    taken = NonNegativeInt.orThrow(taken + requested);
    let released = false;
    const handle = {};

    const release = (): boolean => {
      if (released) return false;
      released = true;
      leakDetector.untrack(handle);
      taken = NonNegativeInt.orThrow(taken - requested);
      releaseWaiters();
      return true;
    };

    const permit = {
      permits: requested,
      release,
      [Symbol.dispose]: release,
    };

    leakDetector.track(
      permit,
      { name: "SemaphorePermit", isLeaked: () => !released },
      handle,
    );

    return permit;
  };

  const releaseWaiters = (): void => {
    for (const waiter of waiters) {
      if (!hasFreePermits(waiter.permits)) {
        if (!isGreedy) break;
        continue;
      }
      waiters.delete(waiter);
      waiter.resolve(ok(grant(waiter.permits, waiter.leakDetector)));
    }
  };

  const take = (
    requestedPermits: Int1To100OrPositiveInt,
  ): Task<SemaphorePermit> =>
    callback(({ run: { deps }, resolve }) => {
      const requested = PositiveInt.orThrow(requestedPermits);

      if (canTake(requested)) {
        resolve(ok(grant(requested, deps.leakDetector)));
        return;
      }

      const waiter = {
        permits: requested,
        leakDetector: deps.leakDetector,
        resolve,
      };
      waiters.add(waiter);
      return () => {
        if (waiters.delete(waiter)) releaseWaiters();
      };
    });

  const withPermits =
    (requestedPermits: Int1To100OrPositiveInt) =>
    <T, E, D>(task: Task<T, E, D>): Task<T, E, D> =>
    async (run) => {
      using _permit = await run.ok(take(requestedPermits));
      return await run(task);
    };

  const isIdle = (): boolean => taken === 0 && waiters.size === 0;

  return {
    withPermit: <T, E, D>(task: Task<T, E, D>): Task<T, E, D> =>
      withPermits(1)(task),
    withPermits,
    withPermitsIfAvailable:
      (requestedPermits: Int1To100OrPositiveInt) =>
      <T, E, D>(task: Task<T, E, D>): Task<Option<T>, E, D> =>
      async (run) => {
        const requested = PositiveInt.orThrow(requestedPermits);

        if (!canTake(requested)) return ok(none);

        using _permit = grant(requested, run.deps.leakDetector);
        const result = await run(task);
        if (!result.ok) return result;
        return ok(some(result.value));
      },
    take,
    resize: (newPermits) => {
      permits = PositiveInt.orThrow(newPermits);
      releaseWaiters();
    },

    snapshot: () => ({
      policy,
      permits,
      taken,
      waiters: Array.from(waiters, ({ permits }) => ({ permits })),
      available: NonNegativeInt.orThrow(
        !isGreedy && waiters.size > 0 ? 0 : Math.max(0, permits - taken),
      ),
      isIdle: isIdle(),
    }),
    isIdle,
  };
};

/**
 * Runs Tasks one at a time.
 *
 * `Mutex` is non-reentrant. A Task that tries to acquire the same Mutex while
 * already holding it waits on itself and will not progress.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createMutex,
 *   createRun,
 *   ok,
 *   sleep,
 *   type Task,
 * } from "@evolu/common";
 *
 * const mutex = createMutex();
 * let balance = 0;
 * const deposit = (amount: number): Task<void> =>
 *   mutex.withLock(async (run) => {
 *     const currentBalance = balance;
 *     await run.ok(sleep("1ms"));
 *     balance = currentBalance + amount;
 *     return ok();
 *   });
 *
 * await using run = createRun();
 * const [first, second] = await Promise.all([
 *   run(deposit(2)),
 *   run(deposit(3)),
 * ]);
 * expectOk(first, undefined);
 * expectOk(second, undefined);
 * expect(balance).toBe(5);
 * ```
 *
 * @group Concurrency primitives
 */
export interface Mutex {
  /** Runs a {@link Task} while holding the lock. */
  readonly withLock: <T, E, D>(task: Task<T, E, D>) => Task<T, E, D>;

  /** Returns the current lock state for monitoring and debugging. */
  readonly snapshot: () => SemaphoreSnapshot;
}

/**
 * Creates a {@link Mutex}.
 *
 * @group Concurrency primitives
 */
export const createMutex = (): Mutex => {
  const semaphore = createSemaphore(1);

  return {
    withLock: semaphore.withPermit,
    snapshot: semaphore.snapshot,
  };
};

/**
 * Coordinates concurrent Tasks independently for each key.
 *
 * `SemaphoreByKey` intentionally exposes only Task-scoped acquisition helpers,
 * not the complete {@link Semaphore} API. Methods like {@link Semaphore.take} and
 * {@link Semaphore.resize} would expose per-key semaphores as long-lived
 * resources, making idle-key cleanup less predictable and making accidental key
 * retention easier.
 *
 * Use Semaphore directly when callers need to hold permits across multiple
 * operations or resize a permit pool. Use `SemaphoreByKey` when permit
 * ownership should be tied to one Task lifetime and idle keys can be forgotten
 * automatically.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createGate,
 *   createRun,
 *   createSemaphoreByKey,
 *   getOk,
 *   ok,
 *   type Task,
 * } from "@evolu/common";
 *
 * // Each host gets an independent two-download limit.
 * const downloadsByHost = createSemaphoreByKey<string>(2);
 * const finishDownloads = createGate();
 * const firstBatchStarted = Promise.withResolvers<void>();
 * const started: Array<string> = [];
 * const download = (host: string, file: string): Task<string> =>
 *   downloadsByHost.withPermit(host, async (run) => {
 *     started.push(`${host}/${file}`);
 *     if (started.length === 3) firstBatchStarted.resolve();
 *     await run.ok(finishDownloads.wait);
 *     return ok(`${host}/${file}`);
 *   });
 *
 * await using run = createRun();
 * const downloads = [
 *   run(download("a.example", "1.json")),
 *   run(download("a.example", "2.json")),
 *   run(download("a.example", "3.json")),
 *   run(download("b.example", "1.json")),
 * ];
 * await firstBatchStarted.promise;
 * expect(started).toEqual([
 *   "a.example/1.json",
 *   "a.example/2.json",
 *   "b.example/1.json",
 * ]);
 *
 * finishDownloads.open();
 * expect((await Promise.all(downloads)).map(getOk)).toEqual([
 *   "a.example/1.json",
 *   "a.example/2.json",
 *   "a.example/3.json",
 *   "b.example/1.json",
 * ]);
 * ```
 *
 * @group Concurrency primitives
 */
export interface SemaphoreByKey<K = unknown> {
  /** Runs a {@link Task} while holding one permit for the key. */
  readonly withPermit: <T, E, D>(key: K, task: Task<T, E, D>) => Task<T, E, D>;

  /** Runs a {@link Task} while holding the requested permits for the key. */
  readonly withPermits: (
    key: K,
    permits: Int1To100OrPositiveInt,
  ) => <T, E, D>(task: Task<T, E, D>) => Task<T, E, D>;

  /** Whether no permits are held and no requests are queued for the key. */
  readonly isIdle: (key: K) => boolean;

  /** Returns the current key state, or null when the key is idle. */
  readonly snapshot: (key: K) => SemaphoreSnapshot | null;
}

/**
 * Options for {@link createSemaphoreByKey}.
 *
 * @group Concurrency primitives
 */
export interface CreateSemaphoreByKeyOptions<K, L = K> extends LookupOption<
  K,
  L
> {}

/**
 * Creates a {@link SemaphoreByKey}.
 *
 * @group Concurrency primitives
 */
export function createSemaphoreByKey<K = unknown>(
  initialPermits: Int1To100OrPositiveInt,
  options?: CreateSemaphoreByKeyOptions<K, unknown>,
): SemaphoreByKey<K>;
export function createSemaphoreByKey<K, L>(
  initialPermits: Int1To100OrPositiveInt,
  options: CreateSemaphoreByKeyOptions<K, L>,
): SemaphoreByKey<K>;
export function createSemaphoreByKey<K, L = K>(
  initialPermits: Int1To100OrPositiveInt,
  { lookup = identity as Lookup<K, L> }: CreateSemaphoreByKeyOptions<K, L> = {},
): SemaphoreByKey<K> {
  const semaphoresByKey = createLookupMap<K, Semaphore, L>({ lookup });

  const getSemaphore = (key: K): Semaphore =>
    semaphoresByKey.getOrInsertComputed(key, () =>
      createSemaphore(initialPermits),
    );

  const withPermits =
    (key: K, requestedPermits: Int1To100OrPositiveInt) =>
    <T, E, D>(task: Task<T, E, D>): Task<T, E, D> =>
    async (run) => {
      const semaphore = getSemaphore(key);
      try {
        using _permit = await run.ok(semaphore.take(requestedPermits));
        return await run(task);
      } finally {
        if (semaphore.isIdle()) semaphoresByKey.delete(key);
      }
    };

  return {
    withPermit: (key, task) => withPermits(key, 1)(task),
    withPermits,
    isIdle: (key) => semaphoresByKey.get(key)?.isIdle() ?? true,
    snapshot: (key) => semaphoresByKey.get(key)?.snapshot() ?? null,
  };
}

/**
 * Runs Tasks one at a time independently for each key, like {@link Mutex}.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createGate,
 *   createMutexByKey,
 *   createRun,
 *   ok,
 *   type Task,
 * } from "@evolu/common";
 *
 * const accountLocks = createMutexByKey<string>();
 * const finishDeposits = createGate();
 * const firstBatchStarted = Promise.withResolvers<void>();
 * const started: Array<string> = [];
 * const balancesByAccount = new Map<string, number>();
 * const deposit = (account: string, amount: number): Task<number> =>
 *   accountLocks.withLock(account, async (run) => {
 *     started.push(account);
 *     if (started.length === 2) firstBatchStarted.resolve();
 *     await run.ok(finishDeposits.wait);
 *     const balance = (balancesByAccount.get(account) ?? 0) + amount;
 *     balancesByAccount.set(account, balance);
 *     return ok(balance);
 *   });
 *
 * await using run = createRun();
 * const first = run(deposit("checking", 2));
 * const second = run(deposit("checking", 3));
 * const third = run(deposit("savings", 4));
 * await firstBatchStarted.promise;
 * // Different accounts proceed together; the second checking deposit waits.
 * expect(started).toEqual(["checking", "savings"]);
 *
 * finishDeposits.open();
 * expectOk(await first, 2);
 * expectOk(await second, 5);
 * expectOk(await third, 4);
 * expect(started).toEqual(["checking", "savings", "checking"]);
 * ```
 *
 * @group Concurrency primitives
 */
export interface MutexByKey<K = unknown> {
  /** Runs a {@link Task} while holding the lock for the key. */
  readonly withLock: <T, E, D>(key: K, task: Task<T, E, D>) => Task<T, E, D>;

  /** Whether the lock for the key is neither held nor queued. */
  readonly isIdle: (key: K) => boolean;

  /** Returns the current key lock state, or null when the key is idle. */
  readonly snapshot: (key: K) => SemaphoreSnapshot | null;
}

/**
 * Options for {@link createMutexByKey}.
 *
 * @group Concurrency primitives
 */
export interface CreateMutexByKeyOptions<K, L = K> extends LookupOption<K, L> {}

/**
 * Creates a {@link MutexByKey}.
 *
 * @group Concurrency primitives
 */
export function createMutexByKey<K = unknown>(
  options?: CreateMutexByKeyOptions<K, unknown>,
): MutexByKey<K>;
export function createMutexByKey<K, L>(
  options: CreateMutexByKeyOptions<K, L>,
): MutexByKey<K>;
export function createMutexByKey<K, L = K>({
  lookup = identity as Lookup<K, L>,
}: CreateMutexByKeyOptions<K, L> = {}): MutexByKey<K> {
  const semaphoreByKey = createSemaphoreByKey<K, L>(1, { lookup });

  return {
    withLock: (key, task) => semaphoreByKey.withPermit(key, task),
    isIdle: semaphoreByKey.isIdle,
    snapshot: semaphoreByKey.snapshot,
  };
}

/**
 * {@link Ref} protected by a {@link Mutex}.
 *
 * `MutexRef` serializes reads, writes, and updates through an internal Mutex,
 * so every operation observes one consistent value transition at a time. When
 * an update fails or is aborted, the previous value is preserved.
 *
 * `MutexRef` is non-reentrant. Updaters and modifiers run while holding the
 * internal Mutex, so calling another method on the same MutexRef from inside
 * one of them waits on itself and will not progress.
 *
 * Use it for state whose transitions are Tasks: atomic async read-modify-write.
 * Plain Ref cannot express that — between a sync read and a later write, a
 * concurrent transition can interleave and get lost.
 *
 * `MutexRef` operations are Tasks and incur normal Run lifecycle overhead. Use
 * {@link Ref} instead for synchronous state transitions, especially on
 * allocation-sensitive hot paths.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   createGate,
 *   createMutexRef,
 *   createRun,
 *   ok,
 *   type Task,
 * } from "@evolu/common";
 *
 * await using run = createRun();
 *
 * const finishRefresh = createGate();
 * const refreshStarted = Promise.withResolvers<void>();
 * let fetchTokenCalls = 0;
 * const fetchToken: Task<string> = async (run) => {
 *   fetchTokenCalls += 1;
 *   refreshStarted.resolve();
 *   await run.ok(finishRefresh.wait);
 *   return ok("fresh-token");
 * };
 *
 * const tokenRef = createMutexRef<string | null>(null);
 *
 * // Concurrent callers never trigger duplicate refreshes: the first caller
 * // runs fetchToken under the lock; later callers reuse the stored token.
 * const getToken = tokenRef.updateAndGet((current) =>
 *   current === null ? fetchToken : () => ok(current),
 * );
 *
 * const first = run(getToken);
 * await refreshStarted.promise;
 * const second = run(getToken);
 * finishRefresh.open();
 *
 * const [firstResult, secondResult] = await Promise.all([first, second]);
 * expectTypeOf(getToken).toEqualTypeOf<Task<string | null>>();
 * expectOk(firstResult, "fresh-token");
 * expectOk(secondResult, "fresh-token");
 * expect(fetchTokenCalls).toBe(1);
 * expectOk(await run(tokenRef.get), "fresh-token");
 * ```
 *
 * @group Concurrency primitives
 * @see {@link createMutexRef}
 */
export interface MutexRef<T> {
  /** Returns the current value. */
  readonly get: Task<T>;

  /** Sets the current value. */
  readonly set: (value: T) => Task<void>;

  /** Sets the current value and returns the previous value. */
  readonly getAndSet: (value: T) => Task<T>;

  /** Sets the current value and returns it. */
  readonly setAndGet: (value: T) => Task<T>;

  /** Updates the current value. */
  readonly update: <E = never, D = unknown>(
    updater: (current: T) => Task<T, E, D>,
  ) => Task<void, E, D>;

  /** Updates the current value and returns the previous value. */
  readonly getAndUpdate: <E = never, D = unknown>(
    updater: (current: T) => Task<T, E, D>,
  ) => Task<T, E, D>;

  /** Updates the current value and returns it. */
  readonly updateAndGet: <E = never, D = unknown>(
    updater: (current: T) => Task<T, E, D>,
  ) => Task<T, E, D>;

  /** Modifies the current value and returns a computed result. */
  readonly modify: <R, E = never, D = unknown>(
    modifier: (current: T) => Task<readonly [result: R, nextValue: T], E, D>,
  ) => Task<R, E, D>;

  /** Returns the current lock state for monitoring and debugging. */
  readonly snapshot: () => SemaphoreSnapshot;
}

/**
 * Creates a {@link MutexRef}.
 *
 * @group Concurrency primitives
 */
export const createMutexRef = <T>(initialValue: T): MutexRef<T> => {
  const ref = createRef(initialValue);
  const mutex = createMutex();

  return {
    get: mutex.withLock(() => ok(ref.get())),

    set: (value) =>
      mutex.withLock(() => {
        ref.set(value);
        return ok();
      }),

    getAndSet: (value) => mutex.withLock(() => ok(ref.getAndSet(value))),

    setAndGet: (value) => mutex.withLock(() => ok(ref.setAndGet(value))),

    update: (updater) =>
      mutex.withLock(async (run) => {
        const nextValue = await run(updater(ref.get()));
        if (!nextValue.ok) return nextValue;
        ref.set(nextValue.value);
        return ok();
      }),

    getAndUpdate: (updater) =>
      mutex.withLock(async (run) => {
        const previousValue = ref.get();
        const nextValue = await run(updater(previousValue));
        if (!nextValue.ok) return nextValue;
        ref.set(nextValue.value);
        return ok(previousValue);
      }),

    updateAndGet: (updater) =>
      mutex.withLock(async (run) => {
        const nextValue = await run(updater(ref.get()));
        if (!nextValue.ok) return nextValue;
        ref.set(nextValue.value);
        return ok(nextValue.value);
      }),

    modify: (modifier) =>
      mutex.withLock(async (run) => {
        const result = await run(modifier(ref.get()));
        if (!result.ok) return result;
        const [value, nextValue] = result.value;
        ref.set(nextValue);
        return ok(value);
      }),

    snapshot: mutex.snapshot,
  };
};

// TODO: Add Run observability after Task migration.
// - Structured logging with levels, inherited log annotations, JSON output,
//   filtering, and pluggable log sinks.
// - Tracing spans with names, timing, parent-child relationships, attributes,
//   error status, and helpers for annotating the current or child spans.
// - Metrics for counters, gauges, histograms, and operation durations.
// - Resource metadata for service name, service version, deployment
//   environment, and user-provided attributes.
// - Exporters for production telemetry backends, including OTLP-compatible
//   logs, traces, and metrics.
// - Transferable snapshots for local and worker monitoring. Current snapshots
//   can contain arbitrary Result values and Error objects, so serialization must
//   replace non-transferable values with safe diagnostics.
// - Incremental snapshot invalidation so polling unchanged large Run trees
//   avoids recursive traversal and child-array allocation.
// - Run labels and structured annotations for rendering useful snapshot trees
//   instead of anonymous ids.
// - Snapshot and trace views should preserve ownership boundaries, so reusable
//   resources and long-lived operations appear as labeled subtrees instead of
//   unrelated child operations.
