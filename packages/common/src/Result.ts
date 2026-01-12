import type { UnknownError } from "./Error.js";
import { exhaustiveCheck } from "./Function.js";
import type { Lazy } from "./Function.js";
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
 * ### Example
 *
 * ```ts
 * interface ParseJsonError {
 *   readonly type: "ParseJsonError";
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
 * `ParseJsonError`, not `unknown`. To avoid `try/catch` inside `parseJson` too,
 * use {@link trySync}:
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
 * ## Examples
 *
 * ### Map on success
 *
 * ```ts
 * const users = getActiveUsers();
 * if (!users.ok) return users;
 * const usernames = mapArray(users.value, (u) => u.username);
 * ```
 *
 * ### Stop on the first error
 *
 * ```ts
 * for (const item of items) {
 *   const result = process(item);
 *   if (!result.ok) return result;
 * }
 * ```
 *
 * ### Collect successes
 *
 * ```ts
 * const values = flatMapArray(fields, (field) => {
 *   const result = validate(field);
 *   return result.ok ? [result.value] : [];
 * });
 * ```
 *
 * ### Collect errors
 *
 * ```ts
 * const errors = flatMapArray(fields, (field) => {
 *   const result = validate(field);
 *   return result.ok ? [] : [result.error];
 * });
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
 * interface SqliteError {
 *   readonly type: "SqliteError";
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
 * Use `Result<void, E>`.
 */
export type Result<T, E = never> = Ok<T> | Err<E>;

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
 * interface NotFoundError {
 *   readonly type: "NotFoundError";
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
 * @category Utilities
 */
export type InferOk<R extends Result<any, any>> =
  R extends Ok<infer T> ? T : never;

/**
 * Extracts the error type from a {@link Result}.
 *
 * @category Utilities
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
  return { ok: true, value: value as T };
}

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
 * @category Utilities
 */
export type ExcludeDone<E> = Exclude<E, Done<any>>;

/**
 * Extracts only {@link Done} from an error union.
 *
 * Useful for pull-based protocols where completion is encoded in the error
 * channel (for example {@link NextResult}).
 *
 * @category Utilities
 */
export type OnlyDone<E> = Extract<E, Done<any>>;

/**
 * Extracts the done value type from a {@link NextResult}.
 *
 * @category Utilities
 */
export type InferDone<R extends Result<any, any>> =
  InferErr<R> extends infer Errors
    ? Errors extends Done<infer D>
      ? D
      : never
    : never;
