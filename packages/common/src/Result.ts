/**
 * 🛡️ Type-safe errors
 *
 * The problem with throwing an exception in JavaScript is that the caught error
 * is always of an unknown type. The unknown type is a problem because we can't
 * be sure all errors have been handled because the TypeScript compiler can't
 * tell us.
 *
 * Languages like Rust 🦀 or Haskell 📚 use a type-safe approach to error
 * handling, where errors are explicitly represented as part of the return type,
 * such as Result or Either, allowing the developer to handle errors safely.
 * TypeScript can have this too via the `Result` type.
 *
 * The `Result` type can be either {@link Ok} (success) or {@link Err} (error).
 * Use {@link ok} to create a successful result and {@link err} to create an error
 * result.
 *
 * Now let's look at how `Result` can be used for safe JSON parsing:
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
 * // Result<unknown, ParseJsonError>
 * const json = parseJson('{"key": "value"}');
 *
 * // Fail fast to handle errors early.
 * if (!json.ok) return json; // Err<ParseJsonError>
 *
 * // Now, we have access to the json.value.
 * expectTypeOf(json.value).toBeUnknown();
 * ```
 *
 * Note how we didn't have to use the try/catch, just `if (!json.ok)`, and how
 * the error isn't unknown but has a type.
 *
 * But we had to use `try/catch` in the `parseJson` function. For such a case,
 * wrapping unsafe code, Evolu provides the {@link trySync} helper:
 *
 * ```ts
 * const parseJson = (value: string): Result<unknown, ParseJsonError> =>
 *   trySync(
 *     () => JSON.parse(value) as unknown,
 *     (error) => ({ type: "ParseJsonError", message: String(error) }),
 *   );
 * ```
 *
 * ✨ {@link trySync} helper makes unsafe (can throw) synchronous code safe; for
 * unsafe asynchronous code, use {@link tryAsync}.
 *
 * Let's summarize it:
 *
 * - For safe code, use `ok` and `err`.
 * - For unsafe code, use `trySync` or `tryAsync`.
 *
 * Asynchronous safe (because of a Promise using Result) code:
 *
 * ```ts
 * const fetchUser = async (
 *   userId: string,
 * ): Promise<Result<User, FetchUserError>> => {
 *   // Simulate an API call
 *   return new Promise((resolve) => {
 *     setTimeout(() => {
 *       if (userId === "1") {
 *         resolve(ok({ id: "1", name: "Alice" }));
 *       } else {
 *         resolve(
 *           err({ type: "FetchUserError", reason: "user not found" }),
 *         );
 *       }
 *     }, 1000);
 *   });
 * };
 * ```
 *
 * ### Naming Convention
 *
 * - For values: `const user = getUser()`
 * - For void operations: `const result = foo()` (unless it would clash)
 * - For clashes, suffix the name: `const saveResult = save()`
 *
 * ```ts
 * const processUser = () => {
 *   // we have a value
 *   const user = getUser();
 *   if (!user.ok) return user;
 *
 *   // void operation
 *   const result = saveToDatabase(user.value);
 *   if (!result.ok) return result;
 *
 *   // avoiding clash
 *   const deleteFromCacheResult = deleteFromCache();
 *   if (!deleteFromCacheResult.ok) return deleteFromCacheResult;
 *
 *   return ok();
 * };
 * ```
 *
 * ### Examples
 *
 * #### Sequential Operations with Short-Circuiting
 *
 * When performing a sequence of operations where any failure should stop
 * further processing, use the `Result` type with early returns.
 *
 * Here's an example of a database reset operation that drops tables, restores a
 * schema, and initializes the database, stopping on the first error:
 *
 * ```ts
 * const resetResult = deps.sqlite.transaction(() => {
 *   const dropAllTablesResult = dropAllTables(deps);
 *   if (!dropAllTablesResult.ok) return dropAllTablesResult;
 *
 *   if (message.restore) {
 *     const dbSchema = getDbSchema(deps)();
 *     if (!dbSchema.ok) return dbSchema;
 *
 *     const ensureDbSchemaResult = ensureDbSchema(deps)(
 *       message.restore.dbSchema,
 *       dbSchema.value,
 *     );
 *     if (!ensureDbSchemaResult.ok) return ensureDbSchemaResult;
 *
 *     const initializeDbResult = initializeDb(deps)(
 *       message.restore.mnemonic,
 *     );
 *     if (!initializeDbResult.ok) return initializeDbResult;
 *   }
 *   return ok();
 * });
 *
 * if (!resetResult.ok) {
 *   deps.postMessage({ type: "onError", error: resetResult.error });
 *   return;
 * }
 * ```
 *
 * In this pattern:
 *
 * - Each operation returns a `Result` (e.g., `Result<void, E>` or `Result<T,
 *   E>`).
 * - After each operation, check `if (!result.ok)` and return the `Err` to
 *   short-circuit.
 * - If all operations succeed, return `ok()` (or another value if needed).
 * - Outside the transaction, handle the final `Result` to report success or
 *   failure.
 *
 * This approach ensures type-safe error handling, avoids nested try/catch
 * blocks, and clearly communicates the control flow.
 *
 * #### A function with two different errors:
 *
 * ```ts
 * const example = (value: string): Result<number, FooError | BarError> => {
 *   const foo = getFoo(value);
 *   if (!foo.ok) return foo;
 *
 *   const bar = getBar(foo.value);
 *   if (!bar.ok) return bar;
 *
 *   return ok(barToNumber(bar.value));
 * };
 * ```
 *
 * ### FAQ
 *
 * #### What if my function doesn't return a value on success?
 *
 * If your function performs an operation but doesn't need to return a value on
 * success, you can use `Result<void, E>`. Using `Result<void, E>` is clearer
 * than using `Result<true, E>` or `Result<null, E>` because it communicates
 * that the function doesn't produce a value but can produce errors.
 *
 * #### How do I short-circuit processing of an array on the first error?
 *
 * If you want to stop processing as soon as an error occurs (short-circuit),
 * you should produce and check each `Result` inside a loop:
 *
 * ```ts
 * for (const query of [
 *   sql`drop table evolu_owner;`,
 *   sql`drop table evolu_message;`,
 * ]) {
 *   const result = deps.sqlite.exec(query);
 *   if (!result.ok) return result;
 * }
 * // All queries succeeded
 * ```
 *
 * #### How do I handle an array of operations and short-circuit on the first error?
 *
 * If you have an array of operations (not results), you should make them
 * _lazy_—that is, represent each operation as a function. This way, you only
 * execute each operation as needed, and can stop on the first error:
 *
 * ```ts
 * import type { LazyValue } from "./Function";
 *
 * const operations: LazyValue<Result<void, MyError>>[] = [
 *   () => doSomething(),
 *   () => doSomethingElse(),
 * ];
 *
 * for (const op of operations) {
 *   const result = op();
 *   if (!result.ok) return result;
 * }
 * // All operations succeeded
 * ```
 *
 * If you already have an array of `Result`s, the processing has already
 * happened, so you can't short-circuit. In that case, you can check for the
 * first error:
 *
 * ```ts
 * const firstError = results.find((r) => !r.ok);
 * if (firstError) return firstError;
 * // All results are Ok
 * ```
 *
 * ### Why doesn't Evolu provide "handy helpers"?
 *
 * Evolu intentionally favors imperative patterns (like the `for...of` loop
 * above) over monadic helpers. Imperative code is generally more readable,
 * easier to debug, and more familiar to most JavaScript and TypeScript
 * developers. While monads and functional helpers can be powerful, they often
 * obscure control flow and make debugging harder.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/** A successful {@link Result}. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * An error {@link Result}.
 *
 * The `error` property can be any type that describes the error. For normal
 * business logic, use a plain object. This allows us to structure errors with
 * custom fields (e.g., `{ type: "MyError", code: 123 }`). Messages for users
 * belong to translations, not to error objects.
 *
 * If you need a stacktrace for debugging, use an `Error` instance or a custom
 * error class to include additional metadata.
 *
 * ### Examples
 *
 * #### Business Logic Error (Plain Object, Recommended)
 *
 * ```ts
 * const failure = err({
 *   type: "ParseJsonError",
 *   code: 1001,
 *   input: "foo",
 * });
 * ```
 *
 * #### Debugging with Stack Trace (Error Instance)
 *
 * ```ts
 * const failure = err(new Error("Something went wrong"));
 * ```
 *
 * #### Custom Error Class
 *
 * ```ts
 * class MyCustomError extends Error {
 *   constructor(
 *     public code: number,
 *     public input: string,
 *   ) {
 *     super(`Error ${code} on input: ${input}`);
 *     this.name = "MyCustomError";
 *   }
 * }
 * const failure = err(new MyCustomError(404, "bad-input"));
 * ```
 */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Creates an {@link Ok} result.
 *
 * - `ok()` creates an `Ok<void>` for operations that succeed without producing a
 *   value.
 * - `ok(value)` creates an `Ok<T>` containing the specified value.
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
export function ok(): Ok<void>;
/** Creates an {@link Ok} result with a specified value. */
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value = undefined): Ok<T> {
  return { ok: true, value: value as T };
}

/**
 * Creates an {@link Err} result.
 *
 * ### Example
 *
 * ```ts
 * const failure = err("Something went wrong");
 * console.log(failure); // { ok: false, error: "Something went wrong" }
 * ```
 */
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

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
 * Wraps synchronous functions that may throw exceptions, returning a
 * {@link Result}.
 *
 * The `trySync` function is designed to handle synchronous code safely by
 * wrapping the execution in a try-catch block. If the function succeeds, it
 * returns an `Ok` result. If an exception is thrown, it maps the error to a
 * custom type and returns an `Err` result.
 *
 * ### Example
 *
 * ```ts
 * interface ParseJsonError {
 *   readonly type: "ParseJsonError";
 *   readonly message: string;
 * }
 *
 * const parseJson = (value: string): Result<unknown, ParseJsonError> =>
 *   trySync(
 *     () => JSON.parse(value) as unknown,
 *     (error): ParseJsonError => ({
 *       type: "ParseJsonError",
 *       message: String(error),
 *     }),
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
 * Wraps async functions or any operation returning a promise, returning a
 * {@link Result}.
 *
 * The `tryAsync` function provides a way to handle asynchronous code safely by
 * catching any rejected promises and mapping errors to a custom type. If the
 * promise resolves, it returns an `Ok` result. If the promise rejects, it maps
 * the error and returns an `Err` result.
 *
 * ### Example
 *
 * ```ts
 * interface FetchError {
 *   readonly type: "FetchError";
 *   readonly message: string;
 * }
 *
 * const tryFetch = async (
 *   url: string,
 * ): Promise<Result<unknown, FetchError>> =>
 *   tryAsync(
 *     async () => {
 *       const response = await fetch(url);
 *       if (!response.ok) {
 *         throw new Error(`Request failed with status ${response.status}`);
 *       }
 *       return response.json();
 *     },
 *     (error) => ({
 *       type: "FetchError",
 *       message: String(error),
 *     }),
 *   );
 *
 * const result = await tryFetch(
 *   "https://jsonplaceholder.typicode.com/posts/1",
 * );
 * if (result.ok) {
 *   console.log("Data:", result.value);
 * } else {
 *   console.error("Error:", result.error);
 * }
 * ```
 */
export const tryAsync = async <T, E>(
  promiseFn: () => Promise<T>,
  mapError: (error: unknown) => E,
): Promise<Result<T, E>> =>
  promiseFn().then(
    (value) => ok(value),
    (error: unknown) => err(mapError(error)),
  );
