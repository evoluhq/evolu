/**
 * Type-safe error handling with the Result type.
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
import type { Typed } from "./Type.ts";
import type { Awaitable } from "./Types.ts";

/**
 * The problem with `throw` in JavaScript is that the caught value is always of
 * unknown type. We can't be sure all errors have been handled because the
 * TypeScript compiler can't tell us what was thrown — we can't use
 * {@link exhaustiveCheck}.
 *
 * Languages like Rust and Haskell solve this with types like `Result` or
 * `Either` where errors are part of the return type. TypeScript can do the
 * same.
 *
 * ## Example
 *
 * ```ts
 * import { err, exhaustiveCheck, type Result } from "@evolu/common";
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
 *   NotFoundError | InvalidInputError
 * > => err({ type: "NotFound" });
 *
 * interface NotFoundError {
 *   readonly type: "NotFound";
 * }
 *
 * interface InvalidInputError {
 *   readonly type: "InvalidInput";
 * }
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
 * Use {@link trySync} and {@link tryAsync} to intentionally convert thrown or
 * rejected errors into typed, recoverable `Result` values.
 *
 * Do not wrap every throwing API in `Result`. If an error is unrecoverable and
 * the caller has no meaningful fallback, let it throw.
 *
 * ## Composition
 *
 * Since `Result` is a plain object, imperative code works naturally.
 *
 * ```ts
 * import { ok, type Result } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 *
 * interface UserNotFoundError {
 *   readonly type: "UserNotFoundError";
 * }
 *
 * interface Profile {
 *   readonly userId: string;
 * }
 *
 * interface ProfileNotFoundError {
 *   readonly type: "ProfileNotFoundError";
 * }
 *
 * const getUser = (): Result<User, UserNotFoundError> =>
 *   ok({ id: "user-1" });
 * const getProfile = (
 *   userId: string,
 * ): Result<Profile, ProfileNotFoundError> => ok({ userId });
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
 * {@link flatMapResult} is for a single local composition.
 *
 * ```ts
 * import { flatMapResult, ok, type Result } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 *
 * interface UserNotFoundError {
 *   readonly type: "UserNotFoundError";
 * }
 *
 * interface Profile {
 *   readonly userId: string;
 * }
 *
 * interface ProfileNotFoundError {
 *   readonly type: "ProfileNotFoundError";
 * }
 *
 * const getUser = (): Result<User, UserNotFoundError> =>
 *   ok({ id: "user-1" });
 * const getProfile = (
 *   userId: string,
 * ): Result<Profile, ProfileNotFoundError> => ok({ userId });
 *
 * const profile = flatMapResult(getUser(), (user) => getProfile(user.id));
 * expectTypeOf(profile).toEqualTypeOf<
 *   Result<Profile, UserNotFoundError | ProfileNotFoundError>
 * >();
 * expectOk(profile, { userId: "user-1" });
 * ```
 *
 * Use {@link allResult} to collect the Ok values from a collection of Results,
 * or return the first Err.
 *
 * ```ts
 * import { allResult, err, ok, type Result } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 *
 * interface Preferences {
 *   readonly theme: "dark" | "light";
 * }
 *
 * interface LoadAccountError {
 *   readonly type: "LoadAccountError";
 *   readonly resource: "user" | "preferences";
 * }
 *
 * const user: Result<User, LoadAccountError> = ok({ id: "user-1" });
 * const preferences: Result<Preferences, LoadAccountError> = ok({
 *   theme: "dark",
 * });
 * const account = allResult([user, preferences]);
 * expectTypeOf(account).toEqualTypeOf<
 *   Result<readonly [User, Preferences], LoadAccountError>
 * >();
 * expectOk(account, [{ id: "user-1" }, { theme: "dark" }]);
 *
 * const userError: Result<never, LoadAccountError> = err({
 *   type: "LoadAccountError",
 *   resource: "user",
 * });
 * const preferencesError: Result<never, LoadAccountError> = err({
 *   type: "LoadAccountError",
 *   resource: "preferences",
 * });
 * const failedAccount = allResult([userError, preferencesError]);
 * expectErr(failedAccount, {
 *   type: "LoadAccountError",
 *   resource: "user",
 * });
 * ```
 *
 * `allResult` can also map collection values to Results before collecting their
 * Ok values. Mapping stops on the first Err.
 *
 * ```ts
 * import { allResult, err, ok, type Result } from "@evolu/common";
 *
 * interface OrderLine {
 *   readonly productId: string;
 *   readonly quantity: number;
 * }
 *
 * interface ProductUnavailableError {
 *   readonly type: "ProductUnavailableError";
 *   readonly productId: string;
 * }
 *
 * const priceByProductId = new Map([["book", 20]]);
 * const priceOrderLine = ({
 *   productId,
 *   quantity,
 * }: OrderLine): Result<number, ProductUnavailableError> => {
 *   const price = priceByProductId.get(productId);
 *   if (price == null) {
 *     return err({ type: "ProductUnavailableError", productId });
 *   }
 *   return ok(price * quantity);
 * };
 *
 * const orderLines: ReadonlyArray<OrderLine> = [
 *   { productId: "book", quantity: 2 },
 *   { productId: "sold-out", quantity: 1 },
 * ];
 * const prices = allResult(orderLines, priceOrderLine);
 * expectTypeOf(prices).toEqualTypeOf<
 *   Result<ReadonlyArray<number>, ProductUnavailableError>
 * >();
 * expectErr(prices, {
 *   type: "ProductUnavailableError",
 *   productId: "sold-out",
 * });
 * ```
 *
 * For side effects, or whenever the success values aren't needed, disable
 * collection with `{ collect: false }`. `allResult` then returns `Result<void,
 * E>` without storing the successful values and still stops on the first Err.
 *
 * ```ts
 * import { allResult, err, ok, type Result } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 *
 * interface SaveUserError {
 *   readonly type: "SaveUserError";
 * }
 *
 * interface SendWelcomeEmailError {
 *   readonly type: "SendWelcomeEmailError";
 * }
 *
 * const saveUser = (_user: User): Result<number, SaveUserError> =>
 *   err({ type: "SaveUserError" });
 *
 * let welcomeEmailSent = false;
 * const sendWelcomeEmail = (
 *   _user: User,
 * ): Result<void, SendWelcomeEmailError> => {
 *   welcomeEmailSent = true;
 *   return ok();
 * };
 *
 * const registerUser = (
 *   user: User,
 * ): Result<void, SaveUserError | SendWelcomeEmailError> =>
 *   allResult(
 *     [saveUser, sendWelcomeEmail],
 *     (operation) => operation(user),
 *     { collect: false },
 *   );
 *
 * const result = registerUser({ id: "user-1" });
 * expectTypeOf(result).toEqualTypeOf<
 *   Result<void, SaveUserError | SendWelcomeEmailError>
 * >();
 * expectErr(result, { type: "SaveUserError" });
 * expect(welcomeEmailSent).toBe(false);
 * ```
 *
 * For the first success, {@link anyResult} returns the first Ok or the last
 * error if all fail:
 *
 * ```ts
 * import { anyResult, err, ok, type Result } from "@evolu/common";
 *
 * interface CacheMissError {
 *   readonly type: "CacheMissError";
 * }
 *
 * const getCachedPrice = (): Result<number, CacheMissError> =>
 *   err({ type: "CacheMissError" });
 *
 * const prices = [getCachedPrice(), ok(20)] as const;
 * const price = anyResult(prices);
 * expectTypeOf(price).toEqualTypeOf<Result<number, CacheMissError>>();
 * expectOk(price, 20);
 * ```
 *
 * ## Naming convention
 *
 * Name a Result after its value (`user`, `config`), not after the wrapper
 * (`userResult`, `configResult`). If it has no success value, name it `result`.
 * For several such operations, use `allResult` with `{ collect: false }` as
 * shown above.
 *
 * ## Unrecoverable errors
 *
 * Some errors can't be handled locally — they must propagate to the top level.
 * These are unrecoverable errors: expected (you know they can happen) but only
 * handleable at the app level.
 *
 * Do not force these errors into `Result` just because the underlying API
 * throws. If the local caller cannot recover, let the error propagate to a
 * global handler or other app boundary.
 *
 * In Evolu apps, the root Run reports defects and the platform lifecycle API
 * owns application shutdown. For example, `@evolu/nodejs` provides `runMain`.
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
 */
export type Result<T, E = never> = Ok<T> | Err<E>;

/**
 * Shorthand for a {@link Result} with `any` type parameters.
 *
 * @group Utilities
 */
export type AnyResult = Result<any, any>;

/** A successful {@link Result}. */
export interface Ok<out T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * An error {@link Result}.
 *
 * The `error` property can be any type that describes the error. For domain
 * errors, use a plain object with a `type` field for discrimination.
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
 * interface NotFoundError extends Typed<"NotFoundError"> {
 *   readonly id: string;
 * }
 *
 * const users = new Map<string, User>([["user-1", { id: "user-1" }]]);
 * const findUser = (id: string): Result<User, NotFoundError> => {
 *   const user = users.get(id);
 *   if (user == null) return err({ type: "NotFoundError", id });
 *   return ok(user);
 * };
 *
 * expectOk(findUser("user-1"), { id: "user-1" });
 * expectErr(findUser("missing"), {
 *   type: "NotFoundError",
 *   id: "missing",
 * });
 * ```
 */
export interface Err<out E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Infers the success value type from a {@link Result}.
 *
 * @group Utilities
 */
export type InferOk<R extends Result<any, any>> =
  R extends Ok<infer T> ? T : never;

/**
 * Infers the error type from a {@link Result}.
 *
 * @group Utilities
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
 * ### Example
 *
 * ```ts
 * import { ok, type Result } from "@evolu/common";
 *
 * const noValue = ok();
 * const success = ok(42);
 *
 * expectTypeOf(noValue).toEqualTypeOf<Result<void>>();
 * expectTypeOf(success).toEqualTypeOf<Result<number>>();
 * expectOk(noValue, undefined);
 * expectOk(success, 42);
 * ```
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

/** Creates an {@link Err} result. */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Type guard for {@link Ok} results. */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok;

/** Type guard for {@link Err} results. */
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> =>
  !result.ok;

/**
 * Gets the value from an `Ok` {@link Result}, or throws if it is an `Err`.
 *
 * Use this where failure should crash the current flow instead of being handled
 * locally.
 *
 * **When to use:**
 *
 * - Application startup or composition-root setup where errors must stop the
 *   program immediately. In Evolu apps, the root Run reports the defect and the
 *   platform lifecycle API handles shutdown.
 * - Module-level constants
 * - Test setup with values that are expected to be valid
 *
 * Prefer an explicit `if (!result.ok)` check in ordinary application logic
 * where the caller can recover, retry, or choose a different flow.
 *
 * ### Example
 *
 * ```ts
 * import { err, getOrThrow, ok, type Result } from "@evolu/common";
 *
 * interface Config {
 *   readonly port: number;
 * }
 * interface InvalidConfigError {
 *   readonly type: "InvalidConfigError";
 * }
 * const loadConfig = (): Result<Config, InvalidConfigError> =>
 *   ok({ port: 3000 });
 *
 * // At app startup, crash if the config is invalid.
 * const config = getOrThrow(loadConfig());
 * expectTypeOf(config).toEqualTypeOf<Config>();
 * expect(config).toEqual({ port: 3000 });
 *
 * try {
 *   getOrThrow(err({ type: "InvalidConfigError" }));
 *   assert.fail("Expected getOrThrow to throw");
 * } catch (error) {
 *   assert(error instanceof Error);
 *   expect(error.message).toBe("getOrThrow");
 *   expect(error.cause).toEqual({ type: "InvalidConfigError" });
 * }
 * ```
 *
 * Throws: `Error` with the original error attached as `cause`.
 */
export const getOrThrow = <T, E>(result: Result<T, E>): T => {
  if (result.ok) {
    return result.value;
  } else {
    throw new Error("getOrThrow", { cause: result.error });
  }
};

/**
 * Gets the value from an `Ok` {@link Result}, or returns `null` if it is an
 * `Err`.
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
 * import { err, getOrNull, ok, type Result } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 * interface UserNotFoundError {
 *   readonly type: "UserNotFoundError";
 * }
 * const findUser = (id: string): Result<User, UserNotFoundError> =>
 *   id === "user-1" ? ok({ id }) : err({ type: "UserNotFoundError" });
 *
 * // For APIs that expect T | null.
 * const user = getOrNull(findUser("user-1"));
 * const missingUser = getOrNull(findUser("missing"));
 *
 * expectTypeOf(user).toEqualTypeOf<User | null>();
 * expect(user).toEqual({ id: "user-1" });
 * expect(missingUser).toBeNull();
 * ```
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
 */
export const getOk = <T>(result: Result<T>): T => {
  assert(result.ok, "Expected Ok result.");
  return result.value;
};

/**
 * Wraps a synchronous function that may throw, returning a {@link Result}.
 *
 * `mapError` converts the caught `unknown` value into a typed domain error.
 *
 * Some APIs use exceptions for both recoverable and unrecoverable failures. In
 * that case, convert only the failures the caller can recover from and rethrow
 * the rest. `trySync` propagates rethrown failures instead of converting them
 * to Err.
 *
 * ### Example
 *
 * ```ts
 * import { trySync, type Result } from "@evolu/common";
 *
 * interface ReserveSeatError {
 *   readonly type: "ReserveSeatError";
 *   readonly seat: string;
 * }
 *
 * class LegacySeatUnavailableError extends Error {}
 *
 * const legacyReserveSeat = (seat: string): void => {
 *   if (seat === "A1") throw new LegacySeatUnavailableError();
 *   if (seat === "B1") throw new Error("Unexpected database error");
 * };
 *
 * const reserveSeat = (seat: string): Result<void, ReserveSeatError> =>
 *   trySync(
 *     () => legacyReserveSeat(seat),
 *     (error) => {
 *       if (error instanceof LegacySeatUnavailableError) {
 *         return { type: "ReserveSeatError", seat };
 *       }
 *       throw error;
 *     },
 *   );
 *
 * const result = reserveSeat("B2");
 * expectTypeOf(result).toEqualTypeOf<Result<void, ReserveSeatError>>();
 * expectOk(result, undefined);
 * expectErr(reserveSeat("A1"), { type: "ReserveSeatError", seat: "A1" });
 * expect(() => reserveSeat("B1")).toThrow("Unexpected database error");
 * ```
 */
export function trySync<T>(fn: () => T): Result<T, unknown>;
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
 * `mapError` converts the caught `unknown` value into a typed domain error.
 *
 * Some APIs use exceptions for both recoverable and unrecoverable failures. In
 * that case, convert only the failures the caller can recover from and rethrow
 * the rest. `tryAsync` rejects with rethrown failures instead of converting
 * them to Err.
 *
 * ### Example
 *
 * ```ts
 * import { tryAsync, type Result } from "@evolu/common";
 *
 * interface ReserveSeatError {
 *   readonly type: "ReserveSeatError";
 *   readonly seat: string;
 * }
 *
 * class LegacySeatUnavailableError extends Error {}
 *
 * const legacyReserveSeat = async (seat: string): Promise<void> => {
 *   if (seat === "A1") throw new LegacySeatUnavailableError();
 *   if (seat === "B1") throw new Error("Unexpected database error");
 * };
 *
 * const reserveSeat = (
 *   seat: string,
 * ): Promise<Result<void, ReserveSeatError>> =>
 *   tryAsync(
 *     () => legacyReserveSeat(seat),
 *     (error) => {
 *       if (error instanceof LegacySeatUnavailableError) {
 *         return { type: "ReserveSeatError", seat };
 *       }
 *       throw error;
 *     },
 *   );
 *
 * const result = await reserveSeat("B2");
 * expectTypeOf(result).toEqualTypeOf<Result<void, ReserveSeatError>>();
 * expectOk(result, undefined);
 * expectErr(await reserveSeat("A1"), {
 *   type: "ReserveSeatError",
 *   seat: "A1",
 * });
 * await expect(reserveSeat("B1")).rejects.toThrow(
 *   "Unexpected database error",
 * );
 * ```
 */
export function tryAsync<T>(
  promiseThunk: Thunk<Awaitable<T>>,
): Promise<Result<T, unknown>>;
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
 * - `Ok<A>` — produced a value
 * - `Err<Done<D>>` — completed normally with a done value
 * - `Err<E>` — failed with an error
 *
 * Inspired by JavaScript's `Iterator.next()`, which returns `{ value, done }`.
 *
 * ### Example
 *
 * ```ts
 * import { done, err, ok, type NextResult } from "@evolu/common";
 *
 * interface ReadError {
 *   readonly type: "ReadError";
 * }
 *
 * const next = (index: number): NextResult<string, ReadError, number> => {
 *   if (index === 0) return ok("first");
 *   if (index === 1) return err({ type: "ReadError" });
 *   return err(done(index));
 * };
 *
 * const value = next(0);
 * expectTypeOf(value).toEqualTypeOf<
 *   NextResult<string, ReadError, number>
 * >();
 * expectOk(value, "first");
 * expectErr(next(1), { type: "ReadError" });
 * expectErr(next(2), { type: "Done", done: 2 });
 * ```
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
 * import { type Done, type ExcludeDone } from "@evolu/common";
 *
 * type Errors = "ReadError" | Done<number>;
 * expectTypeOf<ExcludeDone<Errors>>().toEqualTypeOf<"ReadError">();
 * ```
 *
 * @group Utilities
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
 * import { type Done, type OnlyDone } from "@evolu/common";
 *
 * type Errors = "ReadError" | Done<number>;
 * expectTypeOf<OnlyDone<Errors>>().toEqualTypeOf<Done<number>>();
 * ```
 *
 * @group Utilities
 */
export type OnlyDone<E> = Extract<E, Done<any>>;

/**
 * Infers the done value type from a {@link NextResult}.
 *
 * ### Example
 *
 * ```ts
 * import { type InferDone, type NextResult } from "@evolu/common";
 *
 * type ReadResult = NextResult<string, "ReadError", number>;
 * expectTypeOf<InferDone<ReadResult>>().toEqualTypeOf<number>();
 * ```
 *
 * @group Utilities
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
 * import { err, flatMapResult, ok, type Result } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 * interface UserError {
 *   readonly type: "UserError";
 * }
 *
 * interface Profile {
 *   readonly userId: string;
 * }
 * interface ProfileError {
 *   readonly type: "ProfileError";
 * }
 * const getProfile = (userId: string): Result<Profile, ProfileError> =>
 *   ok({ userId });
 *
 * let getProfileCalls = 0;
 * const getProfileForUser = (
 *   user: User,
 * ): Result<Profile, ProfileError> => {
 *   getProfileCalls++;
 *   return getProfile(user.id);
 * };
 *
 * const user: Result<User, UserError> = ok({ id: "user-1" });
 * const profile = flatMapResult(user, getProfileForUser);
 * expectTypeOf(profile).toEqualTypeOf<
 *   Result<Profile, UserError | ProfileError>
 * >();
 * expectOk(profile, { userId: "user-1" });
 * expect(getProfileCalls).toBe(1);
 *
 * const missingUser: Result<User, UserError> = err({ type: "UserError" });
 * const missingProfile = flatMapResult(missingUser, getProfileForUser);
 * expectErr(missingProfile, { type: "UserError" });
 * expect(getProfileCalls).toBe(1);
 * ```
 *
 * @group Composition
 */
export const flatMapResult = <T, E, U, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> => (result.ok ? fn(result.value) : result);

/**
 * Collects the Ok values from a collection of {@link Result}s, or maps
 * collection values to Results and collects their Ok values.
 *
 * Returns the first error if any result fails.
 *
 * Pass `{ collect: false }` to return `Result<void, E>` without storing the Ok
 * values in an output collection.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, err, ok, type Result } from "@evolu/common";
 *
 * interface CountError {
 *   readonly type: "CountError";
 * }
 * interface LabelError {
 *   readonly type: "LabelError";
 * }
 *
 * const getCount = (): Result<number, CountError> => ok(2);
 * const getLabel = (): Result<string, LabelError> => ok("books");
 *
 * const values = allResult([getCount(), getLabel()]);
 * expectTypeOf(values).toEqualTypeOf<
 *   Result<readonly [number, string], CountError | LabelError>
 * >();
 * expectOk(values, [2, "books"]);
 *
 * const numbers = allResult([
 *   ok(1),
 *   err({ type: "CountError" }),
 *   err({ type: "LabelError" }),
 * ]);
 * expectErr(numbers, { type: "CountError" });
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
 * Stops consuming the iterable on the first Err.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, err, ok, type Result } from "@evolu/common";
 *
 * interface LoadNumberError {
 *   readonly type: "LoadNumberError";
 * }
 *
 * const results: ReadonlyArray<Result<number, LoadNumberError>> = [
 *   ok(1),
 *   err({ type: "LoadNumberError" }),
 * ];
 * const numbers = allResult(results);
 * expectTypeOf(numbers).toEqualTypeOf<
 *   Result<ReadonlyArray<number>, LoadNumberError>
 * >();
 * expectErr(numbers, { type: "LoadNumberError" });
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

/** Does not collect the Ok values from a record of Results. */
export function allResult<T extends Readonly<Record<string, AnyResult>>>(
  results: T,
  options: { readonly collect: false },
): Result<void, [keyof T] extends [never] ? never : InferErr<T[keyof T]>>;

/**
 * Does not collect the Ok values from an iterable of Results.
 *
 * Use this overload when the Results already exist and only their collective
 * success or failure matters. To stop invoking operations after the first Err,
 * use the mapping overload instead.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, err, ok, type Result } from "@evolu/common";
 *
 * interface SaveError {
 *   readonly type: "SaveError";
 * }
 *
 * const results: ReadonlyArray<Result<number, SaveError>> = [
 *   ok(1),
 *   err({ type: "SaveError" }),
 * ];
 * const result = allResult(results, { collect: false });
 * expectTypeOf(result).toEqualTypeOf<Result<void, SaveError>>();
 * expectErr(result, { type: "SaveError" });
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
 * interface Order {
 *   readonly id: string;
 * }
 * interface Invoice {
 *   readonly orderId: string;
 * }
 * interface CreateInvoiceError {
 *   readonly type: "CreateInvoiceError";
 * }
 *
 * const orders: NonEmptyReadonlyArray<Order> = [{ id: "order-1" }];
 * const createInvoice = (
 *   order: Order,
 * ): Result<Invoice, CreateInvoiceError> => ok({ orderId: order.id });
 *
 * const invoices = allResult(orders, createInvoice);
 * expectTypeOf(invoices).toEqualTypeOf<
 *   Result<NonEmptyReadonlyArray<Invoice>, CreateInvoiceError>
 * >();
 * expectOk(invoices, [{ orderId: "order-1" }]);
 *
 * const invoiceTuple = allResult(
 *   [{ id: "order-1" }, { id: "order-2" }] as const,
 *   createInvoice,
 * );
 * expectTypeOf(invoiceTuple).toEqualTypeOf<
 *   Result<readonly [Invoice, Invoice], CreateInvoiceError>
 * >();
 * expectOk(invoiceTuple, [{ orderId: "order-1" }, { orderId: "order-2" }]);
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
 * Stops consuming and mapping the iterable on the first Err.
 *
 * ### Example
 *
 * ```ts
 * import { allResult, err, ok, type Result } from "@evolu/common";
 *
 * interface ProductNotFoundError {
 *   readonly type: "ProductNotFoundError";
 *   readonly productId: string;
 * }
 *
 * const pricesByProductId = new Map([
 *   ["book", 20],
 *   ["pen", 5],
 * ]);
 * const getPrice = (
 *   productId: string,
 * ): Result<number, ProductNotFoundError> => {
 *   const price = pricesByProductId.get(productId);
 *   return price == null
 *     ? err({ type: "ProductNotFoundError", productId })
 *     : ok(price);
 * };
 *
 * const productIds: Iterable<string> = new Set(["book", "pen"]);
 * const prices = allResult(productIds, getPrice);
 * expectTypeOf(prices).toEqualTypeOf<
 *   Result<ReadonlyArray<number>, ProductNotFoundError>
 * >();
 * expectOk(prices, [20, 5]);
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
 * import { allResult, err, ok, type Result } from "@evolu/common";
 *
 * interface User {
 *   readonly id: string;
 * }
 *
 * interface UserNotFoundError {
 *   readonly type: "UserNotFoundError";
 *   readonly userId: string;
 * }
 *
 * const usersById = new Map<string, User>([
 *   ["user-1", { id: "user-1" }],
 *   ["user-2", { id: "user-2" }],
 * ]);
 * const findUser = (userId: string): Result<User, UserNotFoundError> => {
 *   const user = usersById.get(userId);
 *   return user == null
 *     ? err({ type: "UserNotFoundError", userId })
 *     : ok(user);
 * };
 *
 * const userIdsByRole = { owner: "user-1", reviewer: "user-2" } as const;
 * const usersByRole = allResult(userIdsByRole, findUser);
 * expectTypeOf(usersByRole).toEqualTypeOf<
 *   Result<Readonly<Record<"owner" | "reviewer", User>>, UserNotFoundError>
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
 * interface UpdateItemError {
 *   readonly type: "UpdateItemError";
 * }
 *
 * const updatedItemIds: Array<string> = [];
 * const updateItem = (itemId: string): Result<number, UpdateItemError> => {
 *   updatedItemIds.push(itemId);
 *   return ok(1);
 * };
 *
 * const result = allResult(["item-1", "item-2"], updateItem, {
 *   collect: false,
 * });
 * expectTypeOf(result).toEqualTypeOf<Result<void, UpdateItemError>>();
 * expectOk(result, undefined);
 * expect(updatedItemIds).toEqual(["item-1", "item-2"]);
 * ```
 */
export function allResult<A, R extends AnyResult>(
  values: Iterable<A>,
  fn: (value: A) => R,
  options: { readonly collect: false },
): Result<void, InferErr<R>>;

/** Maps record values to Results without collecting their Ok values. */
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
 *   isNonEmptyArray,
 *   ok,
 *   type Result,
 * } from "@evolu/common";
 *
 * interface LookupError {
 *   readonly type: "LookupError";
 * }
 *
 * const results: ReadonlyArray<Result<number, LookupError>> = [
 *   err({ type: "LookupError" }),
 *   ok(42),
 * ];
 * if (isNonEmptyArray(results)) {
 *   const number = anyResult(results);
 *   expectTypeOf(number).toEqualTypeOf<Result<number, LookupError>>();
 *   expectOk(number, 42);
 * }
 * ```
 *
 * A statically non-empty tuple needs no guard:
 *
 * ```ts
 * import { anyResult, err, ok, type Result } from "@evolu/common";
 *
 * interface LookupError {
 *   readonly type: "LookupError";
 *   readonly source: string;
 * }
 *
 * const lookupError = (source: string): Result<never, LookupError> =>
 *   err({ type: "LookupError", source });
 *
 * const results = [
 *   lookupError("first"),
 *   ok(42),
 *   lookupError("second"),
 * ] as const;
 * const number = anyResult(results);
 * expectTypeOf(number).toEqualTypeOf<Result<number, LookupError>>();
 * expectOk(number, 42);
 *
 * const allFailed = [lookupError("a"), lookupError("b")] as const;
 * const result = anyResult(allFailed);
 * expectTypeOf(result).toEqualTypeOf<Result<never, LookupError>>();
 * expectErr(result, { type: "LookupError", source: "b" });
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
