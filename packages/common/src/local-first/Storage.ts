/**
 * Encrypted storage layer for local-first data.
 *
 * @module
 */

import { sha256 } from "@noble/hashes/sha2.js";
import type { NonEmptyReadonlyArray } from "../Array.js";
import { firstInArray, isNonEmptyArray } from "../Array.js";
import { assert } from "../Assert.js";
import type { Brand } from "../Brand.js";
import { concatBytes } from "../Buffer.js";
import { decrement } from "../Number.js";
import type { RandomDep } from "../Random.js";
import { err, ok } from "../Result.js";
import type { SqliteDep } from "../Sqlite.js";
import { sql, SqliteValue } from "../Sqlite.js";
import type { Task } from "../Task.js";
import { Millis } from "../Time.js";
import type { InferType, Int64String, Typed, TypeError } from "../Type.js";
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
import type { Awaitable } from "../Types.js";
import type { Owner, OwnerError, OwnerIdBytes } from "./Owner.js";
import { OwnerId, OwnerWriteKey } from "./Owner.js";
import { systemColumnsWithId } from "./Schema.js";
import {
  createTimestamp,
  orderTimestampBytes,
  Timestamp,
  TimestampBytes,
} from "./Timestamp.js";

export interface StorageConfig {
  /**
   * Callback called before an attempt to write, to check if an {@link OwnerId}
   * has sufficient quota for the write.
   *
   * The callback receives the {@link OwnerId} and the total bytes that would be
   * stored after the write (current stored bytes plus incoming bytes), and
   * returns a {@link Awaitable} boolean: `true` to allow the write, or `false`
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
  ) => Awaitable<boolean>;
}

/**
 * Evolu Storage.
 *
 * Evolu Protocol is agnostic to storage implementation—any storage can be
 * plugged in, as long as it implements this interface. Implementations must
 * handle their own errors; return values only indicate overall success or
 * failure.
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
  readonly getSize: (ownerId: OwnerIdBytes) => NonNegativeInt;

  readonly fingerprint: (
    ownerId: OwnerIdBytes,
    begin: NonNegativeInt,
    end: NonNegativeInt,
  ) => Fingerprint;

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
  ) => ReadonlyArray<FingerprintRange>;

  readonly findLowerBound: (
    ownerId: OwnerIdBytes,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    upperBound: RangeUpperBound,
  ) => NonNegativeInt;

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
  ) => void;

  /**
   * Write encrypted {@link CrdtMessage}s to storage.
   *
   * Must use a mutex per ownerId to ensure sequential processing and proper
   * protocol logic handling during sync operations.
   */
  readonly writeMessages: (
    ownerIdBytes: OwnerIdBytes,
    messages: NonEmptyReadonlyArray<EncryptedCrdtMessage>,
  ) => Task<void, StorageQuotaError>;

  /** Read encrypted {@link DbChange}s from storage. */
  readonly readDbChange: (
    ownerId: OwnerIdBytes,
    timestamp: TimestampBytes,
  ) => EncryptedDbChange;

  /** Delete all data for the given {@link Owner}. */
  readonly deleteOwner: (ownerId: OwnerIdBytes) => void;
}

export interface StorageDep {
  readonly storage: Storage;
}

/** Error when storage or billing quota is exceeded. */
export interface StorageQuotaError
  extends OwnerError, Typed<"StorageQuotaError"> {}

/**
 * A cryptographic hash used for efficiently comparing collections of
 * {@link TimestampBytes}es.
 *
 * It consists of the first {@link fingerprintSize} bytes of the SHA-256 hash of
 * one or more timestamps.
 */
export type Fingerprint = Uint8Array & Brand<"Fingerprint">;

export const fingerprintSize = /*#__PURE__*/ NonNegativeInt.orThrow(12);

/** A fingerprint of an empty range. */
export const zeroFingerprint = /*#__PURE__*/ new Uint8Array(
  fingerprintSize,
) as Fingerprint;

export interface BaseRange {
  readonly upperBound: RangeUpperBound;
}

/**
 * Union type for Range's upperBound: either a {@link TimestampBytes} or
 * {@link InfiniteUpperBound}.
 */
export type RangeUpperBound = TimestampBytes | InfiniteUpperBound;

export const InfiniteUpperBound = /*#__PURE__*/ Symbol(
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

/** Test helper for creating a simple {@link CrdtMessage}. */
export const testCreateCrdtMessage = (
  id: Id,
  millis: number,
  name: string,
): CrdtMessage => ({
  timestamp: createTimestamp({
    millis: Millis.orThrow(millis),
    counter: 0 as never,
  }),
  change: DbChange.orThrow({
    table: "testTable",
    id,
    values: { name },
    isInsert: true,
    isDelete: false,
  }),
});

export const DbChangeValues = /*#__PURE__*/ record(String, SqliteValue);
export type DbChangeValues = typeof DbChangeValues.Type;

export const ValidDbChangeValues = /*#__PURE__*/ brand(
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
export const DbChange = /*#__PURE__*/ object({
  table: String,
  id: Id,
  values: ValidDbChangeValues,
  isInsert: Boolean,
  isDelete: /*#__PURE__*/ nullOr(Boolean),
});
export interface DbChange extends InferType<typeof DbChange> {}

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
export interface BaseSqliteStorage extends Omit<
  Storage,
  "validateWriteKey" | "setWriteKey" | "writeMessages" | "readDbChange"
> {
  /** Inserts a timestamp for an owner into the skiplist-based storage. */
  readonly insertTimestamp: (
    ownerId: OwnerIdBytes,
    timestamp: TimestampBytes,
    strategy: StorageInsertTimestampStrategy,
  ) => void;

  /**
   * Efficiently checks which timestamps already exist in the database using a
   * single CTE query instead of N individual queries.
   */
  readonly getExistingTimestamps: (
    ownerIdBytes: OwnerIdBytes,
    timestampsBytes: NonEmptyReadonlyArray<TimestampBytes>,
  ) => ReadonlyArray<TimestampBytes>;
}

export interface BaseSqliteStorageDep {
  readonly baseSqliteStorage: BaseSqliteStorage;
}

export type SqliteStorageDeps = RandomDep & SqliteDep;

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
export const createBaseSqliteStorage = (
  deps: SqliteStorageDeps,
): BaseSqliteStorage => ({
  insertTimestamp: (
    ownerId: OwnerIdBytes,
    timestamp: TimestampBytes,
    strategy: StorageInsertTimestampStrategy,
  ) => {
    const level = randomSkiplistLevel(deps);
    insertTimestamp(deps)(ownerId, timestamp, level, strategy);
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

    return result.rows.map((row) => row.timestampBytes);
  },

  getSize: getSize(deps),

  fingerprint: (ownerId, begin, end) => {
    assertBeginEnd(begin, end);
    return fingerprint(deps)(ownerId, begin, end);
  },

  fingerprintRanges: fingerprintRanges(deps),

  findLowerBound: (ownerId, begin, end, upperBound) =>
    findLowerBound(deps)(ownerId, begin, end, upperBound),

  iterate: (ownerId, begin, end, callback) => {
    assertBeginEnd(begin, end);
    const length = end - begin;
    if (length === 0) return;

    // This is much faster than SQL limit with offset.
    const first = getTimestampByIndex(deps)(ownerId, begin);

    if (!callback(first, begin)) return;
    if (length === 1) return;

    /**
     * TODO: In rare cases, we might overfetch a lot of rows here, but we don't
     * have real usage numbers yet. Fetching one row at a time would probably be
     * slower in almost all cases. In the future, we should fetch in chunks
     * (e.g., 1,000 rows at a time). For now, consider logging unused rows to
     * gather data and calculate an average, then use that information to
     * determine an optimal chunk size. Before implementing chunking, be sure to
     * run performance tests (including fetching one by one).
     */
    const result = deps.sqlite.exec<{ t: TimestampBytes }>(sql`
      select t
      from evolu_timestamp
      where ownerId = ${ownerId} and t > ${first}
      order by t
      limit ${length - 1};
    `);

    for (let i = 0; i < result.rows.length; i++) {
      const index = NonNegativeInt.orThrow(begin + 1 + i);
      if (!callback(result.rows[i].t, index)) return;
    }
  },

  deleteOwner: (ownerId) => {
    deps.sqlite.exec(sql`
      delete from evolu_timestamp where ownerId = ${ownerId};
    `);
  },
});

const assertBeginEnd = (begin: NonNegativeInt, end: NonNegativeInt) => {
  assert(begin <= end, "invalid begin or end");
};

export const createBaseSqliteStorageTables = (deps: SqliteDep): void => {
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
    deps.sqlite.exec(query);
  }
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
 * Append derives the new node's metadata in its insertion statement. Prepend
 * and insert require a second statement to update existing Skiplist ancestors.
 *
 * A non-level-1 append summarizes the suffix after the nearest preceding node
 * at the same or a higher level. A reverse primary-key scan finds that boundary
 * directly, so metadata traversal starts one level below the new node instead
 * of descending from the maximum level.
 *
 * Append is the fastest strategy because level 1, which occurs 75% of the time,
 * needs only the insertion, and promoted nodes derive their metadata without
 * updating existing nodes. Prepend inserts first, then updates one successor at
 * each relevant higher level through predictable edge searches. Insert is the
 * slowest because an arbitrary interior position requires predecessor metadata
 * for the new node and successor discovery to update existing ancestors. All
 * traversals use bounded index ranges, but insert necessarily performs the most
 * Skiplist work.
 *
 * SQLite does not support `LATERAL` subqueries. Recursive traversals therefore
 * alternate between finding the next timestamp and loading that row by primary
 * key instead of repeating the same correlated range lookup for every column.
 *
 * Inserts are idempotent to support direct calls and message replay. `on
 * conflict do nothing` makes a duplicate insertion a no-op, and `changes() > 0`
 * ensures ancestor metadata is updated only when the preceding insertion added
 * a timestamp.
 */
const insertTimestamp =
  (deps: SqliteDep) =>
  (
    ownerId: OwnerIdBytes,
    timestamp: TimestampBytes,
    level: PositiveInt,
    strategy: StorageInsertTimestampStrategy,
  ): void => {
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
                      ${level} - 1,
                      ifnull(
                        (
                          select t
                          from evolu_timestamp
                          where
                            ownerId = ${ownerId}
                            and l >= ${level}
                            and t < ${timestamp}
                          order by t desc
                          limit 1
                        ),
                        zeroblob(0)
                      ),
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
                        node.t is not null,
                        (ih1 | node.h1) - (ih1 & node.h1),
                        ih1
                      ),
                      iif(
                        node.t is not null,
                        (ih2 | node.h2) - (ih2 & node.h2),
                        ih2
                      ),
                      iif(node.t is not null, ic + node.c, ic)
                    from
                      fc
                      left join evolu_timestamp as node
                        on b and node.ownerId = ${ownerId} and node.t = nt
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
              fp(b, cl, pt, nt, h1, h2) as (
                select
                  0,
                  (select ml from ml),
                  null,
                  null,
                  null,
                  null
                union all
                select
                  not fp.b,
                  iif(fp.b, fp.cl - 1, fp.cl),
                  iif(
                    fp.b,
                    iif(
                      fp.nt is not null and (fp.pt is null or fp.nt < fp.pt),
                      fp.nt,
                      fp.pt
                    ),
                    fp.pt
                  ),
                  iif(
                    fp.b,
                    null,
                    (
                      select t
                      from evolu_timestamp
                      where
                        ownerId = ${ownerId}
                        and l = fp.cl
                        and t > ${timestamp}
                      order by t
                      limit 1
                    )
                  ),
                  iif(
                    fp.b
                    and fp.nt is not null
                    and (fp.pt is null or fp.nt < fp.pt),
                    node.h1,
                    null
                  ),
                  iif(
                    fp.b
                    and fp.nt is not null
                    and (fp.pt is null or fp.nt < fp.pt),
                    node.h2,
                    null
                  )
                from
                  fp
                  left join evolu_timestamp as node
                    on fp.b and node.ownerId = ${ownerId} and node.t = fp.nt
                where fp.cl > ${level}
              ),
              u(t, h1, h2) as (
                select
                  pt,
                  (${h1} | h1) - (${h1} & h1),
                  (${h2} | h2) - (${h2} & h2)
                from fp
                where h1 is not null and pt is not null
                order by pt
                limit ${sql.raw(skiplistMaxLevel.toString())}
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

                sql.prepared`
                  with
                    p(l, t, pt) as (
                      select
                        (
                          select max(l) + 1
                          from evolu_timestamp
                          where ownerId = ${ownerId}
                        ),
                        X'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
                        X'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
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
                              and t < p.t
                            order by t
                            limit 1
                          ),
                          p.t
                        ),
                        p.t
                      from p
                      where p.l > 2
                      limit ${sql.raw(skiplistMaxLevel.toString())}
                    ),
                    u(t, h1, h2) as (
                      select
                        p.t,
                        (${h1} | node.h1) - (${h1} & node.h1),
                        (${h2} | node.h2) - (${h2} & node.h2)
                      from
                        p
                        join evolu_timestamp as node
                          on node.ownerId = ${ownerId} and node.t = p.t
                      where p.t is not p.pt
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
                    -- Alternate range discovery and primary-key loading.
                    n(b, l, t, nt, h1, h2, c) as (
                      select
                        1,
                        (
                          select max(l) + 1
                          from evolu_timestamp
                          where ownerId = ${ownerId}
                        ),
                        X'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
                        null,
                        null,
                        null,
                        null
                      union all
                      select
                        not n.b,
                        iif(n.b, n.l - 1, n.l),
                        iif(n.b, n.t, ifnull(n.nt, n.t)),
                        iif(
                          n.b,
                          (
                            select t
                            from evolu_timestamp
                            where
                              ownerId = ${ownerId}
                              and l = n.l - 1
                              and t > ${timestamp}
                              and t < n.t
                            order by t
                            limit 1
                          ),
                          null
                        ),
                        iif(not n.b and n.nt is not null, node.h1, null),
                        iif(not n.b and n.nt is not null, node.h2, null),
                        iif(not n.b and n.nt is not null, node.c, null)
                      from
                        n
                        left join evolu_timestamp as node
                          on not n.b
                          and node.ownerId = ${ownerId}
                          and node.t = n.nt
                      where iif(n.b, n.l - 1 > (select min(l) from c4), 1)
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
                      where b
                      group by t
                      limit ${sql.raw(skiplistMaxLevel.toString())}
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
      deps.sqlite.exec(query);
    }
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
 * Maximum Skiplist level and exact upper bound for planner-sensitive CTEs.
 *
 * The three CTEs bounded by this value feed `update ... from` statements in the
 * prepend and insert paths. Each emits at most one row per Skiplist level.
 * Without a known integer `limit`, SQLite estimates a recursive CTE at about
 * 2^32 rows and scans every timestamp for the owner instead of scanning the CTE
 * and looking up each timestamp by primary key.
 *
 * Evolu does not run SQLite's `ANALYZE` command or `PRAGMA optimize`. `ANALYZE`
 * samples database contents and stores statistics in tables such as
 * `sqlite_stat1`; without those statistics, the query planner uses default
 * estimates. With those default estimates, 10 is the planner crossover.
 * Collected statistics or a planner change can move it because this is
 * undocumented cost model behavior. Do not enable planner statistics without
 * benchmarking every storage workload and verifying its query plans on a
 * representative populated database.
 *
 * The queries inject this value with `sql.raw`. SQLite versions before 3.47
 * cannot derive the estimate from a bound parameter. Newer versions require
 * QPSG to be disabled and invalidate the query plan whenever that parameter is
 * bound, which would recompile these hot cached statements on every execution.
 *
 * Because the limit can emit at most one row per Skiplist level, the Skiplist
 * is capped at the same value to prevent updates from being truncated. With
 * {@link skiplistProbability} 0.25, level 10 occurs once per 4^9 rows on
 * average, keeping the highest-level scan small for millions of rows.
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
  (ownerId: OwnerIdBytes): NonNegativeInt => {
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

    return result.rows[0].size;
  };

const findLowerBound =
  (deps: SqliteDep) =>
  (
    ownerId: OwnerIdBytes,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    upperBound: RangeUpperBound,
  ): NonNegativeInt => {
    assertBeginEnd(begin, end);

    if (end === 0 || begin === end || upperBound === InfiniteUpperBound) {
      return end;
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

    if (result.rows.length === 0) {
      return end;
    }

    const count = getTimestampCount(deps)(ownerId, result.rows[0].t);
    // `decrement` converts a count to an index.
    return NonNegativeInt.orThrow(decrement(count));
  };

const getTimestampCount =
  (deps: SqliteDep) =>
  (ownerId: OwnerIdBytes, timestamp: TimestampBytes): PositiveInt => {
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

    return result.rows[0].count;
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
  ): Fingerprint => {
    // There is no need to fingerprint an empty range.
    if (end - begin === 0) {
      return zeroFingerprint;
    }

    if (begin === 0) {
      return fingerprintRanges(deps)(ownerId, [end])[0].fingerprint;
    }

    // We should have a param to skip the first result.
    return fingerprintRanges(deps)(ownerId, [begin, end])[1].fingerprint;
  };

/**
 * Computes all RBSR fingerprint buckets in one SQL statement.
 *
 * Continuous ranges reduce the required traversals from 32 to 16. Each
 * recursive step first finds the next timestamp, then loads its count and
 * fingerprint by primary key in the following step. This two-phase traversal
 * avoids repeated correlated range lookups because SQLite does not support
 * `LATERAL` subqueries.
 *
 * See https://logperiodic.com/rbsr.html#tree-friendly-functions.
 */
const fingerprintRanges =
  (deps: SqliteDep) =>
  (
    ownerId: OwnerIdBytes,
    buckets: ReadonlyArray<NonNegativeInt>,
    upperBound: RangeUpperBound = InfiniteUpperBound,
  ): ReadonlyArray<FingerprintRange> => {
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
        c1(c, b, nt, ft, tt, dl, ic, h1, h2) as (
          select
            c,
            1,
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
            c1.c,
            not c1.b,
            iif(
              c1.b,
              (
                select t
                from evolu_timestamp
                where
                  l = c1.dl
                  and t > c1.ft
                  and t < c1.tt
                  and ownerId = ${ownerId}
                order by t
                limit 1
              ),
              null
            ),
            iif(c1.b, c1.ft, iif(c1.ic + node.c <= c1.c, c1.nt, c1.ft)),
            iif(
              c1.b,
              c1.tt,
              iif(c1.ic + node.c <= c1.c, c1.tt, ifnull(c1.nt, c1.tt))
            ),
            iif(c1.b, c1.dl, iif(c1.ic + node.c <= c1.c, c1.dl, c1.dl - 1)),
            iif(
              c1.b,
              c1.ic,
              iif(c1.ic + node.c <= c1.c, c1.ic + node.c, c1.ic)
            ),
            iif(
              c1.b,
              c1.h1,
              iif(c1.ic + node.c <= c1.c, ${x("c1.h1", "node.h1")}, c1.h1)
            ),
            iif(
              c1.b,
              c1.h2,
              iif(c1.ic + node.c <= c1.c, ${x("c1.h2", "node.h2")}, c1.h2)
            )
          from
            c1
            left join evolu_timestamp as node
              on not c1.b and node.ownerId = ${ownerId} and node.t = c1.nt
          where iif(c1.b, 1, c1.ic != c1.c)
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

    const fingerprintRanges = result.rows.map(
      (row, i, arr): FingerprintRange => ({
        type: RangeType.Fingerprint,
        upperBound: i === arr.length - 1 ? upperBound : row.b!,
        fingerprint: sqliteFingerprintToFingerprint([
          row.h1,
          row.h2,
        ] as SqliteFingerprint),
      }),
    );

    return fingerprintRanges;
  };

// XOR in SQLite
const x = (a: string, b: string) => sql.raw(`(${a} | ${b}) - (${a} & ${b})`);

export const getTimestampByIndex =
  (deps: SqliteDep) =>
  (ownerId: OwnerIdBytes, index: NonNegativeInt): TimestampBytes => {
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

    return result.rows[0].pt;
  };

/** Reads owner usage from SQLite and returns default bounds when absent. */
export const readOwnerUsageOrDefault =
  (deps: SqliteDep) =>
  (
    ownerIdBytes: OwnerIdBytes,
    initialTimestamp: TimestampBytes,
  ): {
    readonly storedBytes: NonNegativeInt | null;
    readonly firstTimestamp: TimestampBytes;
    readonly lastTimestamp: TimestampBytes;
  } => {
    const result = deps.sqlite.exec<{
      storedBytes: NonNegativeInt;
      firstTimestamp: TimestampBytes | null;
      lastTimestamp: TimestampBytes | null;
    }>(sql`
      select storedBytes, firstTimestamp, lastTimestamp
      from evolu_usage
      where ownerId = ${ownerIdBytes};
    `);

    if (!isNonEmptyArray(result.rows)) {
      return {
        storedBytes: null,
        firstTimestamp: initialTimestamp,
        lastTimestamp: initialTimestamp,
      };
    }

    const row = firstInArray(result.rows);
    assert(row.firstTimestamp, "not null");
    assert(row.lastTimestamp, "not null");

    return {
      storedBytes: row.storedBytes,
      firstTimestamp: row.firstTimestamp,
      lastTimestamp: row.lastTimestamp,
    };
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
  ): void => {
    deps.sqlite.exec(sql`
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
  };
