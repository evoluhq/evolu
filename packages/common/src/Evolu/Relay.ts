import { isNonEmptyReadonlyArray } from "../Array.js";
import { ConsoleConfig, ConsoleDep } from "../Console.js";
import { TimingSafeEqualDep } from "../Crypto.js";
import { LazyValue } from "../Function.js";
import { err, ok, Result } from "../Result.js";
import { sql, SqliteDep, SqliteError } from "../Sqlite.js";
import { SimpleName } from "../Type.js";
import { OwnerId, OwnerTransport, OwnerWriteKey } from "./Owner.js";
import { ProtocolInvalidDataError } from "./Protocol.js";
import {
  createBaseSqliteStorage,
  CreateBaseSqliteStorageOptions,
  EncryptedDbChange,
  SqliteStorageDeps,
  Storage,
} from "./Storage.js";
import { timestampToTimestampBytes } from "./Timestamp.js";

export interface Relay extends Disposable {}

export interface RelayConfig extends ConsoleConfig {
  /**
   * The relay name.
   *
   * Implementations can use this for identification purposes (e.g., database
   * file name, logging).
   */
  readonly name?: SimpleName;

  /**
   * Optional callback to authenticate an {@link OwnerId} with the relay.
   *
   * If this callback is not provided, all owners are allowed.
   *
   * If provided, the callback receives the OwnerId and should return a promise
   * that resolves to `true` to allow access, or `false` to deny.
   *
   * The callback returns a boolean rather than an error type because error
   * handling and logging are the responsibility of the callback implementation,
   * not the relay. This prevents leaking authentication implementation details
   * into the generic relay interface.
   *
   * OwnerId is used for authentication rather than short-lived tokens because
   * this only controls relay access, not write permissions. Since all data is
   * encrypted on the relay, OwnerId exposure is safe.
   *
   * Owners specify which relays to connect to via {@link OwnerTransport}. In
   * WebSocket-based implementations, this check occurs before accepting the
   * connection, with the OwnerId typically extracted from the URL path (e.g.,
   * `ws://localhost:4000/<ownerId>`).
   *
   * ### Example
   *
   * ```ts
   * const relay = await createNodeJsRelay(deps)({
   *   authenticateOwner: async (ownerId) => {
   *     const isRegistered = await db.checkOwner(ownerId);
   *     if (!isRegistered) {
   *       logger.warn("Unauthorized access attempt", { ownerId });
   *     }
   *     return isRegistered;
   *   },
   * });
   * ```
   */
  readonly authenticateOwner?: (ownerId: OwnerId) => Promise<boolean>;
}

export const createRelaySqliteStorage =
  (deps: SqliteStorageDeps & TimingSafeEqualDep) =>
  (options: CreateBaseSqliteStorageOptions): Storage => {
    const sqliteStorageBase = createBaseSqliteStorage(deps)(options);

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
          options.onStorageError(selectWriteKey.error);
          return false;
        }

        const { rows } = selectWriteKey.value;

        if (!isNonEmptyReadonlyArray(rows)) {
          const insertWriteKey = deps.sqlite.exec(sql`
            insert into evolu_writeKey (ownerId, writeKey)
            values (${ownerId}, ${writeKey});
          `);
          if (!insertWriteKey.ok) {
            options.onStorageError(insertWriteKey.error);
            return false;
          }

          return true;
        }

        return deps.timingSafeEqual(rows[0].writeKey, writeKey);
      },

      setWriteKey: (ownerId, writeKey) => {
        const upsertWriteKey = deps.sqlite.exec(sql`
          insert into evolu_writeKey (ownerId, writeKey)
          values (${ownerId}, ${writeKey})
          on conflict (ownerId) do update
            set writeKey = excluded.writeKey;
        `);
        if (!upsertWriteKey.ok) {
          options.onStorageError(upsertWriteKey.error);
          return false;
        }

        return true;
      },

      // https://eslint.org/docs/latest/rules/require-await#when-not-to-use-it
      // eslint-disable-next-line @typescript-eslint/require-await
      writeMessages: async (ownerId, messages) => {
        const result = deps.sqlite.transaction(() => {
          for (const message of messages) {
            const insertTimestampResult = sqliteStorageBase.insertTimestamp(
              ownerId,
              timestampToTimestampBytes(message.timestamp),
            );
            if (!insertTimestampResult.ok) return insertTimestampResult;

            const insertMessage = deps.sqlite.exec(sql`
              insert into evolu_message ("ownerId", "timestamp", "change")
              values
                (
                  ${ownerId},
                  ${timestampToTimestampBytes(message.timestamp)},
                  ${message.change}
                )
              on conflict do nothing;
            `);
            if (!insertMessage.ok) return insertMessage;
          }
          return ok();
        });

        if (!result.ok) {
          options.onStorageError(result.error);
          return false;
        }

        return true;
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
          options.onStorageError(result.error);
          return null;
        }

        return result.value.rows[0]?.change;
      },

      deleteOwner: (ownerId) => {
        const result = deps.sqlite.transaction(() => {
          const deleteWriteKey = deps.sqlite.exec(sql`
            delete from evolu_writeKey where ownerId = ${ownerId};
          `);
          if (!deleteWriteKey.ok) return deleteWriteKey;

          const deleteMessages = deps.sqlite.exec(sql`
            delete from evolu_message where ownerId = ${ownerId};
          `);
          if (!deleteMessages.ok) return deleteMessages;

          const deleteBaseOwner = sqliteStorageBase.deleteOwner(ownerId);
          if (!deleteBaseOwner) return err(null);

          return ok();
        });
        if (!result.ok) {
          if (result.error) options.onStorageError(result.error);
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
  readonly authenticateOwnerError: (error: unknown) => void;
  readonly connectionEstablished: (totalConnectionCount: number) => void;
  readonly connectionWebSocketError: (error: Error) => void;
  readonly relayOptionSubscribe: (
    ownerId: OwnerId,
    getSubscriberCount: LazyValue<number>,
  ) => void;
  readonly relayOptionUnsubscribe: (
    ownerId: OwnerId,
    getSubscriberCount: LazyValue<number>,
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

  authenticateOwnerError: (error) => {
    deps.console.error("[relay]", "authenticateOwner error", error);
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
