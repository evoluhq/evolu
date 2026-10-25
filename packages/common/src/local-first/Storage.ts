/**
 * Encrypted storage layer for local-first data.
 *
 * @module
 */

import { sha256 } from "@noble/hashes/sha2.js";
import type { NonEmptyReadonlyArray } from "../Array.ts";
import { firstInArray, isNonEmptyArray } from "../Array.ts";
import { assert, assertNonNullable } from "../Assert.ts";
import type { Brand } from "../Brand.ts";
import { concatByteArrays } from "../Bytes.ts";
import type { UnknownError } from "../Error.ts";
import type { RandomDep } from "../Random.ts";
import { err, ok } from "../Result.ts";
import type { Sqlite, SqliteDep, SqliteDriver } from "../Sqlite.ts";
import { sql, SqliteValue } from "../Sqlite.ts";
import type { Task } from "../Task.ts";
import { Millis } from "../Time.ts";
import {
  Boolean,
  brand,
  Id,
  type InferType,
  NonNegativeInt,
  Null,
  nullOr,
  object,
  type ObjectType,
  PositiveInt,
  record,
  String,
  type Typed,
  type TypeError,
  type UnionType,
} from "../Type.ts";
import type { Awaitable } from "../Types.ts";
import type { Evolu } from "./Evolu.ts";
import type { Owner, OwnerError, OwnerIdBytes, SharedOwner } from "./Owner.ts";
import { OwnerId, OwnerWriteKey } from "./Owner.ts";
import type { ProtocolQuotaError, ProtocolWriteError } from "./Protocol.ts";
import { type SystemColumns, systemColumnsWithId } from "./Schema.ts";
import type { syncStateToOwnerSyncStatus } from "./Shared.ts";
import {
  createTimestamp,
  orderTimestampBytes,
  Timestamp,
  TimestampBytes,
} from "./Timestamp.ts";

/**
 * Configuration for {@link Storage}, such as quota checks.
 *
 * @group Core
 */
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
   * and logging are the responsibility of the callback implementation. It must
   * not throw or reject, because a throw is a defect that shuts the relay down
   * for a supervisor to restart it; a callback calling a remote service catches
   * its failure and returns whether to allow the write.
   *
   * Relay deployments configure this callback. Client applications observe a
   * denied relay write as a {@link ProtocolQuotaError} in the `failure` of that
   * relay's route, which {@link syncStateToOwnerSyncStatus} reports as the
   * owner's `Error` status.
   *
   * ### Example
   *
   * ```ts
   * import {
   *   assertEqual,
   *   createAppOwner,
   *   createOwnerSecret,
   *   createRandomBytes,
   *   PositiveInt,
   * } from "@evolu/common";
   * import type { StorageConfig } from "@evolu/common/local-first";
   *
   * // Create once, persist the mnemonic securely, and restore it on later runs.
   * const appOwner = createAppOwner(
   *   createOwnerSecret({ randomBytes: createRandomBytes() }),
   * );
   * const maxBytes = PositiveInt.orThrow(1024);
   * const relayStorageConfig: StorageConfig = {
   *   isOwnerWithinQuota: (ownerId, requiredBytes) =>
   *     ownerId === appOwner.id && requiredBytes <= maxBytes,
   * };
   *
   * assertEqual(
   *   await relayStorageConfig.isOwnerWithinQuota(
   *     appOwner.id,
   *     PositiveInt.orThrow(2048),
   *   ),
   *   false,
   * );
   * ```
   */
  readonly isOwnerWithinQuota: (
    ownerId: OwnerId,
    requiredBytes: NonNegativeInt,
  ) => Awaitable<boolean>;
}

/**
 * Replica storage used by Evolu's synchronization protocol.
 *
 * Protocol owns message framing, set reconciliation, and sync continuation.
 * Storage owns batch acceptance, persistence, and the timestamp and fingerprint
 * queries used by reconciliation. Protocol functions accept any implementation
 * that satisfies this contract.
 *
 * {@link Storage.writeMessages} returns the {@link StorageWriteMessagesError}
 * that made it store none of a batch. Implementations return it without
 * reporting it; the caller owns reporting. The client protocol forwards these
 * errors unchanged, while the relay protocol maps them to wire error codes.
 *
 * The Storage API is synchronous because SQLite's synchronous API is the
 * fastest way to use SQLite. Synchronous bindings, as Evolu's SQLite drivers
 * are, call SQLite's C API directly with no context switching between the event
 * loop and native code, and no promise microtasks or await overhead.
 *
 * The only exception is {@link Storage.writeMessages}, which is async to allow
 * for async validation logic before writing to storage. The write operation
 * itself remains synchronous.
 *
 * Indexes count an owner's timestamps in order from 0, and none may exceed the
 * owner's size from {@link Storage.getSize}. Sync reads the size once per
 * message and derives every index from it.
 *
 * @group Core
 */
export interface Storage {
  /** Returns the number of the owner's timestamps. */
  readonly getSize: (ownerId: OwnerIdBytes) => NonNegativeInt;

  /**
   * Returns the {@link Fingerprint} of the owner's timestamps from index `begin`
   * up to, but not including, `end`, where `begin` is at most `end`.
   */
  readonly fingerprint: (
    ownerId: OwnerIdBytes,
    begin: NonNegativeInt,
    end: NonNegativeInt,
  ) => Fingerprint;

  /**
   * Computes fingerprints with their upper bounds in one call.
   *
   * Each bucket is the end index of a range that starts at the previous bucket,
   * or at 0 for the first. There is at least one, they never decrease, and none
   * exceeds the owner's size, which only the last may equal: a range's upper
   * bound is the timestamp at its bucket, and the last range's is
   * `upperBound`.
   *
   * This function can be replaced with many fingerprint/findLowerBound calls,
   * but implementations can leverage it for batching and more efficient
   * fingerprint computation.
   */
  readonly fingerprintRanges: (
    ownerId: OwnerIdBytes,
    buckets: NonEmptyReadonlyArray<NonNegativeInt>,
    upperBound?: RangeUpperBound,
  ) => ReadonlyArray<FingerprintRange>;

  /**
   * Returns the index of the owner's first timestamp not below `upperBound`,
   * counted from the owner's first timestamp, or `end` when there is none or
   * `upperBound` is {@link InfiniteUpperBound}.
   *
   * `begin` must be 0 or the result for an earlier bound not above
   * `upperBound`, and `end` the owner's size, so the result lies in [`begin`,
   * `end`]. When `end` is 0 or equals `begin`, the result is `end`. Sync meets
   * this because the protocol rejects range upper bounds that decrease.
   */
  readonly findLowerBound: (
    ownerId: OwnerIdBytes,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    upperBound: RangeUpperBound,
  ) => NonNegativeInt;

  /**
   * Calls `callback` with the owner's timestamps and their indexes from `begin`
   * up to, but not including, `end`, where `begin` is at most `end`, until the
   * callback returns `false`. No timestamp after the one it stops at is read.
   * The callback can read, but must not write, the storage's database, as
   * {@link Sqlite.iterate} requires.
   */
  readonly iterate: (
    ownerId: OwnerIdBytes,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    callback: (timestamp: TimestampBytes, index: NonNegativeInt) => boolean,
  ) => void;

  /**
   * Validates the {@link OwnerWriteKey} for the given {@link Owner}.
   *
   * Returns `true` if the write key is valid, `false` otherwise. A relay logs a
   * throw and answers the request with {@link ProtocolWriteError}.
   */
  readonly validateWriteKey: (
    ownerId: OwnerIdBytes,
    writeKey: OwnerWriteKey,
  ) => boolean;

  /**
   * Write encrypted {@link CrdtMessage}s to storage.
   *
   * Stores none of the messages and returns the cause when the batch cannot be
   * accepted. A client storage that cannot decrypt, verify, or decode a message
   * skips it and stores the rest, as the built-in client storage does, because
   * the peer offers the message again in every round, and rejecting the batch
   * would end each round.
   *
   * Must use a mutex per ownerId to ensure sequential processing and proper
   * protocol logic handling during sync operations.
   */
  readonly writeMessages: (
    ownerIdBytes: OwnerIdBytes,
    messages: NonEmptyReadonlyArray<EncryptedCrdtMessage>,
  ) => Task<void, StorageWriteMessagesError>;

  /**
   * Read encrypted {@link DbChange}s from storage.
   *
   * The returned array must not be modified or reused later, because sync
   * references it until it finishes its answer.
   */
  readonly readDbChange: (
    ownerId: OwnerIdBytes,
    timestamp: TimestampBytes,
  ) => EncryptedDbChange;

  /** Delete all data for the given {@link Owner}. */
  readonly deleteOwner: (ownerId: OwnerIdBytes) => void;
}

/**
 * Dependency wrapper for {@link Storage}.
 *
 * @group Core
 */
export interface StorageDep {
  readonly storage: Storage;
}

/**
 * Error when storage or billing quota is exceeded.
 *
 * @group Core
 */
export interface StorageQuotaError
  extends OwnerError, Typed<"StorageQuotaError"> {}

/**
 * Reasons why {@link Storage.writeMessages} stored none of a batch.
 *
 * The built-in relay storage stores opaque encrypted messages and rejects
 * batches over quota. The built-in client storage decrypts and validates
 * incoming messages before updating its clock and database tables. It skips a
 * message that fails instead of rejecting its batch, and sync state shows it as
 * the route's `skippedError` without ending the sync round, so a message is
 * never a reason to reject a batch. The contract permits quota checks on either
 * side.
 *
 * Both built-in storages return {@link UnknownError} when SQLite fails the
 * write, for example on a full disk, after rolling it back.
 *
 * @group Core
 */
export type StorageWriteMessagesError = StorageQuotaError | UnknownError;

/**
 * A summary of a range of {@link TimestampBytes} for comparing ranges cheaply.
 *
 * It is the XOR of the first {@link fingerprintSize} bytes of the SHA-256 hash
 * of each timestamp in the range, or {@link zeroFingerprint} for an empty
 * range.
 *
 * XOR is linear, so fingerprints are not collision resistant: any 97 timestamps
 * contain a nonempty subset whose fingerprints XOR to zero. Anyone who can
 * write to a relay for an owner, which includes every collaborator of a
 * {@link SharedOwner}, can store timestamps whose fingerprints XOR to the
 * fingerprint of a chosen change. Two ranges that differ only by that change
 * and those timestamps then compare equal, so sync skips them, and the change
 * does not move between that relay and a peer. This was demonstrated end to
 * end, and nothing reports it. {@link Evolu.requestSync} does not heal it,
 * because the next round compares the same fingerprints. In protocol version 1,
 * the only recovery is syncing through a relay that does not hold those
 * timestamps. Binding the count or hashing the result changes every
 * fingerprint, so it needs a new protocol version.
 *
 * A write-key holder can also store a change under a timestamp another device
 * has not used yet, such as a later one with the NodeId of that device's
 * session, because relays accept timestamps from any time. A relay keeps the
 * first change stored for a timestamp, so it does not store the device's change
 * when it arrives, and peers that sync through that relay later get the stored
 * one instead. A new fingerprint does not close this.
 *
 * @group Ranges
 */
export type Fingerprint = Uint8Array & Brand<"Fingerprint">;

/**
 * Number of leading SHA-256 bytes that form a {@link Fingerprint}.
 *
 * @group Ranges
 */
export const fingerprintSize = /*#__PURE__*/ NonNegativeInt.orThrow(12);

/**
 * A fingerprint of an empty range.
 *
 * @group Ranges
 */
export const zeroFingerprint = /*#__PURE__*/ new Uint8Array(
  fingerprintSize,
) as Fingerprint;

/**
 * Common shape of every {@link Range}.
 *
 * @group Ranges
 */
export interface BaseRange {
  readonly upperBound: RangeUpperBound;
}

/**
 * Union type for Range's upperBound: either a {@link TimestampBytes} or
 * {@link InfiniteUpperBound}.
 *
 * @group Ranges
 */
export type RangeUpperBound = TimestampBytes | InfiniteUpperBound;

/**
 * Sentinel {@link RangeUpperBound} for a range without an upper limit.
 *
 * @group Ranges
 */
export const InfiniteUpperBound = /*#__PURE__*/ Symbol(
  "evolu.local-first.Storage.InfiniteUpperBound",
);
/**
 * Type of the {@link InfiniteUpperBound} sentinel.
 *
 * @group Ranges
 */
export type InfiniteUpperBound = typeof InfiniteUpperBound;

/**
 * Numeric tags discriminating {@link Range} variants.
 *
 * @group Ranges
 */
export const RangeType = {
  Fingerprint: 1,
  Skip: 0,
  Timestamps: 2,
} as const;

/**
 * Numeric tag of one {@link Range} variant.
 *
 * @group Ranges
 */
export type RangeType = (typeof RangeType)[keyof typeof RangeType];

/**
 * Range with nothing to reconcile.
 *
 * @group Ranges
 */
export interface SkipRange extends BaseRange {
  readonly type: typeof RangeType.Skip;
}

/**
 * Range summarized by a {@link Fingerprint} for comparison.
 *
 * @group Ranges
 */
export interface FingerprintRange extends BaseRange {
  readonly type: typeof RangeType.Fingerprint;
  readonly fingerprint: Fingerprint;
}

/**
 * Range listing its {@link TimestampBytes} explicitly.
 *
 * @group Ranges
 */
export interface TimestampsRange extends BaseRange {
  readonly type: typeof RangeType.Timestamps;
  readonly timestamps: ReadonlyArray<TimestampBytes>;
}

/**
 * Range exchanged during sync: {@link SkipRange}, {@link FingerprintRange}, or
 * {@link TimestampsRange}.
 *
 * @group Ranges
 */
export type Range = SkipRange | FingerprintRange | TimestampsRange;

/**
 * An encrypted {@link CrdtMessage}.
 *
 * @group Messages
 */
export interface EncryptedCrdtMessage {
  readonly timestamp: Timestamp;
  readonly change: EncryptedDbChange;
}

/**
 * Encrypted DbChange
 *
 * A 24-byte XChaCha20-Poly1305 nonce, the ciphertext length, and the ciphertext
 * ending with its 16-byte Poly1305 tag, so at least 41 bytes.
 *
 * @group Messages
 */
export type EncryptedDbChange = Uint8Array & Brand<"EncryptedDbChange">;

/**
 * A CRDT message combining a unique {@link Timestamp} with a {@link DbChange}.
 *
 * Used in Evolu's sync protocol to replicate data changes across devices. Evolu
 * operates as a durable queue, providing exactly-once delivery guarantees for
 * reliable synchronization across application restarts and network failures.
 *
 * @group Messages
 */
export interface CrdtMessage {
  readonly timestamp: Timestamp;
  readonly change: DbChange;
}

/**
 * Test helper for creating a simple {@link CrdtMessage}.
 *
 * @group Testing
 */
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

/**
 * Column values of a {@link DbChange}, keyed by column name.
 *
 * @group Messages
 */
export const DbChangeValues = /*#__PURE__*/ record(String, SqliteValue);
export type DbChangeValues = typeof DbChangeValues.Output;

/**
 * Column values that contain no reserved system columns.
 *
 * @group Messages
 */
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

    return ok();
  },
  (error) =>
    `DbChange values contain reserved system columns: ${error.invalidColumns.join(", ")}.`,
);
export type ValidDbChangeValues = typeof ValidDbChangeValues.Output;

/**
 * Error produced when {@link DbChangeValues} contain reserved system columns.
 *
 * @group Messages
 */
export interface ValidDbChangeValuesError extends TypeError<"ValidDbChangeValues"> {
  readonly value: DbChangeValues;
  readonly invalidColumns: ReadonlyArray<string>;
}

/**
 * A DbChange is a change to a table row. Together with a unique
 * {@link Timestamp}, it forms a {@link CrdtMessage}.
 *
 * `isInsert` is set for a change made by an insert or upsert. It is stored and
 * synced with the change, but `createdAt` and `updatedAt` come from the times
 * of a row's changes alone; see {@link SystemColumns}.
 *
 * @group Messages
 */
export const DbChange: ObjectType<{
  readonly table: typeof String;
  readonly id: typeof Id;
  readonly values: typeof ValidDbChangeValues;
  readonly isInsert: typeof Boolean;
  readonly isDelete: UnionType<readonly [typeof Boolean, typeof Null]>;
}> = /*#__PURE__*/ object({
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
 * Evolu uses a Skiplist, which leverages SQLite indexes. It runs in Evolu's
 * SQLite core as SQL functions, such as `evolu_skiplist_insert`, which Evolu's
 * SQLite drivers register on every connection, so a query walks the Skiplist
 * without a roundtrip per node. A {@link SqliteDriver} without them fails with
 * "no such function".
 *
 * The Skiplist data structure is well explained in [this Stack Overflow
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
 * # Scaling
 *
 * The load can be distributed by deploying multiple relays, synchronized with
 * each other, if necessary. One relay should handle hundreds of thousands of
 * users, and when it goes down, nothing happens, because it will be
 * synchronized later.
 *
 * @group SQLite
 */
export interface BaseSqliteStorage extends Omit<
  Storage,
  "validateWriteKey" | "writeMessages" | "readDbChange"
> {
  /**
   * Inserts a timestamp for an owner into the skiplist-based storage.
   *
   * Returns whether the timestamp was new. An existing timestamp is left
   * unchanged.
   *
   * It must run in a transaction, which the caller rolls back when it throws,
   * because a failed insert can leave part of its changes.
   */
  readonly insertTimestamp: (
    ownerId: OwnerIdBytes,
    timestamp: TimestampBytes,
  ) => boolean;

  /**
   * Efficiently checks which timestamps already exist in the database using a
   * single CTE query instead of N individual queries.
   */
  readonly getExistingTimestamps: (
    ownerIdBytes: OwnerIdBytes,
    timestampsBytes: NonEmptyReadonlyArray<TimestampBytes>,
  ) => ReadonlyArray<TimestampBytes>;
}

/**
 * Dependency wrapper for {@link BaseSqliteStorage}.
 *
 * @group SQLite
 */
export interface BaseSqliteStorageDep {
  readonly baseSqliteStorage: BaseSqliteStorage;
}

/**
 * Dependencies required by {@link createBaseSqliteStorage}.
 *
 * @group SQLite
 */
export type SqliteStorageDeps = RandomDep & SqliteDep;

/**
 * Creates a {@link BaseSqliteStorage} implementation.
 *
 * # Stateless Design
 *
 * This implementation is fully stateless - it requires no in-memory state
 * between invocations. Everything it needs is persisted in SQLite, which must
 * have the SQL functions of Evolu's SQLite core, such as
 * `evolu_skiplist_insert`. This makes Evolu Relay suitable for stateless
 * serverless environments, where memory doesn't persist between requests,
 * wherever Evolu's SQLite core runs.
 *
 * @group SQLite
 */
export const createBaseSqliteStorage = (
  deps: SqliteStorageDeps,
): BaseSqliteStorage => ({
  insertTimestamp: (ownerId, timestamp) => {
    const level = randomSkiplistLevel(deps);
    const { rows } = deps.sqlite.prepared<{ inserted: 0 | 1 }>`
      select evolu_skiplist_insert(
        ${ownerId},
        ${timestamp},
        ${level}
      ) as inserted;
    `;
    return rows[0].inserted === 1;
  },

  getExistingTimestamps: (ownerIdBytes, timestampsBytes) => {
    // A batch can hold hundreds of thousands of timestamps, too many to spread
    // into concatBytes.
    const concatenatedTimestamps = concatByteArrays(timestampsBytes);

    // A batch has no known size, so the planner would make the owner's
    // timestamps the outer loop. A cross join keeps the order as written, so
    // each timestamp is looked up by primary key. The condition is in where,
    // not on, because sql-parser-cst, which formats this SQL, rejects cross
    // join ... on and Prettier then leaves the query unformatted
    // (https://github.com/nene/sql-parser-cst/issues/140).
    const result = deps.sqlite.prepared<{
      timestampBytes: TimestampBytes;
    }>`
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
      from split_timestamps s
      cross join evolu_timestamp t
      where t.ownerId = ${ownerIdBytes} and s.timestampBytes = t.t;
    `;

    return result.rows.map((row) => row.timestampBytes);
  },

  getSize: (ownerId) => {
    const { rows } = deps.sqlite.prepared<{ size: NonNegativeInt }>`
      select evolu_skiplist_size(${ownerId}) as size;
    `;
    return rows[0].size;
  },

  fingerprint: (ownerId, begin, end) => {
    assertBeginEnd(begin, end);
    return fingerprint(deps)(ownerId, begin, end);
  },

  fingerprintRanges: fingerprintRanges(deps),

  findLowerBound: (ownerId, begin, end, upperBound) => {
    assertBeginEnd(begin, end);
    if (end === 0 || begin === end || upperBound === InfiniteUpperBound)
      return end;
    const { rows } = deps.sqlite.prepared<{
      lowerBound: NonNegativeInt | null;
    }>`
      select evolu_skiplist_lower_bound(
        ${ownerId},
        ${upperBound}
      ) as lowerBound;
    `;
    return rows[0].lowerBound ?? end;
  },

  iterate: (ownerId, begin, end, callback) => {
    assertBeginEnd(begin, end);
    const length = end - begin;
    if (length === 0) return;

    // This is much faster than SQL limit with offset.
    const first = getTimestampByIndex(deps)(ownerId, begin);

    if (!callback(first, begin)) return;
    if (length === 1) return;

    // The rows are streamed, so SQLite reads none past the one the callback
    // stops at, as sync does once its frame is full.
    let index = begin;
    deps.sqlite.iterate(
      sql`
        select t
        from evolu_timestamp
        where ownerId = ${ownerId} and t > ${first}
        order by t
        limit ${length - 1};
      `,
      (row) => {
        index++;
        return callback(row.t as TimestampBytes, index);
      },
    );
  },

  deleteOwner: (ownerId) => {
    deps.sqlite.exec(sql`
      delete from evolu_timestamp where ownerId = ${ownerId};
    `);
    deps.sqlite.exec(sql`
      delete from evolu_usage where ownerId = ${ownerId};
    `);
  },
});

const assertBeginEnd = (begin: NonNegativeInt, end: NonNegativeInt) => {
  assert(begin <= end, "invalid begin or end");
};

/**
 * Creates the SQLite tables used by {@link BaseSqliteStorage}.
 *
 * @group SQLite
 */
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
      create index evolu_timestamp_index
      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c");
    `,

    /**
     * Creates the `evolu_usage` table for tracking data consumption per owner.
     *
     * Columns:
     *
     * - `ownerId` – OwnerIdBytes (primary key)
     * - `storedBytes` – total bytes stored in database
     * - `firstTimestamp` – the owner's first timestamp
     * - `lastTimestamp` – the owner's last timestamp
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

/**
 * Returns an owner's first and last timestamps with `timestamp` among them, as
 * {@link updateOwnerUsage} stores them.
 *
 * Nothing in this release reads them, but earlier releases choose how to insert
 * a timestamp from them, and a database this release wrote can be opened by an
 * earlier release, such as an old tab after a deploy. Drop them with the next
 * schema migration.
 *
 * @group SQLite
 */
export const extendTimestampBounds = (
  timestamp: TimestampBytes,
  firstTimestamp: TimestampBytes,
  lastTimestamp: TimestampBytes,
): [firstTimestamp: TimestampBytes, lastTimestamp: TimestampBytes] => {
  if (orderTimestampBytes(timestamp, lastTimestamp) === 1)
    return [firstTimestamp, timestamp];
  if (orderTimestampBytes(timestamp, firstTimestamp) === -1)
    return [timestamp, lastTimestamp];
  return [firstTimestamp, lastTimestamp];
};

/**
 * Computes the {@link Fingerprint} of a single timestamp.
 *
 * @group Ranges
 */
export const timestampBytesToFingerprint = (
  timestamp: TimestampBytes,
): Fingerprint => {
  const hash = sha256(timestamp).slice(0, fingerprintSize);
  return hash as Fingerprint;
};

/**
 * Computes a brute-force {@link Fingerprint} from {@link TimestampBytes} values
 * for tests and benchmarks.
 *
 * @group Testing
 */
export const testFingerprintTimestamps = (
  timestamps: ReadonlyArray<TimestampBytes>,
): Fingerprint =>
  timestamps
    .map(timestampBytesToFingerprint)
    .reduce<Fingerprint>(
      (left, right) =>
        Uint8Array.from(
          left,
          (byte, index) => byte ^ right[index],
        ) as Fingerprint,
      zeroFingerprint,
    );

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
 * The highest Skiplist level, which `evolu_skiplist_insert` takes at most. With
 * {@link skiplistProbability} 0.25, level 10 occurs once per 4^9 rows on
 * average, keeping the highest-level scan small for millions of rows.
 */
const skiplistMaxLevel = 10;

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
 * Computes all RBSR fingerprint buckets in one SQL function call, which returns
 * a 12-byte fingerprint and a 16-byte upper bound for each bucket.
 *
 * See https://logperiodic.com/rbsr.html#tree-friendly-functions.
 */
const fingerprintRanges =
  (deps: SqliteDep) =>
  (
    ownerId: OwnerIdBytes,
    buckets: NonEmptyReadonlyArray<NonNegativeInt>,
    upperBound: RangeUpperBound = InfiniteUpperBound,
  ): ReadonlyArray<FingerprintRange> => {
    // Big-endian 8-byte counts, which no driver has to bind as a bigint.
    const encodedBuckets = new Uint8Array(buckets.length * 8);
    const view = new DataView(encodedBuckets.buffer);
    for (const [i, bucket] of buckets.entries())
      view.setBigUint64(i * 8, BigInt(bucket));

    // A bucket past the owner's timestamps fails the call.
    const { rows } = deps.sqlite.prepared<{ ranges: Uint8Array }>`
      select evolu_skiplist_fingerprints(
        ${ownerId},
        ${encodedBuckets}
      ) as ranges;
    `;
    const { ranges } = rows[0];

    return buckets.map((_, i): FingerprintRange => ({
      type: RangeType.Fingerprint,
      upperBound:
        i === buckets.length - 1
          ? upperBound
          : (ranges.slice(i * 28 + 12, i * 28 + 28) as TimestampBytes),
      fingerprint: ranges.slice(i * 28, i * 28 + 12) as Fingerprint,
    }));
  };

/**
 * Reads the timestamp at a position within an owner's ordered timestamps.
 *
 * Throws when `index` is not below the owner's size.
 *
 * @group SQLite
 */
export const getTimestampByIndex =
  (deps: SqliteDep) =>
  (ownerId: OwnerIdBytes, index: NonNegativeInt): TimestampBytes => {
    const { rows } = deps.sqlite.prepared<{ t: TimestampBytes | null }>`
      select evolu_skiplist_timestamp_at(${ownerId}, ${index}) as t;
    `;
    const { t } = rows[0];
    assert(t, "index out of range");
    return t;
  };

/**
 * Reads an owner's usage from SQLite. An owner without usage has null
 * `storedBytes` and `initialTimestamp` as its first and last timestamps.
 *
 * @group SQLite
 */
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
    const result = deps.sqlite.prepared<{
      storedBytes: NonNegativeInt;
      firstTimestamp: TimestampBytes | null;
      lastTimestamp: TimestampBytes | null;
    }>`
      select storedBytes, firstTimestamp, lastTimestamp
      from evolu_usage
      where ownerId = ${ownerIdBytes};
    `;

    if (!isNonEmptyArray(result.rows)) {
      return {
        storedBytes: null,
        firstTimestamp: initialTimestamp,
        lastTimestamp: initialTimestamp,
      };
    }

    const row = firstInArray(result.rows);
    assertNonNullable(row.firstTimestamp);
    assertNonNullable(row.lastTimestamp);

    return {
      storedBytes: row.storedBytes,
      firstTimestamp: row.firstTimestamp,
      lastTimestamp: row.lastTimestamp,
    };
  };

/**
 * Writes an owner's usage to the evolu_usage table, with the first and last
 * timestamps of {@link extendTimestampBounds}.
 *
 * Used by both relay and client after processing messages.
 *
 * @group SQLite
 */
export const updateOwnerUsage =
  (deps: SqliteDep) =>
  (
    ownerIdBytes: OwnerIdBytes,
    storedBytes: NonNegativeInt,
    firstTimestamp: TimestampBytes,
    lastTimestamp: TimestampBytes,
  ): void => {
    deps.sqlite.prepared`
      insert into evolu_usage
        ("ownerId", "storedBytes", "firstTimestamp", "lastTimestamp")
      values
        (${ownerIdBytes}, ${storedBytes}, ${firstTimestamp}, ${lastTimestamp})
      on conflict (ownerId) do update
        set
          storedBytes = ${storedBytes},
          firstTimestamp = ${firstTimestamp},
          lastTimestamp = ${lastTimestamp};
    `;
  };
