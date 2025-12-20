/**
 * Checks if a value is a plain object (e.g., created with `{}` or `Object`).
 *
 * ## Example
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
 * Like `Object.entries` but preserves branded keys.
 *
 * ## Example
 *
 * ```ts
 * type UserId = string & { readonly __brand: "UserId" };
 * const users = createRecord<UserId, string>();
 * const entries = objectToEntries(users); // [UserId, string][]
 * ```
 */
export const objectToEntries = <T extends Record<string, any>>(
  record: T,
): ReadonlyArray<[StringKeyOf<T>, T[StringKeyOf<T>]]> =>
  Object.entries(record) as Array<
    [StringKeyOf<T>, T[StringKeyOf<T>]]
  > as ReadonlyArray<[StringKeyOf<T>, T[StringKeyOf<T>]]>;

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

/**
 * Creates a prototype-less object typed as `Record<K, V>`.
 *
 * Use this function when you need a plain record without a prototype chain
 * (e.g. when keys are controlled by external sources) to avoid prototype
 * pollution and accidental collisions with properties like `__proto__`.
 *
 * Example:
 *
 * ```ts
 * const values = createRecord<string, SqliteValue>();
 * values["__proto__"] = someValue; // safe, no prototype pollution
 * ```
 */
export const createRecord = <K extends string = string, V = unknown>(): Record<
  K,
  V
> => Object.create(null) as Record<K, V>;

/**
 * Safely gets a property from a record, returning `undefined` if the key
 * doesn't exist.
 *
 * TypeScript's `Record<K, V>` type assumes all keys exist, but at runtime
 * accessing a non-existent key returns `undefined`. This helper provides proper
 * typing for that case without needing a type assertion.
 *
 * ## Example
 *
 * ```ts
 * const users: Record<string, User> = { alice: { name: "Alice" } };
 * const user = getProperty(users, "bob"); // User | undefined
 * ```
 */
export const getProperty = <K extends string, V>(
  record: ReadonlyRecord<K, V>,
  key: string,
): V | undefined => (key in record ? record[key as K] : undefined);

/**
 * A disposable wrapper around `URL.createObjectURL` that automatically revokes
 * the URL when disposed. Use with the `using` declaration for automatic
 * cleanup.
 *
 * ## Example
 *
 * ```ts
 * const blob = new Blob(["hello"], { type: "text/plain" });
 * using objectUrl = createObjectURL(blob);
 * console.log(objectUrl.url); // blob:...
 * // URL.revokeObjectURL is automatically called when the scope ends
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
