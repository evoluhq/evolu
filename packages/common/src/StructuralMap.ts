/**
 * Map with structural keys.
 *
 * @module
 */

import { isPlainObject } from "./Object.js";
import { assert } from "./Assert.js";
import { uint8ArrayToBase64Url, type JsonValue } from "./Type.js";

/**
 * Immutable structural key.
 *
 * Structural keys support {@link JsonValue} plus `Uint8Array`.
 *
 * This is for keys that are JSON-like or can reasonably travel through
 * `postMessage`, not for arbitrary JavaScript objects.
 *
 * Keys are compared by structural value rather than object identity, so arrays,
 * plain objects, and `Uint8Array` values must not be mutated.
 *
 * @see {@link StructuralMap}
 */
export type StructuralKey =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | StructuralArrayInput
  | StructuralObjectInput;

export interface StructuralObjectInput {
  readonly [key: string]: StructuralKey;
}

export type StructuralArrayInput = ReadonlyArray<StructuralKey>;

/**
 * `Map`-like collection keyed by {@link StructuralKey}.
 *
 * Use this when keys should compare by structural value instead of identity.
 *
 * Structurally equal arrays and plain objects address the same entry even when
 * they are different JavaScript instances.
 *
 * This is intended for small to medium registries and coordination tables where
 * callers naturally already have immutable JSON-like keys and do not want to
 * maintain a separate canonical id.
 *
 * The implementation derives a canonical structural id for each key and stores
 * entries in a native `Map` keyed by that id. For repeated lookups of the same
 * object or array instance, the derived id is cached in a `WeakMap` so
 * subsequent access can reuse it without recomputing the full structure.
 *
 * This favors simplicity and predictable behavior over maximum scale. Each
 * operation still needs to derive the structural id, so cost is proportional to
 * key size before the final native `Map` lookup. For collections with many
 * distinct keys or very hot paths, prefer native stable keys with a native
 * `Map`.
 */
export interface StructuralMap<K extends StructuralKey, V> extends Iterable<
  readonly [K, V]
> {
  readonly size: number;
  readonly clear: () => void;
  readonly delete: (key: K) => boolean;
  readonly entries: () => IterableIterator<readonly [K, V]>;
  readonly forEach: (
    callback: (value: V, key: K, map: StructuralMap<K, V>) => void,
  ) => void;
  readonly get: (key: K) => V | undefined;
  readonly has: (key: K) => boolean;
  readonly keys: () => IterableIterator<K>;
  readonly set: (key: K, value: V) => StructuralMap<K, V>;
  readonly values: () => IterableIterator<V>;
}

/** Creates {@link StructuralMap}. */
export const createStructuralMap = <
  K extends StructuralKey,
  V,
>(): StructuralMap<K, V> => {
  const entriesById = new Map<string, Entry<K, V>>();
  const keyIdByObject = new WeakMap<object, string>();

  const getKeyId = (key: K): string =>
    serializeStructuralKey(key, keyIdByObject, new Set<object>());

  const map: StructuralMap<K, V> = {
    get size() {
      return entriesById.size;
    },

    clear: () => {
      entriesById.clear();
    },

    delete: (key) => entriesById.delete(getKeyId(key)),

    entries: function* () {
      for (const entry of entriesById.values()) {
        yield [entry.key, entry.value] as const;
      }
    },

    forEach: (callback) => {
      for (const entry of entriesById.values()) {
        callback(entry.value, entry.key, map);
      }
    },

    get: (key) => entriesById.get(getKeyId(key))?.value,

    has: (key) => entriesById.has(getKeyId(key)),

    keys: function* () {
      for (const entry of entriesById.values()) {
        yield entry.key;
      }
    },

    set: (key, value) => {
      entriesById.set(getKeyId(key), { key, value });
      return map;
    },

    values: function* () {
      for (const entry of entriesById.values()) {
        yield entry.value;
      }
    },

    [Symbol.iterator]: function () {
      return map.entries();
    },
  };

  return map;
};

interface Entry<K extends StructuralKey, V> {
  readonly key: K;
  readonly value: V;
}

const serializeStructuralKey = (
  value: StructuralKey,
  keyIdByObject: WeakMap<object, string>,
  path: Set<object>,
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

      const cachedId = keyIdByObject.get(value);
      if (cachedId) return cachedId;

      let keyId: string;

      if (Array.isArray(value)) {
        assert(!path.has(value), "Structural keys must not contain cycles.");
        path.add(value);
        keyId = serializeStructuralArray(value, keyIdByObject, path);
        path.delete(value);
      } else if (isPlainObject(value)) {
        assert(!path.has(value), "Structural keys must not contain cycles.");
        path.add(value);
        keyId = serializeStructuralObject(value, keyIdByObject, path);
        path.delete(value);
      } else {
        keyId = `u:${uint8ArrayToBase64Url(value as Uint8Array)}`;
      }

      keyIdByObject.set(value, keyId);
      return keyId;
    }
    default:
      assert(false, "Structural keys must be JSON-like values or Uint8Array.");
  }
};

const serializeStructuralArray = (
  value: StructuralArrayInput,
  keyIdByObject: WeakMap<object, string>,
  path: Set<object>,
): string =>
  `a:[${value
    .map((item) => serializeStructuralKey(item, keyIdByObject, path))
    .join(",")}]`;

const serializeStructuralObject = (
  value: Readonly<Record<string, StructuralKey | undefined>>,
  keyIdByObject: WeakMap<object, string>,
  path: Set<object>,
): string => {
  const entries = Object.keys(value)
    .sort()
    .map((key) => {
      const item = value[key];
      assert(item !== undefined, "Structural keys must not contain undefined.");
      return `${JSON.stringify(key)}:${serializeStructuralKey(item, keyIdByObject, path)}`;
    });

  return `o:{${entries.join(",")}}`;
};
