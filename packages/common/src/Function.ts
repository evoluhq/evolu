/**
 * Function utilities including exhaustive checks and composition.
 *
 * @module
 */

import type { NonEmptyArray, NonEmptyReadonlyArray } from "./Array.js";
import type { ReadonlyRecord } from "./Object.js";

/**
 * Helper function to ensure exhaustive matching in a switch statement. Throws
 * an error if an unhandled case is encountered.
 *
 * ### Example
 *
 * ```ts
 * type Color = "red" | "green" | "blue";
 *
 * const handleColor = (color: Color): void => {
 *   switch (color) {
 *     case "red":
 *       console.log("Handling red");
 *       break;
 *     case "green":
 *       console.log("Handling green");
 *       break;
 *     case "blue":
 *       console.log("Handling blue");
 *       break;
 *     default:
 *       exhaustiveCheck(color); // Ensures all cases are handled
 *   }
 * };
 * ```
 *
 * Useful only when the switch returns `void`; if it returns a value, the
 * function return type enforces exhaustiveness.
 *
 * ### Example
 *
 * Use a return type when the switch returns a value.
 *
 * ```ts
 * type Color = "red" | "green" | "blue";
 *
 * const colorToHex = (color: Color): string => {
 *   switch (color) {
 *     case "red":
 *       return "#ff0000";
 *     case "green":
 *       return "#00ff00";
 *     case "blue":
 *       return "#0000ff";
 *   }
 * };
 * ```
 */
export const exhaustiveCheck = (value: never): never => {
  throw new Error(`exhaustiveCheck unhandled case: ${JSON.stringify(value)}`);
};

/**
 * Returns the value unchanged.
 *
 * Useful as a default transformation, placeholder callback, or when a function
 * is required but no transformation is needed.
 *
 * ### Example
 *
 * ```ts
 * const values = [1, 2, 3];
 * const same = values.map(identity); // [1, 2, 3]
 *
 * const getTransform = (shouldDouble: boolean) =>
 *   shouldDouble ? (x: number) => x * 2 : identity;
 * ```
 */
export const identity = <A>(a: A): A => a;

/**
 * Casts an array, set, record, or map to its readonly counterpart.
 *
 * Zero runtime cost — returns the same value with a readonly type. Use this to
 * enforce immutability at the type level. Preserves {@link NonEmptyArray} as
 * {@link NonEmptyReadonlyArray}.
 *
 * ### Example
 *
 * ```ts
 * // Array literals become NonEmptyReadonlyArray
 * const items = readonly([1, 2, 3]);
 * // Type: NonEmptyReadonlyArray<number>
 *
 * // NonEmptyArray is preserved as NonEmptyReadonlyArray
 * const nonEmpty: NonEmptyArray<number> = [1, 2, 3];
 * const readonlyNonEmpty = readonly(nonEmpty);
 * // Type: NonEmptyReadonlyArray<number>
 *
 * // Regular arrays become ReadonlyArray
 * const arr: Array<number> = getNumbers();
 * const readonlyArr = readonly(arr);
 * // Type: ReadonlyArray<number>
 *
 * // Sets, Records, and Maps
 * const ids = readonly(new Set(["a", "b"]));
 * // Type: ReadonlySet<string>
 *
 * const users: Record<UserId, string> = { ... };
 * const readonlyUsers = readonly(users);
 * // Type: ReadonlyRecord<UserId, string>
 *
 * const lookup = readonly(new Map([["key", "value"]]));
 * // Type: ReadonlyMap<string, string>
 *
 * // ES2025 iterator chains: use .toArray() then readonly
 * const doubled = readonly([1, 2, 3].values().map((x) => x * 2).toArray());
 * // Type: ReadonlyArray<number>
 * ```
 */
export function readonly<T>(array: NonEmptyArray<T>): NonEmptyReadonlyArray<T>;
export function readonly<T>(array: Array<T>): ReadonlyArray<T>;
export function readonly<T>(set: Set<T>): ReadonlySet<T>;
export function readonly<K, V>(map: Map<K, V>): ReadonlyMap<K, V>;
export function readonly<K extends keyof any, V>(
  record: Record<K, V>,
): ReadonlyRecord<K, V>;
export function readonly<T, K extends keyof any, V>(
  value: Array<T> | Set<T> | Map<K, V> | Record<K, V>,
):
  | ReadonlyArray<T>
  | ReadonlySet<T>
  | ReadonlyMap<K, V>
  | ReadonlyRecord<K, V> {
  return value;
}

/**
 * A function that takes no arguments and returns a value of type T. Also known
 * as a thunk.
 *
 * Useful for:
 *
 * - Providing default callbacks (see {@link lazyVoid}, {@link lazyTrue}, etc.)
 * - Delaying expensive operations until actually needed
 * - Deferring side effects so the callee controls when they run
 *
 * ### Example
 *
 * ```ts
 * // Default callback
 * const notify = (onDone: Lazy<void> = lazyVoid) => {
 *   onDone();
 * };
 *
 * // Delay computation
 * const getData: Lazy<Data> = () => compute();
 * const data = getData();
 *
 * // Defer side effects
 * const schedule = (job: Lazy<void>) => {
 *   queueMicrotask(job);
 * };
 * schedule(() => logMetric("loaded"));
 * ```
 */
export type Lazy<T> = () => T;

/** Creates a {@link Lazy} from a value. Useful for defining constant thunks. */
export const lazy =
  <T>(value: T): Lazy<T> =>
  () =>
    value;

/** A {@link Lazy} that returns `true`. */
export const lazyTrue: Lazy<true> = lazy(true);

/** A {@link Lazy} that returns `false`. */
export const lazyFalse: Lazy<false> = lazy(false);

/** A {@link Lazy} that returns `null`. */
export const lazyNull: Lazy<null> = lazy(null);

/** A {@link Lazy} that returns `undefined`. */
export const lazyUndefined: Lazy<undefined> = lazy(undefined);

/** A {@link Lazy} that returns `undefined` for void callbacks. */
export const lazyVoid: Lazy<void> = lazyUndefined;

/**
 * Development placeholder that always throws.
 *
 * Use to sketch function bodies before implementing them. TypeScript infers the
 * return type from context, so surrounding code still type-checks. Use an
 * explicit generic when there is no return type annotation.
 *
 * ### Example
 *
 * ```ts
 * // Type inferred from return type annotation
 * const fetchUser = (id: UserId): Result<User, FetchError> => todo();
 * expectTypeOf(fetchUser).returns.toEqualTypeOf<
 *   Result<User, FetchError>
 * >();
 *
 * // Explicit generic when no return type
 * const getConfig = () => todo<Config>();
 * expectTypeOf(getConfig).returns.toEqualTypeOf<Config>();
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const todo = <T>(): T => {
  throw new Error("not yet implemented");
};
