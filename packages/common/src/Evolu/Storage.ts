import { sha256 } from "@noble/hashes/sha2";
import { NonEmptyReadonlyArray } from "../Array.js";
import { assert } from "../Assert.js";
import { Brand } from "../Brand.js";
import { decrement } from "../Number.js";
import { RandomDep } from "../Random.js";
import { ok, Result } from "../Result.js";
import { sql, SqliteDep, SqliteError, SqliteValue } from "../Sqlite.js";
import {
  Id,
  Int64String,
  NonNegativeInt,
  object,
  PositiveInt,
  record,
  String,
} from "../Type.js";
import {
  BinaryOwnerId,
  binaryOwnerIdToOwnerId,
  Owner,
  OwnerId,
  WriteKey,
} from "./Owner.js";
import {
  BinaryTimestamp,
  orderBinaryTimestamp,
  Timestamp,
} from "./Timestamp.js";

/**
 * Evolu Storage
 *
 * The protocol using Storage is agnostic to storage implementation details—any
 * storage can be plugged in, as long as it implements this interface.
 * Implementations must handle their own errors; return values only indicates
 * overall success or failure.
 */
export interface Storage {
  readonly getSize: (ownerId: BinaryOwnerId) => NonNegativeInt | null;

  readonly fingerprint: (
    ownerId: BinaryOwnerId,
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
    ownerId: BinaryOwnerId,
    buckets: ReadonlyArray<NonNegativeInt>,
    upperBound?: RangeUpperBound,
  ) => ReadonlyArray<FingerprintRange> | null;

  readonly findLowerBound: (
    ownerId: BinaryOwnerId,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    upperBound: RangeUpperBound,
  ) => NonNegativeInt | null;

  readonly iterate: (
    ownerId: BinaryOwnerId,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    callback: (timestamp: BinaryTimestamp, index: NonNegativeInt) => boolean,
  ) => void;

  /** Validates the {@link WriteKey} for the given {@link Owner}. */
  readonly validateWriteKey: (
    ownerId: BinaryOwnerId,
    writeKey: WriteKey,
  ) => boolean;

  /** Sets the {@link WriteKey} for the given {@link Owner}. */
  readonly setWriteKey: (ownerId: BinaryOwnerId, writeKey: WriteKey) => boolean;

  /** Write encrypted {@link CrdtMessage}s to storage. */
  readonly writeMessages: (
    ownerId: BinaryOwnerId,
    messages: NonEmptyReadonlyArray<EncryptedCrdtMessage>,
  ) => boolean;

  /** Read encrypted {@link DbChange}s from storage. */
  readonly readDbChange: (
    ownerId: BinaryOwnerId,
    timestamp: BinaryTimestamp,
  ) => EncryptedDbChange | null;

  /** Delete all data for the given {@link Owner}. */
  readonly deleteOwner: (ownerId: BinaryOwnerId) => boolean;
}

export interface StorageDep {
  readonly storage: Storage;
}

/**
 * A cryptographic hash used for efficiently comparing collections of
 * {@link BinaryTimestamp}s.
 *
 * It consists of the first {@link fingerprintSize} bytes of the SHA-256 hash of
 * one or more timestamps.
 */
export type Fingerprint = Uint8Array & Brand<"Fingerprint">;

export const fingerprintSize = 12 as NonNegativeInt;

/** A fingerprint of an empty range. */
export const zeroFingerprint = new Uint8Array(fingerprintSize) as Fingerprint;

export interface BaseRange {
  readonly upperBound: RangeUpperBound;
}

/**
 * Union type for Range's upperBound: either a {@link BinaryTimestamp} or
 * {@link InfiniteUpperBound}.
 */
export type RangeUpperBound = BinaryTimestamp | InfiniteUpperBound;

export const InfiniteUpperBound = Symbol("InfiniteUpperBound");
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
  readonly timestamps: ReadonlyArray<BinaryTimestamp>;
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
 * A CRDT message that combines a unique {@link Timestamp} with a
 * {@link DbChange}.
 */
export interface CrdtMessage {
  readonly timestamp: Timestamp;
  readonly change: DbChange;
}

/**
 * A DbChange is a change to a table row. Together with a unique
 * {@link Timestamp}, it forms a {@link CrdtMessage}.
 */
export const DbChange = object({
  table: String,
  id: Id,
  values: record(String, SqliteValue),
});
export type DbChange = typeof DbChange.Type;

/**
 * Common interface for both client and relay SQLite storages.
 *
 * Evolu uses a Skiplist, which leverages SQLite indexes. The core logic is
 * implemented in SQL, so it doesn't have to make roundtrips to the DB.
 *
 * The ideal storage for a Relay should use a similar architecture to
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
export interface SqliteStorageBase {
  readonly insertTimestamp: (
    ownerId: BinaryOwnerId,
    timestamp: BinaryTimestamp,
  ) => Result<void, SqliteError>;

  readonly getSize: Storage["getSize"];
  readonly fingerprint: Storage["fingerprint"];
  readonly fingerprintRanges: Storage["fingerprintRanges"];
  readonly findLowerBound: Storage["findLowerBound"];
  readonly iterate: Storage["iterate"];
  readonly deleteOwner: Storage["deleteOwner"];
}

export interface SqliteStorageBaseDep {
  readonly storage: SqliteStorageBase;
}

export type SqliteStorageDeps = RandomDep & SqliteDep;

export interface CreateSqliteStorageBaseOptions {
  onStorageError: (error: SqliteError) => void;
}

export const createSqliteStorageBase =
  (deps: SqliteStorageDeps) =>
  (
    options: CreateSqliteStorageBaseOptions,
  ): Result<SqliteStorageBase, SqliteError> => {
    const createTablesResult = createTables(deps);
    if (!createTablesResult.ok) return createTablesResult;

    const ownerStats = new Map<
      OwnerId,
      {
        minT: BinaryTimestamp;
        maxT: BinaryTimestamp;
      }
    >();

    return ok({
      insertTimestamp: (ownerId: BinaryOwnerId, timestamp: BinaryTimestamp) => {
        const ownerIdString = binaryOwnerIdToOwnerId(ownerId);
        const level = randomSkiplistLevel(deps);

        let stats = ownerStats.get(ownerIdString);

        if (!stats) {
          const result = deps.sqlite.exec<{
            maxT: BinaryTimestamp | null;
            minT: BinaryTimestamp | null;
          }>(sql.prepared`
            select min(t) as minT, max(t) as maxT
            from evolu_timestamp
            where ownerId = ${ownerId};
          `);
          if (!result.ok) return result;

          stats = {
            minT: result.value.rows[0].minT ?? timestamp,
            maxT: result.value.rows[0].maxT ?? timestamp,
          };
          ownerStats.set(ownerIdString, stats);
        }

        let strategy: InsertTimestampStrategy;

        if (orderBinaryTimestamp(timestamp, stats.maxT) === 1) {
          strategy = "append";
          stats.maxT = timestamp;
        } else if (orderBinaryTimestamp(timestamp, stats.minT) === -1) {
          strategy = "prepend";
          stats.minT = timestamp;
        } else {
          strategy = "insert";
        }

        return insertTimestamp(deps)(ownerId, timestamp, level, strategy);
      },

      getSize: (ownerId) => {
        const size = getSize(deps)(ownerId);
        if (!size.ok) {
          options.onStorageError(size.error);
          return null;
        }
        return size.value;
      },

      fingerprint: (ownerId, begin, end) => {
        assertBeginEnd(begin, end);
        const result = fingerprint(deps)(ownerId, begin, end);
        if (!result.ok) {
          options.onStorageError(result.error);
          return null;
        }
        return result.value;
      },

      fingerprintRanges: (ownerId, buckets, upperBound) => {
        const ranges = fingerprintRanges(deps)(ownerId, buckets, upperBound);
        if (!ranges.ok) {
          options.onStorageError(ranges.error);
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
          options.onStorageError(lowerBound.error);
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
          options.onStorageError(first.error);
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
        const result = deps.sqlite.exec<{ t: BinaryTimestamp }>(sql`
          select t
          from evolu_timestamp
          where ownerId = ${ownerId} and t > ${first.value}
          order by t
          limit ${length - 1};
        `);
        if (!result.ok) {
          options.onStorageError(result.error);
          return;
        }

        for (let i = 0; i < result.value.rows.length; i++) {
          const index = (begin + 1 + i) as NonNegativeInt;
          if (!callback(result.value.rows[i].t, index)) return;
        }
      },

      deleteOwner: (ownerId) => {
        const result = deps.sqlite.exec(sql`
          delete from evolu_timestamp where ownerId = ${ownerId};
        `);
        if (!result.ok) {
          options.onStorageError(result.error);
          return false;
        }
        return true;
      },
    });
  };

const assertBeginEnd = (begin: NonNegativeInt, end: NonNegativeInt) => {
  assert(begin <= end, "invalid begin or end");
};

const createTables = (deps: SqliteDep): Result<void, SqliteError> => {
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
     * - `t` – globally unique binary timestamp
     * - `h1`/`h2` – 12-byte fingerprint split into two integers for fast XOR
     * - `c` – incremental count
     * - `l` – Skiplist level (1 to 32)
     *
     * For scaling or isolation, sharding is possible—each owner can have a
     * separate SQLite database.
     *
     * Maybe we could use an integer surrogate key for ownerId, but it's fast
     * enough even without it.
     */
    sql`
      create table if not exists evolu_timestamp (
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
      create index if not exists evolu_timestamp_index on evolu_timestamp (
        "ownerId",
        "l",
        "t",
        "h1",
        "h2",
        "c"
      );
    `,
  ]) {
    const result = deps.sqlite.exec(query);
    if (!result.ok) return result;
  }
  return ok();
};

type InsertTimestampStrategy = "append" | "prepend" | "insert";

// AFAIK, we can't do both insert and update in one query, and that's probably
// why append is 2x faster than insert. Prepend also has to update parents, but
// it's constantly fast. Insert degrades for reversed (yet LIMIT X magically
// makes it much faster) but it's OK for append. It's probably because it's the
// most complicated SQL, but I believe it can be simplified. If not, we can
// optimize prepending by reversing the incoming timestamps if we detect that
// they will prepend. They are always sorted in ascending order by the
// Protocol.
const insertTimestamp =
  (deps: SqliteDep) =>
  (
    ownerId: BinaryOwnerId,
    timestamp: BinaryTimestamp,
    level: PositiveInt,
    strategy: InsertTimestampStrategy,
  ): Result<void, SqliteError> => {
    const [h1, h2] = fingerprintToSqliteFingerprint(
      binaryTimestampToFingerprint(timestamp),
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

export const binaryTimestampToFingerprint = (
  timestamp: BinaryTimestamp,
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
  return level as PositiveInt;
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
  (ownerId: BinaryOwnerId): Result<NonNegativeInt, SqliteError> => {
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
    ownerId: BinaryOwnerId,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    upperBound: RangeUpperBound,
  ): Result<NonNegativeInt, SqliteError> => {
    assertBeginEnd(begin, end);

    if (end === 0 || begin === end || upperBound === InfiniteUpperBound) {
      return ok(end);
    }

    const result = deps.sqlite.exec<{
      t: BinaryTimestamp;
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
    return ok(decrement(count.value) as NonNegativeInt);
  };

const getTimestampCount =
  (deps: SqliteDep) =>
  (
    ownerId: BinaryOwnerId,
    timestamp: BinaryTimestamp,
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
    ownerId: BinaryOwnerId,
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
    ownerId: BinaryOwnerId,
    buckets: ReadonlyArray<NonNegativeInt>,
    upperBound: RangeUpperBound = InfiniteUpperBound,
  ): Result<ReadonlyArray<FingerprintRange>, SqliteError> => {
    const bucketsJson = JSON.stringify(buckets);

    const result = deps.sqlite.exec<{
      b: BinaryTimestamp | null;
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
    ownerId: BinaryOwnerId,
    index: NonNegativeInt,
  ): Result<BinaryTimestamp, SqliteError> => {
    const result = deps.sqlite.exec<{
      readonly pt: BinaryTimestamp;
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
