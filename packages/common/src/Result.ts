/**
 * ## Intro
 *
 * Type-safe error handling with {@link Result}.
 *
 * The problem with exceptions in JavaScript is that a caught value is always of
 * unknown type. We can't be sure all errors have been handled because the
 * TypeScript compiler can't tell us what might be thrown — we can't use
 * {@link exhaustiveCheck}.
 *
 * Languages like Rust and Haskell model recoverable failures with types such as
 * `Result` and `Either`, making errors part of the return type.
 *
 * TypeScript can express the same pattern with discriminated unions of plain
 * objects. In Evolu, domain error interfaces extend {@link Typed} to avoid
 * repeating the literal `type` discriminant.
 *
 * ```ts
 * import {
 *   err,
 *   exhaustiveCheck,
 *   type Result,
 *   type Typed,
 * } from "@evolu/common";
 *
 * // TypeScript can't know what was thrown.
 * try {
 *   throw new Error("Not found");
 * } catch (error) {
 *   expectTypeOf(error).toEqualTypeOf<unknown>();
 * }
 *
 * // With Result, errors are part of the return type.
 * const doSomething = (): Result<
 *   number,
 *   InvalidInputError | NotFoundError
 * > => err({ type: "NotFound" });
 *
 * interface InvalidInputError extends Typed<"InvalidInput"> {}
 *
 * interface NotFoundError extends Typed<"NotFound"> {}
 *
 * // With Result, the error type is known and exhaustiveCheck works.
 * // If we add another error type, TypeScript tells us it isn't handled.
 * const result = doSomething();
 * if (!result.ok) {
 *   switch (result.error.type) {
 *     case "NotFound":
 *       expect(result.error).toEqual({ type: "NotFound" });
 *       break;
 *     case "InvalidInput":
 *       expect(result.error).toEqual({ type: "InvalidInput" });
 *       break;
 *     default:
 *       exhaustiveCheck(result.error);
 *   }
 * }
 * expectErr(result, { type: "NotFound" });
 * ```
 *
 * A `Result` is either {@link Ok} (success with a value) or {@link Err} (failure
 * with an error). Create them with {@link ok} and {@link err}.
 *
 * ```ts
 * type Result<T, E = never> = Ok<T> | Err<E>;
 *
 * interface Ok<T> {
 *   readonly ok: true;
 *   readonly value: T;
 * }
 *
 * interface Err<E> {
 *   readonly ok: false;
 *   readonly error: E;
 * }
 * ```
 *
 * Use {@link trySync} and {@link tryAsync} to intentionally convert thrown values
 * and Promise rejections into typed, recoverable errors represented by
 * `Result`.
 *
 * Do not wrap every API that throws or rejects in `Result`. If an error is
 * unrecoverable and the caller has no meaningful fallback, let it propagate.
 *
 * Since `Result` is a plain object, imperative code works naturally.
 *
 * ```ts
 * import { ok, type Result, type Typed } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 *
 * const getUser = (): Result<User, UserNotFoundError> =>
 *   ok({ id: "user-1" });
 *
 * interface UserNotFoundError extends Typed<"UserNotFound"> {}
 *
 * interface Profile {
 *   readonly userId: string;
 * }
 *
 * const getProfile = (
 *   userId: string,
 * ): Result<Profile, ProfileNotFoundError> => ok({ userId });
 *
 * interface ProfileNotFoundError extends Typed<"ProfileNotFound"> {}
 *
 * const getCurrentProfile = (): Result<
 *   Profile,
 *   UserNotFoundError | ProfileNotFoundError
 * > => {
 *   const user = getUser();
 *   if (!user.ok) return user;
 *
 *   return getProfile(user.value.id);
 * };
 *
 * const profile = getCurrentProfile();
 * expectTypeOf(profile).toEqualTypeOf<
 *   Result<Profile, UserNotFoundError | ProfileNotFoundError>
 * >();
 * expectOk(profile, { userId: "user-1" });
 * ```
 *
 * Note `user` and `profile` are named after their success values, not after the
 * Result (`userResult`, `profileResult`).
 *
 * If a Result has no success value, name it `result`. For several such
 * operations, use {@link allResult} with `{ collect: false }`.
 *
 * ## Unrecoverable errors
 *
 * Unrecoverable errors are failures the application can't handle meaningfully.
 * For example, a database failure is unrecoverable when the application has no
 * useful fallback, retry, or degraded mode.
 *
 * Do not turn such failures into `Result` merely because the underlying API
 * throws or rejects. Let the exception or Promise rejection propagate to the
 * top-level handler so the application stops instead of continuing in a
 * potentially invalid state.
 *
 * In Evolu apps, the root {@link Run} reports defects and the platform lifecycle
 * API owns application shutdown. For example, `@evolu/nodejs` provides
 * {@link @evolu/nodejs!runMain | runMain}.
 *
 * ## FAQ
 *
 * ### Is Result expensive?
 *
 * Wrapping a value in Result creates one small plain object and is very cheap.
 * Its cost is usually worth considering only when a performance-critical loop
 * creates millions of Results. Use Result by default; if profiling identifies
 * such a loop as a bottleneck, benchmark the complete workload before
 * optimizing it.
 *
 * ### Why not generators?
 *
 * Generator-based APIs make sequential workflows more concise: `yield*`
 * combines error propagation (roughly replacing `if (!result.ok) return
 * result`) with unwrapping the success value. That doesn't come for free.
 * Supporting direct `yield*` requires adding iterator behavior to every Result;
 * otherwise every use needs an adapter. That makes Result more than plain
 * structural data: after serialization, its iterator behavior must be restored
 * before direct `yield*` works. Generator machinery also makes control flow,
 * debugger stepping, and stack traces less direct while adding runtime
 * overhead. Evolu instead keeps Result as plain data and makes error
 * propagation explicit. With AI, explicit checks are cheap to write.
 *
 * Generators do not make accidental omission impossible: a function returning a
 * lazy operation can be called without composing the returned value with
 * `yield*`, leaving the operation out of the workflow, just as a
 * Result-returning function can be called and its Result ignored. Dedicated
 * tooling can detect these omissions, but that safety comes from the tooling,
 * not generator syntax itself.
 *
 * The intended way to write Evolu code is with test-driven development (TDD).
 * Tests document the intended behavior and serve as its runnable specification,
 * including failure paths. AI makes writing and maintaining those tests cheap.
 * {@link exhaustiveCheck} complements tests by having TypeScript report newly
 * added error variants.
 *
 * ### What if a function doesn't return a value on success?
 *
 * Use `Result<void, E>` and return `ok()` (no argument). Don't return
 * `ok(true)`, `ok("success")`, or `ok("done")` — `ok()` already signals
 * success; redundant values add noise.
 *
 * @module
 */
import {
  emptyArray,
  isNonEmptyArray,
  type NonEmptyReadonlyArray,
} from "./Array.ts";
import { assert } from "./Assert.ts";
import { exhaustiveCheck, type Thunk } from "./Function.ts";
import { createMutableRecord, emptyRecord, isIterable } from "./Object.ts";
import type { Run } from "./Task.ts";
import type { Typed } from "./Type.ts";
import type { Awaitable } from "./Types.ts";

/**
 * A discriminated success or failure value: either {@link Ok} or {@link Err}.
 *
 * See the {@link @evolu/common!Result | Result overview}.
 *
 * @group Core
 */
export type Result<T, E = never> = Ok<T> | Err<E>;

/**
 * Shorthand for a {@link Result} with `any` type parameters.
 *
 * @group Core
 */
export type AnyResult = Result<any, any>;

/**
 * A successful {@link Result}.
 *
 * ### Example
 *
 * ```ts
 * import { ok, type Result } from "@evolu/common";
 *
 * const result = ok();
 * const count = ok(42);
 *
 * expectTypeOf(result).toEqualTypeOf<Result<void>>();
 * expectTypeOf(count).toEqualTypeOf<Result<number>>();
 * expectOk(result, undefined);
 * expectOk(count, 42);
 * ```
 *
 * @group Core
 */
export interface Ok<out T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * An error {@link Result}.
 *
 * The `error` property can be any type that describes the error. For domain
 * errors, define a plain interface extending {@link Typed}.
 *
 * ### Example
 *
 * ```ts
 * import { err, ok, type Result, type Typed } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 *
 * const users = new Map<string, User>([["user-1", { id: "user-1" }]]);
 * const findUser = (id: string): Result<User, NotFoundError> => {
 *   const user = users.get(id);
 *   if (user == null) return err({ type: "NotFound", id });
 *   return ok(user);
 * };
 *
 * interface NotFoundError extends Typed<"NotFound"> {
 *   readonly id: string;
 * }
 *
 * expectOk(findUser("user-1"), { id: "user-1" });
 * expectErr(findUser("missing"), {
 *   type: "NotFound",
 *   id: "missing",
 * });
 * ```
 *
 * @group Core
 */
export interface Err<out E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Infers the success value type from a {@link Result}.
 *
 * @group Core
 */
export type InferOk<R extends Result<any, any>> =
  R extends Ok<infer T> ? T : never;

/**
 * Infers the error type from a {@link Result}.
 *
 * @group Core
 */
export type InferErr<R extends Result<any, any>> =
  R extends Err<infer E> ? E : never;

/**
 * Creates an {@link Ok} result.
 *
 * - `ok()` creates a `Result<void, never>` for operations that succeed without
 *   producing a value.
 * - `ok(value)` creates a `Result<T, never>` containing the specified value.
 *
 * @group Core
 */
export function ok(): Result<void>;
/** Creates an {@link Ok} result with a specified value. */
export function ok<T>(value: T): Result<T>;
export function ok<T>(value?: T): Result<T> {
  if (value === undefined) return okVoid as Result<T>;
  return { ok: true, value: value as T };
}

/** Cache ok() and ok(undefined) to avoid repeated allocations. */
const okVoid: Result<void> = { ok: true, value: undefined };

/**
 * Creates an {@link Err} result.
 *
 * @group Core
 */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/**
 * Type guard for {@link Ok} results.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   isOk,
 *   ok,
 *   type Ok,
 *   type Result,
 *   type Typed,
 * } from "@evolu/common";
 *
 * const getCount = (): Result<number, CountUnavailableError> => ok(2);
 *
 * interface CountUnavailableError extends Typed<"CountUnavailable"> {}
 *
 * const count = getCount();
 * if (isOk(count)) {
 *   expectTypeOf(count).toEqualTypeOf<Ok<number>>();
 *   expect(count.value).toBe(2);
 * }
 * ```
 *
 * @group Guards
 */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok;

/**
 * Type guard for {@link Err} results.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   err,
 *   isErr,
 *   type Err,
 *   type Result,
 *   type Typed,
 * } from "@evolu/common";
 *
 * const getCount = (): Result<number, CountUnavailableError> =>
 *   err({ type: "CountUnavailable" });
 *
 * interface CountUnavailableError extends Typed<"CountUnavailable"> {}
 *
 * const count = getCount();
 * if (isErr(count)) {
 *   expectTypeOf(count).toEqualTypeOf<Err<CountUnavailableError>>();
 *   expect(count.error).toEqual({ type: "CountUnavailable" });
 * }
 * ```
 *
 * @group Guards
 */
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> =>
  !result.ok;

/**
 * Gets the value from an {@link Ok}, or throws for an {@link Err}.
 *
 * Use this where failure should crash the current flow instead of being handled
 * locally.
 *
 * **When to use:**
 *
 * - Application startup or composition-root setup where errors must stop the
 *   program immediately. In Evolu apps, the root {@link Run} reports the defect
 *   and the platform lifecycle API handles shutdown.
 * - Module-level constants
 * - Test setup with values that are expected to be valid
 *
 * Prefer an explicit `if (!result.ok)` check in ordinary application logic
 * where the caller can recover, retry, or choose a different flow.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   err,
 *   getOrThrow,
 *   ok,
 *   type Result,
 *   type Typed,
 * } from "@evolu/common";
 *
 * interface Config {
 *   readonly port: number;
 * }
 *
 * const loadConfig = (): Result<Config, InvalidConfigError> =>
 *   ok({ port: 3000 });
 *
 * interface InvalidConfigError extends Typed<"InvalidConfig"> {}
 *
 * // At app startup, crash if the config is invalid.
 * const config = getOrThrow(loadConfig());
 * expectTypeOf(config).toEqualTypeOf<Config>();
 * expect(config).toEqual({ port: 3000 });
 *
 * try {
 *   getOrThrow(err({ type: "InvalidConfig" }));
 *   assert.fail("Expected getOrThrow to throw");
 * } catch (error) {
 *   assert(error instanceof Error);
 *   expect(error.message).toBe("getOrThrow");
 *   expect(error.cause).toEqual({ type: "InvalidConfig" });
 * }
 * ```
 *
 * Throws: `Error` with the original error attached as `cause`.
 *
 * @group Unwrapping
 */
export const getOrThrow = <T, E>(result: Result<T, E>): T => {
  if (result.ok) {
    return result.value;
  } else {
    throw new Error("getOrThrow", { cause: result.error });
  }
};

/**
 * Gets the value from an {@link Ok}, or returns `null` for an {@link Err}.
 *
 * **Intended usage:**
 *
 * - When you need to convert a `Result` to a nullable value for APIs that expect
 *   `T | null`.
 * - When the error is not important and you just want the value or nothing.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   err,
 *   getOrNull,
 *   ok,
 *   type Result,
 *   type Typed,
 * } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 *
 * const findUser = (id: string): Result<User, UserNotFoundError> =>
 *   id === "user-1" ? ok({ id }) : err({ type: "UserNotFound" });
 *
 * interface UserNotFoundError extends Typed<"UserNotFound"> {}
 *
 * // For APIs that expect T | null.
 * const user = getOrNull(findUser("user-1"));
 * const missingUser = getOrNull(findUser("missing"));
 *
 * expectTypeOf(user).toEqualTypeOf<User | null>();
 * expect(user).toEqual({ id: "user-1" });
 * expect(missingUser).toBeNull();
 * ```
 *
 * @group Unwrapping
 */
export const getOrNull = <T, E>(result: Result<T, E>): T | null =>
  result.ok ? result.value : null;

/**
 * Gets the value from a {@link Result} whose error type is `never`.
 *
 * This is useful when the type system guarantees the result cannot fail (for
 * example `Result<T, never>`), avoiding impossible `if (!result.ok)` branches
 * at call sites.
 *
 * ### Example
 *
 * ```ts
 * import { getOk, ok, type Result } from "@evolu/common";
 *
 * const getCount = (): Result<number> => ok(2);
 * const count = getOk(getCount());
 * expectTypeOf(count).toEqualTypeOf<number>();
 * expect(count).toBe(2);
 * ```
 *
 * @group Unwrapping
 */
export const getOk = <T>(result: Result<T>): T => {
  assert(result.ok, "Expected Ok result.");
  return result.value;
};

/**
 * Wraps a synchronous function that may throw, returning a {@link Result}.
 *
 * When provided, `mapError` converts the caught `unknown` value into a typed
 * domain error.
 *
 * Some APIs throw for both recoverable and unrecoverable errors. In that case,
 * convert only the errors the caller can recover from and rethrow the rest. The
 * `trySync` error mapper propagates rethrown values instead of converting them
 * to {@link Err}.
 *
 * ### Example
 *
 * ```ts
 * import { trySync, type Result, type Typed } from "@evolu/common";
 *
 * class LegacySeatUnavailableError extends Error {}
 *
 * const legacyReserveSeat = (seat: string): void => {
 *   if (seat === "A1") throw new LegacySeatUnavailableError();
 *   if (seat === "B1") throw new Error("Database error");
 * };
 *
 * const reserveSeat = (seat: string): Result<void, SeatUnavailableError> =>
 *   trySync(
 *     () => legacyReserveSeat(seat),
 *     (error) => {
 *       if (error instanceof LegacySeatUnavailableError) {
 *         return { type: "SeatUnavailable", seat };
 *       }
 *       throw error;
 *     },
 *   );
 *
 * interface SeatUnavailableError extends Typed<"SeatUnavailable"> {
 *   readonly seat: string;
 * }
 *
 * const result = reserveSeat("B2");
 * expectTypeOf(result).toEqualTypeOf<Result<void, SeatUnavailableError>>();
 * expectOk(result, undefined);
 * expectErr(reserveSeat("A1"), { type: "SeatUnavailable", seat: "A1" });
 * expect(() => reserveSeat("B1")).toThrow("Database error");
 * ```
 *
 * @group Exception interop
 */
export function trySync<T>(fn: () => T): Result<T, unknown>;

/** Maps caught exceptions to a typed error. */
export function trySync<T, E>(
  fn: () => T,
  mapError: (error: unknown) => E,
): Result<T, E>;
export function trySync<T, E>(
  fn: () => T,
  mapError?: (error: unknown) => E,
): Result<T, E | unknown> {
  try {
    return ok(fn());
  } catch (error) {
    return err(mapError ? mapError(error) : error);
  }
}

/**
 * Wraps an async function that may throw or reject, returning a {@link Result}.
 *
 * When provided, `mapError` converts the caught `unknown` value into a typed
 * domain error.
 *
 * Some async APIs throw or reject for both recoverable and unrecoverable
 * errors. In that case, convert only the errors the caller can recover from and
 * rethrow the rest. The `tryAsync` error mapper leaves rethrown values as
 * Promise rejections instead of converting them to {@link Err}.
 *
 * ### Example
 *
 * ```ts
 * import { tryAsync, type Result, type Typed } from "@evolu/common";
 *
 * class LegacySeatUnavailableError extends Error {}
 *
 * const legacyReserveSeat = async (seat: string): Promise<void> => {
 *   if (seat === "A1") throw new LegacySeatUnavailableError();
 *   if (seat === "B1") throw new Error("Database error");
 * };
 *
 * const reserveSeat = (
 *   seat: string,
 * ): Promise<Result<void, SeatUnavailableError>> =>
 *   tryAsync(
 *     () => legacyReserveSeat(seat),
 *     (error) => {
 *       if (error instanceof LegacySeatUnavailableError) {
 *         return { type: "SeatUnavailable", seat };
 *       }
 *       throw error;
 *     },
 *   );
 *
 * interface SeatUnavailableError extends Typed<"SeatUnavailable"> {
 *   readonly seat: string;
 * }
 *
 * const result = await reserveSeat("B2");
 * expectTypeOf(result).toEqualTypeOf<Result<void, SeatUnavailableError>>();
 * expectOk(result, undefined);
 * expectErr(await reserveSeat("A1"), {
 *   type: "SeatUnavailable",
 *   seat: "A1",
 * });
 * await expect(reserveSeat("B1")).rejects.toThrow("Database error");
 * ```
 *
 * @group Exception interop
 */
export function tryAsync<T>(
  promiseThunk: Thunk<Awaitable<T>>,
): Promise<Result<T, unknown>>;

/** Maps thrown or rejected values to a typed error. */
export function tryAsync<T, E>(
  promiseThunk: Thunk<Awaitable<T>>,
  mapError: (error: unknown) => E,
): Promise<Result<T, E>>;
export async function tryAsync<T, E>(
  promiseThunk: Thunk<Awaitable<T>>,
  mapError?: (error: unknown) => E,
): Promise<Result<T, E | unknown>> {
  try {
    return ok(await promiseThunk());
  } catch (error) {
    return err(mapError ? mapError(error) : error);
  }
}

/**
 * A result for a pull-based protocol with three outcomes.
 *
 * The consumer requests the next value (e.g. via `next()`), and the producer
 * responds with one of:
 *
 * - An {@link Ok} containing `A` — produced a value
 * - An {@link Err} containing {@link Done} — completed normally with a done value
 * - An {@link Err} containing `E` — failed with an error
 *
 * Inspired by JavaScript's `Iterator.next()`, which returns `{ value, done }`.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   done,
 *   err,
 *   ok,
 *   type NextResult,
 *   type Typed,
 * } from "@evolu/common";
 *
 * const next = (
 *   index: number,
 * ): NextResult<string, ReadFailedError, number> => {
 *   if (index === 0) return ok("first");
 *   if (index === 1) return err({ type: "ReadFailed" });
 *   return err(done(index));
 * };
 *
 * interface ReadFailedError extends Typed<"ReadFailed"> {}
 *
 * const value = next(0);
 * expectTypeOf(value).toEqualTypeOf<
 *   NextResult<string, ReadFailedError, number>
 * >();
 * expectOk(value, "first");
 * expectErr(next(1), { type: "ReadFailed" });
 * expectErr(next(2), { type: "Done", done: 2 });
 * ```
 *
 * @group Pull
 */
export type NextResult<A, E = never, D = void> = Result<A, E | Done<D>>;

/**
 * A signal indicating normal completion of a pull-based protocol.
 *
 * This is not a failure — it is a control signal that carries an optional
 * "done" value (often `void`, but can be a final summary or leftover).
 *
 * Inspired by JavaScript's `IteratorResult` where `{ done: true }` signals
 * completion.
 *
 * ### Example
 *
 * ```ts
 * import { done, type Done } from "@evolu/common";
 *
 * const withoutValue = done();
 * const withValue = done(42);
 * expectTypeOf(withoutValue).toEqualTypeOf<Done<void>>();
 * expectTypeOf(withValue).toEqualTypeOf<Done<number>>();
 * expect(withoutValue).toEqual({ type: "Done", done: undefined });
 * expect(withValue).toEqual({ type: "Done", done: 42 });
 * ```
 *
 * @group Pull
 */
export interface Done<out D = unknown> extends Typed<"Done"> {
  readonly done: D;
}

/**
 * Constructs a {@link Done} value.
 *
 * - `done()` creates a `Done<void>` for protocols that don't need a done value.
 * - `done(value)` creates a `Done<D>` containing the specified value.
 *
 * @group Pull
 */
export function done(): Done<void>;
/** With a done value. */
export function done<D>(value: D): Done<D>;
export function done<D>(value?: D): Done<D> {
  return {
    type: "Done",
    done: value as D,
  };
}

/**
 * Removes {@link Done} from an error union.
 *
 * Useful for pull-based protocols where completion is encoded in the error
 * channel (for example {@link NextResult}).
 *
 * ### Example
 *
 * ```ts
 * import { type Done, type ExcludeDone, type Typed } from "@evolu/common";
 *
 * type Errors = ReadFailedError | Done<number>;
 *
 * interface ReadFailedError extends Typed<"ReadFailed"> {}
 *
 * expectTypeOf<ExcludeDone<Errors>>().toEqualTypeOf<ReadFailedError>();
 * ```
 *
 * @group Pull
 */
export type ExcludeDone<E> = Exclude<E, Done<any>>;

/**
 * Extracts only {@link Done} from an error union.
 *
 * Useful for pull-based protocols where completion is encoded in the error
 * channel (for example {@link NextResult}).
 *
 * ### Example
 *
 * ```ts
 * import { type Done, type OnlyDone, type Typed } from "@evolu/common";
 *
 * type Errors = ReadFailedError | Done<number>;
 *
 * interface ReadFailedError extends Typed<"ReadFailed"> {}
 *
 * expectTypeOf<OnlyDone<Errors>>().toEqualTypeOf<Done<number>>();
 * ```
 *
 * @group Pull
 */
export type OnlyDone<E> = Extract<E, Done<any>>;

/**
 * Infers the done value type from a {@link NextResult}.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   type InferDone,
 *   type NextResult,
 *   type Typed,
 * } from "@evolu/common";
 *
 * type ReadResult = NextResult<string, ReadFailedError, number>;
 *
 * interface ReadFailedError extends Typed<"ReadFailed"> {}
 *
 * expectTypeOf<InferDone<ReadResult>>().toEqualTypeOf<number>();
 * ```
 *
 * @group Pull
 */
export type InferDone<R extends Result<any, any>> =
  InferErr<R> extends infer Errors
    ? Errors extends Done<infer D>
      ? D
      : never
    : never;

/**
 * Composes a successful {@link Result} with another Result-returning operation.
 *
 * Returns the existing error without calling the operation when the Result has
 * failed.
 *
 * Do not nest `flatMapResult`. For longer workflows, use explicit checks, which
 * keep names, intermediate values, and control flow flat and easy to read.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   flatMapResult,
 *   ok,
 *   type Result,
 *   type Typed,
 * } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 *
 * interface UserNotFoundError extends Typed<"UserNotFound"> {}
 *
 * interface Profile {
 *   readonly userId: string;
 * }
 *
 * const getProfile = (
 *   userId: string,
 * ): Result<Profile, ProfileNotFoundError> => ok({ userId });
 *
 * interface ProfileNotFoundError extends Typed<"ProfileNotFound"> {}
 *
 * const user: Result<User, UserNotFoundError> = ok({ id: "user-1" });
 * const profile = flatMapResult(user, ({ id }) => getProfile(id));
 * expectTypeOf(profile).toEqualTypeOf<
 *   Result<Profile, UserNotFoundError | ProfileNotFoundError>
 * >();
 * expectOk(profile, { userId: "user-1" });
 * ```
 *
 * @group Composition
 */
export const flatMapResult = <T, E, U, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> => (result.ok ? fn(result.value) : result);

/**
 * Collects successful values from {@link Result}s.
 *
 * Stops processing the input at the first {@link Err}. Mapping overloads do not
 * call the mapper for the remaining input values.
 *
 * Pass `{ collect: false }` to return `Result<void, E>` without storing the
 * {@link Ok} values in an output collection.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, ok, type Result, type Typed } from "@evolu/common";
 *
 * const getCount = (): Result<number, CountUnavailableError> => ok(2);
 *
 * interface CountUnavailableError extends Typed<"CountUnavailable"> {}
 *
 * const getLabel = (): Result<string, LabelUnavailableError> =>
 *   ok("books");
 *
 * interface LabelUnavailableError extends Typed<"LabelUnavailable"> {}
 *
 * const values = allResult([getCount(), getLabel()]);
 * expectTypeOf(values).toEqualTypeOf<
 *   Result<
 *     readonly [number, string],
 *     CountUnavailableError | LabelUnavailableError
 *   >
 * >();
 * expectOk(values, [2, "books"]);
 * ```
 *
 * @group Composition
 */
export function allResult<
  const T extends readonly [AnyResult, ...ReadonlyArray<AnyResult>],
>(results: T): Result<{ [K in keyof T]: InferOk<T[K]> }, InferErr<T[number]>>;

/**
 * Returns an object with the same keys.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, ok, type Result } from "@evolu/common";
 *
 * const resultsByName = { a: ok(1), b: ok(2) } as const;
 * const valuesByName = allResult(resultsByName);
 * expectTypeOf(valuesByName).toEqualTypeOf<
 *   Result<{ readonly a: number; readonly b: number }>
 * >();
 * expectOk(valuesByName, { a: 1, b: 2 });
 * ```
 */
export function allResult<T extends Readonly<Record<string, AnyResult>>>(
  results: T,
): Result<
  { [P in keyof T]: InferOk<T[P]> },
  [keyof T] extends [never] ? never : InferErr<T[keyof T]>
>;

/**
 * For dynamic or generated result lists.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, ok, type Result } from "@evolu/common";
 *
 * const results: ReadonlyArray<Result<number>> = [ok(1), ok(2)];
 * const numbers = allResult(results);
 * expectTypeOf(numbers).toEqualTypeOf<Result<ReadonlyArray<number>>>();
 * expectOk(numbers, [1, 2]);
 * ```
 */
export function allResult<T, E>(
  results: Iterable<Result<T, E>>,
): Result<ReadonlyArray<T>, E>;

/**
 * Preserves a non-empty array on success.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   allResult,
 *   ok,
 *   type NonEmptyReadonlyArray,
 *   type Result,
 * } from "@evolu/common";
 *
 * const results: NonEmptyReadonlyArray<Result<number>> = [ok(1), ok(2)];
 * const numbers = allResult(results);
 * expectTypeOf(numbers).toEqualTypeOf<
 *   Result<NonEmptyReadonlyArray<number>>
 * >();
 * expectOk(numbers, [1, 2]);
 * ```
 */
export function allResult<T, E>(
  results: NonEmptyReadonlyArray<Result<T, E>>,
): Result<NonEmptyReadonlyArray<T>, E>;

/**
 * Does not collect the Ok values from a record of Results.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, ok, type Result } from "@evolu/common";
 *
 * const result = allResult({ a: ok(1), b: ok(2) }, { collect: false });
 * expectTypeOf(result).toEqualTypeOf<Result<void>>();
 * expectOk(result, undefined);
 * ```
 */
export function allResult<T extends Readonly<Record<string, AnyResult>>>(
  results: T,
  options: { readonly collect: false },
): Result<void, [keyof T] extends [never] ? never : InferErr<T[keyof T]>>;

/**
 * Does not collect the Ok values from an iterable of Results.
 *
 * Use this overload when the Results already exist and only their collective
 * success or failure matters.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, ok, type Result } from "@evolu/common";
 *
 * const results: ReadonlyArray<Result<number>> = [ok(1), ok(2)];
 * const result = allResult(results, { collect: false });
 * expectTypeOf(result).toEqualTypeOf<Result<void>>();
 * expectOk(result, undefined);
 * ```
 */
export function allResult<R extends AnyResult>(
  results: Iterable<R>,
  options: { readonly collect: false },
): Result<void, InferErr<R>>;

/**
 * Maps a non-empty array or tuple to Results and preserves its shape.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   allResult,
 *   ok,
 *   type NonEmptyReadonlyArray,
 *   type Result,
 * } from "@evolu/common";
 *
 * const numbers: NonEmptyReadonlyArray<number> = [1, 2];
 * const doubled = allResult(numbers, (number) => ok(number * 2));
 * expectTypeOf(doubled).toEqualTypeOf<
 *   Result<NonEmptyReadonlyArray<number>>
 * >();
 * expectOk(doubled, [2, 4]);
 *
 * const tuple = allResult([1, 2] as const, (number) => ok(number * 2));
 * expectTypeOf(tuple).toEqualTypeOf<Result<readonly [number, number]>>();
 * expectOk(tuple, [2, 4]);
 * ```
 */
export function allResult<
  const A extends readonly [unknown, ...Array<unknown>],
  R extends AnyResult,
>(
  values: A,
  fn: (value: A[number]) => R,
): Result<{ [K in keyof A]: InferOk<R> }, InferErr<R>>;

/**
 * Maps a dynamic or generated value collection to Results.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, ok, type Result } from "@evolu/common";
 *
 * const numbers: Iterable<number> = new Set([1, 2]);
 * const doubled = allResult(numbers, (number) => ok(number * 2));
 * expectTypeOf(doubled).toEqualTypeOf<Result<ReadonlyArray<number>>>();
 * expectOk(doubled, [2, 4]);
 * ```
 */
export function allResult<A, R extends AnyResult>(
  values: Iterable<A>,
  fn: (value: A) => R,
): Result<ReadonlyArray<InferOk<R>>, InferErr<R>>;

/**
 * Maps record values to Results and preserves the record's keys.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, ok, type Result } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 *
 * const toUser = (id: string): Result<User> => ok({ id });
 *
 * const userIdsByRole = { owner: "user-1", reviewer: "user-2" } as const;
 * const usersByRole = allResult(userIdsByRole, toUser);
 * expectTypeOf(usersByRole).toEqualTypeOf<
 *   Result<Readonly<Record<"owner" | "reviewer", User>>>
 * >();
 * expectOk(usersByRole, {
 *   owner: { id: "user-1" },
 *   reviewer: { id: "user-2" },
 * });
 * ```
 */
export function allResult<A, R extends AnyResult, K extends string>(
  values: Readonly<Record<K, A>>,
  fn: (value: A) => R,
): Result<Readonly<Record<K, InferOk<R>>>, InferErr<R>>;

/**
 * Maps values to Results without collecting their Ok values.
 *
 * This avoids allocating the output collection even when the mapped operations
 * return success values.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, ok, type Result } from "@evolu/common";
 *
 * const visited: Array<number> = [];
 * const result = allResult(
 *   [1, 2],
 *   (number) => {
 *     visited.push(number);
 *     return ok(number * 2);
 *   },
 *   {
 *     collect: false,
 *   },
 * );
 * expectTypeOf(result).toEqualTypeOf<Result<void>>();
 * expectOk(result, undefined);
 * expect(visited).toEqual([1, 2]);
 * ```
 */
export function allResult<A, R extends AnyResult>(
  values: Iterable<A>,
  fn: (value: A) => R,
  options: { readonly collect: false },
): Result<void, InferErr<R>>;

/**
 * Maps record values to Results without collecting their Ok values.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, ok, type Result } from "@evolu/common";
 *
 * const result = allResult({ a: 1, b: 2 }, (number) => ok(number * 2), {
 *   collect: false,
 * });
 * expectTypeOf(result).toEqualTypeOf<Result<void>>();
 * expectOk(result, undefined);
 * ```
 */
export function allResult<A, R extends AnyResult, K extends string>(
  values: Readonly<Record<K, A>>,
  fn: (value: A) => R,
  options: { readonly collect: false },
): Result<void, InferErr<R>>;

export function allResult(
  input: Iterable<unknown> | Readonly<Record<string, unknown>>,
  fnOrOptions?: ((value: unknown) => AnyResult) | { readonly collect: false },
  options?: { readonly collect: false },
): AnyResult {
  const fn = typeof fnOrOptions === "function" ? fnOrOptions : undefined;
  const collect =
    typeof fnOrOptions === "function"
      ? options?.collect !== false
      : fnOrOptions?.collect !== false;

  if (!collect) {
    if (isIterable(input)) {
      for (const value of input) {
        const result = fn ? fn(value) : (value as AnyResult);
        if (!result.ok) return result;
      }
      return ok();
    }

    const keys = Object.keys(input);

    for (const key of keys) {
      const value = (input as Record<string, unknown>)[key];
      const result = fn ? fn(value) : (value as AnyResult);
      if (!result.ok) return result;
    }
    return ok();
  }

  if (Array.isArray(input)) {
    const length = input.length;
    if (length === 0) return ok(emptyArray);

    const values = new Array<unknown>(length);
    for (let i = 0; i < length; i++) {
      const result = fn ? fn(input[i]) : (input[i] as AnyResult);
      if (!result.ok) return result;
      values[i] = result.value;
    }
    return ok(values);
  }

  if (isIterable(input)) {
    const values: Array<unknown> = [];
    for (const value of input) {
      const result = fn ? fn(value) : (value as AnyResult);
      if (!result.ok) return result;
      values.push(result.value);
    }
    return ok(values.length === 0 ? emptyArray : values);
  }

  const keys = Object.keys(input);
  if (keys.length === 0) return ok(emptyRecord);

  const record = createMutableRecord();
  for (const key of keys) {
    const value = (input as Record<string, unknown>)[key];
    const result = fn ? fn(value) : (value as AnyResult);
    if (!result.ok) return result;
    record[key] = result.value;
  }
  return ok(record);
}

/**
 * Returns the first successful {@link Result}.
 *
 * If all results fail, returns the last error.
 *
 * Requires a non-empty array — there's no "first success" with zero
 * participants. Use {@link isNonEmptyArray} to guard.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   anyResult,
 *   err,
 *   ok,
 *   type Result,
 *   type Typed,
 * } from "@evolu/common";
 *
 * const getCachedPrice = (): Result<number, CacheMissError> =>
 *   err({ type: "CacheMiss" });
 *
 * interface CacheMissError extends Typed<"CacheMiss"> {}
 *
 * const number = anyResult([getCachedPrice(), ok(42)]);
 * expectTypeOf(number).toEqualTypeOf<Result<number, CacheMissError>>();
 * expectOk(number, 42);
 * ```
 *
 * @group Composition
 */
export function anyResult<
  const T extends readonly [AnyResult, ...ReadonlyArray<AnyResult>],
>(results: T): Result<InferOk<T[number]>, InferErr<T[number]>>;

export function anyResult(
  results: NonEmptyReadonlyArray<AnyResult>,
): AnyResult {
  let lastError: Err<unknown> | null = null;
  for (const result of results) {
    if (result.ok) return result;
    lastError = result;
  }
  return lastError!;
}
