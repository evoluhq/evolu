/** Represents a many-to-many mapping between keys and values. */
export interface ManyToManyMap<K, V> {
  /** Adds a key-value association to the map. */
  add: (key: K, value: V) => ManyToManyMap<K, V>;

  /** Removes a specific key-value association. */
  remove: (key: K, value: V) => boolean;

  /** Gets all values associated with a key. */
  getValues: (key: K) => Set<V> | undefined;

  /** Gets all keys associated with a value. */
  getKeys: (value: V) => Set<K> | undefined;

  /** Checks if a specific key-value pair exists. */
  hasPair: (key: K, value: V) => boolean;

  /** Checks if a key exists in the map. */
  hasKey(key: K): boolean;

  /** Checks if a value exists in the map. */
  hasValue: (value: V) => boolean;

  /** Deletes all associations for a key. */
  deleteKey: (key: K) => boolean;

  /** Deletes all associations for a value. */
  deleteValue: (value: V) => boolean;

  /** Clears all associations in the map. */
  clear(): void;
}

/** Creates a {@link ManyToManyMap}. */
export const createManyToManyMap = <K, V>(): ManyToManyMap<K, V> => {
  const forwardMap = new Map<K, Set<V>>();
  const reverseMap = new Map<V, Set<K>>();

  const map: ManyToManyMap<K, V> = {
    add(key: K, value: V) {
      let values = forwardMap.get(key);
      if (!values) {
        values = new Set<V>();
        forwardMap.set(key, values);
      }
      values.add(value);

      let keys = reverseMap.get(value);
      if (!keys) {
        keys = new Set<K>();
        reverseMap.set(value, keys);
      }
      keys.add(key);

      return map;
    },

    remove(key: K, value: V) {
      const values = forwardMap.get(key);
      if (!values?.has(value)) return false;

      values.delete(value);
      if (values.size === 0) {
        forwardMap.delete(key);
      }

      const keys = reverseMap.get(value);
      if (keys?.size) {
        keys.delete(key);
        if (keys.size === 0) {
          reverseMap.delete(value);
        }
      }

      return true;
    },

    getValues(key: K) {
      return forwardMap.get(key);
    },

    getKeys(value: V) {
      return reverseMap.get(value);
    },

    hasPair(key: K, value: V) {
      const values = forwardMap.get(key);
      return values?.has(value) ?? false;
    },

    hasKey(key: K) {
      return forwardMap.has(key);
    },

    hasValue(value: V) {
      return reverseMap.has(value);
    },

    deleteKey(key: K) {
      const values = forwardMap.get(key);
      if (!values) return false;

      for (const value of values) {
        const keys = reverseMap.get(value);
        if (keys) {
          keys.delete(key);
          if (keys.size === 0) {
            reverseMap.delete(value);
          }
        }
      }
      forwardMap.delete(key);
      return true;
    },

    deleteValue(value: V) {
      const keys = reverseMap.get(value);
      if (!keys) return false;

      for (const key of keys) {
        const values = forwardMap.get(key);
        if (values) {
          values.delete(value);
          if (values.size === 0) {
            forwardMap.delete(key);
          }
        }
      }
      reverseMap.delete(value);
      return true;
    },

    clear() {
      forwardMap.clear();
      reverseMap.clear();
    },
  };

  return map;
};
