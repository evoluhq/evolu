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

/** An Object representation recognized by {@link getObjectKind}. */
export type ObjectKind =
  "Array" | "Date" | "Map" | "Object" | "Set" | "Uint8Array" | "Unsupported";

/**
 * Classifies Object representations supported by Evolu's structural data APIs.
 *
 * Plain Objects are classified from their prototype without reading their
 * properties, including `Symbol.toStringTag`.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, getObjectKind } from "@evolu/common";
 *
 * assertEqual(getObjectKind({}), "Object");
 * assertEqual(getObjectKind(new Map()), "Map");
 * assertEqual(getObjectKind(/value/u), "Unsupported");
 * ```
 */
export const getObjectKind = (value: object): ObjectKind => {
  if (Array.isArray(value)) return "Array";
  if (isPlainObject(value)) return "Object";

  switch (Object.prototype.toString.call(value)) {
    case "[object Date]":
      return "Date";
    case "[object Map]":
      return "Map";
    case "[object Set]":
      return "Set";
    case "[object Uint8Array]":
      return "Uint8Array";
    default:
      return "Unsupported";
  }
};

/**
 * Checks if a value is a plain object (e.g., created with `{}` or `Object`).
 *
 * Accepts objects with a `null` prototype. Otherwise, it uses a realm-neutral
 * structural heuristic: the immediate prototype must be a root object with own
 * `hasOwnProperty` and `isPrototypeOf` properties. This recognizes ordinary
 * Objects from another JavaScript realm without relying on prototype identity.
 *
 * A custom root prototype with the same shape can therefore be classified as
 * plain. This function assumes trusted JavaScript and is not a prototype
 * authentication or security boundary. Other custom prototypes, class
 * instances, and built-in objects are rejected.
 *
 * ### Example
 *
 * ```ts
 * import { assertFalse, assertTrue, isPlainObject } from "@evolu/common";
 *
 * assertTrue(isPlainObject({}));
 * assertTrue(isPlainObject(Object.create(null)));
 * assertFalse(isPlainObject(new Date()));
 * assertFalse(isPlainObject(new (class Example {})()));
 * assertFalse(isPlainObject([]));
 * assertFalse(isPlainObject(null));
 * ```
 */
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype === null) return true;
  return (
    Object.getPrototypeOf(prototype) === null &&
    Object.hasOwn(prototype, "hasOwnProperty") &&
    Object.hasOwn(prototype, "isPrototypeOf")
  );
};

/**
 * Checks if a value is a function.
 *
 * ### Example
 *
 * ```ts
 * import { assertFalse, assertTrue, isFunction } from "@evolu/common";
 *
 * assertTrue(isFunction(() => {}));
 * assertTrue(isFunction(function () {}));
 * assertFalse(isFunction({}));
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
 * import { assertFalse, assertTrue, isIterable } from "@evolu/common";
 *
 * assertTrue(isIterable([1, 2, 3]));
 * assertTrue(isIterable("abc"));
 * assertFalse(isIterable({}));
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
 *   assertEqual,
 *   assertType,
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
 * assertType<ReadonlyArray<[UserId, string]>, typeof entries>();
 * assertEqual(entries, [[userId, "Alice"]]);
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
 *   assertEqual,
 *   assertType,
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
 * assertType<ReadonlyRecord<UserId, string>, typeof users>();
 * assertEqual(users, { u1: "Alice" });
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
 * import {
 *   assertEqual,
 *   assertType,
 *   objectFrom,
 *   type ReadonlyRecord,
 * } from "@evolu/common";
 *
 * const translations = objectFrom(
 *   ["en", "fr"] as const,
 *   (locale): string => `Hello in ${locale}`,
 * );
 *
 * assertType<ReadonlyRecord<"en" | "fr", string>, typeof translations>();
 * assertEqual(translations, {
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
 * import { assertEqual, createMutableRecord } from "@evolu/common";
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
 * assertEqual(
 *   createValuesByKey([
 *     ["a", 1],
 *     ["b", 2],
 *   ]),
 *   { a: 1, b: 2 },
 * );
 * ```
 *
 * Note that TypeScript does not model an object's runtime prototype. A plain
 * TypeScript Record exposes `Object.prototype` members even when the runtime
 * object has a `null` prototype:
 *
 * ```ts
 * import { assertErr, assertTrue, trySync } from "@evolu/common";
 *
 * const values = Object.create(null) as Record<string, number>;
 *
 * // TypeScript accepts the call, but `toString` is undefined at runtime.
 * const result = trySync(() => values.toString());
 * assertErr(result);
 * assertTrue(result.error instanceof TypeError);
 * ```
 *
 * `createMutableRecord` uses the same TypeScript Record representation.
 *
 * ```ts
 * import {
 *   assertErr,
 *   assertTrue,
 *   createMutableRecord,
 *   trySync,
 * } from "@evolu/common";
 *
 * const values = createMutableRecord<string, number>();
 *
 * // TypeScript accepts the call, but `toString` is undefined at runtime.
 * const result = trySync(() => values.toString());
 * assertErr(result);
 * assertTrue(result.error instanceof TypeError);
 * ```
 *
 * In other words, treat the returned object as string-keyed data rather than
 * calling inherited object methods through it.
 */
export function createMutableRecord<
  K extends string = string,
  V = unknown,
>(): Record<K, V>;

/** Creates a mutable null-prototype copy of an object. */
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
 * import { assertEqual, assertType, getOwnProp } from "@evolu/common";
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
 * assertType<User | undefined, typeof user>();
 * assertEqual(user, undefined);
 * assertEqual(getOwnProp(users, "toString"), undefined);
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
 * import { assertTrue, createObjectURL } from "@evolu/common";
 *
 * const blob = new Blob(["hello"], { type: "text/plain" });
 * using objectUrl = createObjectURL(blob);
 *
 * assertTrue(/^blob:/.test(objectUrl.url));
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
