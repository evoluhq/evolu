/**
 * Optional value container.
 *
 * Distinguishes absence from values like `null` or `undefined`.
 *
 * Use Option when the value itself can be `null` or `undefined`. For APIs where
 * `null` means "not found", just use `T | null` directly.
 *
 * ### Example
 *
 * ```ts
 * // A cache that can store any value, including null and undefined
 * const cache = new Map<string, Option<unknown>>();
 *
 * const get = (key: string): Option<unknown> => cache.get(key) ?? none;
 *
 * cache.set("a", some(null)); // Stored null
 * cache.set("b", some(undefined)); // Stored undefined
 *
 * isSome(get("a")); // true — value is null
 * isSome(get("b")); // true — value is undefined
 * isNone(get("c")); // true — key doesn't exist
 * ```
 *
 * @module
 */

/** Optional value. */
import type { Typed } from "./Type.js";

/** Optional value. */
export type Option<T> = Some<T> | None;

/** Present value in an {@link Option}. */
export interface Some<out T> extends Typed<"Some"> {
  readonly value: T;
}

/** Absent value in an {@link Option}. */
export interface None extends Typed<"None"> {}

/**
 * Extracts the value type from an {@link Option} or {@link Some}.
 *
 * @group Utilities
 */
export type InferOption<O extends Option<any>> =
  O extends Some<infer T> ? T : never;

/** Creates a {@link Some}. */
export const some = <T>(value: T): Option<T> => ({
  type: "Some",
  value,
});

/** Shared {@link None} instance. */
export const none: None = { type: "None" };

/** Type guard for {@link Some}. */
export const isSome = <T>(option: Option<T>): option is Some<T> =>
  option.type === "Some";

/** Type guard for {@link None}. */
export const isNone = <T>(option: Option<T>): option is None =>
  option.type === "None";

/**
 * Converts a nullable value to an {@link Option}.
 *
 * `null` and `undefined` become {@link none}.
 */
export const fromNullable = <T>(
  value: T | null | undefined,
): Option<NonNullable<T>> => (value == null ? none : some(value));
