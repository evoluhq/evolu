/**
 * An in-memory {@link Storage} that keeps SQLite out of the protocol-only
 * measurement.
 *
 * It holds one owner's timestamps in a sorted array with XOR prefix
 * fingerprints, built with the loaded version's own fingerprint function,
 * sentinels, and range type, so it answers exactly as relay storage does.
 * Before timing, the benchmark checks that it produces frames byte-identical to
 * real SQLite relay storage. It statically imports only erased types.
 */
import type { NonNegativeInt } from "@evolu/common";
import type {
  EncryptedDbChange,
  Fingerprint,
  FingerprintRange,
  OwnerWriteKey,
  Storage,
  TimestampBytes,
} from "@evolu/common/local-first";
import type { CommonModule, LocalFirstModule } from "../protocol/child.mts";

/** The loaded Evolu exports the storage is built from. */
export interface MemoryStorageModules {
  readonly common: Pick<CommonModule, "ok">;
  readonly localFirst: Pick<
    LocalFirstModule,
    | "InfiniteUpperBound"
    | "RangeType"
    | "timestampBytesToFingerprint"
    | "timestampToTimestampBytes"
    | "zeroFingerprint"
  >;
}

export interface MemoryStorageEntry {
  readonly timestamp: TimestampBytes;
  readonly change: EncryptedDbChange;
}

/**
 * Immutable stored rows a {@link MemoryStorage} starts from, so each measured
 * pass starts from the same state without loading it again.
 */
export interface MemoryStorageSnapshot {
  readonly size: number;
  readonly timestamps: ReadonlyArray<TimestampBytes>;
  /** Timestamp bytes as Latin-1 strings, which sort like the bytes. */
  readonly keys: ReadonlyArray<string>;
  /** Three little-endian words of each timestamp's fingerprint. */
  readonly fingerprintWords: Uint32Array;
  readonly changesByKey: ReadonlyMap<string, EncryptedDbChange>;
}

export interface MemoryStorage extends Storage {
  /** The stored rows in timestamp order, for verification. */
  readonly readAll: () => ReadonlyArray<MemoryStorageEntry>;
  /**
   * Restores the snapshot's rows and forgets the write key, in place, so the
   * next pass allocates nothing to start over. Call it outside measured
   * regions.
   */
  readonly reset: () => void;
}

/** Builds a snapshot from entries in ascending timestamp order. */
export const createMemoryStorageSnapshot = (
  { localFirst }: MemoryStorageModules,
  sortedEntries: ReadonlyArray<MemoryStorageEntry>,
): MemoryStorageSnapshot => {
  const size = sortedEntries.length;
  const fingerprintWords = new Uint32Array(size * wordsPerFingerprint);
  const changesByKey = new Map<string, EncryptedDbChange>();
  const keys: Array<string> = [];
  const timestamps: Array<TimestampBytes> = [];
  sortedEntries.forEach(({ timestamp, change }, index) => {
    const key = timestampBytesToKey(timestamp);
    if (index > 0 && keys[index - 1] >= key) {
      throw new Error("Memory storage entries must be ascending and unique.");
    }
    keys.push(key);
    timestamps.push(timestamp);
    changesByKey.set(key, change);
    writeFingerprintWords(
      fingerprintWords,
      index,
      localFirst.timestampBytesToFingerprint(timestamp),
    );
  });
  return { size, timestamps, keys, fingerprintWords, changesByKey };
};

/**
 * Creates a storage that starts from `snapshot` and never changes it.
 *
 * `capacity` presizes the fingerprint arrays for the rows sync adds. The
 * storage holds a single owner and ignores owner ids.
 */
export const createMemoryStorage = (
  { common, localFirst }: MemoryStorageModules,
  snapshot: MemoryStorageSnapshot,
  capacity: number,
): MemoryStorage => {
  const initialCapacity = Math.max(capacity, snapshot.size, 1);

  let size = snapshot.size;
  const keys = [...snapshot.keys];
  const timestamps = [...snapshot.timestamps];
  let fingerprintWords = new Uint32Array(initialCapacity * wordsPerFingerprint);
  fingerprintWords.set(snapshot.fingerprintWords);
  /** The XOR of the fingerprints before each index, so index 0 holds zero. */
  let prefixWords = new Uint32Array(
    (initialCapacity + 1) * wordsPerFingerprint,
  );
  // Changes written since the last reset; the snapshot's map is shared.
  const addedChangesByKey = new Map<string, EncryptedDbChange>();
  /** Rows before this index still equal the snapshot's. */
  let firstChanged = size;
  let writeKey: OwnerWriteKey | null = null;

  /** Recomputes prefix fingerprints after index `from` changed. */
  const updatePrefix = (from: number) => {
    for (let index = from; index < size; index++) {
      const word = index * wordsPerFingerprint;
      prefixWords[word + 3] = prefixWords[word] ^ fingerprintWords[word];
      prefixWords[word + 4] =
        prefixWords[word + 1] ^ fingerprintWords[word + 1];
      prefixWords[word + 5] =
        prefixWords[word + 2] ^ fingerprintWords[word + 2];
    }
  };

  const changeOf = (key: string): EncryptedDbChange => {
    const change = addedChangesByKey.get(key) ?? snapshot.changesByKey.get(key);
    if (change === undefined) {
      throw new Error("Every timestamp must have a change");
    }
    return change;
  };

  /** Index of the first key in [0, `end`) not below `key`, or `end`. */
  const lowerBound = (key: string, end: number): number => {
    let low = 0;
    let high = end;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (keys[middle] < key) low = middle + 1;
      else high = middle;
    }
    return low;
  };

  const fingerprintBetween = (begin: number, end: number): Fingerprint => {
    if (begin === end) return localFirst.zeroFingerprint;
    const fingerprint = new Uint8Array(fingerprintSize);
    const beginWord = begin * wordsPerFingerprint;
    const endWord = end * wordsPerFingerprint;
    for (let word = 0; word < wordsPerFingerprint; word++) {
      const value = prefixWords[beginWord + word] ^ prefixWords[endWord + word];
      fingerprint[word * 4] = value & 0xff;
      fingerprint[word * 4 + 1] = (value >>> 8) & 0xff;
      fingerprint[word * 4 + 2] = (value >>> 16) & 0xff;
      fingerprint[word * 4 + 3] = value >>> 24;
    }
    return fingerprint as Fingerprint;
  };

  updatePrefix(0);

  return {
    getSize: () => size as NonNegativeInt,

    fingerprint: (_ownerId, begin, end) => fingerprintBetween(begin, end),

    fingerprintRanges: (
      _ownerId,
      buckets,
      upperBound = localFirst.InfiniteUpperBound,
    ) =>
      buckets.map((end, index): FingerprintRange => {
        if (end > size) throw new Error("bucket out of range");
        const isLast = index === buckets.length - 1;
        if (!isLast && end === size) {
          throw new Error("A bucket before the last ends at the size.");
        }
        return {
          type: localFirst.RangeType.Fingerprint,
          upperBound: isLast ? upperBound : timestamps[end],
          fingerprint: fingerprintBetween(
            index === 0 ? 0 : buckets[index - 1],
            end,
          ),
        };
      }),

    // Like relay storage, the result counts from the owner's first timestamp.
    findLowerBound: (_ownerId, begin, end, upperBound) => {
      if (
        end === 0 ||
        begin === end ||
        upperBound === localFirst.InfiniteUpperBound
      ) {
        return end;
      }
      const index = lowerBound(timestampBytesToKey(upperBound), size);
      return (index === size ? end : index) as NonNegativeInt;
    },

    iterate: (_ownerId, begin, end, callback) => {
      for (let index = begin; index < end; index++) {
        if (!callback(timestamps[index], index)) return;
      }
    },

    validateWriteKey: (_ownerId, candidate) => {
      if (writeKey === null) {
        writeKey = candidate;
        return true;
      }
      // Both are 16 bytes, as OwnerWriteKey guarantees.
      let difference = 0;
      for (let index = 0; index < candidate.length; index++) {
        difference |= writeKey[index] ^ candidate[index];
      }
      return difference === 0;
    },

    writeMessages: (_ownerId, messages) => () => {
      const added: Array<{
        readonly key: string;
        readonly timestamp: TimestampBytes;
      }> = [];
      for (const { timestamp, change } of messages) {
        const timestampBytes = localFirst.timestampToTimestampBytes(timestamp);
        const key = timestampBytesToKey(timestampBytes);
        // A key added earlier in this batch is already in addedChangesByKey.
        if (addedChangesByKey.has(key) || snapshot.changesByKey.has(key)) {
          continue;
        }
        addedChangesByKey.set(key, change);
        added.push({ key, timestamp: timestampBytes });
      }
      if (added.length === 0) return common.ok();
      added.sort((a, b) => (a.key < b.key ? -1 : 1));

      // Inserts the new entries, ascending by key. A few are spliced in one by
      // one. Otherwise they are placed from the largest down, and the stored
      // rows above each one move up as a block by the count of new entries not
      // above them, so only rows after the first insertion point move, each
      // once. Both keep `Array.prototype.copyWithin` off regular arrays, where
      // it is much slower than a loop.
      const required = size + added.length;
      const currentCapacity = fingerprintWords.length / wordsPerFingerprint;
      if (required > currentCapacity) {
        const next = Math.max(required, currentCapacity * 2);
        const grownFingerprints = new Uint32Array(next * wordsPerFingerprint);
        grownFingerprints.set(fingerprintWords);
        fingerprintWords = grownFingerprints;
        const grownPrefix = new Uint32Array((next + 1) * wordsPerFingerprint);
        grownPrefix.set(prefixWords);
        prefixWords = grownPrefix;
      }
      let first = size;
      if (added.length <= maxSplicedEntries) {
        for (const { key, timestamp } of added) {
          const position = lowerBound(key, size);
          keys.splice(position, 0, key);
          timestamps.splice(position, 0, timestamp);
          fingerprintWords.copyWithin(
            (position + 1) * wordsPerFingerprint,
            position * wordsPerFingerprint,
            size * wordsPerFingerprint,
          );
          writeFingerprintWords(
            fingerprintWords,
            position,
            localFirst.timestampBytesToFingerprint(timestamp),
          );
          size++;
          first = Math.min(first, position);
        }
      } else {
        for (let index = 0; index < added.length; index++) {
          keys.push("");
          timestamps.push(added[0].timestamp);
        }
        let end = size;
        for (let index = added.length - 1; index >= 0; index--) {
          const { key, timestamp } = added[index];
          const position = lowerBound(key, end);
          const shift = index + 1;
          for (let source = end - 1; source >= position; source--) {
            keys[source + shift] = keys[source];
            timestamps[source + shift] = timestamps[source];
          }
          fingerprintWords.copyWithin(
            (position + shift) * wordsPerFingerprint,
            position * wordsPerFingerprint,
            end * wordsPerFingerprint,
          );
          keys[position + index] = key;
          timestamps[position + index] = timestamp;
          writeFingerprintWords(
            fingerprintWords,
            position + index,
            localFirst.timestampBytesToFingerprint(timestamp),
          );
          end = position;
        }
        size += added.length;
        first = end;
      }
      firstChanged = Math.min(firstChanged, first);
      updatePrefix(first);
      return common.ok();
    },

    readDbChange: (_ownerId, timestamp) =>
      changeOf(timestampBytesToKey(timestamp)),

    deleteOwner: () => {
      throw new Error("The memory storage does not delete owners.");
    },

    readAll: () =>
      timestamps.slice(0, size).map((timestamp, index) => ({
        timestamp,
        change: changeOf(keys[index]),
      })),

    reset: () => {
      writeKey = null;
      if (firstChanged === snapshot.size && size === snapshot.size) return;
      size = snapshot.size;
      keys.length = size;
      timestamps.length = size;
      for (let index = firstChanged; index < size; index++) {
        keys[index] = snapshot.keys[index];
        timestamps[index] = snapshot.timestamps[index];
      }
      fingerprintWords.set(
        snapshot.fingerprintWords.subarray(firstChanged * wordsPerFingerprint),
        firstChanged * wordsPerFingerprint,
      );
      addedChangesByKey.clear();
      updatePrefix(firstChanged);
      firstChanged = size;
    },
  };
};

/** Wraps each method of `target` to count its calls by name. */
export const countCalls = <T extends object>(
  target: T,
): { readonly storage: T; readonly counts: () => Record<string, number> } => {
  const callsByMethod: Record<string, number> = {};
  const storage = Object.fromEntries(
    Object.entries(target).map(([method, value]: [string, unknown]) => {
      if (typeof value !== "function") return [method, value];
      callsByMethod[method] = 0;
      return [
        method,
        (...args: Array<unknown>): unknown => {
          callsByMethod[method]++;
          return Reflect.apply(value, target, args) as unknown;
        },
      ];
    }),
  ) as T;
  return { storage, counts: () => ({ ...callsByMethod }) };
};

/** Up to this many new entries are spliced in one by one. */
const maxSplicedEntries = 8;

const fingerprintSize = 12;
const wordsPerFingerprint = 3;

const timestampBytesToKey = (bytes: Uint8Array): string =>
  String.fromCharCode(
    bytes[0],
    bytes[1],
    bytes[2],
    bytes[3],
    bytes[4],
    bytes[5],
    bytes[6],
    bytes[7],
    bytes[8],
    bytes[9],
    bytes[10],
    bytes[11],
    bytes[12],
    bytes[13],
    bytes[14],
    bytes[15],
  );

const writeFingerprintWords = (
  words: Uint32Array,
  index: number,
  fingerprint: Uint8Array,
): void => {
  if (fingerprint.length !== fingerprintSize) {
    throw new Error(`A fingerprint has ${fingerprint.length} bytes.`);
  }
  for (let word = 0; word < wordsPerFingerprint; word++) {
    words[index * wordsPerFingerprint + word] =
      (fingerprint[word * 4] |
        (fingerprint[word * 4 + 1] << 8) |
        (fingerprint[word * 4 + 2] << 16) |
        (fingerprint[word * 4 + 3] << 24)) >>>
      0;
  }
};
