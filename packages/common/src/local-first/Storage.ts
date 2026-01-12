/**
 * Encrypted storage layer for local-first data.
 *
 * @module
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { firstInArray, isNonEmptyArray } from "../Array.js";
import type { NonEmptyReadonlyArray } from "../Array.js";
import { assert } from "../Assert.js";
import type { Brand } from "../Brand.js";
import { concatBytes } from "../Buffer.js";
import { decrement } from "../Number.js";
import type { RandomDep } from "../Random.js";
import { err, ok } from "../Result.js";
import type { Result } from "../Result.js";
import { sql, SqliteValue } from "../Sqlite.js";
import type { SqliteDep, SqliteError } from "../Sqlite.js";
import type { MaybeAsync } from "../OldTask.js";
import {
  Boolean,
  brand,
  Id,
  NonNegativeInt,
  nullOr,
  object,
  PositiveInt,
  record,
  String,
} from "../Type.js";
import type { Int64String, TypeError } from "../Type.js";
import { OwnerId, OwnerWriteKey } from "./Owner.js";
import type { Owner, OwnerError, OwnerIdBytes } from "./Owner.js";
import { systemColumnsWithId } from "./Schema.js";
import { orderTimestampBytes, Timestamp, TimestampBytes } from "./Timestamp.js";

export interface StorageConfig {
  /**
   * Callback called before an attempt to write, to check if an {@link OwnerId}
   * has sufficient quota for the write.
   *
   * The callback receives the {@link OwnerId} and the total bytes that would be
   * stored after the write (current stored bytes plus incoming bytes), and
   * returns a {@link MaybeAsync} boolean: `true` to allow the write, or `false`
   * to deny it due to quota limits.
   *
   * The callback can be synchronous (for SQLite or in-memory checks) or
   * asynchronous (for calling remote APIs).
   *
   * The callback returns a boolean rather than an error because error handling
   * and logging are the responsibility of the callback implementation.
   *
   * ### Example
   *
   * ```ts
   * // Client
   * // evolu.subscribeError
   *
   * // Relay
   * isOwnerWithinQuota: (ownerId, requiredBytes) => {
   *   console.log(ownerId, requiredBytes);
   *   // Check error via evolu.subscribeError
   *   return true;
   * };
   * ```
   */
  readonly isOwnerWithinQuota: (
    ownerId: OwnerId,
    requiredBytes: PositiveInt,
  ) => MaybeAsync<boolean>;
}

/**
 * Evolu Storage
 *
 * Evolu protocol using Storage is agnostic to storage implementation
 * details—any storage can be plugged in, as long as it implements this
 * interface. Implementations must handle their own errors; return values only
 * indicate overall success or failure.
 *
 * The Storage API is synchronous because SQLite's synchronous API is the
 * fastest way to use SQLite. Synchronous bindings (like better-sqlite3) call
 * SQLite's C API directly with no context switching between the event loop and
 * native code, and no promise microtasks or await overhead.
 *
 * The only exception is {@link Storage.writeMessages}, which is async to allow
 * for async validation logic before writing to storage. The write operation
 * itself remains synchronous.
 */
export interface Storage {
  readonly getSize: (ownerId: OwnerIdBytes) => NonNegativeInt | null;

  readonly fingerprint: (
    ownerId: OwnerIdBytes,
    begin: NonNegativeInt,
    end: NonNegativeInt,
  ) => Fingerprint | null;

  /**
   * Computes fingerprints with their upper bounds in one call.
   *
   * This function can be replaced with many fingerprint/findLowerBound calls,
   * but implementations can leverage it for batching and more efficient
   * fingerprint computation.
   */
  readonly fingerprintRanges: (
    ownerId: OwnerIdBytes,
    buckets: ReadonlyArray<NonNegativeInt>,
    upperBound?: RangeUpperBound,
  ) => ReadonlyArray<FingerprintRange> | null;

  readonly findLowerBound: (
    ownerId: OwnerIdBytes,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    upperBound: RangeUpperBound,
  ) => NonNegativeInt | null;

  readonly iterate: (
    ownerId: OwnerIdBytes,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    callback: (timestamp: TimestampBytes, index: NonNegativeInt) => boolean,
  ) => void;

  /**
   * Validates the {@link OwnerWriteKey} for the given {@link Owner}.
   *
   * Returns `true` if the write key is valid, `false` otherwise.
   */
  readonly validateWriteKey: (
    ownerId: OwnerIdBytes,
    writeKey: OwnerWriteKey,
  ) => boolean;

  /** Sets the {@link OwnerWriteKey} for the given {@link Owner}. */
  readonly setWriteKey: (
    ownerId: OwnerIdBytes,
    writeKey: OwnerWriteKey,
  ) => boolean;

  /**
   * Write encrypted {@link CrdtMessage}s to storage.
   *
   * Must use a mutex per ownerId to ensure sequential processing and proper
   * protocol logic handling during sync operations.
   *
   * TODO: Use MaybeAsync
   */
  readonly writeMessages: (
    ownerIdBytes: OwnerIdBytes,
    messages: NonEmptyReadonlyArray<EncryptedCrdtMessage>,
  ) => MaybeAsync<Result<void, StorageWriteError | StorageQuotaError>>;

  /** Read encrypted {@link DbChange}s from storage. */
  readonly readDbChange: (
    ownerId: OwnerIdBytes,
    timestamp: TimestampBytes,
  ) => EncryptedDbChange | null;

  /**
   * Delete all data for the given {@link Owner}.
   *
   * Returns `true` on success, `false` on failure.
   */
  readonly deleteOwner: (ownerId: OwnerIdBytes) => boolean;
}

export interface StorageDep {
  readonly storage: Storage;
}

/** Error indicating a serious write failure. */
export interface StorageWriteError extends OwnerError {
  readonly type: "StorageWriteError";
}

/** Error when storage or billing quota is exceeded. */
export interface StorageQuotaError extends OwnerError {
  readonly type: "StorageQuotaError";
}

/**
 * A cryptographic hash used for efficiently comparing collections of
 * {@link TimestampBytes}s.
 *
 * It consists of the first {@link fingerprintSize} bytes of the SHA-256 hash of
 * one or more timestamps.
 */
export type Fingerprint = Uint8Array & Brand<"Fingerprint">;

export const fingerprintSize = NonNegativeInt.orThrow(12);

/** A fingerprint of an empty range. */
export const zeroFingerprint = new Uint8Array(fingerprintSize) as Fingerprint;

export interface BaseRange {
  readonly upperBound: RangeUpperBound;
}

/**
 * Union type for Range's upperBound: either a {@link TimestampBytes} or
 * {@link InfiniteUpperBound}.
 */
export type RangeUpperBound = TimestampBytes | InfiniteUpperBound;

export const InfiniteUpperBound = Symbol(
  "evolu.local-first.Storage.InfiniteUpperBound",
);
export type InfiniteUpperBound = typeof InfiniteUpperBound;

export const RangeType = {
  Fingerprint: 1,
  Skip: 0,
  Timestamps: 2,
} as const;

export type RangeType = (typeof RangeType)[keyof typeof RangeType];

export interface SkipRange extends BaseRange {
  readonly type: typeof RangeType.Skip;
}

export interface FingerprintRange extends BaseRange {
  readonly type: typeof RangeType.Fingerprint;
  readonly fingerprint: Fingerprint;
}

export interface TimestampsRange extends BaseRange {
  readonly type: typeof RangeType.Timestamps;
  readonly timestamps: ReadonlyArray<TimestampBytes>;
}

export type Range = SkipRange | FingerprintRange | TimestampsRange;

/** An encrypted {@link CrdtMessage}. */
export interface EncryptedCrdtMessage {
  readonly timestamp: Timestamp;
  readonly change: EncryptedDbChange;
}

/** Encrypted DbChange */
export type EncryptedDbChange = Uint8Array & Brand<"EncryptedDbChange">;

/**
 * A CRDT message combining a unique {@link Timestamp} with a {@link DbChange}.
 *
 * Used in Evolu's sync protocol to replicate data changes across devices. Evolu
 * operates as a durable queue, providing exactly-once delivery guarantees for
 * reliable synchronization across application restarts and network failures.
 */
export interface CrdtMessage {
  readonly timestamp: Timestamp;
  readonly change: DbChange;
}

export const DbChangeValues = record(String, SqliteValue);
export type DbChangeValues = typeof DbChangeValues.Type;

export const ValidDbChangeValues = brand(
  "ValidDbChangeValues",
  DbChangeValues,
  (value) => {
    const invalidColumns = systemColumnsWithId.filter((key) => key in value);
    if (invalidColumns.length > 0)
      return err<ValidDbChangeValuesError>({
        type: "ValidDbChangeValues",
        value,
        invalidColumns,
      });

    return ok(value);
  },
);
export type ValidDbChangeValues = typeof ValidDbChangeValues.Type;

export interface ValidDbChangeValuesError extends TypeError<"ValidDbChangeValues"> {
  readonly invalidColumns: ReadonlyArray<string>;
}

/**
 * A DbChange is a change to a table row. Together with a unique
 * {@link Timestamp}, it forms a {@link CrdtMessage}.
 */
export const DbChange = object({
  table: String,
  id: Id,
  values: ValidDbChangeValues,
  isInsert: Boolean,
  isDelete: nullOr(Boolean),
});
export type DbChange = typeof DbChange.Type;

/**
 * Common interface for both client and relay SQLite storages.
 *
 * Evolu uses a Skiplist, which leverages SQLite indexes. The core logic is
 * implemented in SQL, so it doesn't have to make roundtrips to the DB.
 *
 * While the SQL implementation may look sophisticated, it's conceptually simple
 * and LLMs can explain how it works. The Skiplist data structure is well
 * explained in [this Stack Overflow
 * answer](https://stackoverflow.com/questions/61944198/what-is-a-zip-tree-and-how-does-it-work).
 * The logic resembles [Negentropy's C++
 * storage](https://github.com/hoytech/negentropy), except we use a Skiplist to
 * leverage SQLite indexes, which makes the code simpler.
 *
 * Note: A paid review by the SQLite team is planned, as they use the same
 * algorithm for their rsync tool.
 *
 * The ideal storage for a Relay should use an architecture like
 * [strfry](https://github.com/hoytech/strfry) (a KV storage), but with Skiplist
 * to ensure that insertion order doesn't matter (local-first apps can often
 * write in the past.)
 *
 * The ideal client implementation should probably use the SQLite extension
 * instead of SQL or even a KV storage, when such a thing for browsers/native
 * will exist and will be faster than SQLite.
 *
 * # Scaling
 *
 * The load can be distributed by deploying multiple relays, synchronized with
 * each other, if necessary. One relay should handle hundreds of thousands of
 * users, and when it goes down, nothing happens, because it will be
 * synchronized later.
 */
export interface BaseSqliteStorage extends Pick<
  Storage,
  | "getSize"
  | "fingerprint"
  | "fingerprintRanges"
  | "findLowerBound"
  | "iterate"
  | "deleteOwner"
> {
  /** Inserts a timestamp for an owner into the skiplist-based storage. */
  readonly insertTimestamp: (
    ownerId: OwnerIdBytes,
    timestamp: TimestampBytes,
    strategy: StorageInsertTimestampStrategy,
  ) => Result<void, SqliteError>;

  /**
   * Efficiently checks which timestamps already exist in the database using a
   * single CTE query instead of N individual queries.
   */
  readonly getExistingTimestamps: (
    ownerIdBytes: OwnerIdBytes,
    timestampsBytes: NonEmptyReadonlyArray<TimestampBytes>,
  ) => Result<ReadonlyArray<TimestampBytes>, SqliteError>;
}

export interface BaseSqliteStorageDep {
  readonly storage: BaseSqliteStorage;
}

export type SqliteStorageDeps = RandomDep & SqliteDep;

export interface CreateBaseSqliteStorageConfig extends StorageConfig {
  onStorageError: (error: SqliteError) => void;
}

/**
 * Creates a {@link BaseSqliteStorage} implementation.
 *
 * # Stateless Design
 *
 * This implementation is fully stateless - it requires no in-memory state
 * between invocations. All necessary metadata (timestamp bounds for insertion
 * strategy optimization) is persisted in the evolu_usage table. This makes
 * Evolu Relay suitable for stateless serverless environments like AWS Lambda,
 * Cloudflare Workers with Durable Objects, and other platforms where memory
 * doesn't persist between requests. While not extensively tested in all these
 * environments yet, the stateless design should work well across them.
 */
export const createBaseSqliteStorage =
  (deps: SqliteStorageDeps) =>
  (config: CreateBaseSqliteStorageConfig): BaseSqliteStorage => {
    return {
      insertTimestamp: (
        ownerId: OwnerIdBytes,
        timestamp: TimestampBytes,
        strategy: StorageInsertTimestampStrategy,
      ) => {
        const level = randomSkiplistLevel(deps);
        return insertTimestamp(deps)(ownerId, timestamp, level, strategy);
      },

      getExistingTimestamps: (ownerIdBytes, timestampsBytes) => {
        const concatenatedTimestamps = concatBytes(...timestampsBytes);

        const result = deps.sqlite.exec<{
          timestampBytes: TimestampBytes;
        }>(sql`
          with recursive
            split_timestamps(timestampBytes, pos) as (
              select
                substr(${concatenatedTimestamps}, 1, 16),
                17 as pos
              union all
              select
                substr(${concatenatedTimestamps}, pos, 16),
                pos + 16
              from split_timestamps
              where pos <= length(${concatenatedTimestamps})
            )
          select s.timestampBytes
          from
            split_timestamps s
            join evolu_timestamp t
              on t.ownerId = ${ownerIdBytes} and s.timestampBytes = t.t;
        `);

        if (!result.ok) return result;

        return ok(result.value.rows.map((row) => row.timestampBytes));
      },

      getSize: (ownerId) => {
        const size = getSize(deps)(ownerId);
        if (!size.ok) {
          config.onStorageError(size.error);
          return null;
        }
        return size.value;
      },

      fingerprint: (ownerId, begin, end) => {
        assertBeginEnd(begin, end);
        const result = fingerprint(deps)(ownerId, begin, end);
        if (!result.ok) {
          config.onStorageError(result.error);
          return null;
        }
        return result.value;
      },

      fingerprintRanges: (ownerId, buckets, upperBound) => {
        const ranges = fingerprintRanges(deps)(ownerId, buckets, upperBound);
        if (!ranges.ok) {
          config.onStorageError(ranges.error);
          return null;
        }
        return ranges.value;
      },

      findLowerBound: (ownerId, begin, end, upperBound) => {
        const lowerBound = findLowerBound(deps)(
          ownerId,
          begin,
          end,
          upperBound,
        );
        if (!lowerBound.ok) {
          config.onStorageError(lowerBound.error);
          return null;
        }
        return lowerBound.value;
      },

      iterate: (ownerId, begin, end, callback) => {
        assertBeginEnd(begin, end);
        const length = end - begin;
        if (length === 0) return;

        // This is much faster than SQL limit with offset.
        const first = getTimestampByIndex(deps)(ownerId, begin);
        if (!first.ok) {
          config.onStorageError(first.error);
          return;
        }

        if (!callback(first.value, begin)) return;
        if (length === 1) return;

        /**
         * TODO: In rare cases, we might overfetch a lot of rows here, but we
         * don't have real usage numbers yet. Fetching one row at a time would
         * probably be slower in almost all cases. In the future, we should
         * fetch in chunks (e.g., 1,000 rows at a time). For now, consider
         * logging unused rows to gather data and calculate an average, then use
         * that information to determine an optimal chunk size. Before
         * implementing chunking, be sure to run performance tests (including
         * fetching one by one).
         */
        const result = deps.sqlite.exec<{ t: TimestampBytes }>(sql`
          select t
          from evolu_timestamp
          where ownerId = ${ownerId} and t > ${first.value}
          order by t
          limit ${length - 1};
        `);
        if (!result.ok) {
          config.onStorageError(result.error);
          return;
        }

        for (let i = 0; i < result.value.rows.length; i++) {
          const index = NonNegativeInt.orThrow(begin + 1 + i);
          if (!callback(result.value.rows[i].t, index)) return;
        }
      },

      deleteOwner: (ownerId) => {
        const result = deps.sqlite.exec(sql`
          delete from evolu_timestamp where ownerId = ${ownerId};
        `);
        if (!result.ok) {
          config.onStorageError(result.error);
          return false;
        }
        return true;
      },
    };
  };

const assertBeginEnd = (begin: NonNegativeInt, end: NonNegativeInt) => {
  assert(begin <= end, "invalid begin or end");
};

export const createBaseSqliteStorageTables = (
  deps: SqliteDep,
): Result<void, SqliteError> => {
  for (const query of [
    /**
     * Creates the `evolu_timestamp` table for storing timestamps of multiple
     * owners.
     *
     * All timestamps are stored in a single table using `ownerId` as part of
     * the primary key. The table implements a Skiplist structure via the `l`
     * (level) column for fast, scalable queries without the need for tree
     * balancing.
     *
     * Columns:
     *
     * - `t` – TimestampBytes
     * - `h1`/`h2` – 12-byte fingerprint split into two integers for fast XOR
     * - `c` – incremental count
     * - `l` – Skiplist level (1 to 10)
     */
    sql`
      create table evolu_timestamp (
        "ownerId" blob not null,
        "t" blob not null,
        "h1" integer,
        "h2" integer,
        "c" integer,
        "l" integer not null,
        primary key ("ownerId", "t")
      )
      strict;
    `,

    sql`
      create index evolu_timestamp_index on evolu_timestamp (
        "ownerId",
        "l",
        "t",
        "h1",
        "h2",
        "c"
      );
    `,

    /**
     * Creates the `evolu_usage` table for tracking data consumption per owner.
     *
     * Columns:
     *
     * - `ownerId` – OwnerIdBytes (primary key)
     * - `storedBytes` – total bytes stored in database
     * - `firstTimestamp` – for timestamp insertion strategies
     * - `lastTimestamp` – for timestamp insertion strategies
     */
    sql`
      create table evolu_usage (
        "ownerId" blob primary key,
        "storedBytes" integer not null,
        "firstTimestamp" blob,
        "lastTimestamp" blob
      )
      strict;
    `,
  ]) {
    const result = deps.sqlite.exec(query);
    if (!result.ok) return result;
  }
  return ok();
};

export type StorageInsertTimestampStrategy = "append" | "prepend" | "insert";

/**
 * Determines the insertion strategy for a timestamp based on its position
 * relative to the current first and last timestamps.
 *
 * Returns a tuple with the strategy and updated timestamp bounds.
 */
export const getTimestampInsertStrategy = (
  timestamp: TimestampBytes,
  firstTimestamp: TimestampBytes,
  lastTimestamp: TimestampBytes,
): [
  strategy: StorageInsertTimestampStrategy,
  firstTimestamp: TimestampBytes,
  lastTimestamp: TimestampBytes,
] => {
  if (orderTimestampBytes(timestamp, lastTimestamp) === 1) {
    return ["append", firstTimestamp, timestamp];
  }
  if (orderTimestampBytes(timestamp, firstTimestamp) === -1) {
    return ["prepend", timestamp, lastTimestamp];
  }
  return ["insert", firstTimestamp, lastTimestamp];
};

/**
 * AFAIK, we can't do both insert and update in one query, and that's probably
 * why append is 2x faster than insert. Prepend also has to update parents, but
 * it's constantly fast. Insert degrades for reversed (yet LIMIT X magically
 * fixes that) but it's OK for append.
 *
 * Note: SQL operations are idempotent (using `on conflict do nothing` and
 * `changes() > 0`), but this is no longer required here since we use
 * {@link BaseSqliteStorage.getExistingTimestamps} to filter out duplicates
 * before insertion, which we need for quota checks anyway.
 *
 * TODO: Remove idempotency (`on conflict do nothing` and `changes() > 0`) since
 * duplicates are now filtered before insertion.
 */
const insertTimestamp =
  (deps: SqliteDep) =>
  (
    ownerId: OwnerIdBytes,
    timestamp: TimestampBytes,
    level: PositiveInt,
    strategy: StorageInsertTimestampStrategy,
  ): Result<void, SqliteError> => {
    const [h1, h2] = fingerprintToSqliteFingerprint(
      timestampBytesToFingerprint(timestamp),
    );

    let queries: Array<ReturnType<typeof sql.prepared>> = [];

    switch (strategy) {
      case "append":
        queries = [
          level === 1
            ? sql.prepared`
                insert into evolu_timestamp
                  (ownerId, l, t, h1, h2, c)
                values
                  (${ownerId}, 1, ${timestamp}, ${h1}, ${h2}, 1)
                on conflict do nothing;
              `
            : sql.prepared`
                with
                  fc(b, cl, pt, nt, ih1, ih2, ic) as (
                    select
                      0,
                      (
                        select max(l)
                        from evolu_timestamp
                        where ownerId = ${ownerId}
                      ),
                      zeroblob(0),
                      null,
                      0,
                      0,
                      0
                    union all
                    select
                      not b,
                      iif(b, iif(nt is null, cl - 1, cl), cl),
                      iif(b, ifnull(nt, pt), pt),
                      iif(
                        b,
                        null,
                        (
                          select t
                          from evolu_timestamp
                          where
                            ownerId = ${ownerId}
                            and l = cl
                            and t > pt
                            and t < ${timestamp}
                          order by t
                          limit 1
                        )
                      ),
                      iif(
                        b and cl < ${level} and nt is not null,
                        (
                          select (ih1 | h1) - (ih1 & h1)
                          from evolu_timestamp
                          where ownerId = ${ownerId} and t = nt
                        ),
                        ih1
                      ),
                      iif(
                        b and cl < ${level} and nt is not null,
                        (
                          select (ih2 | h2) - (ih2 & h2)
                          from evolu_timestamp
                          where ownerId = ${ownerId} and t = nt
                        ),
                        ih2
                      ),
                      iif(
                        b and cl < ${level} and nt is not null,
                        (
                          select ic + c
                          from evolu_timestamp
                          where ownerId = ${ownerId} and t = nt
                        ),
                        ic
                      )
                    from fc
                    where cl > 0
                  )
                insert into evolu_timestamp (ownerId, t, l, h1, h2, c)
                select
                  ${ownerId},
                  ${timestamp},
                  ${level},
                  (${h1} | ih1) - (${h1} & ih1),
                  (${h2} | ih2) - (${h2} & ih2),
                  ic + 1
                from fc
                order by cl asc
                limit 1
                on conflict do nothing;
              `,
        ];
        break;

      case "prepend":
        queries = [
          sql.prepared`
            insert into evolu_timestamp
              (ownerId, l, t, h1, h2, c)
            values
              (${ownerId}, ${level}, ${timestamp}, ${h1}, ${h2}, 1)
            on conflict do nothing;
          `,
          sql.prepared`
            with
              ml(ml) as (
                select max(l)
                from evolu_timestamp
                where ownerId = ${ownerId}
              ),
              fp(b, cl, pt, nt, h1, h2, c) as (
                select
                  0,
                  (select ml from ml),
                  null,
                  null,
                  null,
                  null,
                  null
                union all
                select
                  not b,
                  iif(b, cl - 1, cl),
                  iif(
                    b,
                    iif(nt is not null and (pt is null or nt < pt), nt, pt),
                    pt
                  ),
                  iif(
                    b,
                    null,
                    (
                      select t
                      from evolu_timestamp
                      where ownerId = ${ownerId} and l = cl and t > ${timestamp}
                      order by t
                      limit 1
                    )
                  ),
                  iif(
                    b and nt is not null and (pt is null or nt < pt),
                    (
                      select h1
                      from evolu_timestamp
                      where ownerId = ${ownerId} and t = nt
                    ),
                    null
                  ),
                  iif(
                    b and nt is not null and (pt is null or nt < pt),
                    (
                      select h2
                      from evolu_timestamp
                      where ownerId = ${ownerId} and t = nt
                    ),
                    null
                  ),
                  iif(
                    b and nt is not null and (pt is null or nt < pt),
                    (
                      select c
                      from evolu_timestamp
                      where ownerId = ${ownerId} and t = nt
                    ),
                    null
                  )
                from fp
                where cl > ${level}
              ),
              u(t, h1, h2) as (
                select
                  pt,
                  (${h1} | h1) - (${h1} & h1),
                  (${h2} | h2) - (${h2} & h2)
                from fp
                where h1 is not null and pt is not null
                order by pt
                -- Check skiplistMaxLevel docs.
                limit 10
              )
            update evolu_timestamp
            set
              h1 = u.h1,
              h2 = u.h2,
              c = c + 1
            from u
            where
              changes() > 0
              and ownerId = ${ownerId}
              and evolu_timestamp.t = u.t;
          `,
        ];
        break;

      case "insert":
        queries =
          level === 1
            ? [
                sql.prepared`
                  insert into evolu_timestamp
                    (ownerId, l, t, h1, h2, c)
                  values
                    (${ownerId}, 1, ${timestamp}, ${h1}, ${h2}, 1)
                  on conflict do nothing;
                `,

                // DEV: Check whether a boolean flag is faster.
                sql.prepared`
                  with
                    p(l, t, h1, h2) as (
                      select
                        (
                          select max(l) + 1
                          from evolu_timestamp
                          where ownerId = ${ownerId}
                        ),
                        null,
                        null,
                        null
                      union all
                      select
                        p.l - 1,
                        ifnull(
                          (
                            select t
                            from evolu_timestamp
                            where
                              ownerId = ${ownerId}
                              and l = p.l - 1
                              and t > ${timestamp}
                              and (p.t is null or p.t > t)
                            order by t
                            limit 1
                          ),
                          p.t
                        ),
                        (
                          select h1
                          from evolu_timestamp
                          where
                            ownerId = ${ownerId}
                            and l = p.l - 1
                            and t > ${timestamp}
                            and (p.t is null or p.t > t)
                          order by t
                          limit 1
                        ),
                        (
                          select h2
                          from evolu_timestamp
                          where
                            ownerId = ${ownerId}
                            and l = p.l - 1
                            and t > ${timestamp}
                            and (p.t is null or p.t > t)
                          order by t
                          limit 1
                        )
                      from p
                      where p.l > 2
                      -- Check skiplistMaxLevel docs.
                      limit 10
                    ),
                    u(t, h1, h2) as (
                      select
                        t,
                        (${h1} | h1) - (${h1} & h1),
                        (${h2} | h2) - (${h2} & h2)
                      from p
                      where h1 is not null
                    )
                  update evolu_timestamp
                  set
                    h1 = u.h1,
                    h2 = u.h2,
                    c = c + 1
                  from u
                  where
                    changes() > 0
                    and ownerId = ${ownerId}
                    and evolu_timestamp.t = u.t;
                `,
              ]
            : [
                sql.prepared`
                  insert into evolu_timestamp (ownerId, t, l)
                  values (${ownerId}, ${timestamp}, ${level})
                  on conflict do nothing;
                `,

                sql.prepared`
                  with
                    c0(b, cl, pt, nt, h1, h2, c) as (
                      select
                        0,
                        (
                          select max(l)
                          from evolu_timestamp
                          where ownerId = ${ownerId}
                        ),
                        0,
                        null,
                        null,
                        null,
                        null
                      union all
                      select
                        not b,
                        iif(b, iif(nt is null, cl - 1, cl), cl),
                        iif(b, ifnull(nt, pt), pt),
                        iif(
                          b,
                          null,
                          (
                            select t
                            from evolu_timestamp
                            where
                              ownerId = ${ownerId}
                              and l = cl
                              and t > pt
                              and t < ${timestamp}
                            order by t
                            limit 1
                          )
                        ),
                        iif(
                          b and cl < ${level} and nt is not null,
                          (
                            select h1
                            from evolu_timestamp
                            where ownerId = ${ownerId} and t = nt
                          ),
                          null
                        ),
                        iif(
                          b and cl < ${level} and nt is not null,
                          (
                            select h2
                            from evolu_timestamp
                            where ownerId = ${ownerId} and t = nt
                          ),
                          null
                        ),
                        iif(
                          b and cl < ${level} and nt is not null,
                          (
                            select c
                            from evolu_timestamp
                            where ownerId = ${ownerId} and t = nt
                          ),
                          null
                        )
                      from c0
                      where cl > 0
                    ),
                    c1(l, t, h1, h2, c) as (
                      select
                        ${level},
                        ${timestamp},
                        ${h1},
                        ${h2},
                        1
                      union all
                      select cl, pt, h1, h2, c
                      from c0
                      where h1 is not null
                    ),
                    c2(rn, l, t, h1, h2, c) as (
                      select row_number() over (order by l), l, t, h1, h2, c
                      from c1
                    ),
                    c3(rn, l, t, h1, h2, c) as (
                      select rn, l, t, h1, h2, c from c2 where rn = 1
                      union all
                      select
                        c3.rn + 1,
                        c2.l,
                        c2.t,
                        (c2.h1 | c3.h1) - (c2.h1 & c3.h1),
                        (c2.h2 | c3.h2) - (c2.h2 & c3.h2),
                        c2.c + c3.c
                      from
                        c3
                        join c2 on c2.rn = c3.rn + 1
                    ),
                    c4(l, t, h1, h2, c, rn) as (
                      select l, t, h1, h2, c, max(rn)
                      from c3
                      group by l
                    ),
                    -- DEV: Check whether a boolean flag is faster.
                    n(l, t, h1, h2, c) as (
                      select
                        (
                          select max(l) + 1
                          from evolu_timestamp
                          where ownerId = ${ownerId}
                        ),
                        null,
                        null,
                        null,
                        null
                      union all
                      select
                        n.l - 1,
                        ifnull(
                          (
                            select t
                            from evolu_timestamp
                            where
                              ownerId = ${ownerId}
                              and l = n.l - 1
                              and t > ${timestamp}
                              and (n.t is null or t < n.t)
                            order by t
                            limit 1
                          ),
                          n.t
                        ),
                        (
                          select h1
                          from evolu_timestamp
                          where
                            ownerId = ${ownerId}
                            and l = n.l - 1
                            and t > ${timestamp}
                            and (n.t is null or t < n.t)
                          order by t
                          limit 1
                        ),
                        (
                          select h2
                          from evolu_timestamp
                          where
                            ownerId = ${ownerId}
                            and l = n.l - 1
                            and t > ${timestamp}
                            and (n.t is null or t < n.t)
                          order by t
                          limit 1
                        ),
                        (
                          select c
                          from evolu_timestamp
                          where
                            ownerId = ${ownerId}
                            and l = n.l - 1
                            and t > ${timestamp}
                            and (n.t is null or t < n.t)
                          order by t
                          limit 1
                        )
                      from n
                      where l - 1 > (select min(l) from c4)
                    ),
                    u(ut, uh1, uh2, uc) as (
                      select t, h1, h2, c from c4 where t = ${timestamp}
                      union all
                      select
                        max(t),
                        iif(
                          l > ${level},
                          (${h1} | h1) - (${h1} & h1),
                          (
                            select (c4.h1 | n.h1) - (c4.h1 & n.h1)
                            from c4
                            where
                              c4.l = (select max(l) from c4 where c4.l < n.l)
                          )
                        ),
                        iif(
                          l > ${level},
                          (${h2} | h2) - (${h2} & h2),
                          (
                            select (c4.h2 | n.h2) - (c4.h2 & n.h2)
                            from c4
                            where
                              c4.l = (select max(l) from c4 where c4.l < n.l)
                          )
                        ),
                        iif(
                          l > ${level},
                          c + 1,
                          (
                            select n.c - c4.c
                            from c4
                            where
                              c4.l = (select max(l) from c4 where c4.l < n.l)
                          )
                        )
                      from n
                      group by t
                      -- Check skiplistMaxLevel docs.
                      limit 10
                    )
                  update evolu_timestamp
                  set
                    h1 = uh1,
                    h2 = uh2,
                    c = uc
                  from u
                  where changes() > 0 and ownerId = ${ownerId} and t = ut;
                `,
              ];
        break;
    }

    for (const query of queries) {
      const result = deps.sqlite.exec(query);
      if (!result.ok) return result;
    }

    return ok();
  };

export const timestampBytesToFingerprint = (
  timestamp: TimestampBytes,
): Fingerprint => {
  const hash = sha256(timestamp).slice(0, fingerprintSize);
  return hash as Fingerprint;
};

/**
 * Generates a random skiplist level in the range [1, skiplistMaxLevel].
 * Probabilistic approach avoids the need for explicit tree balancing.
 */
const randomSkiplistLevel = (deps: RandomDep): PositiveInt => {
  let level = 1;
  while (
    deps.random.next() <= skiplistProbability &&
    level < skiplistMaxLevel
  ) {
    level += 1;
  }
  return PositiveInt.orThrow(level);
};

/**
 * Probability used for generating Skiplist levels.
 *
 * 0.5 is little faster for the first 30k.
 */
const skiplistProbability = 0.25;

/**
 * The SQLite has weird behaviour when we have to limit CTEs even when we don't
 * actually limit anything; otherwise, it would not work. But without it, SQLite
 * insert and prepend is slow. The 10 is the maximum allowed number, which
 * "fixes" SQLite.
 *
 * Because we are using {@link skiplistProbability} 0.25, it's OK even for
 * millions of rows.
 */
const skiplistMaxLevel = 10;

/**
 * {@link Fingerprint} encoded for efficient use in SQLite.
 *
 * Fingerprints are 12-byte binary values. While SQLite can XOR binary blobs or
 * strings, it's not efficient. The fastest approach is to split the 12 bytes
 * into two 6-byte integers, which can be XORed quickly in SQL. We use strings
 * to represent these integers because not all SQLite drivers support native
 * bigint types.
 */
type SqliteFingerprint = [Int64String, Int64String] &
  Brand<"SqliteFingerprint">;

const fingerprintToSqliteFingerprint = (
  fingerprint: Fingerprint,
): SqliteFingerprint => {
  let part1 = BigInt(0);
  let part2 = BigInt(0);
  for (let i = 0; i < 6; i++) {
    part1 = (part1 << BigInt(8)) | BigInt(fingerprint[i]);
  }
  for (let i = 6; i < 12; i++) {
    part2 = (part2 << BigInt(8)) | BigInt(fingerprint[i]);
  }
  return [part1.toString(), part2.toString()] as SqliteFingerprint;
};

const sqliteFingerprintToFingerprint = ([
  part1String,
  part2String,
]: SqliteFingerprint): Fingerprint => {
  let part1 = BigInt(part1String);
  let part2 = BigInt(part2String);

  const hash = new Uint8Array(12);
  for (let i = 5; i >= 0; i--) {
    hash[i] = Number(part1 & BigInt(0xff));
    part1 >>= BigInt(8);
  }
  for (let i = 11; i >= 6; i--) {
    hash[i] = Number(part2 & BigInt(0xff));
    part2 >>= BigInt(8);
  }
  return hash as Fingerprint;
};

const getSize =
  (deps: SqliteDep) =>
  (ownerId: OwnerIdBytes): Result<NonNegativeInt, SqliteError> => {
    const result = deps.sqlite.exec<{ size: NonNegativeInt }>(sql.prepared`
      with
        ml(ml) as (
          select max(l)
          from evolu_timestamp
          where ownerId = ${ownerId}
        ),
        sc(l, pt, c) as (
          select (select ml + 1 from ml), zeroblob(0), 0
          union all
          select
            sc.l - 1,
            ifnull(
              (
                select max(t)
                from evolu_timestamp as m
                where ownerId = ${ownerId} and m.l = sc.l - 1 and m.t > sc.pt
              ),
              sc.pt
            ),
            ifnull(
              (
                select sum(m.c)
                from evolu_timestamp as m
                where ownerId = ${ownerId} and m.l = sc.l - 1 and m.t > sc.pt
              ),
              0
            )
          from sc
          where sc.l > 1
        )
      select sum(c) as size
      from sc;
    `);

    if (!result.ok) return result;
    return ok(result.value.rows[0].size);
  };

const findLowerBound =
  (deps: SqliteDep) =>
  (
    ownerId: OwnerIdBytes,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    upperBound: RangeUpperBound,
  ): Result<NonNegativeInt, SqliteError> => {
    assertBeginEnd(begin, end);

    if (end === 0 || begin === end || upperBound === InfiniteUpperBound) {
      return ok(end);
    }

    const result = deps.sqlite.exec<{
      t: TimestampBytes;
    }>(sql.prepared`
      select t
      from evolu_timestamp
      where ownerId = ${ownerId} and t >= ${upperBound}
      order by t
      limit 1;
    `);
    if (!result.ok) return result;

    if (result.value.rows.length === 0) {
      return ok(end);
    }

    const count = getTimestampCount(deps)(ownerId, result.value.rows[0].t);
    if (!count.ok) return count;

    // `decrement` converts a count to an index.
    return ok(NonNegativeInt.orThrow(decrement(count.value)));
  };

const getTimestampCount =
  (deps: SqliteDep) =>
  (
    ownerId: OwnerIdBytes,
    timestamp: TimestampBytes,
  ): Result<PositiveInt, SqliteError> => {
    const result = deps.sqlite.exec<{
      count: PositiveInt;
    }>(sql.prepared`
      with
        ml(ml) as (
          select max(l) from evolu_timestamp where ownerId = ${ownerId}
        ),
        sc(l, pt, tc) as (
          select ml + 1, zeroblob(0), 0 from ml
          union all
          select
            sc.l - 1,
            ifnull(
              (
                select max(t)
                from evolu_timestamp
                where
                  ownerId = ${ownerId}
                  and l = sc.l - 1
                  and t <= ${timestamp}
                  and t > sc.pt
                order by t
              ),
              sc.pt
            ),
            ifnull(
              (
                select sum(c)
                from evolu_timestamp
                where
                  ownerId = ${ownerId}
                  and l = sc.l - 1
                  and t <= ${timestamp}
                  and t > sc.pt
              ),
              0
            )
          from sc
          where sc.l > 1 and sc.pt != ${timestamp}
        )
      select sum(tc) as count
      from sc;
    `);

    if (!result.ok) return result;
    return ok(result.value.rows[0].count);
  };

/**
 * TODO: We reuse {@link fingerprintRanges}, which returns upper bound, which we
 * don't need, so fingerprintRanges should have a parameter for that.
 */
const fingerprint =
  (deps: SqliteDep) =>
  (
    ownerId: OwnerIdBytes,
    begin: NonNegativeInt,
    end: NonNegativeInt,
  ): Result<Fingerprint, SqliteError> => {
    // There is no need to fingerprint an empty range.
    if (end - begin === 0) {
      return ok(zeroFingerprint);
    }

    if (begin === 0) {
      const result = fingerprintRanges(deps)(ownerId, [end]);
      if (!result.ok) return result;
      return ok(result.value[0].fingerprint);
    }

    // We should have a param to skip the first result.
    const result = fingerprintRanges(deps)(ownerId, [begin, end]);
    if (!result.ok) return result;
    return ok(result.value[1].fingerprint);
  };

/**
 * First, check this: https://logperiodic.com/rbsr.html#tree-friendly-functions
 *
 * We are a little smarter. We leverage continuous ranges to have half of
 * traversals. 16 instead of 32. And we compute all of them in a single SQL
 * select. If only we could get rid of those subqueries. Then, it would be
 * perfect. Btw, reading h1, h2, c in the second step would be slighly faster.
 */
const fingerprintRanges =
  (deps: SqliteDep) =>
  (
    ownerId: OwnerIdBytes,
    buckets: ReadonlyArray<NonNegativeInt>,
    upperBound: RangeUpperBound = InfiniteUpperBound,
  ): Result<ReadonlyArray<FingerprintRange>, SqliteError> => {
    const bucketsJson = JSON.stringify(buckets);

    const result = deps.sqlite.exec<{
      b: TimestampBytes | null;
      h1: Int64String;
      h2: Int64String;
    }>(sql.prepared`
      with
        ml(ml) as (
          select max(l) from evolu_timestamp where ownerId = ${ownerId}
        ),
        c0(c) as (select value as c from json_each(${bucketsJson})),
        c1(c, b, nt, nc, nh1, nh2, ft, tt, dl, ic, h1, h2) as (
          select
            c,
            1,
            null,
            null,
            null,
            null,
            zeroblob(0),
            X'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
            ml,
            0,
            0,
            0
          from
            c0,
            ml
          union all
          select
            c,
            not b,
            iif(
              b,
              (
                select t
                from evolu_timestamp
                where l = dl and t > ft and t < tt and ownerId = ${ownerId}
                order by t
                limit 1
              ),
              null
            ),
            iif(
              b,
              (
                select c
                from evolu_timestamp
                where l = dl and t > ft and t < tt and ownerId = ${ownerId}
                order by t
                limit 1
              ),
              null
            ),
            iif(
              b,
              (
                select h1
                from evolu_timestamp
                where l = dl and t > ft and t < tt and ownerId = ${ownerId}
                order by t
                limit 1
              ),
              null
            ),
            iif(
              b,
              (
                select h2
                from evolu_timestamp
                where l = dl and t > ft and t < tt and ownerId = ${ownerId}
                order by t
                limit 1
              ),
              null
            ),
            iif(b, ft, iif(ic + nc <= c, nt, ft)),
            iif(b, tt, iif(ic + nc <= c, tt, ifnull(nt, tt))),
            iif(b, dl, iif(ic + nc <= c, dl, dl - 1)),
            iif(b, ic, iif(ic + nc <= c, ic + nc, ic)),
            iif(b, h1, iif(ic + nc <= c, ${x("h1", "nh1")}, h1)),
            iif(b, h2, iif(ic + nc <= c, ${x("h2", "nh2")}, h2))
          from c1
          where iif(b, 1, ic != c)
        ),
        c2(h1, h2, t, rn) as (
          select
            h1,
            h2,
            (
              select min(t)
              from evolu_timestamp
              where t > ft and ownerId = ${ownerId}
            ),
            row_number() over (order by c)
          from c1
          where c = ic and b = 1
        ),
        c3(oh1, oh2, b, rn, h1, h2) as (
          select h1, h2, t, rn, h1, h2 from c2 where rn = 1
          union all
          select
            c2.h1,
            c2.h2,
            t,
            c2.rn,
            ${x("c3.oh1", "c2.h1")},
            ${x("c3.oh2", "c2.h2")}
          from
            c2
            join c3 on c2.rn = c3.rn + 1
        )
      select b, cast(h1 as text) as h1, cast(h2 as text) as h2
      from c3;
    `);

    if (!result.ok) return result;

    const fingerprintRanges = result.value.rows.map(
      (row, i, arr): FingerprintRange => ({
        type: RangeType.Fingerprint,
        upperBound: i === arr.length - 1 ? upperBound : row.b!,
        fingerprint: sqliteFingerprintToFingerprint([
          row.h1,
          row.h2,
        ] as SqliteFingerprint),
      }),
    );

    return ok(fingerprintRanges);
  };

// XOR in SQLite
const x = (a: string, b: string) => sql.raw(`(${a} | ${b}) - (${a} & ${b})`);

export const getTimestampByIndex =
  (deps: SqliteDep) =>
  (
    ownerId: OwnerIdBytes,
    index: NonNegativeInt,
  ): Result<TimestampBytes, SqliteError> => {
    const result = deps.sqlite.exec<{
      readonly pt: TimestampBytes;
    }>(sql.prepared`
      with
        fi(b, cl, ic, pt, mt, nt, nc) as (
          select
            0,
            (
              select max(l)
              from evolu_timestamp
              where ownerId = ${ownerId}
            ),
            0,
            zeroblob(0),
            X'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
            null,
            0
          union all
          select
            not b,
            iif(
              b,
              iif(nt is null or nt > mt or ic + nc > ${index + 1}, cl - 1, cl),
              cl
            ),
            iif(
              b,
              iif(nt is null or nt > mt or ic + nc > ${index + 1}, ic, ic + nc),
              ic
            ),
            iif(
              b,
              iif(nt is null or nt > mt or ic + nc > ${index + 1}, pt, nt),
              pt
            ),
            iif(
              b,
              iif(
                nt is null or nt > mt or ic + nc > ${index + 1},
                iif(nt is not null and nt < mt, nt, mt),
                mt
              ),
              mt
            ),
            iif(
              b,
              null,
              (
                select t
                from evolu_timestamp
                where ownerId = ${ownerId} and l = cl and t > pt
                order by t
                limit 1
              )
            ),
            iif(
              b,
              null,
              (
                select c
                from evolu_timestamp
                where ownerId = ${ownerId} and l = cl and t > pt
                order by t
                limit 1
              )
            )
          from fi
          where ic != ${index + 1}
        )
      select pt
      from fi
      where ic == ${index + 1};
    `);

    if (!result.ok) return result;
    return ok(result.value.rows[0].pt);
  };

/** Retrieves usage information for an owner from the evolu_usage table. */
export const getOwnerUsage =
  (deps: SqliteDep) =>
  (
    ownerIdBytes: OwnerIdBytes,
    initialTimestamp: TimestampBytes,
  ): Result<
    {
      storedBytes: NonNegativeInt | null;
      firstTimestamp: TimestampBytes;
      lastTimestamp: TimestampBytes;
    },
    SqliteError
  > => {
    const result = deps.sqlite.exec<{
      storedBytes: NonNegativeInt;
      firstTimestamp: TimestampBytes | null;
      lastTimestamp: TimestampBytes | null;
    }>(sql`
      select storedBytes, firstTimestamp, lastTimestamp
      from evolu_usage
      where ownerId = ${ownerIdBytes};
    `);
    if (!result.ok) return result;

    if (!isNonEmptyArray(result.value.rows)) {
      return ok({
        storedBytes: null,
        firstTimestamp: initialTimestamp,
        lastTimestamp: initialTimestamp,
      });
    }

    const row = firstInArray(result.value.rows);
    assert(row.firstTimestamp, "not null");
    assert(row.lastTimestamp, "not null");

    return ok({
      storedBytes: row.storedBytes,
      firstTimestamp: row.firstTimestamp,
      lastTimestamp: row.lastTimestamp,
    });
  };

/**
 * Updates timestamp bounds in evolu_usage table.
 *
 * Used by both relay and client to maintain firstTimestamp/lastTimestamp after
 * processing messages.
 */
export const updateOwnerUsage =
  (deps: SqliteDep) =>
  (
    ownerIdBytes: OwnerIdBytes,
    storedBytes: PositiveInt,
    firstTimestamp: TimestampBytes,
    lastTimestamp: TimestampBytes,
  ): Result<void, SqliteError> => {
    const result = deps.sqlite.exec(sql`
      insert into evolu_usage
        ("ownerId", "storedBytes", "firstTimestamp", "lastTimestamp")
      values
        (${ownerIdBytes}, ${storedBytes}, ${firstTimestamp}, ${lastTimestamp})
      on conflict (ownerId) do update
        set
          storedBytes = ${storedBytes},
          firstTimestamp = ${firstTimestamp},
          lastTimestamp = ${lastTimestamp};
    `);
    if (!result.ok) return result;
    return ok();
  };
