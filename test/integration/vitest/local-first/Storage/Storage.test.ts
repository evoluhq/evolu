import { sha256 } from "@noble/hashes/sha2.js";
import { assert, expect, test } from "vitest";
import { ownerIdToOwnerIdBytes } from "../../../../../packages/common/src/local-first/Owner.ts";
import type { StorageInsertTimestampStrategy } from "../../../../../packages/common/src/local-first/Storage.ts";
import {
  createBaseSqliteStorage,
  createBaseSqliteStorageTables,
  DbChange,
  getTimestampByIndex,
  getTimestampInsertStrategy,
  InfiniteUpperBound,
  testFingerprintTimestamps,
  timestampBytesToFingerprint,
  zeroFingerprint,
} from "../../../../../packages/common/src/local-first/Storage.ts";
import {
  Counter,
  createTimestamp,
  orderTimestampBytes,
  TimestampBytes,
  timestampToTimestampBytes,
} from "../../../../../packages/common/src/local-first/Timestamp.ts";
import { computeBalancedBuckets } from "../../../../../packages/common/src/Number.ts";
import type { RandomNumber } from "../../../../../packages/common/src/Random.ts";
import { createRandom } from "../../../../../packages/common/src/Random.ts";
import { getOrThrow, ok } from "../../../../../packages/common/src/Result.ts";
import type { SqliteQuery } from "../../../../../packages/common/src/Sqlite.ts";
import { sql } from "../../../../../packages/common/src/Sqlite.ts";
import { testCreateDeps } from "../../../../../packages/common/src/Task.ts";
import type { Millis } from "../../../../../packages/common/src/Time.ts";
import {
  createId,
  NonNegativeInt,
  PositiveInt,
  zeroNonNegativeInt,
} from "../../../../../packages/common/src/Type.ts";
import { setupSqlite } from "../../_deps.ts";
import {
  testAnotherTimestampsAsc,
  testAppOwner2,
  testAppOwnerIdBytes,
  testTimestampsAsc,
  testTimestampsDesc,
  testTimestampsRandom,
} from "../../../../unit/vitest/common/local-first/_fixtures.ts";

const setupSqliteAndStorage = async () => {
  const setup = await setupSqlite();
  const { sqlite } = setup;

  // For reliable performance, we have to use Math.random!
  // Pseudo-random does not scale (randomness is limited).
  const random = createRandom();

  createBaseSqliteStorageTables({ sqlite });

  return {
    sqlite,
    storage: createBaseSqliteStorage({ sqlite, random }),
    [Symbol.asyncDispose]: () => setup[Symbol.asyncDispose](),
  };
};

const testTimestamps = async (
  timestamps: ReadonlyArray<TimestampBytes>,
  strategy: StorageInsertTimestampStrategy,
) => {
  await using setup = await setupSqliteAndStorage();
  const { sqlite, storage } = setup;
  const sortedTimestamps = timestamps.toSorted(orderTimestampBytes);

  const bruteForceAllTimestampsFingerprint =
    testFingerprintTimestamps(timestamps);

  const txResult = sqlite.transaction(() => {
    for (const timestamp of timestamps) {
      storage.insertTimestamp(testAppOwnerIdBytes, timestamp, strategy);
    }

    // Add the same timestamps again to test idempotency.
    for (const timestamp of timestamps) {
      storage.insertTimestamp(testAppOwnerIdBytes, timestamp, strategy);
    }

    // Add similar timestamps of another owner.
    for (const timestamp of testAnotherTimestampsAsc) {
      storage.insertTimestamp(
        ownerIdToOwnerIdBytes(testAppOwner2.id),
        timestamp,
        "append",
      );
    }
    return ok();
  });
  assert(txResult.ok);

  const count = storage.getSize(testAppOwnerIdBytes);
  assert(count);
  expect(count).toBe(timestamps.length);

  const buckets = getOrThrow(computeBalancedBuckets(count));

  const fingerprintRanges = storage.fingerprintRanges(
    testAppOwnerIdBytes,
    buckets,
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

    const { rows: timestampRows } = sqlite.exec<{ t: TimestampBytes }>(sql`
      select t
      from evolu_timestamp
      where
        (${lower} is null or t >= ${lower})
        and (${upper} is null or t < ${upper})
        and ownerid = ${testAppOwnerIdBytes};
    `);

    expect(timestampRows.length, `count in range ${i}`).toBe(
      buckets[i] - (i === 0 ? 0 : buckets[i - 1]),
    );
    if (buckets[i] === timestamps.length) {
      expect(fingerprintRanges[i].upperBound, `upper bound of range ${i}`).toBe(
        InfiniteUpperBound,
      );
    } else {
      expect(
        Array.from(fingerprintRanges[i].upperBound as TimestampBytes),
        `upper bound of range ${i}`,
      ).toStrictEqual(Array.from(sortedTimestamps[buckets[i]]));
    }

    incrementalCounts.push(timestampRows.length);

    const bruteForceRangeFingerprint = testFingerprintTimestamps(
      timestampRows.map((row) => row.t),
    );

    expect(fingerprintRanges[i].fingerprint, i.toString()).toStrictEqual(
      bruteForceRangeFingerprint,
    );

    const fingerprintResult = storage.fingerprint(
      testAppOwnerIdBytes,
      NonNegativeInt.orThrow(i > 0 ? buckets[i - 1] : 0),
      NonNegativeInt.orThrow(buckets[i]),
    );
    assert(fingerprintResult);
    expect(fingerprintResult).toEqual(bruteForceRangeFingerprint);
  }

  // Check how many rows were returned by each range.
  expect(incrementalCounts.reduce((prev, curr) => prev + curr)).toBe(
    timestamps.length,
  );

  // The whole DB fingerprint.
  const oneRangeFingerprints = storage.fingerprintRanges(testAppOwnerIdBytes, [
    timestamps.length as PositiveInt,
  ]);
  assert(oneRangeFingerprints);

  expect(oneRangeFingerprints.length).toBe(1);
  expect(oneRangeFingerprints[0].fingerprint).toStrictEqual(
    bruteForceAllTimestampsFingerprint,
  );
};

const longTimeout = { timeout: 10 * 60 * 1000 };

test("testFingerprintTimestamps XORs timestamp fingerprints", () => {
  const timestamps = testTimestampsAsc.slice(0, 2);
  const fingerprints = timestamps.map(timestampBytesToFingerprint);

  expect(testFingerprintTimestamps(timestamps)).toStrictEqual(
    Uint8Array.from(
      fingerprints[0],
      (byte, index) => byte ^ fingerprints[1][index],
    ),
  );
  expect(testFingerprintTimestamps([])).toStrictEqual(zeroFingerprint);
});

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

    await testTimestamps(testTimestampsAsc, "append");
    await testTimestamps(sequentialTimestampsAsc, "append");
    await testTimestamps(testTimestampsDesc, "prepend");
    await testTimestamps(sequentialTimestampsDesc, "prepend");
    await testTimestamps(testTimestampsRandom, "insert");
    await testTimestamps(sequentialTimestampsRandom, "insert");
  },
);

test("insertTimestamp updates use primary-key query plans", async () => {
  await using setup = await setupSqlite();
  const { sqlite } = setup;
  createBaseSqliteStorageTables({ sqlite });

  const updateQueries: Array<SqliteQuery> = [];
  const randomValues = [0.9, 0.9, 0.9, 0.9, 0.1, 0.9] as Array<RandomNumber>;
  const storage = createBaseSqliteStorage({
    random: { next: () => randomValues.shift() ?? (0.9 as RandomNumber) },
    sqlite: {
      ...sqlite,
      exec: (query) => {
        if (query.sql.includes("update evolu_timestamp")) {
          updateQueries.push(query);
        }
        return sqlite.exec(query);
      },
    },
  });
  const timestamp = (millis: number) =>
    timestampToTimestampBytes(createTimestamp({ millis: millis as Millis }));

  storage.insertTimestamp(testAppOwnerIdBytes, timestamp(100), "append");
  storage.insertTimestamp(testAppOwnerIdBytes, timestamp(200), "append");
  storage.insertTimestamp(testAppOwnerIdBytes, timestamp(0), "prepend");
  storage.insertTimestamp(testAppOwnerIdBytes, timestamp(150), "insert");
  storage.insertTimestamp(testAppOwnerIdBytes, timestamp(175), "insert");

  expect(updateQueries).toHaveLength(3);

  for (const [index, query] of updateQueries.entries()) {
    const plan = sqlite.exec<{
      id: number;
      parent: number;
      detail: string;
    }>({
      // prettier-ignore
      ...sql`explain query plan ${sql.raw(query.sql)}`,
      parameters: query.parameters,
    });
    const topLevelDetails = plan.rows
      .filter((row) => row.parent === 0)
      .map((row) => row.detail);

    const scanIndex = topLevelDetails.indexOf(
      `SCAN ${index === 1 ? "p" : "u"}`,
    );
    const targetSearchIndex = topLevelDetails.findIndex(
      (detail, index) =>
        index > scanIndex &&
        /^SEARCH evolu_timestamp USING (?:COVERING )?INDEX .* \(ownerId=\? AND t=\?\)$/.test(
          detail,
        ),
    );

    expect(scanIndex).toBeGreaterThanOrEqual(0);
    expect(targetSearchIndex).toBeGreaterThan(scanIndex);

    if (index >= 1) {
      expect(
        plan.rows.filter((row) =>
          /^SEARCH evolu_timestamp USING COVERING INDEX .* \(ownerId=\? AND l=\? AND t>\? AND t<\?\)$/.test(
            row.detail,
          ),
        ),
      ).toHaveLength(index);
    }
  }
});

test("insertTimestamp append uses primary-key query plans", async () => {
  await using setup = await setupSqlite();
  const { sqlite } = setup;
  createBaseSqliteStorageTables({ sqlite });

  const appendQueries: Array<SqliteQuery> = [];
  const randomValues = [0.9, 0.1, 0.9] as Array<RandomNumber>;
  const storage = createBaseSqliteStorage({
    random: { next: () => randomValues.shift() ?? (0.9 as RandomNumber) },
    sqlite: {
      ...sqlite,
      exec: (query) => {
        if (query.sql.includes("fc(b, cl, pt, nt, ih1, ih2, ic)")) {
          appendQueries.push(query);
        }
        return sqlite.exec(query);
      },
    },
  });
  const timestamp = (millis: number) =>
    timestampToTimestampBytes(createTimestamp({ millis: millis as Millis }));

  storage.insertTimestamp(testAppOwnerIdBytes, timestamp(100), "append");
  storage.insertTimestamp(testAppOwnerIdBytes, timestamp(200), "append");

  expect(appendQueries).toHaveLength(1);
  const query = appendQueries[0];
  const plan = sqlite.exec<{
    id: number;
    parent: number;
    detail: string;
  }>({
    // prettier-ignore
    ...sql`explain query plan ${sql.raw(query.sql)}`,
    parameters: query.parameters,
  });
  const details = plan.rows.map((row) => row.detail);

  expect(details).toContainEqual(
    expect.stringMatching(
      /^SEARCH evolu_timestamp USING INDEX .* \(ownerId=\? AND t<\?\)$/,
    ),
  );
  expect(details).toContainEqual(
    expect.stringMatching(
      /^SEARCH node USING (?:COVERING )?INDEX .* \(ownerId=\? AND t=\?\) LEFT-JOIN$/,
    ),
  );
});

test("empty db", async () => {
  await using setup = await setupSqliteAndStorage();
  const { storage } = setup;
  const size = storage.getSize(testAppOwnerIdBytes);
  expect(size).toBe(0);

  const fingerprint = storage.fingerprint(
    testAppOwnerIdBytes,
    0 as NonNegativeInt,
    0 as NonNegativeInt,
  );
  expect(fingerprint.join()).toBe("0,0,0,0,0,0,0,0,0,0,0,0");

  const lowerBound = storage.findLowerBound(
    testAppOwnerIdBytes,
    0 as NonNegativeInt,
    0 as NonNegativeInt,
    testTimestampsAsc[0],
  );
  expect(lowerBound).toBe(0);
});

test("findLowerBound", async () => {
  await using setup = await setupSqliteAndStorage();
  const { storage } = setup;

  const timestamps = Array.from({ length: 10 }, (_, i) =>
    timestampToTimestampBytes(createTimestamp({ millis: (i + 1) as Millis })),
  );
  for (const t of timestamps) {
    storage.insertTimestamp(testAppOwnerIdBytes, t, "append");
  }

  const ownerId = testAppOwnerIdBytes;
  const begin = zeroNonNegativeInt;
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
  await using setup = await setupSqliteAndStorage();
  const { storage } = setup;

  for (const timestamp of testTimestampsAsc) {
    storage.insertTimestamp(testAppOwnerIdBytes, timestamp, "append");
  }

  const collected: Array<TimestampBytes> = [];
  storage.iterate(
    testAppOwnerIdBytes,
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
  storage.iterate(
    testAppOwnerIdBytes,
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
  await using setup = await setupSqliteAndStorage();
  const { sqlite, storage } = setup;

  for (const timestamp of testTimestampsAsc) {
    storage.insertTimestamp(testAppOwnerIdBytes, timestamp, "append");
  }

  for (let i = 0; i < testTimestampsAsc.length; i++) {
    const timestamp = getTimestampByIndex({ sqlite })(
      testAppOwnerIdBytes,
      i as NonNegativeInt,
    );
    expect(timestamp.join()).toBe(testTimestampsAsc[i].join());
  }
});

test("getTimestampInsertStrategy", () => {
  const t100 = timestampToTimestampBytes(
    createTimestamp({ millis: 100 as Millis }),
  );
  const t200 = timestampToTimestampBytes(
    createTimestamp({ millis: 200 as Millis }),
  );

  // Append: after last
  expect(
    getTimestampInsertStrategy(
      timestampToTimestampBytes(createTimestamp({ millis: 300 as Millis })),
      t100,
      t200,
    )[0],
  ).toBe("append");

  // Prepend: before first
  expect(
    getTimestampInsertStrategy(
      timestampToTimestampBytes(createTimestamp({ millis: 50 as Millis })),
      t100,
      t200,
    )[0],
  ).toBe("prepend");

  // Insert: between first and last, or equal
  expect(
    getTimestampInsertStrategy(
      timestampToTimestampBytes(createTimestamp({ millis: 150 as Millis })),
      t100,
      t200,
    )[0],
  ).toBe("insert");

  expect(getTimestampInsertStrategy(t100, t100, t200)[0]).toBe("insert");
  expect(getTimestampInsertStrategy(t200, t100, t200)[0]).toBe("insert");
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

test("DbChange", () => {
  const deps = testCreateDeps();
  const id = createId(deps);

  // Valid
  expect(
    DbChange.is({
      table: "testTable",
      id,
      values: { column1: "value1", column2: 123 },
      isInsert: true,
      isDelete: false,
    }),
  ).toBe(true);

  // Invalid: system columns in values
  expect(
    DbChange.is({
      table: "testTable",
      id,
      values: { createdAt: "2024-01-01T00:00:00Z" },
      isInsert: true,
      isDelete: false,
    }),
  ).toBe(false);

  expect(
    DbChange.is({
      table: "testTable",
      id,
      values: { updatedAt: "2024-01-01T00:00:00Z" },
      isInsert: true,
      isDelete: false,
    }),
  ).toBe(false);

  expect(
    DbChange.is({
      table: "testTable",
      id,
      values: { id },
      isInsert: true,
      isDelete: false,
    }),
  ).toBe(false);

  expect(
    DbChange.is({
      table: "testTable",
      id,
      values: { isDeleted: 1 },
      isInsert: true,
      isDelete: false,
    }),
  ).toBe(false);

  // Invalid: invalid table
  expect(
    DbChange.is({
      table: 123,
      id,
      values: { column1: "value1" },
      isInsert: true,
      isDelete: false,
    }),
  ).toBe(false);

  // Invalid: invalid id
  expect(
    DbChange.is({
      table: "testTable",
      id: "invalid",
      values: { column1: "value1" },
      isInsert: true,
      isDelete: false,
    }),
  ).toBe(false);

  // Invalid: invalid isInsert
  expect(
    DbChange.is({
      table: "testTable",
      id,
      values: { column1: "value1" },
      isInsert: "true",
      isDelete: false,
    }),
  ).toBe(false);

  // Invalid: invalid isDelete
  expect(
    DbChange.is({
      table: "testTable",
      id,
      values: { column1: "value1" },
      isInsert: true,
      isDelete: "false",
    }),
  ).toBe(false);
});
