import { sha256 } from "@noble/hashes/sha2.js";
import { test } from "node:test";
import {
  assert,
  assertEqual,
  assertEqualBytes,
  assertFalse,
  assertLength,
  assertNonEmptyReadonlyArray,
  assertOk,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
} from "../../../../../packages/common/src/Assert.ts";
import {
  createAppOwner,
  createOwnerSecret,
  ownerIdToOwnerIdBytes,
  testAppOwner,
} from "../../../../../packages/common/src/local-first/Owner.ts";
import {
  createBaseSqliteStorage,
  createBaseSqliteStorageTables,
  DbChange,
  extendTimestampBounds,
  getTimestampByIndex,
  InfiniteUpperBound,
  RangeType,
  testFingerprintTimestamps,
  timestampBytesToFingerprint,
  updateOwnerUsage,
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
import type {
  SafeSql,
  SqliteQuery,
} from "../../../../../packages/common/src/Sqlite.ts";
import { sql } from "../../../../../packages/common/src/Sqlite.ts";
import { testCreateDeps } from "../../../../../packages/common/src/Task.ts";
import type { Millis } from "../../../../../packages/common/src/Time.ts";
import {
  createId,
  NonNegativeInt,
  PositiveInt,
  zeroNonNegativeInt,
} from "../../../../../packages/common/src/Type.ts";
import {
  readSkiplistFixture,
  skiplistFixtureRowsSql,
} from "../../../../../packages/sqlite-core/test/skiplist-fixture.mts";
import {
  setupInterceptedSqlite,
  setupSqlite,
  testCreateTimestampBytesFixtures,
} from "../../_deps.ts";

const testAppOwner2 = createAppOwner(
  createOwnerSecret(testCreateDeps({ seed: "testAppOwner2" })),
);
const testAppOwnerIdBytes = ownerIdToOwnerIdBytes(testAppOwner.id);
const {
  testAnotherTimestampsAsc,
  testTimestampsAsc,
  testTimestampsDesc,
  testTimestampsRandom,
} = testCreateTimestampBytesFixtures(testCreateDeps());

const setupSqliteAndStorage = async () => {
  const setup = await setupSqlite();
  const { sqlite } = setup;

  // For reliable performance, we have to use Math.random!
  // Pseudo-random does not scale (randomness is limited).
  const random = createRandom();

  createBaseSqliteStorageTables({ sqlite });
  const storage = createBaseSqliteStorage({ sqlite, random });

  return {
    sqlite,
    storage,
    /** Inserts the owner's timestamps in a transaction, as Storage requires. */
    insertTimestamps: (timestamps: ReadonlyArray<TimestampBytes>) => {
      sqlite.transaction(() => {
        for (const timestamp of timestamps)
          storage.insertTimestamp(testAppOwnerIdBytes, timestamp);
      });
    },
    [Symbol.asyncDispose]: () => setup[Symbol.asyncDispose](),
  };
};

const testTimestamps = async (timestamps: ReadonlyArray<TimestampBytes>) => {
  await using setup = await setupSqliteAndStorage();
  const { sqlite, storage } = setup;
  const sortedTimestamps = timestamps.toSorted(orderTimestampBytes);

  const bruteForceAllTimestampsFingerprint =
    testFingerprintTimestamps(timestamps);

  const txResult = sqlite.transaction(() => {
    for (const timestamp of timestamps) {
      assertTrue(storage.insertTimestamp(testAppOwnerIdBytes, timestamp));
    }

    // Add the same timestamps again to test idempotency. An existing
    // timestamp is reported as not new.
    for (const timestamp of timestamps) {
      assertFalse(storage.insertTimestamp(testAppOwnerIdBytes, timestamp));
    }

    // Add similar timestamps of another owner.
    for (const timestamp of testAnotherTimestampsAsc) {
      storage.insertTimestamp(
        ownerIdToOwnerIdBytes(testAppOwner2.id),
        timestamp,
      );
    }
    return ok();
  });
  assertOk(txResult);

  const count = storage.getSize(testAppOwnerIdBytes);
  assertTrue(count > 0);
  assertEqual(count, timestamps.length);

  const buckets = getOrThrow(computeBalancedBuckets(count));

  const fingerprintRanges = storage.fingerprintRanges(
    testAppOwnerIdBytes,
    buckets,
  );

  const finiteUpperBounds = fingerprintRanges
    .map((range) => range.upperBound)
    .filter((bound) => bound !== InfiniteUpperBound);

  assertEqual(
    finiteUpperBounds,
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

    assertEqual(
      timestampRows.length,
      buckets[i] - (i === 0 ? 0 : buckets[i - 1]),
    );
    if (buckets[i] === timestamps.length) {
      assertSame(fingerprintRanges[i].upperBound, InfiniteUpperBound);
    } else {
      assertEqualBytes(
        fingerprintRanges[i].upperBound as TimestampBytes,
        sortedTimestamps[buckets[i]],
      );
    }

    incrementalCounts.push(timestampRows.length);

    const bruteForceRangeFingerprint = testFingerprintTimestamps(
      timestampRows.map((row) => row.t),
    );

    assertEqualBytes(
      fingerprintRanges[i].fingerprint,
      bruteForceRangeFingerprint,
    );

    const fingerprintResult = storage.fingerprint(
      testAppOwnerIdBytes,
      NonNegativeInt.orThrow(i > 0 ? buckets[i - 1] : 0),
      NonNegativeInt.orThrow(buckets[i]),
    );
    assertEqualBytes(fingerprintResult, bruteForceRangeFingerprint);
  }

  // Check how many rows were returned by each range.
  assertEqual(
    incrementalCounts.reduce((prev, curr) => prev + curr),
    timestamps.length,
  );

  // The whole DB fingerprint.
  const oneRangeFingerprints = storage.fingerprintRanges(testAppOwnerIdBytes, [
    timestamps.length as PositiveInt,
  ]);

  assertLength(oneRangeFingerprints, 1);
  assertEqualBytes(
    oneRangeFingerprints[0].fingerprint,
    bruteForceAllTimestampsFingerprint,
  );
};

const longTimeout = { timeout: 10 * 60 * 1000 };

test("testFingerprintTimestamps XORs timestamp fingerprints", () => {
  const timestamps = testTimestampsAsc.slice(0, 2);
  const fingerprints = timestamps.map(timestampBytesToFingerprint);

  assertEqualBytes(
    testFingerprintTimestamps(timestamps),
    Uint8Array.from(
      fingerprints[0],
      (byte, index) => byte ^ fingerprints[1][index],
    ),
  );
  assertEqualBytes(testFingerprintTimestamps([]), zeroFingerprint);
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

    await testTimestamps(testTimestampsAsc);
    await testTimestamps(sequentialTimestampsAsc);
    await testTimestamps(testTimestampsDesc);
    await testTimestamps(sequentialTimestampsDesc);
    await testTimestamps(testTimestampsRandom);
    await testTimestamps(sequentialTimestampsRandom);
  },
);

test("Storage leaves the skiplist fixture's rows and returns its answers", async () => {
  const fixture = readSkiplistFixture();
  await using setup = await setupSqlite();
  const { sqlite } = setup;
  createBaseSqliteStorageTables({ sqlite });
  // Storage draws a level from these; each insert queues its own.
  const randomNumbers: Array<number> = [];
  const storage = createBaseSqliteStorage({
    sqlite,
    random: {
      next: () => {
        const value = randomNumbers.shift();
        assert(value != null, "No queued random number.");
        return value as RandomNumber;
      },
    },
  });

  sqlite.transaction(() => {
    for (const { ownerId, timestamp, level, inserted } of fixture.inserts) {
      // Storage draws once more after the last level, also at level 10.
      randomNumbers.push(...Array.from({ length: level - 1 }, () => 0.1), 0.9);
      assertSame(storage.insertTimestamp(ownerId, timestamp), inserted);
      assertLength(randomNumbers, 0);
    }
  });

  assertEqual(
    sqlite
      .exec<{ row: string }>({
        sql: skiplistFixtureRowsSql as SafeSql,
        parameters: [],
      })
      .rows.map(({ row }) => row),
    fixture.rows,
  );

  for (const owner of fixture.owners) {
    const { ownerId, size } = owner;
    assertEqual(storage.getSize(ownerId), size);

    for (const [index, timestamp] of owner.timestamps.entries())
      assertEqualBytes(
        getTimestampByIndex({ sqlite })(ownerId, NonNegativeInt.orThrow(index)),
        timestamp,
      );

    for (const { buckets, ranges } of owner.fingerprints) {
      // Sync ends only the last range at the size, so Storage doesn't define
      // the upper bound of an earlier one there.
      if (buckets.slice(0, -1).includes(size)) continue;
      // The last range takes its upper bound from the caller.
      const upperBound = ranges.at(-1)?.upperBound ?? InfiniteUpperBound;
      assertEqual(
        storage.fingerprintRanges(ownerId, buckets, upperBound),
        ranges.map((range, i) => ({
          type: RangeType.Fingerprint,
          upperBound: i < ranges.length - 1 ? range.upperBound : upperBound,
          fingerprint: range.fingerprint,
        })),
      );
    }

    for (const { timestamp, index } of owner.lowerBounds)
      assertEqual(
        storage.findLowerBound(ownerId, zeroNonNegativeInt, size, timestamp),
        index ?? size,
      );
  }
});

test("a failed insertTimestamp can leave part of its changes, which a rollback undoes", async () => {
  await using setup = await setupSqlite();
  const { sqlite } = setup;
  createBaseSqliteStorageTables({ sqlite });
  // The first timestamp at level 2, then each at level 1.
  const randomNumbers = [0.1, 0.9];
  const storage = createBaseSqliteStorage({
    sqlite,
    random: { next: () => (randomNumbers.shift() ?? 0.9) as RandomNumber },
  });
  const [earlier, later] = testTimestampsAsc;
  sqlite.transaction(() => {
    storage.insertTimestamp(testAppOwnerIdBytes, later);
  });
  const readRows = () =>
    sqlite.exec({ sql: skiplistFixtureRowsSql as SafeSql, parameters: [] })
      .rows;
  const rows = readRows();

  // The earlier timestamp's insert adds its row and then fails to update the
  // level 2 node after it.
  sqlite.exec(sql`
    create temp trigger evolu_timestamp_update_fails
    before update on evolu_timestamp
    begin
      select raise(abort, 'injected');
    end;
  `);
  sqlite.exec(sql`begin;`);
  assertThrowsInstanceOf(
    () => storage.insertTimestamp(testAppOwnerIdBytes, earlier),
    Error,
  );
  assertLength(readRows(), 2);
  sqlite.exec(sql`rollback;`);

  assertThrowsInstanceOf(() => {
    sqlite.transaction(() => {
      storage.insertTimestamp(testAppOwnerIdBytes, earlier);
    });
  }, Error);
  assertEqual(readRows(), rows);

  sqlite.exec(sql`drop trigger evolu_timestamp_update_fails;`);
  sqlite.transaction(() => {
    assertTrue(storage.insertTimestamp(testAppOwnerIdBytes, earlier));
  });
  assertEqual(storage.getSize(testAppOwnerIdBytes), 2);
});

test("empty db", async () => {
  await using setup = await setupSqliteAndStorage();
  const { storage } = setup;
  const size = storage.getSize(testAppOwnerIdBytes);
  assertEqual(size, 0);

  const fingerprint = storage.fingerprint(
    testAppOwnerIdBytes,
    0 as NonNegativeInt,
    0 as NonNegativeInt,
  );
  assertEqualBytes(fingerprint, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  const lowerBound = storage.findLowerBound(
    testAppOwnerIdBytes,
    0 as NonNegativeInt,
    0 as NonNegativeInt,
    testTimestampsAsc[0],
  );
  assertEqual(lowerBound, 0);
});

test("findLowerBound", async () => {
  await using setup = await setupSqliteAndStorage();
  const { storage } = setup;

  const timestamps = Array.from({ length: 10 }, (_, i) =>
    timestampToTimestampBytes(createTimestamp({ millis: (i + 1) as Millis })),
  );
  setup.insertTimestamps(timestamps);

  const ownerId = testAppOwnerIdBytes;
  const begin = zeroNonNegativeInt;
  const end = NonNegativeInt.orThrow(10);

  const beforeAll = timestampToTimestampBytes(createTimestamp());
  assertEqual(storage.findLowerBound(ownerId, begin, end, beforeAll), begin);

  const afterAll = timestampToTimestampBytes(
    createTimestamp({
      millis: 11 as Millis,
    }),
  );
  assertEqual(storage.findLowerBound(ownerId, begin, end, afterAll), end);

  assertEqual(
    storage.findLowerBound(ownerId, begin, end, InfiniteUpperBound),
    end,
  );

  assertEqual(storage.findLowerBound(ownerId, begin, end, timestamps[0]), 0);
  assertEqual(storage.findLowerBound(ownerId, begin, end, timestamps[1]), 1);

  // The index counts from the owner's first timestamp, not from begin.
  assertEqual(
    storage.findLowerBound(
      ownerId,
      NonNegativeInt.orThrow(5),
      end,
      timestamps[6],
    ),
    6,
  );

  assertEqual(
    storage.findLowerBound(
      ownerId,
      begin,
      end,
      timestampToTimestampBytes(
        createTimestamp({ millis: 2 as Millis, counter: 1 as Counter }),
      ),
    ),
    2,
  );
});

test("findLowerBound throws for damaged skiplist counts", async () => {
  await using setup = await setupSqliteAndStorage();
  const { sqlite, storage } = setup;

  const timestamps = Array.from({ length: 10 }, (_, i) =>
    timestampToTimestampBytes(createTimestamp({ millis: (i + 1) as Millis })),
  );
  setup.insertTimestamps(timestamps);
  // A damaged database can count a found timestamp zero times.
  sqlite.exec(sql`update evolu_timestamp set c = 0;`);

  const error = assertThrowsInstanceOf(
    () =>
      storage.findLowerBound(
        testAppOwnerIdBytes,
        zeroNonNegativeInt,
        NonNegativeInt.orThrow(10),
        timestamps[3],
      ),
    Error,
  );
  assertTrue(
    error.message.includes("evolu_timestamp breaks the skiplist invariant"),
  );
});

test("deleteOwner deletes the owner's timestamps and usage", async () => {
  await using setup = await setupSqliteAndStorage();
  const { sqlite, storage } = setup;
  const timestamp = testTimestampsAsc[0];
  setup.insertTimestamps([timestamp]);
  updateOwnerUsage({ sqlite })(
    testAppOwnerIdBytes,
    zeroNonNegativeInt,
    timestamp,
    timestamp,
  );

  storage.deleteOwner(testAppOwnerIdBytes);

  for (const table of ["evolu_timestamp", "evolu_usage"]) {
    const { rows } = sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from ${sql.raw(table)}
      where ownerId = ${testAppOwnerIdBytes};
    `);
    assertEqual(rows[0].count, 0);
  }
});

// Earlier releases choose their insert path from the timestamp bounds.
test("createBaseSqliteStorageTables creates evolu_usage with timestamp bounds", async () => {
  await using setup = await setupSqlite();
  const { sqlite } = setup;
  createBaseSqliteStorageTables({ sqlite });

  const { rows } = sqlite.exec<{ name: string }>(sql`
    select name from pragma_table_info('evolu_usage');
  `);
  assertEqual(
    rows.map(({ name }) => name),
    ["ownerId", "storedBytes", "firstTimestamp", "lastTimestamp"],
  );
});

test("getExistingTimestamps looks up each timestamp by primary key", async () => {
  await using setup = await setupSqlite();
  const { sqlite } = setup;
  createBaseSqliteStorageTables({ sqlite });

  const queries: Array<SqliteQuery> = [];
  const storage = createBaseSqliteStorage({
    random: createRandom(),
    sqlite: setupInterceptedSqlite(sqlite, (query, run) => {
      if (query.sql.includes("split_timestamps")) queries.push(query);
      return run();
    }),
  });
  storage.getExistingTimestamps(testAppOwnerIdBytes, [testTimestampsAsc[0]]);

  assertLength(queries, 1);
  const plan = sqlite.exec<{ parent: number; detail: string }>({
    // prettier-ignore
    ...sql`explain query plan ${sql.raw(queries[0].sql)}`,
    parameters: queries[0].parameters,
  });
  const topLevelDetails = plan.rows
    .filter((row) => row.parent === 0)
    .map((row) => row.detail);

  // The timestamps are the outer loop, so the owner's other timestamps are
  // never scanned.
  const scanIndex = topLevelDetails.indexOf("SCAN s");
  const searchIndex = topLevelDetails.findIndex((detail) =>
    /^SEARCH t USING COVERING INDEX .* \(ownerId=\? AND t=\?\)$/u.test(detail),
  );
  assertTrue(scanIndex >= 0);
  assertTrue(searchIndex > scanIndex);
  assertFalse(plan.rows.some((row) => row.detail.includes("AUTOMATIC")));
});

test("getExistingTimestamps takes more timestamps than a call can spread", async () => {
  await using setup = await setupSqliteAndStorage();
  const { storage } = setup;

  const timestamps = Array.from({ length: 200_000 }, (_, i) =>
    timestampToTimestampBytes(createTimestamp({ millis: (i + 1) as Millis })),
  );
  assertNonEmptyReadonlyArray(timestamps);
  const existing = timestamps[123_456];
  setup.insertTimestamps([existing]);

  assertEqual(storage.getExistingTimestamps(testAppOwnerIdBytes, timestamps), [
    existing,
  ]);
});

test("iterate", async () => {
  await using setup = await setupSqliteAndStorage();
  const { storage } = setup;

  setup.insertTimestamps(testTimestampsAsc);

  const collected: Array<TimestampBytes> = [];
  storage.iterate(
    testAppOwnerIdBytes,
    0 as NonNegativeInt,
    testTimestampsAsc.length as NonNegativeInt,
    (timestamp, index) => {
      collected.push(timestamp);
      assertEqual(index, collected.length - 1);
      return true;
    },
  );

  assertEqual(collected.length, testTimestampsAsc.length);
  for (let i = 0; i < testTimestampsAsc.length; i++) {
    assertEqualBytes(collected[i], testTimestampsAsc[i]);
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

  assertEqual(stopAfterCollected.length, stopAfter);
  for (let i = 0; i < stopAfter; i++) {
    assertEqualBytes(stopAfterCollected[i], testTimestampsAsc[i]);
  }
});

test("iterate reads no timestamp past the one the callback stops at", async () => {
  await using setup = await setupSqliteAndStorage();
  const { sqlite } = setup;
  setup.insertTimestamps(testTimestampsAsc);

  // The rows SQLite returns to the storage's queries.
  let rowsRead = 0;
  const storage = createBaseSqliteStorage({
    sqlite: {
      ...setupInterceptedSqlite(sqlite, (_query, run) => {
        const result = run();
        rowsRead += result.rows.length;
        return result;
      }),
      iterate: (query, onRow) => {
        sqlite.iterate(query, (row) => {
          rowsRead++;
          return onRow(row);
        });
      },
    },
    random: createRandom(),
  });

  const collected: Array<TimestampBytes> = [];
  storage.iterate(
    testAppOwnerIdBytes,
    0 as NonNegativeInt,
    testTimestampsAsc.length as NonNegativeInt,
    (timestamp) => {
      collected.push(timestamp);
      return collected.length < 3;
    },
  );

  assertEqual(collected, testTimestampsAsc.slice(0, 3));
  // A seek reads the first, and the stream the next two, of 5,000.
  assertSame(rowsRead, 3);
});

test("getTimestampByIndex", async () => {
  await using setup = await setupSqliteAndStorage();
  const { sqlite } = setup;

  setup.insertTimestamps(testTimestampsAsc);

  for (let i = 0; i < testTimestampsAsc.length; i++) {
    const timestamp = getTimestampByIndex({ sqlite })(
      testAppOwnerIdBytes,
      i as NonNegativeInt,
    );
    assertEqualBytes(timestamp, testTimestampsAsc[i]);
  }
});

test("positions past the owner's timestamps throw", async () => {
  await using setup = await setupSqliteAndStorage();
  const { sqlite, storage } = setup;
  const timestamps = testTimestampsAsc.slice(0, 10);
  setup.insertTimestamps(timestamps);
  const size = storage.getSize(testAppOwnerIdBytes);
  const emptyOwnerIdBytes = ownerIdToOwnerIdBytes(testAppOwner2.id);
  const position = (value: number) => NonNegativeInt.orThrow(value);

  const indexIsOutOfRange = (run: () => unknown) => {
    assertSame(
      assertThrowsInstanceOf(run, Error).message,
      "index out of range",
    );
  };
  indexIsOutOfRange(() =>
    getTimestampByIndex({ sqlite })(testAppOwnerIdBytes, size),
  );
  indexIsOutOfRange(() =>
    getTimestampByIndex({ sqlite })(emptyOwnerIdBytes, zeroNonNegativeInt),
  );
  indexIsOutOfRange(() => {
    storage.iterate(testAppOwnerIdBytes, size, position(size + 2), () => true);
  });

  const bucketIsOutOfRange = (run: () => unknown) => {
    assertTrue(
      assertThrowsInstanceOf(run, Error).message.includes(
        "a bucket is past the owner's timestamps",
      ),
    );
  };
  bucketIsOutOfRange(() =>
    storage.fingerprint(testAppOwnerIdBytes, zeroNonNegativeInt, position(11)),
  );
  bucketIsOutOfRange(() =>
    storage.fingerprintRanges(emptyOwnerIdBytes, [position(3)]),
  );

  // In range, iterate starts at begin.
  const iterated: Array<[TimestampBytes, NonNegativeInt]> = [];
  storage.iterate(
    testAppOwnerIdBytes,
    position(3),
    position(6),
    (timestamp, index) => {
      iterated.push([timestamp, index]);
      return true;
    },
  );
  assertEqual(iterated, [
    [timestamps[3], 3],
    [timestamps[4], 4],
    [timestamps[5], 5],
  ]);
});

test("extendTimestampBounds", () => {
  const timestamp = (millis: number) =>
    timestampToTimestampBytes(createTimestamp({ millis: millis as Millis }));
  const t100 = timestamp(100);
  const t200 = timestamp(200);

  assertEqual(extendTimestampBounds(timestamp(300), t100, t200), [
    t100,
    timestamp(300),
  ]);
  assertEqual(extendTimestampBounds(timestamp(50), t100, t200), [
    timestamp(50),
    t200,
  ]);
  for (const between of [t100, timestamp(150), t200])
    assertEqual(extendTimestampBounds(between, t100, t200), [t100, t200]);
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

    assertEqual(seenHashes.size, numRows);
  },
);

test("DbChange", () => {
  const deps = testCreateDeps();
  const id = createId(deps);

  // Valid
  assertTrue(
    DbChange.is({
      table: "testTable",
      id,
      values: { column1: "value1", column2: 123 },
      isInsert: true,
      isDelete: false,
    }),
  );

  // Invalid: system columns in values
  assertFalse(
    DbChange.is({
      table: "testTable",
      id,
      values: { createdAt: "2024-01-01T00:00:00Z" },
      isInsert: true,
      isDelete: false,
    }),
  );

  assertFalse(
    DbChange.is({
      table: "testTable",
      id,
      values: { updatedAt: "2024-01-01T00:00:00Z" },
      isInsert: true,
      isDelete: false,
    }),
  );

  assertFalse(
    DbChange.is({
      table: "testTable",
      id,
      values: { id },
      isInsert: true,
      isDelete: false,
    }),
  );

  assertFalse(
    DbChange.is({
      table: "testTable",
      id,
      values: { isDeleted: 1 },
      isInsert: true,
      isDelete: false,
    }),
  );

  // Invalid: invalid table
  assertFalse(
    DbChange.is({
      table: 123,
      id,
      values: { column1: "value1" },
      isInsert: true,
      isDelete: false,
    }),
  );

  // Invalid: invalid id
  assertFalse(
    DbChange.is({
      table: "testTable",
      id: "invalid",
      values: { column1: "value1" },
      isInsert: true,
      isDelete: false,
    }),
  );

  // Invalid: invalid isInsert
  assertFalse(
    DbChange.is({
      table: "testTable",
      id,
      values: { column1: "value1" },
      isInsert: "true",
      isDelete: false,
    }),
  );

  // Invalid: invalid isDelete
  assertFalse(
    DbChange.is({
      table: "testTable",
      id,
      values: { column1: "value1" },
      isInsert: true,
      isDelete: "false",
    }),
  );
});
