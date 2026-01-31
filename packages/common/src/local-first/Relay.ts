/**
 * Relay server for data synchronization.
 *
 * @module
 */

import {
  filterArray,
  firstInArray,
  isNonEmptyArray,
  mapArray,
} from "../Array.js";
import type { TimingSafeEqualDep } from "../Crypto.js";
import { createInstances } from "../Instances.js";
import type { MaybeAsync } from "../OldTask.js";
import { isAsync } from "../OldTask.js";
import type { Result } from "../Result.js";
import { err, ok } from "../Result.js";
import type { SqliteDep, SqliteError } from "../Sqlite.js";
import { sql } from "../Sqlite.js";
import type { Mutex } from "../Task.js";
import { createMutex } from "../Task.js";
import { PositiveInt, SimpleName } from "../Type.js";
import {
  OwnerId,
  ownerIdBytesToOwnerId,
  // OwnerTransport,
  OwnerWriteKey,
} from "./Owner.js";
import type {
  CreateBaseSqliteStorageConfig,
  EncryptedDbChange,
  SqliteStorageDeps,
  Storage,
  StorageConfig,
  StorageQuotaError,
} from "./Storage.js";
import {
  createBaseSqliteStorage,
  getOwnerUsage,
  getTimestampInsertStrategy,
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
  readonly name?: SimpleName;

  /**
   * Optional callback to check if an {@link OwnerId} is allowed to access the
   * relay. If this callback is not provided, all owners are allowed.
   *
   * The callback receives the {@link OwnerId} and returns a {@link MaybeAsync}
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
  readonly isOwnerAllowed?: (ownerId: OwnerId) => MaybeAsync<boolean>;
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
  (config: CreateBaseSqliteStorageConfig): Storage => {
    const sqliteStorageBase = createBaseSqliteStorage(deps)(config);

    /** Mutex instances cached per OwnerId to prevent concurrent writes. */
    const ownerMutexes = createInstances<OwnerId, Mutex>();

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
        if (!selectWriteKey.ok) {
          config.onStorageError(selectWriteKey.error);
          return false;
        }

        const { rows } = selectWriteKey.value;

        if (isNonEmptyArray(rows)) {
          return deps.timingSafeEqual(rows[0].writeKey, writeKey);
        }

        const insertWriteKey = deps.sqlite.exec(sql`
          insert into evolu_writeKey (ownerId, writeKey)
          values (${ownerId}, ${writeKey});
        `);
        if (!insertWriteKey.ok) {
          config.onStorageError(insertWriteKey.error);
          return false;
        }

        return true;
      },

      setWriteKey: (ownerId, writeKey) => {
        const upsertWriteKey = deps.sqlite.exec(sql`
          insert into evolu_writeKey (ownerId, writeKey)
          values (${ownerId}, ${writeKey})
          on conflict (ownerId) do update
            set writeKey = excluded.writeKey;
        `);
        if (!upsertWriteKey.ok) {
          config.onStorageError(upsertWriteKey.error);
          return false;
        }

        return true;
      },

      writeMessages: (ownerIdBytes, messages) => async (run) => {
        const ownerId = ownerIdBytesToOwnerId(ownerIdBytes);
        const messagesWithTimestampBytes = mapArray(messages, (m) => ({
          timestamp: timestampToTimestampBytes(m.timestamp),
          change: m.change,
        }));

        const result = await run(
          ownerMutexes
            .ensure(ownerId, createMutex)
            .withLock(
              async (): Promise<
                Result<void, SqliteError | StorageQuotaError>
              > => {
                const existingTimestampsResult =
                  sqliteStorageBase.getExistingTimestamps(
                    ownerIdBytes,
                    mapArray(messagesWithTimestampBytes, (m) => m.timestamp),
                  );
                if (!existingTimestampsResult.ok)
                  return existingTimestampsResult;

                const existingTimestampsSet = new Set(
                  existingTimestampsResult.value.map((t) => t.toString()),
                );
                const newMessages = filterArray(
                  messagesWithTimestampBytes,
                  (m) => !existingTimestampsSet.has(m.timestamp.toString()),
                );

                // Nothing to write
                if (!isNonEmptyArray(newMessages)) {
                  return ok();
                }

                const usage = getOwnerUsage(deps)(
                  ownerIdBytes,
                  firstInArray(newMessages).timestamp,
                );
                if (!usage.ok) return usage;

                const { storedBytes } = usage.value;

                const incomingBytes = newMessages.reduce(
                  (sum, m) => sum + m.change.length,
                  0,
                );
                const newStoredBytes = PositiveInt.orThrow(
                  (storedBytes ?? 0) + incomingBytes,
                );

                const quotaResult = config.isOwnerWithinQuota(
                  ownerId,
                  newStoredBytes,
                );
                const isWithinQuota = isAsync(quotaResult)
                  ? await quotaResult
                  : quotaResult;
                if (!isWithinQuota) {
                  return err({ type: "StorageQuotaError", ownerId });
                }

                let { firstTimestamp, lastTimestamp } = usage.value;

                return deps.sqlite.transaction(() => {
                  for (const { timestamp, change } of newMessages) {
                    let strategy;
                    [strategy, firstTimestamp, lastTimestamp] =
                      getTimestampInsertStrategy(
                        timestamp,
                        firstTimestamp,
                        lastTimestamp,
                      );

                    {
                      const result = sqliteStorageBase.insertTimestamp(
                        ownerIdBytes,
                        timestamp,
                        strategy,
                      );
                      if (!result.ok) return result;
                    }

                    {
                      const result = deps.sqlite.exec(sql`
                        insert into evolu_message
                          ("ownerId", "timestamp", "change")
                        values (${ownerIdBytes}, ${timestamp}, ${change})
                        on conflict do nothing;
                      `);
                      if (!result.ok) return result;
                    }
                  }

                  return updateOwnerUsage(deps)(
                    ownerIdBytes,
                    newStoredBytes,
                    firstTimestamp,
                    lastTimestamp,
                  );
                });
              },
            ),
        );

        if (!result.ok && result.error.type !== "AbortError") {
          switch (result.error.type) {
            case "SqliteError":
              config.onStorageError(result.error);
              return err({ type: "StorageWriteError", ownerId });
            case "StorageQuotaError":
              return err({ type: "StorageQuotaError", ownerId });
          }
        }

        return ok();
      },

      readDbChange: (ownerId, timestamp) => {
        const result = deps.sqlite.exec<{
          change: EncryptedDbChange;
        }>(sql`
          select "change"
          from evolu_message
          where "ownerId" = ${ownerId} and "timestamp" = ${timestamp};
        `);
        if (!result.ok) {
          config.onStorageError(result.error);
          return null;
        }

        return result.value.rows[0]?.change;
      },

      deleteOwner: (ownerId) => {
        const transactionResult = deps.sqlite.transaction(() => {
          const deleteWriteKey = deps.sqlite.exec(sql`
            delete from evolu_writeKey where ownerId = ${ownerId};
          `);
          if (!deleteWriteKey.ok) return deleteWriteKey;

          const deleteMessages = deps.sqlite.exec(sql`
            delete from evolu_message where ownerId = ${ownerId};
          `);
          if (!deleteMessages.ok) return deleteMessages;

          const deleteUsage = deps.sqlite.exec(sql`
            delete from evolu_usage where ownerId = ${ownerId};
          `);
          if (!deleteUsage.ok) return deleteUsage;

          const deleteBaseOwner = sqliteStorageBase.deleteOwner(ownerId);
          if (!deleteBaseOwner) return err(null);

          return ok();
        });

        if (!transactionResult.ok) {
          if (transactionResult.error)
            config.onStorageError(transactionResult.error);
          return false;
        }

        return true;
      },
    };
  };

export const createRelayStorageTables = (
  deps: SqliteDep,
): Result<void, SqliteError> => {
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
    const result = deps.sqlite.exec(query);
    if (!result.ok) return result;
  }

  return ok();
};
