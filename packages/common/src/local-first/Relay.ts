/**
 * Relay server for data synchronization.
 *
 * @module
 */

import {
  dedupeArray,
  filterArray,
  firstInArray,
  isNonEmptyArray,
  mapArray,
} from "../Array.js";
import { assert } from "../Assert.js";
import type { TimingSafeEqualDep } from "../Crypto.js";
import { err, ok } from "../Result.js";
import type { SqliteDep } from "../Sqlite.js";
import { sql } from "../Sqlite.js";
import { createMutexByKey } from "../Task.js";
import { Name, PositiveInt, uint8ArrayToBase64Url } from "../Type.js";
import { isPromiseLike, type Awaitable } from "../Types.js";
import {
  OwnerId,
  ownerIdBytesToOwnerId,
  // OwnerTransport,
  OwnerWriteKey,
} from "./Owner.js";
import type {
  EncryptedDbChange,
  SqliteStorageDeps,
  Storage,
  StorageConfig,
  StorageQuotaError,
} from "./Storage.js";
import {
  createBaseSqliteStorage,
  getTimestampInsertStrategy,
  readOwnerUsageOrDefault,
  updateOwnerUsage,
} from "./Storage.js";
import { timestampToTimestampBytes } from "./Timestamp.js";

export interface RelayConfig extends StorageConfig {
  /**
   * The relay name.
   *
   * Implementations can use this for identification purposes (e.g., database
   * file name, logging).
   */
  readonly name?: Name;

  /**
   * Optional callback to check if an {@link OwnerId} is allowed to access the
   * relay. If this callback is not provided, all owners are allowed.
   *
   * The callback receives the {@link OwnerId} and returns a {@link Awaitable}
   * boolean: `true` to allow access, or `false` to deny.
   *
   * The callback can be synchronous (for SQLite or in-memory checks) or
   * asynchronous (for calling remote APIs).
   *
   * The callback returns a boolean rather than an error type because error
   * handling and logging are the responsibility of the callback
   * implementation.
   *
   * OwnerId is used rather than short-lived tokens because this only controls
   * relay access, not write permissions. Since all data is encrypted on the
   * relay, OwnerId exposure is safe.
   *
   * Owners specify which relays to connect to via `OwnerTransport`. In
   * WebSocket-based implementations, this check occurs before accepting the
   * connection, with the OwnerId typically extracted from the URL Path (e.g.,
   * `ws://localhost:4000/<ownerId>`). The relay requires the URL to be in the
   * correct format for OwnerId extraction.
   *
   * ### Example
   *
   * ```ts
   * // Client
   * const transport = createOwnerWebSocketTransport({
   *   url: "wss://relay.evolu.dev",
   *   ownerId: owner.id,
   * });
   *
   * const evolu = createEvolu(deps)(Schema, {
   *   transports: [transport],
   * });
   *
   *
   * // Relay
   * isOwnerAllowed: (ownerId) =>
   *   Promise.resolve(ownerId === "6jy_2F4RT5qqeLgJ14_dnQ"),
   * ```
   */
  readonly isOwnerAllowed?: (ownerId: OwnerId) => Awaitable<boolean>;
}

/**
 * A completely interchangeable server for syncing and backing up encrypted data
 * between Evolu clients.
 *
 * Unlike traditional servers, relays are blind by design—they transmit
 * encrypted data without understanding its shape or meaning. This enables true
 * decentralization and infinite horizontal scalability with minimal
 * infrastructure.
 */
export interface Relay extends AsyncDisposable {}

export const createRelaySqliteStorage =
  (deps: SqliteStorageDeps & TimingSafeEqualDep) =>
  (config: StorageConfig): Storage => {
    const sqliteStorageBase = createBaseSqliteStorage(deps);

    /** Mutex keyed by OwnerId to prevent concurrent writes. */
    const mutexByOwnerId = createMutexByKey<OwnerId>();

    return {
      ...sqliteStorageBase,

      /**
       * Lazily authorizes the initiator's {@link OwnerWriteKey} for the given
       * {@link OwnerId}.
       *
       * - If the {@link OwnerId} does not exist, it is created and associated with
       *   the provided write key.
       * - If the {@link OwnerId} exists, the provided write key is compared to the
       *   stored key.
       */
      validateWriteKey: (ownerId, writeKey) => {
        const selectWriteKey = deps.sqlite.exec<{ writeKey: OwnerWriteKey }>(
          sql`
            select writeKey
            from evolu_writeKey
            where ownerId = ${ownerId};
          `,
        );
        const { rows } = selectWriteKey;

        if (isNonEmptyArray(rows)) {
          return deps.timingSafeEqual(rows[0].writeKey, writeKey);
        }

        deps.sqlite.exec(sql`
          insert into evolu_writeKey (ownerId, writeKey)
          values (${ownerId}, ${writeKey});
        `);

        return true;
      },

      setWriteKey: (ownerId, writeKey) => {
        deps.sqlite.exec(sql`
          insert into evolu_writeKey (ownerId, writeKey)
          values (${ownerId}, ${writeKey})
          on conflict (ownerId) do update
            set writeKey = excluded.writeKey;
        `);
      },

      writeMessages: (ownerIdBytes, messages) => async (run) => {
        const ownerId = ownerIdBytesToOwnerId(ownerIdBytes);
        const uniqueMessagesWithTimestampBytes = dedupeArray(
          mapArray(messages, (m) => ({
            timestamp: timestampToTimestampBytes(m.timestamp),
            change: m.change,
          })),
          (message) => uint8ArrayToBase64Url(message.timestamp),
        );

        return run(
          mutexByOwnerId.withLock(ownerId, async () => {
            const existingTimestampsResult =
              sqliteStorageBase.getExistingTimestamps(
                ownerIdBytes,
                mapArray(uniqueMessagesWithTimestampBytes, (m) => m.timestamp),
              );

            const existingTimestampKeys = new Set(
              mapArray(existingTimestampsResult, uint8ArrayToBase64Url),
            );
            const newMessages = filterArray(
              uniqueMessagesWithTimestampBytes,
              (message) =>
                !existingTimestampKeys.has(
                  uint8ArrayToBase64Url(message.timestamp),
                ),
            );

            // Nothing to write
            if (!isNonEmptyArray(newMessages)) {
              return ok();
            }

            const usage = readOwnerUsageOrDefault(deps)(
              ownerIdBytes,
              firstInArray(newMessages).timestamp,
            );

            const incomingBytes = newMessages.reduce(
              (sum, m) => sum + m.change.length,
              0,
            );
            const newStoredBytes = PositiveInt.orThrow(
              (usage.storedBytes ?? 0) + incomingBytes,
            );

            const quotaResult = config.isOwnerWithinQuota(
              ownerId,
              newStoredBytes,
            );
            const isWithinQuota = isPromiseLike(quotaResult)
              ? await quotaResult
              : quotaResult;
            if (!isWithinQuota) {
              return err<StorageQuotaError>({
                type: "StorageQuotaError",
                ownerId,
              });
            }

            let { firstTimestamp, lastTimestamp } = usage;

            return deps.sqlite.transaction(() => {
              for (const { timestamp, change } of newMessages) {
                let strategy;
                [strategy, firstTimestamp, lastTimestamp] =
                  getTimestampInsertStrategy(
                    timestamp,
                    firstTimestamp,
                    lastTimestamp,
                  );

                sqliteStorageBase.insertTimestamp(
                  ownerIdBytes,
                  timestamp,
                  strategy,
                );

                deps.sqlite.exec(sql`
                  insert into evolu_message
                    ("ownerId", "timestamp", "change")
                  values (${ownerIdBytes}, ${timestamp}, ${change})
                  on conflict do nothing;
                `);
              }

              updateOwnerUsage(deps)(
                ownerIdBytes,
                newStoredBytes,
                firstTimestamp,
                lastTimestamp,
              );

              return ok();
            });
          }),
        );
      },

      readDbChange: (ownerId, timestamp) => {
        const result = deps.sqlite.exec<{
          change: EncryptedDbChange;
        }>(sql`
          select "change"
          from evolu_message
          where "ownerId" = ${ownerId} and "timestamp" = ${timestamp};
        `);

        const row = result.rows[0];
        assert(row, "Every timestamp must have a change");
        return row.change;
      },

      deleteOwner: (ownerId) => {
        deps.sqlite.transaction(() => {
          deps.sqlite.exec(sql`
            delete from evolu_writeKey where ownerId = ${ownerId};
          `);

          deps.sqlite.exec(sql`
            delete from evolu_message where ownerId = ${ownerId};
          `);

          deps.sqlite.exec(sql`
            delete from evolu_usage where ownerId = ${ownerId};
          `);

          sqliteStorageBase.deleteOwner(ownerId);

          return ok();
        });
      },
    };
  };

export const createRelayStorageTables = (deps: SqliteDep): void => {
  for (const query of [
    sql`
      create table evolu_writeKey (
        "ownerId" blob not null,
        "writeKey" blob not null,
        primary key ("ownerId")
      )
      strict;
    `,

    sql`
      create table evolu_message (
        "ownerId" blob not null,
        "timestamp" blob not null,
        "change" blob not null,
        primary key ("ownerId", "timestamp")
      )
      strict;
    `,
  ]) {
    deps.sqlite.exec(query);
  }
};
