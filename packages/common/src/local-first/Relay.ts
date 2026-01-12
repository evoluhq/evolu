import {
  filterArray,
  firstInArray,
  isNonEmptyArray,
  mapArray,
} from "../Array.js";
import { ConsoleConfig, ConsoleDep } from "../Console.js";
import { TimingSafeEqualDep } from "../Crypto.js";
import { Lazy } from "../Function.js";
import { createInstances } from "../Instances.js";
import { err, ok, Result } from "../Result.js";
import { sql, SqliteDep, SqliteError } from "../Sqlite.js";
import { createMutex, isAsync, MaybeAsync, Mutex } from "../OldTask.js";
import { PositiveInt, SimpleName } from "../Type.js";
import {
  OwnerId,
  ownerIdBytesToOwnerId,
  // OwnerTransport,
  OwnerWriteKey,
} from "./Owner.js";
import { ProtocolInvalidDataError } from "./Protocol.js";
import {
  createBaseSqliteStorage,
  CreateBaseSqliteStorageConfig,
  EncryptedDbChange,
  getOwnerUsage,
  getTimestampInsertStrategy,
  SqliteStorageDeps,
  Storage,
  StorageConfig,
  StorageQuotaError,
  updateOwnerUsage,
} from "./Storage.js";
import { timestampToTimestampBytes } from "./Timestamp.js";

export interface RelayConfig extends ConsoleConfig, StorageConfig {
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
export interface Relay extends Disposable {}

export const createRelaySqliteStorage =
  (deps: SqliteStorageDeps & TimingSafeEqualDep) =>
  (config: CreateBaseSqliteStorageConfig): Storage => {
    const sqliteStorageBase = createBaseSqliteStorage(deps)(config);

    /**
     * Mutex instances are cached per OwnerId to prevent concurrent writes for
     * the same owner. Instances are never evicted, causing a memory leak
     * proportional to unique owner count. However, per-instance overhead should
     * be small. Monitor production memory usage to determine if
     * eviction/cleanup is needed.
     */
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

      writeMessages: async (ownerIdBytes, messages) => {
        const ownerId = ownerIdBytesToOwnerId(ownerIdBytes);
        const messagesWithTimestampBytes = mapArray(messages, (m) => ({
          timestamp: timestampToTimestampBytes(m.timestamp),
          change: m.change,
        }));

        const result = await ownerMutexes
          .ensure(ownerId, createMutex)
          .withLock<void, SqliteError | StorageQuotaError>(async () => {
            const existingTimestampsResult =
              sqliteStorageBase.getExistingTimestamps(
                ownerIdBytes,
                mapArray(messagesWithTimestampBytes, (m) => m.timestamp),
              );
            if (!existingTimestampsResult.ok) return existingTimestampsResult;

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

            const result = config.isOwnerWithinQuota(ownerId, newStoredBytes);
            const isWithinQuota = isAsync(result) ? await result : result;
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
                    insert into evolu_message ("ownerId", "timestamp", "change")
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
          })();

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

export interface RelayLogger {
  readonly started: (enableLogging: boolean, port: number) => void;
  readonly storageError: (error: unknown) => void;
  readonly upgradeSocketError: (error: Error) => void;
  readonly invalidOrMissingOwnerIdInUrl: (url: string | undefined) => void;
  readonly unauthorizedOwner: (ownerId: OwnerId) => void;
  readonly connectionEstablished: (totalConnectionCount: number) => void;
  readonly connectionWebSocketError: (error: Error) => void;
  readonly relayOptionSubscribe: (
    ownerId: OwnerId,
    getSubscriberCount: Lazy<number>,
  ) => void;
  readonly relayOptionUnsubscribe: (
    ownerId: OwnerId,
    getSubscriberCount: Lazy<number>,
  ) => void;
  readonly relayOptionBroadcast: (
    ownerId: OwnerId,
    broadcastCount: number,
    subscriberCount: number,
  ) => void;
  readonly messageLength: (messageLength: number) => void;
  readonly applyProtocolMessageAsRelayError: (
    error: ProtocolInvalidDataError,
  ) => void;
  readonly responseLength: (responseLength: number) => void;
  readonly applyProtocolMessageAsRelayUnknownError: (error: unknown) => void;
  readonly connectionClosed: (totalConnectionCount: number) => void;
  readonly shuttingDown: () => void;
  readonly webSocketServerDisposed: () => void;
  readonly httpServerDisposed: () => void;
}

export const createRelayLogger = (deps: ConsoleDep): RelayLogger => ({
  started: (enableLogging, port) => {
    deps.console.enabled = true;
    deps.console.log(`Evolu Relay started on port ${port}`);
    deps.console.enabled = enableLogging;
  },

  storageError: (error) => {
    deps.console.error("[relay]", "storage", error);
  },

  upgradeSocketError: (error) => {
    deps.console.warn("[relay]", "socket error", { error });
  },

  invalidOrMissingOwnerIdInUrl: (url) => {
    deps.console.warn("[relay]", "invalid or missing ownerId in URL", { url });
  },

  unauthorizedOwner: (ownerId) => {
    deps.console.warn("[relay]", "unauthorized owner", { ownerId });
  },

  connectionEstablished: (totalConnectionCount) => {
    deps.console.log("[relay]", "connection", { totalConnectionCount });
  },

  connectionWebSocketError: (error) => {
    deps.console.error("[relay]", "error", { error });
  },

  relayOptionSubscribe: (ownerId, getSubscriberCount) => {
    if (deps.console.enabled)
      deps.console.log("[relay]", "subscribe", {
        ownerId,
        subscriberCount: getSubscriberCount(),
      });
  },

  relayOptionUnsubscribe: (ownerId, getSubscriberCount) => {
    if (deps.console.enabled)
      deps.console.log("[relay]", "unsubscribe", {
        ownerId,
        subscriberCount: getSubscriberCount(),
      });
  },

  relayOptionBroadcast: (ownerId, broadcastCount, totalSubscribers) => {
    deps.console.log("[relay]", "broadcast", {
      ownerId,
      broadcastCount,
      totalSubscribers,
    });
  },

  messageLength: (messageLength) => {
    deps.console.log("[relay]", "on message", { messageLength });
  },

  applyProtocolMessageAsRelayError: (error) => {
    deps.console.error("[relay]", "applyProtocolMessageAsRelay", error);
  },

  responseLength: (responseLength) => {
    deps.console.log("[relay]", "responseLength", { responseLength });
  },

  applyProtocolMessageAsRelayUnknownError: (error) => {
    deps.console.error(
      "[relay]",
      "applyProtocolMessageAsRelayUnknownError",
      error,
    );
  },

  connectionClosed: (totalConnectionCount) => {
    deps.console.log("[relay]", "close", { totalConnectionCount });
  },

  shuttingDown: () => {
    deps.console.log("Shutting down Evolu Relay...");
  },

  webSocketServerDisposed: () => {
    deps.console.log("Evolu Relay WebSocketServer disposed");
  },

  httpServerDisposed: () => {
    deps.console.log("Evolu Relay HTTP server disposed");
  },
});
