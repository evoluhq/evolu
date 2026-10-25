/**
 * A skiplist workload and what Storage.ts's recursive common table expressions,
 * which the skiplist functions of src/evolu_skiplist.h replace, left in
 * evolu_timestamp and returned for it, recorded in skiplist-fixture.json.
 *
 * Four owners, one without timestamps, the others with timestamps inserted in
 * ascending, descending and random order, interleaved, each at a level from 1
 * to 10, and every level in each. Some inserts repeat an existing timestamp,
 * and some of the random owner's timestamps are also the ascending owner's.
 *
 * @module
 */
import {
  assertNonEmptyReadonlyArray,
  hexToBytes,
  type NonEmptyReadonlyArray,
  NonNegativeInt,
  PositiveInt,
} from "@evolu/common";
import {
  type Fingerprint,
  OwnerIdBytes,
  TimestampBytes,
} from "@evolu/common/local-first";
import { readFileSync } from "node:fs";

export interface SkiplistFixture {
  readonly owners: ReadonlyArray<SkiplistFixtureOwner>;
  /** The inserts, in order, in one transaction. */
  readonly inserts: ReadonlyArray<SkiplistFixtureInsert>;
  /** The rows {@link skiplistFixtureRowsSql} returns after the inserts. */
  readonly rows: ReadonlyArray<string>;
}

export interface SkiplistFixtureOwner {
  readonly ownerId: OwnerIdBytes;
  readonly size: NonNegativeInt;
  /** The timestamp at each index. */
  readonly timestamps: ReadonlyArray<TimestampBytes>;
  readonly fingerprints: ReadonlyArray<SkiplistFixtureFingerprints>;
  readonly lowerBounds: ReadonlyArray<SkiplistFixtureLowerBound>;
}

export interface SkiplistFixtureInsert {
  readonly ownerId: OwnerIdBytes;
  readonly timestamp: TimestampBytes;
  readonly level: PositiveInt;
  /** Whether the timestamp was new. */
  readonly inserted: boolean;
}

/**
 * Ranges ending at buckets, each starting at the previous bucket, or at 0 for
 * the first.
 */
export interface SkiplistFixtureFingerprints {
  readonly buckets: NonEmptyReadonlyArray<NonNegativeInt>;
  readonly ranges: ReadonlyArray<{
    readonly fingerprint: Fingerprint;
    /** The timestamp at the range's bucket, or null at the size. */
    readonly upperBound: TimestampBytes | null;
  }>;
}

export interface SkiplistFixtureLowerBound {
  readonly timestamp: TimestampBytes;
  /** The index of the first timestamp at or after it, or null for none. */
  readonly index: NonNegativeInt | null;
}

/** Each row of evolu_timestamp as one string, by ownerId and t. */
export const skiplistFixtureRowsSql =
  "select hex(ownerId) || ' ' || hex(t) || ' ' || h1 || ' ' || h2 || ' ' || c || ' ' || l as row from evolu_timestamp order by ownerId, t";

/**
 * The fixture as skiplist-fixture.json stores it: bytes in hex and records as
 * strings of space-separated fields, a dash for null.
 */
export interface SkiplistFixtureJson {
  readonly owners: ReadonlyArray<{
    readonly ownerId: string;
    readonly size: number;
    readonly timestamps: ReadonlyArray<string>;
    readonly fingerprints: ReadonlyArray<{
      readonly buckets: ReadonlyArray<number>;
      /** Each `fingerprint upperBound`. */
      readonly ranges: ReadonlyArray<string>;
    }>;
    /** Each `timestamp index`. */
    readonly lowerBounds: ReadonlyArray<string>;
  }>;
  /** Each `owner timestamp level inserted`, the owner as an index. */
  readonly inserts: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<string>;
}

export const readSkiplistFixture = (): SkiplistFixture => {
  const json = JSON.parse(
    readFileSync(new URL("skiplist-fixture.json", import.meta.url), "utf8"),
  ) as SkiplistFixtureJson;
  const timestamp = (hex: string) => TimestampBytes.orThrow(hexToBytes(hex));
  const owners = json.owners.map((owner): SkiplistFixtureOwner => ({
    ownerId: OwnerIdBytes.orThrow(hexToBytes(owner.ownerId)),
    size: NonNegativeInt.orThrow(owner.size),
    timestamps: owner.timestamps.map(timestamp),
    fingerprints: owner.fingerprints.map(({ buckets, ranges }) => {
      const counts = buckets.map((bucket) => NonNegativeInt.orThrow(bucket));
      assertNonEmptyReadonlyArray(counts);
      return {
        buckets: counts,
        ranges: ranges.map((range) => {
          const [fingerprint, upperBound] = range.split(" ");
          return {
            fingerprint: hexToBytes(fingerprint) as Fingerprint,
            upperBound: upperBound === "-" ? null : timestamp(upperBound),
          };
        }),
      };
    }),
    lowerBounds: owner.lowerBounds.map((lowerBound) => {
      const [probe, index] = lowerBound.split(" ");
      return {
        timestamp: timestamp(probe),
        index: index === "-" ? null : NonNegativeInt.orThrow(Number(index)),
      };
    }),
  }));
  return {
    owners,
    inserts: json.inserts.map((insert): SkiplistFixtureInsert => {
      const [owner, hex, level, inserted] = insert.split(" ");
      return {
        ownerId: owners[Number(owner)].ownerId,
        timestamp: timestamp(hex),
        level: PositiveInt.orThrow(Number(level)),
        inserted: inserted === "1",
      };
    }),
    rows: json.rows,
  };
};
