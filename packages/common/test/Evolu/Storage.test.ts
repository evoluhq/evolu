import { sha256 } from "@noble/hashes/sha2.js";
import { assert, expect, test } from "vitest";
import {
  BaseSqliteStorageDep,
  createBaseSqliteStorage,
  createBaseSqliteStorageTables,
  Fingerprint,
  getTimestampByIndex,
  InfiniteUpperBound,
  timestampBytesToFingerprint,
} from "../../src/Evolu/Storage.js";
import {
  Counter,
  createTimestamp,
  Millis,
  orderTimestampBytes,
  timestampToTimestampBytes,
} from "../../src/Evolu/Timestamp.js";
import {
  computeBalancedBuckets,
  createRandom,
  getOrThrow,
  NonNegativeInt,
  ok,
  ownerIdToOwnerIdBytes,
  PositiveInt,
  sql,
  SqliteDep,
  TimestampBytes,
} from "../../src/index.js";
import { testCreateSqlite, testOwner2, testOwnerIdBytes } from "../_deps.js";
import {
  testAnotherTimestampsAsc,
  testTimestampsAsc,
  testTimestampsDesc,
  testTimestampsRandom,
} from "./_fixtures.js";

const createDeps = async (): Promise<SqliteDep & BaseSqliteStorageDep> => {
  const sqlite = await testCreateSqlite();
  // For reliable performance, we have to use Math.random!
  // Pseudo-random does not scale (randomness is limited).
  const random = createRandom();

  const result = createBaseSqliteStorageTables({ sqlite });
  assert(result.ok);

  const storage = createBaseSqliteStorage({ sqlite, random })({
    onStorageError: (error) => {
      throw new Error(error.type);
    },
  });
  return { sqlite, storage };
};

const xorFingerprints = (arr1: Fingerprint, arr2: Fingerprint): Fingerprint => {
  if (arr1.length !== arr2.length) {
    throw new Error("Arrays must have the same length");
  }
  const result = new Uint8Array(arr1.length);
  for (let i = 0; i < arr1.length; i++) {
    result[i] = arr1[i] ^ arr2[i];
  }
  return result as Fingerprint;
};

const testTimestamps = async (timestamps: ReadonlyArray<TimestampBytes>) => {
  const deps = await createDeps();

  const bruteForceAllTimestampsFingerprint = timestamps
    .map(timestampBytesToFingerprint)
    .reduce((prev, curr) => xorFingerprints(prev, curr));

  const txResult = deps.sqlite.transaction(() => {
    for (const timestamp of timestamps) {
      deps.storage.insertTimestamp(testOwnerIdBytes, timestamp);
    }

    // Add the same timestamps again to test idempotency.
    for (const timestamp of timestamps) {
      deps.storage.insertTimestamp(testOwnerIdBytes, timestamp);
    }

    // Add similar timestamps of another owner.
    for (const timestamp of testAnotherTimestampsAsc) {
      deps.storage.insertTimestamp(
        ownerIdToOwnerIdBytes(testOwner2.id),
        timestamp,
      );
    }
    return ok();
  });
  assert(txResult.ok);

  const count = deps.storage.getSize(testOwnerIdBytes);
  assert(count);
  expect(count).toBe(timestamps.length);

  const buckets = computeBalancedBuckets(count);
  assert(buckets.ok, JSON.stringify(buckets));

  const fingerprintRanges = deps.storage.fingerprintRanges(
    testOwnerIdBytes,
    buckets.value,
  );
  assert(fingerprintRanges);

  const finiteUpperBounds = fingerprintRanges
    .map((range) => range.upperBound)
    .filter((bound) => bound !== InfiniteUpperBound);

  expect(finiteUpperBounds).toStrictEqual(
    finiteUpperBounds.toSorted(orderTimestampBytes),
  );

  const incrementalCounts: Array<number> = [];

  for (let i = 0; i < fingerprintRanges.length; i++) {
    const lower = (
      i === 0 ? null : fingerprintRanges[i - 1].upperBound
    ) as TimestampBytes | null;
    const upper =
      fingerprintRanges[i].upperBound === InfiniteUpperBound
        ? null
        : (fingerprintRanges[i].upperBound as TimestampBytes);

    const { rows: timestampRows } = getOrThrow(
      deps.sqlite.exec<{ t: TimestampBytes }>(sql`
        select t
        from evolu_timestamp
        where
          (${lower} is null or t >= ${lower})
          and (${upper} is null or t < ${upper})
          and ownerId = ${testOwnerIdBytes};
      `),
    );

    incrementalCounts.push(timestampRows.length);

    const bruteForceRangeFingerprint = timestampRows
      .map((a) => timestampBytesToFingerprint(a.t))
      .reduce((prev, curr) => xorFingerprints(prev, curr));

    expect(fingerprintRanges[i].fingerprint, i.toString()).toStrictEqual(
      bruteForceRangeFingerprint,
    );

    const fingerprintResult = deps.storage.fingerprint(
      testOwnerIdBytes,
      NonNegativeInt.orThrow(i > 0 ? buckets.value[i - 1] : 0),
      NonNegativeInt.orThrow(buckets.value[i]),
    );
    assert(fingerprintResult);
    expect(fingerprintResult).toEqual(bruteForceRangeFingerprint);
  }

  // Check how many rows were returned by each range.
  expect(incrementalCounts.reduce((prev, curr) => prev + curr)).toBe(
    timestamps.length,
  );

  // The whole DB fingerprint.
  const oneRangeFingerprints = deps.storage.fingerprintRanges(
    testOwnerIdBytes,
    [timestamps.length as PositiveInt],
  );
  assert(oneRangeFingerprints);

  expect(oneRangeFingerprints.length).toBe(1);
  expect(oneRangeFingerprints[0].fingerprint).toStrictEqual(
    bruteForceAllTimestampsFingerprint,
  );
};

const longTimeout = { timeout: 10 * 60 * 1000 };

test(
  "insertTimestamp/getSize/fingerprintRanges/fingerprint",
  longTimeout,
  async () => {
    const sequentialTimestampsAsc = Array.from({ length: 10_000 }, (_, i) =>
      timestampToTimestampBytes(createTimestamp({ millis: i as Millis })),
    );
    const sequentialTimestampsDesc = sequentialTimestampsAsc.toReversed();
    const sequentialTimestampsRandom = sequentialTimestampsAsc.toSorted(
      () => Math.random() - 0.5,
    );

    await testTimestamps(testTimestampsAsc);
    await testTimestamps(sequentialTimestampsAsc);
    await testTimestamps(testTimestampsDesc);
    await testTimestamps(sequentialTimestampsDesc);
    await testTimestamps(testTimestampsRandom);
    await testTimestamps(sequentialTimestampsRandom);
  },
);

test("empty db", async () => {
  const deps = await createDeps();
  const size = deps.storage.getSize(testOwnerIdBytes);
  expect(size).toBe(0);

  const fingerprint = deps.storage.fingerprint(
    testOwnerIdBytes,
    0 as NonNegativeInt,
    0 as NonNegativeInt,
  );
  expect(fingerprint?.join()).toBe("0,0,0,0,0,0,0,0,0,0,0,0");

  const lowerBound = deps.storage.findLowerBound(
    testOwnerIdBytes,
    0 as NonNegativeInt,
    0 as NonNegativeInt,
    testTimestampsAsc[0],
  );
  expect(lowerBound).toBe(0);
});

const count = 1_000_000;
const batchSize = 10_000;

const benchmarkTimestamps = async (
  timestamps: ReadonlyArray<TimestampBytes>,
  label: string,
) => {
  const deps = await createDeps();
  const insertBeginTime = performance.now();

  for (
    let batchStart = 0;
    batchStart < timestamps.length;
    batchStart += batchSize
  ) {
    const batchEnd = Math.min(batchStart + batchSize, timestamps.length);

    const batchBeginTime = performance.now();
    deps.sqlite.transaction(() => {
      for (let i = batchStart; i < batchEnd; i++) {
        deps.storage.insertTimestamp(testOwnerIdBytes, timestamps[i]);
      }
      return ok();
    });
    const batchTimeSec = (performance.now() - batchBeginTime) / 1000;
    const insertsPerSec = ((batchEnd - batchStart) / batchTimeSec).toFixed(0);

    const bucketsBeginTime = performance.now();
    const size = deps.storage.getSize(testOwnerIdBytes);
    assert(size);
    const buckets = computeBalancedBuckets(size);
    assert(buckets.ok);
    const fingerprint = deps.storage.fingerprintRanges(
      testOwnerIdBytes,
      buckets.value,
    );
    assert(fingerprint);
    const now = performance.now();
    const timestampsTime = (now - insertBeginTime).toFixed(1);
    const bucketsTime = (now - bucketsBeginTime).toFixed(1);

    // eslint-disable-next-line no-console
    console.log(
      `${Math.min(batchStart + batchSize, timestamps.length)} timestamps ${
        label
      } in ${
        timestampsTime
      } ms, ${insertsPerSec} inserts/sec in batch, getSize + 16 fingerprints in ${
        bucketsTime
      } ms`,
    );
  }
};

test("findLowerBound", async () => {
  const { storage } = await createDeps();

  const timestamps = Array.from({ length: 10 }, (_, i) =>
    timestampToTimestampBytes(createTimestamp({ millis: (i + 1) as Millis })),
  );
  for (const t of timestamps) {
    storage.insertTimestamp(testOwnerIdBytes, t);
  }

  const ownerId = testOwnerIdBytes;
  const begin = NonNegativeInt.orThrow(0);
  const end = NonNegativeInt.orThrow(10);

  const beforeAll = timestampToTimestampBytes(createTimestamp());
  expect(storage.findLowerBound(ownerId, begin, end, beforeAll)).toEqual(begin);

  const afterAll = timestampToTimestampBytes(
    createTimestamp({
      millis: 11 as Millis,
    }),
  );
  expect(storage.findLowerBound(ownerId, begin, end, afterAll)).toEqual(end);

  expect(
    storage.findLowerBound(ownerId, begin, end, InfiniteUpperBound),
  ).toEqual(end);

  expect(storage.findLowerBound(ownerId, begin, end, timestamps[0])).toEqual(0);
  expect(storage.findLowerBound(ownerId, begin, end, timestamps[1])).toEqual(1);

  expect(
    storage.findLowerBound(
      ownerId,
      begin,
      end,
      timestampToTimestampBytes(
        createTimestamp({ millis: 2 as Millis, counter: 1 as Counter }),
      ),
    ),
  ).toEqual(2);
});

test("iterate", async () => {
  const deps = await createDeps();

  for (const timestamp of testTimestampsAsc) {
    deps.storage.insertTimestamp(testOwnerIdBytes, timestamp);
  }

  const collected: Array<TimestampBytes> = [];
  deps.storage.iterate(
    testOwnerIdBytes,
    0 as NonNegativeInt,
    testTimestampsAsc.length as NonNegativeInt,
    (timestamp, index) => {
      collected.push(timestamp);
      expect(index).toBe(collected.length - 1);
      return true;
    },
  );

  expect(collected.length).toBe(testTimestampsAsc.length);
  for (let i = 0; i < testTimestampsAsc.length; i++) {
    expect(collected[i].join()).toBe(testTimestampsAsc[i].join());
  }

  const stopAfter = 3;
  const stopAfterCollected: Array<TimestampBytes> = [];
  deps.storage.iterate(
    testOwnerIdBytes,
    0 as NonNegativeInt,
    testTimestampsAsc.length as NonNegativeInt,
    (timestamp) => {
      stopAfterCollected.push(timestamp);
      // Stop after collecting `stopAfter` items
      return stopAfterCollected.length < stopAfter;
    },
  );

  expect(stopAfterCollected.length).toBe(stopAfter);
  for (let i = 0; i < stopAfter; i++) {
    expect(stopAfterCollected[i].join()).toBe(testTimestampsAsc[i].join());
  }
});

test("getTimestampByIndex", async () => {
  const deps = await createDeps();

  for (const timestamp of testTimestampsAsc) {
    deps.storage.insertTimestamp(testOwnerIdBytes, timestamp);
  }

  for (let i = 0; i < testTimestampsAsc.length; i++) {
    const timestamp = getTimestampByIndex(deps)(
      testOwnerIdBytes,
      i as NonNegativeInt,
    );
    assert(timestamp.ok);
    expect(timestamp.value.join()).toBe(testTimestampsAsc[i].join());
  }
});

test.skip("insert 1_000_000", longTimeout, async () => {
  const timestampsAsc = Array.from({ length: count }, (_, i) =>
    timestampToTimestampBytes(createTimestamp({ millis: i as Millis })),
  );
  const timestampsDesc = timestampsAsc.toReversed();
  const timestampsRandom = timestampsAsc.toSorted(() => Math.random() - 0.5);

  // Tested on M1, file (not memory).

  // 1m timestamps asc in 22s, the first 10k: 57742 inserts/sec, it's stable.
  await benchmarkTimestamps(timestampsAsc, "asc");

  // 1m timestamps desc in 87s, the first 10k: 26882 inserts/sec, it's stable.
  await benchmarkTimestamps(timestampsDesc, "desc");

  // The first 10k: 11912 inserts/sec, then it degrades,
  // but it's fixable and still usable (1-2k inserts/sec).
  await benchmarkTimestamps(timestampsRandom, "random");
});

/**
 * Test with 16_777_216 sequential timestamps, as JavaScript's Set has a limit
 * around this size. Using 6-byte hashes because it is the smallest size that
 * avoids collisions with this number of entries.
 *
 * Evolu uses 12-byte hashes, offering a much larger space (2^96), allowing it
 * to handle far more timestamps without collisions.
 *
 * This test is skipped by default because it takes a long time.
 */
test.skip(
  "truncated XORed hash collision with sequential timestamps",
  longTimeout,
  () => {
    const numRows = 16_777_216;
    const hashBytes = 6;

    const seenHashes = new Set<string>();
    let previousHash = Buffer.alloc(hashBytes);

    for (let i = 0; i < numRows; i++) {
      const timestampBytes = timestampToTimestampBytes(
        createTimestamp({ millis: i as Millis }),
      );
      const hash = sha256(timestampBytes);
      const shortHash = hash.slice(0, hashBytes);

      const xorHash = Buffer.alloc(hashBytes);
      for (let j = 0; j < hashBytes; j++) {
        xorHash[j] = shortHash[j] ^ previousHash[j];
      }
      previousHash = xorHash;

      const xorHashBase64 = xorHash.toString("base64");

      if (seenHashes.has(xorHashBase64)) {
        throw new Error(`Collision detected at iteration ${i}`);
      }
      seenHashes.add(xorHashBase64);
    }

    expect(seenHashes.size).toBe(numRows);
  },
);
