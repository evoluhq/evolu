/**
 * Checks if a value is a plain object (e.g., created with `{}` or `Object`).
 *
 * ### Example
 *
 * ```ts
 * isPlainObject({}); // true
 * isPlainObject(new Date()); // false
 * isPlainObject([]); // false
 * isPlainObject(null); // false
 * ```
 */
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === "[object Object]";

/**
 * A read-only `Record<K, V>` with `K extends keyof any` to preserve branded key
 * types (e.g., in {@link mapObject}).
 */
export type ReadonlyRecord<K extends keyof any, V> = Readonly<Record<K, V>>;

// A helper type to remove symbol keys (e.g for branded objects).
type StringKeyOf<T> = Extract<keyof T, string>;

/**
 * Converts a record to entries, preserving branded string key types (e.g.,
 * `type Id = 'id' & string`) via `StringKeyOf<T>`, unlike `Object.entries`
 * which widens keys to `string`.
 */
export const objectToEntries = <T extends Record<string, any>>(
  record: T,
): Array<[StringKeyOf<T>, T[StringKeyOf<T>]]> =>
  Object.entries(record) as Array<[StringKeyOf<T>, T[StringKeyOf<T>]]>;

/**
 * Maps a `ReadonlyRecord<K, V>` to a new `ReadonlyRecord<K, U>`, preserving
 * branded key types (e.g., `type Id = 'id' & string`) lost by `Object.entries`.
 * Uses `K extends string` for precision.
 */
export const mapObject = <K extends string, V, U>(
  record: ReadonlyRecord<K, V>,
  fn: (value: V, key: K) => U,
): ReadonlyRecord<K, U> =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      fn(value as V, key as K),
    ]),
  ) as ReadonlyRecord<K, U>;

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
