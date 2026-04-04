/**
 * Lookup-key collections and helpers.
 *
 * @module
 */

import { assert } from "./Assert.js";
import type { Brand } from "./Brand.js";
import { isPlainObject } from "./Object.js";
import { Uint8Array, uint8ArrayToBase64Url } from "./Type.js";

/**
 * Derives the native lookup key used by lookup-based collections.
 *
 * Native `Map` and `Set` are suitable for primitive keys and keys where
 * reference identity is the intended key, but they are not useful when
 * different references should represent the same logical key.
 *
 * Lookup-based collections solve that by deriving a stable lookup key from each
 * input key and using that lookup key for the internal native `Map` lookup.
 * Keys that derive the same lookup key are treated as the same logical key.
 *
 * Use this when callers provide keys in one form but logical identity should be
 * based on another stable key, such as a natural id or {@link StructuralKey}.
 *
 * @see {@link createLookupMap}
 * @see {@link createLookupSet}
 */
export type Lookup<K, L> = (key: K) => L;

/** Optional {@link Lookup}. */
export interface LookupOption<K, L = K> {
  /** Derives the lookup key used for logical equality. */
  readonly lookup?: Lookup<K, L>;
}

/**
 * `Map`-like collection keyed by a {@link Lookup derived lookup key}.
 *
 * `set` preserves the first inserted representative for a logical key. `getKey`
 * returns that representative for callers that need stable identity.
 *
 * @see {@link createLookupMap}
 */
export interface LookupMap<K, V> extends Iterable<readonly [K, V]> {
  readonly size: number;
  readonly has: (key: K) => boolean;
  readonly get: (key: K) => V | undefined;
  readonly getOrInsert: (key: K, defaultValue: V) => V;
  readonly getOrInsertComputed: (key: K, callbackfn: (key: K) => V) => V;
  readonly getKey: (key: K) => K | undefined;
  readonly set: (key: K, value: V) => LookupMap<K, V>;
  readonly delete: (key: K) => boolean;
  readonly clear: () => void;
  readonly keys: () => IterableIterator<K>;
  readonly values: () => IterableIterator<V>;
  readonly entries: () => IterableIterator<readonly [K, V]>;
  readonly forEach: (
    callback: (value: V, key: K, map: LookupMap<K, V>) => void,
  ) => void;
  readonly [Symbol.iterator]: () => IterableIterator<readonly [K, V]>;
}

/** Options for {@link createLookupMap}. */
export interface CreateLookupMapOptions<K, V, L> extends Required<
  LookupOption<K, L>
> {
  /** Initial entries for the map. */
  readonly entries?: Iterable<readonly [K, V]>;
}

/** Creates {@link LookupMap}. */
export const createLookupMap = <K, V, L>({
  lookup,
  entries,
}: CreateLookupMapOptions<K, V, L>): LookupMap<K, V> => {
  interface LookupEntry<K, V> {
    readonly key: K;
    readonly value: V;
  }

  const entriesByLookupKey = new Map<L, LookupEntry<K, V>>();

  const map: LookupMap<K, V> = {
    get size() {
      return entriesByLookupKey.size;
    },

    has: (key) => entriesByLookupKey.has(lookup(key)),

    get: (key) => entriesByLookupKey.get(lookup(key))?.value,

    getOrInsert: (key, defaultValue) =>
      entriesByLookupKey.getOrInsert(lookup(key), {
        key,
        value: defaultValue,
      }).value,

    getOrInsertComputed: (key, callbackfn) =>
      entriesByLookupKey.getOrInsertComputed(lookup(key), () => ({
        key,
        value: callbackfn(key),
      })).value,

    getKey: (key) => entriesByLookupKey.get(lookup(key))?.key,

    set: (key, value) => {
      const lookupKey = lookup(key);
      const existingEntry = entriesByLookupKey.get(lookupKey);
      entriesByLookupKey.set(lookupKey, {
        key: existingEntry?.key ?? key,
        value,
      });
      return map;
    },

    delete: (key) => entriesByLookupKey.delete(lookup(key)),

    clear: () => {
      entriesByLookupKey.clear();
    },

    keys: function* () {
      for (const entry of entriesByLookupKey.values()) {
        yield entry.key;
      }
    },

    values: function* () {
      for (const entry of entriesByLookupKey.values()) {
        yield entry.value;
      }
    },

    entries: function* () {
      for (const entry of entriesByLookupKey.values()) {
        yield [entry.key, entry.value] as const;
      }
    },

    forEach: (callback) => {
      for (const entry of entriesByLookupKey.values()) {
        callback(entry.value, entry.key, map);
      }
    },

    [Symbol.iterator]: function () {
      return map.entries();
    },
  };

  if (entries) {
    for (const [key, value] of entries) {
      map.set(key, value);
    }
  }

  return map;
};

/**
 * `Set`-like collection keyed by a {@link Lookup derived lookup key}.
 *
 * `add` preserves the first inserted representative for a logical key. `get`
 * returns that representative for callers that need stable identity.
 *
 * @see {@link createLookupSet}
 */
export interface LookupSet<K> extends Iterable<K> {
  readonly size: number;
  readonly has: (key: K) => boolean;
  readonly get: (key: K) => K | undefined;
  readonly add: (key: K) => LookupSet<K>;
  readonly delete: (key: K) => boolean;
  readonly clear: () => void;
  readonly keys: () => IterableIterator<K>;
  readonly values: () => IterableIterator<K>;
  readonly entries: () => IterableIterator<readonly [K, K]>;
  readonly forEach: (
    callback: (value: K, key: K, set: LookupSet<K>) => void,
  ) => void;
  readonly [Symbol.iterator]: () => IterableIterator<K>;
}

/** Options for {@link createLookupSet}. */
export interface CreateLookupSetOptions<K, L> extends Required<
  LookupOption<K, L>
> {
  /** Initial values for the set. */
  readonly values?: Iterable<K>;
}

/** Creates {@link LookupSet}. */
export const createLookupSet = <K, L>({
  lookup,
  values,
}: CreateLookupSetOptions<K, L>): LookupSet<K> => {
  const map = createLookupMap<K, true, L>({ lookup });

  const set: LookupSet<K> = {
    get size() {
      return map.size;
    },

    has: (key) => map.has(key),

    get: (key) => map.getKey(key),

    add: (key) => {
      map.set(key, true);
      return set;
    },

    delete: (key) => map.delete(key),

    clear: () => {
      map.clear();
    },

    keys: () => map.keys(),

    values: () => map.keys(),

    entries: function* () {
      for (const key of map.keys()) {
        yield [key, key] as const;
      }
    },

    forEach: (callback) => {
      for (const key of map.keys()) {
        callback(key, key, set);
      }
    },

    [Symbol.iterator]: function () {
      return set.keys();
    },
  };

  if (values) {
    for (const value of values) {
      set.add(value);
    }
  }

  return set;
};

/** Scalar branch shared by {@link StructuralKey} and {@link Structural}. */
export type StructuralScalar = string | number | boolean | null | Uint8Array;

/** Branded native key produced by {@link structuralLookup}. */
export type StructuralLookupKey = string & Brand<"StructuralLookupKey">;

/**
 * Immutable structural key.
 *
 * Structural keys are JSON-like values with `NaN` and positive/negative
 * infinity also supported, or `Uint8Array`.
 *
 * @see {@link Structural}
 * @see {@link structuralLookup}
 */
export type StructuralKey =
  | StructuralScalar
  | ReadonlyArray<StructuralKey>
  | { readonly [key: string]: StructuralKey };

/**
 * Compile-time structural form of `T` for structural lookup APIs.
 *
 * This exists because {@link StructuralKey} is the runtime serialization model,
 * not a good public generic constraint for interface-shaped objects.
 * `StructuralKey` models object values with a string index signature, which is
 * stricter than ordinary interfaces like `{ readonly id: string }` even though
 * the runtime serializer accepts such plain objects.
 *
 * `Structural<T>` checks a concrete type recursively at compile time instead:
 * scalars pass through, arrays recurse, object properties recurse, and
 * function-valued properties are rejected. This keeps public structural APIs
 * ergonomic for interface-based inputs while preserving the same runtime
 * constraints as structural lookup serialization.
 *
 * @see {@link StructuralKey}
 * @see {@link structuralLookup}
 */
export type Structural<T> = T extends StructuralScalar
  ? T
  : T extends ReadonlyArray<infer Item>
    ? ReadonlyArray<Structural<Item>>
    : T extends StructuralFunction
      ? never
      : T extends object
        ? {
            readonly [K in keyof T as Extract<
              T[K],
              StructuralFunction
            > extends never
              ? K
              : never]: Structural<Exclude<T[K], StructuralFunction>>;
          } & {
            readonly [K in keyof T as Extract<
              T[K],
              StructuralFunction
            > extends never
              ? never
              : K]?: never;
          }
        : never;

/** Function branch excluded by {@link Structural}. */
export type StructuralFunction = (...args: ReadonlyArray<unknown>) => unknown;

/**
 * Returns the structural lookup key for `key`.
 *
 * Structural lookup keys are derived from JSON-like values plus `Uint8Array`.
 * Equal structures produce the same lookup key even when they are different
 * JavaScript instances.
 *
 * The derived key is memoized by non-null object identity in a module-scoped
 * `WeakMap` shared by all callers, so keys must be immutable.
 *
 * Use this as a {@link Lookup} when logical equality should be based on
 * structural value instead of reference identity.
 *
 * ### Example
 *
 * ```ts
 * const byFilter = createLookupMap<
 *   { readonly table: string; readonly where: readonly [string, string] },
 *   string,
 *   StructuralLookupKey
 * >({
 *   lookup: structuralLookup,
 * });
 *
 * byFilter.set({ table: "todo", where: ["owner", "ada"] }, "cached");
 * byFilter.get({ table: "todo", where: ["owner", "ada"] }); // "cached"
 * ```
 *
 * @see {@link StructuralKey}
 * @see {@link Structural}
 */
export const structuralLookup = <K>(key: Structural<K>): StructuralLookupKey =>
  structuralLookupInternal(key) as StructuralLookupKey;

const structuralLookupKeyByValue = new WeakMap<object, string>();

const structuralLookupInternal = (
  value: unknown,
  path: Set<object> = new Set(),
): string => {
  switch (typeof value) {
    case "string":
      return `s:${JSON.stringify(value)}`;
    case "number":
      if (Number.isNaN(value)) return "n:NaN";
      if (value === Number.POSITIVE_INFINITY) return "n:Infinity";
      if (value === Number.NEGATIVE_INFINITY) return "n:-Infinity";
      return Object.is(value, -0) ? "n:0" : `n:${value}`;
    case "boolean":
      return value ? "b:true" : "b:false";
    case "object": {
      if (value === null) return "l:null";

      const cachedLookupKey = structuralLookupKeyByValue.get(value);
      if (cachedLookupKey) return cachedLookupKey;

      let lookupKey: string;

      if (Array.isArray(value)) {
        assert(
          !path.has(value),
          "Structural lookup keys must not contain cycles.",
        );
        path.add(value);
        lookupKey = getStructuralArrayLookupKey(value, path);
        path.delete(value);
      } else if (isPlainObject(value)) {
        assert(
          !path.has(value),
          "Structural lookup keys must not contain cycles.",
        );
        path.add(value);
        lookupKey = getStructuralObjectLookupKey(value, path);
        path.delete(value);
      } else if (Uint8Array.is(value)) {
        lookupKey = `u:${uint8ArrayToBase64Url(value)}`;
      } else {
        assert(
          false,
          "Structural lookup keys must be JSON-like values or Uint8Array.",
        );
      }

      structuralLookupKeyByValue.set(value, lookupKey);
      return lookupKey;
    }
    default:
      assert(
        false,
        "Structural lookup keys must be JSON-like values or Uint8Array.",
      );
  }
};

const getStructuralArrayLookupKey = (
  value: ReadonlyArray<unknown>,
  path: Set<object>,
): string =>
  `a:[${Array.from(value, (item) => structuralLookupInternal(item, path)).join(",")}]`;

const getStructuralObjectLookupKey = (
  value: object,
  path: Set<object>,
): string => {
  const valueRecord = value as Record<string, unknown>;

  const entries = Object.keys(valueRecord)
    .toSorted()
    .map((key) => {
      const item = valueRecord[key];
      return `${JSON.stringify(key)}:${structuralLookupInternal(item, path)}`;
    });

  return `o:{${entries.join(",")}}`;
};
