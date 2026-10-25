/**
 * Records packages/sqlite-core/test/skiplist-fixture.json from Storage.ts's
 * recursive common table expressions. Run it with `node` on a commit that has
 * them.
 *
 * @module
 */
import { writeFileSync } from "node:fs";
import { assert } from "../../../../../packages/common/src/Assert.ts";
import { bytesToHex } from "../../../../../packages/common/src/Bytes.ts";
import type { OwnerIdBytes } from "../../../../../packages/common/src/local-first/Owner.ts";
import {
  createBaseSqliteStorage,
  createBaseSqliteStorageTables,
  getTimestampByIndex,
  getTimestampInsertStrategy,
} from "../../../../../packages/common/src/local-first/Storage.ts";
import { TimestampBytes } from "../../../../../packages/common/src/local-first/Timestamp.ts";
import { computeBalancedBuckets } from "../../../../../packages/common/src/Number.ts";
import type { RandomNumber } from "../../../../../packages/common/src/Random.ts";
import { getOrThrow } from "../../../../../packages/common/src/Result.ts";
import type { SafeSql } from "../../../../../packages/common/src/Sqlite.ts";
import {
  NonNegativeInt,
  PositiveInt,
} from "../../../../../packages/common/src/Type.ts";
import {
  type SkiplistFixtureJson,
  skiplistFixtureRowsSql,
} from "../../../../../packages/sqlite-core/test/skiplist-fixture.mts";
import { setupSqlite } from "../../_deps.ts";

const timestampsPerOwner = 64;

// Xorshift32, so every run records the same workload.
let state = 0x2545f491;
const nextRandom = (): number => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
};

const randomBytes = (length: number): Uint8Array =>
  Uint8Array.from({ length }, () => nextRandom() & 0xff);

const owners = [0x1a, 0x2b, 0x3c, 0x4d].map(
  (byte) => new Uint8Array(16).fill(byte) as OwnerIdBytes,
);
const ascending = 0;
const empty = 1;
const descending = 2;
const random = 3;

/** The owner's next new timestamp. */
const newTimestamp = (owner: number, position: number): TimestampBytes => {
  const bytes = randomBytes(16);
  if (owner === random)
    // Some are also the ascending owner's.
    return position % 8 === 3
      ? timestampsByOwner[ascending][position]
      : TimestampBytes.orThrow(bytes);
  new DataView(bytes.buffer).setUint32(
    0,
    owner === ascending ? 0x01000000 + position : 0xfeffffff - position,
  );
  return TimestampBytes.orThrow(bytes);
};

/**
 * Levels drawn as Storage.ts draws them, and every level from 10 down to 1 at
 * every sixth new timestamp, so each owner has each.
 */
const levelFor = (position: number): PositiveInt => {
  if (position % 6 === 5 && position < 60)
    return PositiveInt.orThrow(10 - (position - 5) / 6);
  let level = 1;
  while (nextRandom() % 4 === 0 && level < 10) level++;
  return PositiveInt.orThrow(level);
};

const timestampsByOwner: Array<Array<TimestampBytes>> = owners.map(() => []);
const workload: Array<{
  owner: number;
  timestamp: TimestampBytes;
  level: PositiveInt;
}> = [];
for (let position = 0; position < timestampsPerOwner; position++) {
  for (const owner of [ascending, descending, random]) {
    const timestamp = newTimestamp(owner, position);
    timestampsByOwner[owner].push(timestamp);
    workload.push({ owner, timestamp, level: levelFor(position) });
  }
  if (position % 9 === 8)
    for (const owner of [ascending, descending, random]) {
      const timestamps = timestampsByOwner[owner];
      workload.push({
        owner,
        timestamp: timestamps[nextRandom() % timestamps.length],
        level: levelFor(timestampsPerOwner),
      });
    }
}
// The first and the last timestamp again.
for (const owner of [ascending, descending, random])
  for (const timestamp of [
    timestampsByOwner[owner][0],
    timestampsByOwner[owner].at(-1)!,
  ])
    workload.push({ owner, timestamp, level: levelFor(timestampsPerOwner) });

await using setup = await setupSqlite();
const { sqlite } = setup;
createBaseSqliteStorageTables({ sqlite });
// Storage.ts draws a level from these; each insert queues its own.
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

const inserts: Array<string> = [];
const boundsByOwner = new Map<number, [TimestampBytes, TimestampBytes]>();
sqlite.transaction(() => {
  for (const { owner, timestamp, level } of workload) {
    // Storage.ts draws once more after the last level, also at level 10.
    randomNumbers.push(...Array.from({ length: level - 1 }, () => 0.1), 0.9);
    // As Storage.ts's callers choose it, from the owner's first and last
    // timestamps, both the timestamp itself at first.
    const [strategy, first, last] = getTimestampInsertStrategy(
      timestamp,
      ...(boundsByOwner.get(owner) ?? [timestamp, timestamp]),
    );
    boundsByOwner.set(owner, [first, last]);
    const inserted = storage.insertTimestamp(
      owners[owner],
      timestamp,
      strategy,
    );
    assert(randomNumbers.length === 0, "A random number left.");
    inserts.push(
      `${owner} ${bytesToHex(timestamp)} ${level} ${inserted ? 1 : 0}`,
    );
  }
});

const rows = sqlite
  .exec<{ row: string }>({
    sql: skiplistFixtureRowsSql as SafeSql,
    parameters: [],
  })
  .rows.map(({ row }) => row);

const timestampAt = (ownerId: OwnerIdBytes, index: number) =>
  getTimestampByIndex({ sqlite })(ownerId, NonNegativeInt.orThrow(index));

const fixtureOwners = owners.map((ownerId, owner) => {
  const size = storage.getSize(ownerId);
  const timestamps = Array.from({ length: size }, (_, index) =>
    timestampAt(ownerId, index),
  );

  const bucketsList: Array<ReadonlyArray<number>> =
    owner === empty
      ? [[0], [0, 0]]
      : [
          [size],
          [0],
          [0, size],
          [size, size],
          [1, size],
          [size - 1, size],
          [0, 0, 1, 1, size],
          [1, 2, 3],
          getOrThrow(computeBalancedBuckets(size)),
          getOrThrow(
            computeBalancedBuckets(
              size,
              PositiveInt.orThrow(3),
              PositiveInt.orThrow(1),
            ),
          ),
          ...Array.from({ length: 4 }, () =>
            Array.from(
              { length: 1 + (nextRandom() % 6) },
              () => nextRandom() % (size + 1),
            ).toSorted((a, b) => a - b),
          ),
        ];
  const fingerprints = bucketsList.map((buckets) => {
    const ranges = storage.fingerprintRanges(
      ownerId,
      buckets.map((bucket) => NonNegativeInt.orThrow(bucket)),
    );
    return {
      buckets,
      ranges: ranges.map((range, i) => {
        // Storage.ts takes the last range's upper bound from its caller.
        const upperBound =
          i < ranges.length - 1
            ? (range.upperBound as TimestampBytes | null)
            : buckets[i] < size
              ? timestampAt(ownerId, buckets[i])
              : null;
        return `${bytesToHex(range.fingerprint)} ${upperBound ? bytesToHex(upperBound) : "-"}`;
      }),
    };
  });

  const probes = [
    TimestampBytes.orThrow(new Uint8Array(16)),
    TimestampBytes.orThrow(
      Uint8Array.from({ length: 16 }, (_, i) => (i === 5 ? 0xfe : 0xff)),
    ),
    ...timestamps.filter((_, index) => index % 3 === 0),
    ...timestamps
      .filter((_, index) => index % 3 === 1)
      .map((timestamp) =>
        TimestampBytes.orThrow(
          Uint8Array.from(timestamp, (byte, i) =>
            i === 15 ? (byte + 1) & 0xff : byte,
          ),
        ),
      ),
    ...Array.from({ length: 6 }, () => TimestampBytes.orThrow(randomBytes(16))),
  ];
  const lowerBounds = probes.map((probe) => {
    const index = storage.findLowerBound(
      ownerId,
      NonNegativeInt.orThrow(0),
      size,
      probe,
    );
    return `${bytesToHex(probe)} ${index === size ? "-" : index}`;
  });

  return {
    ownerId: bytesToHex(ownerId),
    size,
    timestamps: timestamps.map(bytesToHex),
    fingerprints,
    lowerBounds,
  };
});

const levels = new Set(
  rows.map((row) => `${row.split(" ")[0]} ${row.split(" ")[5]}`),
);
assert(levels.size === 30, "An owner without a level.");

const fixture: SkiplistFixtureJson = {
  owners: fixtureOwners,
  inserts,
  rows,
};
writeFileSync(
  new URL(
    "../../../../../packages/sqlite-core/test/skiplist-fixture.json",
    import.meta.url,
  ),
  `${JSON.stringify(fixture, null, 2)}\n`,
);
