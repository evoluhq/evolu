/**
 * Type-safe error handling with Result types.
 *
 * @module
 */

import {
  arrayFrom,
  emptyArray,
  isNonEmptyArray,
  type NonEmptyReadonlyArray,
} from "./Array.js";
import type { UnknownError } from "./Error.js";
import type { Lazy } from "./Function.js";
import { exhaustiveCheck } from "./Function.js";
import { createRecord, emptyRecord, isIterable } from "./Object.js";
import type { Typed } from "./Type.js";

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
 * ```ts
 * // With throw - caught value is unknown, can't use exhaustiveCheck
 * try {
 *   doSomething();
 * } catch (error) {
 *   // error is unknown - TypeScript can't help us here
 * }
 *
 * // With Result - error type is known, exhaustiveCheck works
 * const result = doSomething();
 * if (!result.ok) {
 *   switch (result.error.type) {
 *     case "NotFound":
 *       // handle not found
 *       break;
 *     case "InvalidInput":
 *       // handle invalid input
 *       break;
 *     default:
 *       exhaustiveCheck(result.error); // TypeScript ensures all cases handled
 *   }
 * }
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
 * ## Example
 *
 * ```ts
 * // Typed<T> adds { type: T } for discriminated unions
 * interface ParseJsonError extends Typed<"ParseJsonError"> {
 *   readonly message: string;
 * }
 *
 * const parseJson = (value: string): Result<unknown, ParseJsonError> => {
 *   try {
 *     return ok(JSON.parse(value));
 *   } catch (error) {
 *     return err({ type: "ParseJsonError", message: String(error) });
 *   }
 * };
 *
 * const json = parseJson('{"name": "Alice"}');
 * if (!json.ok) return json; // short-circuit on error
 *
 * // Now we have access to json.value (type: unknown)
 * console.log(json.value);
 * ```
 *
 * The caller doesn't need `try/catch`, just `if (!json.ok)`, and the error is
 * `ParseJsonError`, not `unknown`.
 *
 * To avoid `try/catch` inside `parseJson` too, use {@link trySync}:
 *
 * ```ts
 * const parseJson = (value: string): Result<unknown, ParseJsonError> =>
 *   trySync(
 *     () => JSON.parse(value) as unknown,
 *     (error) => ({ type: "ParseJsonError", message: String(error) }),
 *   );
 * ```
 *
 * `trySync` makes synchronous code that can throw safe. For asynchronous code,
 * use {@link tryAsync}.
 *
 * Since `Result` is a plain object, imperative code works naturally:
 *
 * ### Stop on error, map on success
 *
 * ```ts
 * const users = getActiveUsers();
 * if (!users.ok) return users;
 * const usernames = mapArray(users.value, (u) => u.username);
 * ```
 *
 * ### Iterate array, stop on first error
 *
 * ```ts
 * for (const user of users) {
 *   const result = validateUser(user); // Result<ValidUser, ValidateUserError>
 *   if (!result.ok) return result;
 * }
 * ```
 *
 * ## Composition
 *
 * Some patterns are common enough that deserve helpers. The previous example
 * can be written with {@link mapResult}:
 *
 * ```ts
 * const result = mapResult(users, validateUser);
 * // Result<ValidUser[], ValidateUserError>
 * ```
 *
 * For an array of results, {@link allResult} extracts all values or returns the
 * first error:
 *
 * ```ts
 * const result = allResult(validationResults);
 * ```
 *
 * For the first success, {@link anyResult} returns the first Ok or the last
 * error if all fail:
 *
 * ```ts
 * const result = anyResult(parserResults);
 * ```
 *
 * ## Naming convention
 *
 * - Result with a value: name it after the value (`user`, `config`)
 * - Result without a value: name it `result`
 *
 * ```ts
 * const processUser = (): Result<
 *   void,
 *   GetUserError | SaveToDatabaseError | SendWelcomeEmailError
 * > => {
 *   const user = getUser();
 *   if (!user.ok) return user;
 *
 *   const result = saveToDatabase(user.value);
 *   if (!result.ok) return result;
 *
 *   // To avoid a clash with the previous `result`, use a block scope.
 *   {
 *     const result = sendWelcomeEmail(user.value);
 *     if (!result.ok) return result;
 *   }
 *
 *   return ok();
 * };
 * ```
 *
 * ## Unrecoverable errors
 *
 * Some errors can't be handled locally — they must propagate to the top level.
 * These are unrecoverable errors: expected (you know they can happen) but only
 * handleable at the app level. Group them in a union type like `AppError`:
 *
 * ```ts
 * type AppError = SqliteError | SyncError | UnknownError;
 *
 * interface SqliteError extends Typed<"SqliteError"> {
 *   readonly error: UnknownError;
 * }
 * ```
 *
 * {@link UnknownError} wraps `unknown` so it can be part of a union (`unknown`
 * absorbs all other types).
 *
 * Handle unrecoverable errors at the top level:
 *
 * ```ts
 * const handleAppError = (error: AppError): void => {
 *   switch (error.type) {
 *     case "SqliteError":
 *       console.error(error.error.stack); // Log preserved stack trace
 *       showToast("Database error. Please restart the app.");
 *       break;
 *     case "SyncError":
 *       showToast("Sync failed. Retrying...");
 *       break;
 *     case "UnknownError":
 *       console.error(error.stack);
 *       showToast("An unexpected error occurred.");
 *       break;
 *     default:
 *       exhaustiveCheck(error);
 *   }
 * };
 * ```
 *
 * ## Unexpected errors
 *
 * Wrapping all unsafe code with {@link trySync} or {@link tryAsync} doesn't
 * prevent all errors — bugs can still throw. Catch them with global handlers:
 *
 * ```ts
 * // Worker
 * scope.onError = (error) => {
 *   errorPort.postMessage(error);
 * };
 * ```
 *
 * TODO: Window and Node.js
 *
 * ## FAQ
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
 * interface NotFoundError extends Typed<"NotFoundError"> {
 *   readonly id: string;
 * }
 *
 * const findUser = (id: string): Result<User, NotFoundError> => {
 *   const user = users.get(id);
 *   if (user == null) return err({ type: "NotFoundError", id });
 *   return ok(user);
 * };
 * ```
 */
export interface Err<out E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Extracts the value type from a {@link Result}.
 *
 * @group Utilities
 */
export type InferOk<R extends Result<any, any>> =
  R extends Ok<infer T> ? T : never;

/**
 * Extracts the error type from a {@link Result}.
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
 * const noValue = ok();
 * console.log(noValue); // { ok: true, value: undefined }
 *
 * const success = ok(42);
 * console.log(success); // { ok: true, value: 42 }
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
 * Extracts the value from a {@link Result} if it is an `Ok`, or throws an error
 * if it is an `Err`.
 *
 * **Intended usage:**
 *
 * - For critical code paths (e.g., app startup, config values) where failure
 *   should crash the app.
 * - Not recommended for general error handling in application logic—prefer
 *   explicit checks.
 *
 * ### Example
 *
 * ```ts
 * // At app startup, crash if config is invalid:
 * const config = getOrThrow(loadConfig());
 * // Safe to use config here
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
 * Extracts the value from a {@link Result} if it is an `Ok`, or returns `null`
 * if it is an `Err`.
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
 * // For APIs that expect T | null
 * const user = getOrNull(findUser(id));
 * ```
 */
export const getOrNull = <T, E>(result: Result<T, E>): T | null =>
  result.ok ? result.value : null;

/**
 * Wraps a synchronous function that may throw, returning a {@link Result}.
 *
 * ### Example
 *
 * ```ts
 * const parseJson = (value: string): Result<unknown, ParseJsonError> =>
 *   trySync(
 *     () => JSON.parse(value) as unknown,
 *     (error) => ({ type: "ParseJsonError", message: String(error) }),
 *   );
 * ```
 */
export const trySync = <T, E>(
  fn: () => T,
  mapError: (error: unknown) => E,
): Result<T, E> => {
  try {
    return ok(fn());
  } catch (error) {
    return err(mapError(error));
  }
};

/**
 * Wraps an async function that may throw, returning a {@link Result}.
 *
 * ### Example
 *
 * ```ts
 * const fetchJson = (url: string): Promise<Result<unknown, FetchError>> =>
 *   tryAsync(
 *     async () => {
 *       const response = await fetch(url);
 *       if (!response.ok) throw new Error(`Status ${response.status}`);
 *       return response.json();
 *     },
 *     (error) => ({ type: "FetchError", message: String(error) }),
 *   );
 * ```
 */
export const tryAsync = <T, E>(
  lazyPromise: Lazy<Promise<T>>,
  mapError: (error: unknown) => E,
): Promise<Result<T, E>> =>
  Promise.try(lazyPromise).then(
    (value) => ok(value),
    (error: unknown) => err(mapError(error)),
  );

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
 * @group Utilities
 */
export type ExcludeDone<E> = Exclude<E, Done<any>>;

/**
 * Extracts only {@link Done} from an error union.
 *
 * Useful for pull-based protocols where completion is encoded in the error
 * channel (for example {@link NextResult}).
 *
 * @group Utilities
 */
export type OnlyDone<E> = Extract<E, Done<any>>;

/**
 * Extracts the done value type from a {@link NextResult}.
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
 * Extracts all values from an array of {@link Result}s.
 *
 * Returns the first error if any result fails.
 *
 * ### Example
 *
 * ```ts
 * const results = [ok(1), ok(2), ok(3)];
 * const all = allResult(results);
 * // ok([1, 2, 3])
 *
 * const withError = [ok(1), err("fail"), ok(3)];
 * const failed = allResult(withError);
 * // err("fail")
 * ```
 *
 * @group Composition
 */
export function allResult<
  const T extends readonly [AnyResult, ...ReadonlyArray<AnyResult>],
>(results: T): Result<{ [K in keyof T]: InferOk<T[K]> }, InferErr<T[number]>>;

/**
 * Returns object with same keys.
 *
 * ```ts
 * const result = allResult({ a: ok(1), b: ok(2) });
 * // ok({ a: 1, b: 2 })
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
 * ```ts
 * const results: ReadonlyArray<Result<number, Error>> = getResults();
 * const all = allResult(results);
 * // Result<ReadonlyArray<number>, Error>
 * ```
 */
export function allResult<T, E>(
  results: Iterable<Result<T, E>>,
): Result<ReadonlyArray<T>, E>;

/**
 * Guarantees non-empty result.
 *
 * ```ts
 * const results: NonEmptyReadonlyArray<Result<number, Error>> = [
 *   ok(1),
 *   ok(2),
 * ];
 * const all = allResult(results);
 * // Result<NonEmptyReadonlyArray<number>, Error>
 * ```
 */
export function allResult<T, E>(
  results: NonEmptyReadonlyArray<Result<T, E>>,
): Result<NonEmptyReadonlyArray<T>, E>;

export function allResult(
  input: Iterable<AnyResult> | Readonly<Record<string, AnyResult>>,
): AnyResult {
  if (isIterable(input)) {
    const array = arrayFrom(input);
    if (!isNonEmptyArray(array)) return ok(emptyArray);

    const length = array.length;
    const values = new Array<unknown>(length);
    for (let i = 0; i < length; i++) {
      const result = array[i];
      if (!result.ok) return result;
      values[i] = result.value;
    }
    return ok(values);
  }

  const length = Object.keys(input).length;
  if (length === 0) return ok(emptyRecord);

  const keys = new Array<string>(length);
  const results = new Array<AnyResult>(length);
  let index = 0;
  for (const key in input) {
    keys[index] = key;
    results[index] = (input as Record<string, AnyResult>)[key];
    index++;
  }

  const record = createRecord();
  for (let i = 0; i < length; i++) {
    const result = results[i];
    if (!result.ok) return result;
    record[keys[i]] = result.value;
  }
  return ok(record);
}

/**
 * Maps items to {@link Result}s and extracts all values.
 *
 * Returns the first error if any result fails.
 *
 * ### Example
 *
 * ```ts
 * const users = [{ id: 1 }, { id: 2 }];
 * const result = mapResult(users, validateUser);
 * // Result<ReadonlyArray<ValidUser>, ValidateUserError>
 * ```
 *
 * @group Composition
 */
export function mapResult<
  const A extends readonly [unknown, ...Array<unknown>],
  T,
  E,
>(
  items: A,
  fn: (a: A[number]) => Result<T, E>,
): Result<{ [K in keyof A]: T }, E>;

/**
 * For dynamic or generated item lists.
 *
 * ```ts
 * const users = [{ id: 1 }, { id: 2 }];
 * const result = mapResult(users, validateUser);
 * // Result<ReadonlyArray<ValidUser>, ValidateUserError>
 * ```
 */
export function mapResult<A, T, E>(
  items: Iterable<A>,
  fn: (a: A) => Result<T, E>,
): Result<ReadonlyArray<T>, E>;

/**
 * Returns object with same keys.
 *
 * ```ts
 * const result = mapResult({ a: 1, b: 2 }, double);
 * // Result<{ a: number, b: number }, DoubleError>
 * ```
 */
export function mapResult<A, T, E, K extends string>(
  items: Readonly<Record<K, A>>,
  fn: (a: A) => Result<T, E>,
): Result<Readonly<Record<K, T>>, E>;

export function mapResult(
  input: Iterable<unknown> | Readonly<Record<string, unknown>>,
  fn: (a: unknown) => AnyResult,
): AnyResult {
  if (isIterable(input)) {
    const array = arrayFrom(input);
    if (!isNonEmptyArray(array)) return ok(emptyArray);

    const length = array.length;
    const values = new Array<unknown>(length);
    for (let i = 0; i < length; i++) {
      const result = fn(array[i]);
      if (!result.ok) return result;
      values[i] = result.value;
    }
    return ok(values);
  }

  const length = Object.keys(input).length;
  if (length === 0) return ok(emptyRecord);

  const keys = new Array<string>(length);
  const items = new Array<unknown>(length);
  let index = 0;
  for (const key in input) {
    keys[index] = key;
    items[index] = (input as Record<string, unknown>)[key];
    index++;
  }

  const record = createRecord();
  for (let i = 0; i < length; i++) {
    const result = fn(items[i]);
    if (!result.ok) return result;
    record[keys[i]] = result.value;
  }
  return ok(record);
}

/**
 * Returns the first successful {@link Result}.
 *
 * If all results fail, returns the last error.
 *
 * Requires a non-empty array — there's no "first success" with zero
 * participants. Use {@link isNonEmptyArray} to guard:
 *
 * ```ts
 * if (isNonEmptyArray(results)) {
 *   const result = anyResult(results);
 * }
 * ```
 *
 * ### Example
 *
 * ```ts
 * const results = [err("fail1"), ok(42), err("fail2")];
 * if (isNonEmptyArray(results)) {
 *   const result = anyResult(results);
 *   // ok(42)
 * }
 *
 * const allFailed = [err("a"), err("b"), err("c")];
 * if (isNonEmptyArray(allFailed)) {
 *   const result = anyResult(allFailed);
 *   // err("c") — last error
 * }
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
