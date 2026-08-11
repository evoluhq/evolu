/**
 * Object utilities.
 *
 * @module
 */

/**
 * A read-only `Record<K, V>` with `K extends keyof any` to preserve branded key
 * types (e.g., in {@link mapObject}).
 */
export type ReadonlyRecord<K extends keyof any, V> = Readonly<Record<K, V>>;

/**
 * Checks if a value is a plain object (e.g., created with `{}` or `Object`).
 *
 * Accepts objects with `Object.prototype` and objects with a `null` prototype
 * created via `Object.create(null)`. Rejects class instances and other built-in
 * objects because their prototype chain includes an application-specific or
 * built-in prototype before `Object.prototype`.
 *
 * The prototype-chain check uses structure instead of `prototype ===
 * Object.prototype` so it also works for plain objects coming from another
 * JavaScript realm.
 *
 * TODO: deprecated Use `Object.is` from Type. Define a dedicated Type when
 * another object domain is required.
 *
 * ### Example
 *
 * ```ts
 * import { isPlainObject } from "@evolu/common";
 *
 * expect(isPlainObject({})).toBe(true);
 * expect(isPlainObject(Object.create(null))).toBe(true);
 * expect(isPlainObject(new Date())).toBe(false);
 * expect(isPlainObject(new (class Example {})())).toBe(false);
 * expect(isPlainObject([])).toBe(false);
 * expect(isPlainObject(null)).toBe(false);
 * ```
 */
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};

/**
 * Checks if a value is a function.
 *
 * ### Example
 *
 * ```ts
 * import { isFunction } from "@evolu/common";
 *
 * expect(isFunction(() => {})).toBe(true);
 * expect(isFunction(function () {})).toBe(true);
 * expect(isFunction({})).toBe(false);
 * ```
 */
export const isFunction = (value: unknown): value is globalThis.Function =>
  typeof value === "function";

/**
 * Checks if a value is {@link Iterable}.
 *
 * ### Example
 *
 * ```ts
 * import { isIterable } from "@evolu/common";
 *
 * expect(isIterable([1, 2, 3])).toBe(true);
 * expect(isIterable("abc")).toBe(true);
 * expect(isIterable({})).toBe(false);
 * ```
 */
export const isIterable = (value: unknown): value is Iterable<unknown> =>
  value != null &&
  typeof (value as Iterable<unknown>)[Symbol.iterator] === "function";

/**
 * Like `Object.entries` but preserves branded keys.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   objectToEntries,
 *   type Brand,
 *   type ReadonlyRecord,
 * } from "@evolu/common";
 *
 * type UserId = string & Brand<"UserId">;
 *
 * const userId = "u1" as UserId;
 * const users: ReadonlyRecord<UserId, string> = { [userId]: "Alice" };
 * const entries = objectToEntries(users);
 *
 * expectTypeOf(entries).toEqualTypeOf<ReadonlyArray<[UserId, string]>>();
 * expect(entries).toEqual([[userId, "Alice"]]);
 * ```
 */
export const objectToEntries = <T extends Record<string, any>>(
  record: T,
): ReadonlyArray<[StringKeyOf<T>, T[StringKeyOf<T>]]> =>
  Object.entries(record) as Array<[StringKeyOf<T>, T[StringKeyOf<T>]]>;

// A helper type to remove symbol keys (e.g for branded objects).
type StringKeyOf<T> = Extract<keyof T, string>;

/**
 * Creates an object from key-value pairs, preserving branded key types.
 *
 * The inverse of {@link objectToEntries}. Use when you need type-safe
 * reconstruction of objects with branded keys.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   objectFromEntries,
 *   type Brand,
 *   type ReadonlyRecord,
 * } from "@evolu/common";
 *
 * type UserId = string & Brand<"UserId">;
 * const entries: ReadonlyArray<[UserId, string]> = [
 *   ["u1" as UserId, "Alice"],
 * ];
 * const users = objectFromEntries(entries);
 *
 * expectTypeOf(users).toEqualTypeOf<ReadonlyRecord<UserId, string>>();
 * expect(users).toEqual({ u1: "Alice" });
 * ```
 */
export const objectFromEntries = <K extends string, V>(
  entries: Iterable<readonly [K, V]>,
): ReadonlyRecord<K, V> => Object.fromEntries(entries) as ReadonlyRecord<K, V>;

/**
 * Creates an object by mapping keys to values.
 *
 * The inverse of `Object.keys` — instead of extracting keys from an object,
 * builds an object from keys with a mapper function.
 *
 * ### Example
 *
 * ```ts
 * import { objectFrom, type ReadonlyRecord } from "@evolu/common";
 *
 * const translations = objectFrom(
 *   ["en", "fr"] as const,
 *   (locale): string => `Hello in ${locale}`,
 * );
 *
 * expectTypeOf(translations).toEqualTypeOf<
 *   ReadonlyRecord<"en" | "fr", string>
 * >();
 * expect(translations).toEqual({
 *   en: "Hello in en",
 *   fr: "Hello in fr",
 * });
 * ```
 */
export const objectFrom = <K extends string, V>(
  keys: ReadonlyArray<K>,
  getValue: (key: K) => V,
): ReadonlyRecord<K, V> =>
  Object.fromEntries(keys.map((k) => [k, getValue(k)])) as ReadonlyRecord<K, V>;

/**
 * Maps a `ReadonlyRecord<K, V>` to a new `ReadonlyRecord<K, U>`, preserving
 * branded key types (e.g., `type Id = 'id' & string`) lost by `Object.entries`.
 * Uses `K extends string` for precision.
 */
export const mapObject = <K extends string, V, U>(
  record: ReadonlyRecord<K, V>,
  fn: (value: V, key: K) => U,
): ReadonlyRecord<K, U> => {
  const out = Object.create(null) as Record<K, U>;

  for (const key in record) {
    out[key as K] = fn(record[key as K], key);
  }

  return out;
};

/** Conditionally excludes a property from an object. */
export const excludeProp = <T extends object, K extends keyof T>(
  obj: T,
  prop: K,
  condition?: boolean,
): typeof condition extends true ? T : Omit<T, K> => {
  if (condition) {
    return { ...obj };
  }
  const { [prop]: _, ...rest } = obj;
  return rest;
};

/**
 * Creates a mutable Record.
 *
 * Use it to build a Record locally through mutation, avoiding repeated object
 * spreads. Keep mutation scoped to the constructing function, and treat the
 * completed Record as immutable after it leaves that scope. When a source is
 * provided, its own enumerable properties are shallow-copied. Inherited and
 * non-enumerable properties are not copied.
 *
 * The Record is created with `Object.create(null)`, so any string can be used
 * as a key while it is being built. Missing keys such as `toString` and
 * `constructor` do not resolve to inherited values, and assigning `__proto__`
 * creates an own data property instead of changing the prototype.
 *
 * The null prototype makes dynamic construction safer, but it does not have to
 * be preserved. Spreading the completed Record into an ordinary object is
 * supported. Use {@link getOwnProp} when a lookup must read only own
 * properties.
 *
 * For immutable empty application data, defaults, or placeholders, use
 * {@link emptyRecord}.
 *
 * ### Example
 *
 * ```ts
 * import { createMutableRecord } from "@evolu/common";
 *
 * const createValuesByKey = (
 *   entries: ReadonlyArray<readonly [string, number]>,
 * ): Readonly<Record<string, number>> => {
 *   const valuesByKey = createMutableRecord<string, number>();
 *
 *   for (const [key, value] of entries) {
 *     valuesByKey[key] = value;
 *   }
 *
 *   return valuesByKey;
 * };
 *
 * expect(
 *   createValuesByKey([
 *     ["a", 1],
 *     ["b", 2],
 *   ]),
 * ).toEqual({ a: 1, b: 2 });
 * ```
 *
 * Note that TypeScript does not model an object's runtime prototype. A plain
 * TypeScript Record exposes `Object.prototype` members even when the runtime
 * object has a `null` prototype:
 *
 * ```ts
 * const values = Object.create(null) as Record<string, number>;
 *
 * // TypeScript accepts the call, but `toString` is undefined at runtime.
 * expect(() => values.toString()).toThrow(TypeError);
 * ```
 *
 * `createMutableRecord` uses the same TypeScript Record representation.
 *
 * ```ts
 * import { createMutableRecord } from "@evolu/common";
 *
 * const values = createMutableRecord<string, number>();
 *
 * // TypeScript accepts the call, but `toString` is undefined at runtime.
 * expect(() => values.toString()).toThrow(TypeError);
 * ```
 *
 * In other words, treat the returned object as string-keyed data rather than
 * calling inherited object methods through it.
 */
export function createMutableRecord<
  K extends string = string,
  V = unknown,
>(): Record<K, V>;
export function createMutableRecord<T extends object>(
  source: T,
): { -readonly [K in keyof T]: T[K] };
export function createMutableRecord(source?: object): Record<string, unknown> {
  const record = Object.create(null) as Record<string, unknown>;
  return source === undefined ? record : Object.assign(record, source);
}

/**
 * A shared frozen empty readonly Record.
 *
 * Use it as an immutable empty value for defaults and placeholders instead of
 * allocating a new empty object. Because the instance is shared, it is frozen
 * to prevent accidental mutation.
 *
 * Use {@link createMutableRecord} to build a Record locally through mutation
 * instead of repeated object spreads.
 *
 * @group Constants
 */
export const emptyRecord: Readonly<Record<string, never>> =
  /*#__PURE__*/ Object.freeze(
    /*#__PURE__*/ createMutableRecord<string, never>(),
  );

/**
 * Gets an own property from a record, returning `undefined` if the key is
 * missing or inherited.
 *
 * TypeScript's `Record<K, V>` type assumes all keys exist, but at runtime
 * accessing a missing key returns `undefined`. This helper provides proper
 * typing for that case without treating properties inherited from
 * `Object.prototype` as record data.
 *
 * ### Example
 *
 * ```ts
 * import { getOwnProp } from "@evolu/common";
 *
 * interface User {
 *   readonly name: string;
 * }
 *
 * const users: Readonly<Record<string, User>> = {
 *   alice: { name: "Alice" },
 * };
 * const user = getOwnProp(users, "bob");
 *
 * expectTypeOf(user).toEqualTypeOf<User | undefined>();
 * expect(user).toBeUndefined();
 * expect(getOwnProp(users, "toString")).toBeUndefined();
 * ```
 */
export const getOwnProp = <K extends string, V>(
  record: ReadonlyRecord<K, V>,
  key: NoInfer<K>,
): V | undefined => (Object.hasOwn(record, key) ? record[key] : undefined);

/**
 * A disposable wrapper around `URL.createObjectURL` that automatically revokes
 * the URL when disposed. Use with the `using` declaration for automatic
 * cleanup.
 *
 * ### Example
 *
 * ```ts
 * import { createObjectURL } from "@evolu/common";
 *
 * const blob = new Blob(["hello"], { type: "text/plain" });
 * using objectUrl = createObjectURL(blob);
 *
 * expect(objectUrl.url).toMatch(/^blob:/);
 * // URL.revokeObjectURL is automatically called when the scope ends.
 * ```
 *
 * This ensures the URL is always revoked when the scope ends, even if an error
 * occurs, preventing memory leaks from unreleased blob URLs.
 */
export interface ObjectURL extends Disposable {
  /** The object URL string created by `URL.createObjectURL`. */
  readonly url: string;
}

/** Creates a disposable {@link ObjectURL} for the given blob. */
export const createObjectURL = (blob: Blob): ObjectURL => {
  const url = URL.createObjectURL(blob);
  return {
    url,
    [Symbol.dispose]: () => {
      URL.revokeObjectURL(url);
    },
  };
};
