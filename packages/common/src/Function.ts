import { NonEmptyArray, NonEmptyReadonlyArray } from "./Array.js";
import { ReadonlyRecord } from "./Object.js";

/**
 * Helper function to ensure exhaustive matching in a switch statement. Throws
 * an error if an unhandled case is encountered.
 *
 * Remember, it's useful only when we don't return anything from the switch
 * statement. Otherwise, a return type of a function is enough.
 *
 * ### Example
 *
 * ```ts
 * type Color = "red" | "green" | "blue";
 *
 * function handleColor(color: Color): void {
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
 * }
 * ```
 */
export const exhaustiveCheck = (value: never): never => {
  throw new Error(`exhaustiveCheck unhandled case: ${JSON.stringify(value)}`);
};

/**
 * Returns the input value unchanged.
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
 * ```
 *
 * @experimental
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
 * A function that delays computation and returns a value of type T.
 *
 * Useful for:
 *
 * - Lazy evaluation
 * - Returning constant values
 * - Providing default or placeholder behaviors
 *
 * ### Example
 *
 * ```ts
 * const getRandomNumber: LazyValue<number> = () => Math.random();
 * const randomValue = getRandomNumber();
 * ```
 */
export type LazyValue<T> = () => T;

export const constVoid: LazyValue<void> = () => undefined;
export const constUndefined: LazyValue<undefined> = () => undefined;
export const constNull: LazyValue<null> = () => null;
export const constTrue: LazyValue<true> = () => true;
export const constFalse: LazyValue<false> = () => false;
