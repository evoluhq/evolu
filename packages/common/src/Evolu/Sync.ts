import { NonEmptyArray, NonEmptyReadonlyArray } from "../Array.js";
import { assert } from "../Assert.js";
import type { Brand } from "../Brand.js";
import { ConsoleDep } from "../Console.js";
import {
  CreateRandomBytesDep,
  EncryptionKey,
  SymmetricCryptoDecryptError,
  SymmetricCryptoDep,
} from "../Crypto.js";
import { eqArrayNumber } from "../Eq.js";
import { constFalse } from "../Function.js";
import { NanoIdLibDep } from "../NanoId.js";
import { objectToEntries } from "../Object.js";
import { RandomDep } from "../Random.js";
import { createRefCountedResourceManager } from "../RefCountedResourceManager.js";
import { ok, Result } from "../Result.js";
import { sql, SqliteDep, SqliteError, SqliteValue } from "../Sqlite.js";
import { TimeDep } from "../Time.js";
import { BinaryId, binaryIdToId, idToBinaryId } from "../Type.js";
import { CreateWebSocketDep, WebSocket } from "../WebSocket.js";
import { TransportConfig } from "./Config.js";
import {
  AppOwner,
  BinaryOwnerId,
  binaryOwnerIdToOwnerId,
  OwnerId,
  ownerIdToBinaryOwnerId,
  ShardOwner,
  SharedOwner,
  SharedReadonlyOwner,
  WriteKey,
} from "./Owner.js";
import {
  applyProtocolMessageAsClient,
  createProtocolMessageForSync,
  createProtocolMessageForUnsubscribe,
  createProtocolMessageFromCrdtMessages,
  decryptAndDecodeDbChange,
  encodeAndEncryptDbChange,
  ProtocolInvalidDataError,
  ProtocolSyncError,
  ProtocolTimestampMismatchError,
  ProtocolUnsupportedVersionError,
  ProtocolWriteError,
  ProtocolWriteKeyError,
  SubscriptionFlags,
} from "./Protocol.js";
import { MutationChange } from "./Schema.js";
import {
  CrdtMessage,
  createSqliteStorageBase,
  SqliteStorageBase,
  Storage,
} from "./Storage.js";
import {
  binaryTimestampToTimestamp,
  createInitialTimestamp,
  Millis,
  receiveTimestamp,
  sendTimestamp,
  Timestamp,
  TimestampConfigDep,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampTimeOutOfRangeError,
  timestampToBinaryTimestamp,
  timestampToTimestampString,
} from "./Timestamp.js";

export interface Sync extends Disposable {
  /**
   * Assigns or removes an owner to/from transports with reference counting.
   *
   * Owners are only "active" if assigned to at least one transport. Uses
   * `owner.transports` or falls back to config transports. Multiple calls
   * increment/decrement reference counts (useful for React Hooks).
   */
  readonly useOwner: (use: boolean, owner: SyncOwner) => void;

  readonly applyChanges: (
    changes: NonEmptyReadonlyArray<MutationChange>,
  ) => Result<
    void,
    | SqliteError
    | TimestampCounterOverflowError
    | TimestampDriftError
    | TimestampTimeOutOfRangeError
  >;
}

export interface SyncDep {
  readonly sync: Sync;
}

/**
 * Represents an owner for sync operations. This is a unified interface that
 * abstracts over the specific owner types ({@link ShardOwner},
 * {@link SharedOwner}, {@link SharedReadonlyOwner}) for the sync layer.
 *
 * The sync layer only needs the essential data for synchronization and doesn't
 * need to distinguish between different owner types.
 */
export interface SyncOwner {
  readonly id: OwnerId;
  readonly encryptionKey: EncryptionKey;
  /** Optional for read-only owners like {@link SharedReadonlyOwner}. */
  readonly writeKey?: WriteKey;
  readonly transports?: ReadonlyArray<TransportConfig>;
}

export interface SyncConfig {
  readonly appOwner: AppOwner;

  readonly transports: ReadonlyArray<TransportConfig>;

  /**
   * Delay in milliseconds before disposing unused WebSocket connections.
   * Defaults to 100ms.
   */
  readonly disposalDelayMs?: number;

  readonly onError: (
    error:
      | ProtocolInvalidDataError
      | ProtocolSyncError
      | ProtocolTimestampMismatchError
      | ProtocolUnsupportedVersionError
      | ProtocolWriteError
      | ProtocolWriteKeyError
      | SqliteError
      | SymmetricCryptoDecryptError
      | TimestampCounterOverflowError
      | TimestampDriftError
      | TimestampTimeOutOfRangeError,
  ) => void;

  readonly onReceive: () => void;
}

export const createSync =
  (
    deps: ClockDep &
      ConsoleDep &
      CreateRandomBytesDep &
      CreateWebSocketDep &
      RandomDep &
      SqliteDep &
      SymmetricCryptoDep &
      TimeDep &
      TimestampConfigDep,
  ) =>
  (config: SyncConfig): Result<Sync, SqliteError> => {
    let isDisposed = false;

    /** Returns owner data only if actively assigned to at least one transport. */
    const getSyncOwner = (ownerId: OwnerId): SyncOwner | null => {
      if (isDisposed) return null;
      return transports.getConsumer(ownerId);
    };

    const storageResult = createClientStorage({
      ...deps,
      getSyncOwner,
    })(config);

    if (!storageResult.ok) return storageResult;
    const storage = storageResult.value;

    const createResource = (transportConfig: TransportConfig): WebSocket => {
      const transportKey = createTransportKey(transportConfig);

      deps.console.log("[sync]", "createWebSocket", {
        transportKey,
        url: transportConfig.url,
      });

      return deps.createWebSocket(transportConfig.url, {
        binaryType: "arraybuffer",

        onOpen: () => {
          if (isDisposed) return;

          const webSocket = transports.getResource(transportKey);
          if (!webSocket) return;

          const ownerIds = transports.getConsumersForResource(transportKey);
          deps.console.log("[sync]", "onOpen", { transportKey, ownerIds });

          for (const ownerId of ownerIds) {
            const message = createProtocolMessageForSync({ storage })(
              ownerId,
              SubscriptionFlags.Subscribe,
            );
            if (!message) continue;
            deps.console.log("[sync]", "send", { message });
            webSocket.send(message);
          }
        },

        onClose: (event) => {
          deps.console.log("[sync]", "onClose", {
            transportKey,
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });
        },

        onError: (error) => {
          deps.console.warn("[sync]", "onError", { transportKey, error });
        },

        onMessage: (data: string | ArrayBuffer | Blob) => {
          // Only handle ArrayBuffer data for sync messages
          if (isDisposed || !(data instanceof ArrayBuffer)) return;

          const webSocket = transports.getResource(transportKey);
          if (!webSocket) return;

          const input = new Uint8Array(data);
          deps.console.log("[sync]", "onMessage", {
            transportKey,
            message: input,
          });

          const message = deps.sqlite.transaction(() =>
            applyProtocolMessageAsClient({ storage })(input, {
              getWriteKey: (ownerId) => getSyncOwner(ownerId)?.writeKey ?? null,
            }),
          );

          if (!message.ok) {
            config.onError(message.error);
            return;
          }

          switch (message.value.type) {
            case "response":
              webSocket.send(message.value.message);
              break;
            case "no-response":
              // Sync complete, no response needed
              break;
            case "broadcast":
              // This was a broadcast message, don't affect sync counter
              break;
          }
        },
      });
    };

    const transports = createRefCountedResourceManager<
      WebSocket,
      TransportKey,
      TransportConfig,
      SyncOwner,
      OwnerId
    >({
      createResource,
      getResourceKey: createTransportKey,
      getConsumerId: (owner) => owner.id,
      disposalDelay: config.disposalDelayMs ?? 100,

      onConsumerAdded: (owner, webSocket) => {
        deps.console.log("[sync]", "onConsumerAdded", {
          ownerId: owner.id,
          isOpen: webSocket.isOpen(),
        });

        // The onOpen handler will sync it.
        if (!webSocket.isOpen()) return;
        const message = createProtocolMessageForSync({ storage })(
          owner.id,
          SubscriptionFlags.Subscribe,
        );
        if (message) webSocket.send(message);
      },

      onConsumerRemoved: (owner, webSocket) => {
        deps.console.log("[sync]", "onConsumerRemoved", {
          ownerId: owner.id,
          isOpen: webSocket.isOpen(),
        });

        const message = createProtocolMessageForUnsubscribe(owner.id);
        webSocket.send(message);
      },
    });

    const sync: Sync = {
      useOwner: (use, owner) => {
        if (isDisposed) {
          deps.console.warn(
            "[sync]",
            "useOwner called on disposed Sync instance",
            { owner },
          );
          return;
        }

        deps.console.log("[sync]", "useOwner", { use, owner });
        const transportsToUse = owner.transports ?? config.transports;

        if (use) {
          transports.addConsumer(owner, transportsToUse);
        } else {
          const result = transports.removeConsumer(owner, transportsToUse);

          if (!result.ok) {
            deps.console.warn("[sync]", "Failed to remove consumer", {
              transportsToUse,
              ownerId: owner.id,
              error: result.error,
            });
          }
        }
      },

      applyChanges: (changes) => {
        deps.console.log("[sync]", "applyChanges", { changes });

        let clockTimestamp = deps.clock.get();
        const ownerMessages = new Map<OwnerId, NonEmptyArray<CrdtMessage>>();

        for (const change of changes) {
          const nextTimestamp = sendTimestamp(deps)(clockTimestamp);
          if (!nextTimestamp.ok) return nextTimestamp;
          clockTimestamp = nextTimestamp.value;

          const { ownerId = config.appOwner.id, ...dbChange } = change;
          const message = { timestamp: clockTimestamp, change: dbChange };

          const messages = ownerMessages.get(ownerId);
          if (messages) messages.push(message);
          else ownerMessages.set(ownerId, [message]);
        }

        for (const [ownerId, messages] of ownerMessages) {
          const result = applyMessages({ ...deps, storage })(ownerId, messages);
          if (!result.ok) return result;

          const owner = getSyncOwner(ownerId);
          if (!owner?.writeKey) continue;

          const message = createProtocolMessageFromCrdtMessages(deps)(
            {
              id: owner.id,
              encryptionKey: owner.encryptionKey,
              writeKey: owner.writeKey,
            },
            messages,
          );

          const transportsToUse = owner.transports ?? config.transports;

          // Send message to all transports for this owner
          for (const transportConfig of transportsToUse) {
            const transportKey = createTransportKey(transportConfig);

            const webSocket = transports.getResource(transportKey);
            if (!webSocket) continue;

            if (webSocket.isOpen()) {
              deps.console.log("[sync]", "send", { transportKey, message });
              webSocket.send(message);
            }
          }
        }

        return deps.clock.save(clockTimestamp);
      },

      [Symbol.dispose]: () => {
        if (isDisposed) return;
        isDisposed = true;
        transports[Symbol.dispose]();
      },
    };

    return ok(sync);
  };

export interface ClockDep {
  readonly clock: Clock;
}

export interface Clock {
  readonly get: () => Timestamp;
  readonly save: (timestamp: Timestamp) => Result<void, SqliteError>;
}

export const createClock =
  (deps: NanoIdLibDep & SqliteDep) =>
  (initialTimestamp = createInitialTimestamp(deps)): Clock => {
    let currentTimestamp = initialTimestamp;

    return {
      get: () => currentTimestamp,
      save: (timestamp) => {
        currentTimestamp = timestamp;

        const timestampString = timestampToTimestampString(timestamp);
        const result = deps.sqlite.exec(sql.prepared`
          update evolu_config set "clock" = ${timestampString};
        `);
        if (!result.ok) return result;

        return ok();
      },
    };
  };

interface GetSyncOwnerDep {
  readonly getSyncOwner: (ownerId: OwnerId) => SyncOwner | null;
}

export interface ClientStorage extends SqliteStorageBase, Storage {}

export interface ClientStorageDep {
  readonly storage: ClientStorage;
}

const createClientStorage =
  (
    deps: ClockDep &
      GetSyncOwnerDep &
      RandomDep &
      SqliteDep &
      SymmetricCryptoDep &
      TimeDep &
      TimestampConfigDep,
  ) =>
  (config: {
    onError: (
      error:
        | ProtocolInvalidDataError
        | ProtocolTimestampMismatchError
        | SqliteError
        | SymmetricCryptoDecryptError
        | TimestampCounterOverflowError
        | TimestampDriftError
        | TimestampTimeOutOfRangeError,
    ) => void;
    onReceive: () => void;
  }): Result<ClientStorage, SqliteError> => {
    const sqliteStorageBase = createSqliteStorageBase(deps)({
      onStorageError: config.onError,
    });
    if (!sqliteStorageBase.ok) return sqliteStorageBase;

    const storage: ClientStorage = {
      ...sqliteStorageBase.value,

      validateWriteKey: constFalse,
      setWriteKey: constFalse,

      writeMessages: (ownerId, messages) => {
        const owner = deps.getSyncOwner(binaryOwnerIdToOwnerId(ownerId));
        // Owner can be removed to stop syncing.
        if (!owner) return false;

        const decodedAndDecryptedMessages: Array<CrdtMessage> = [];

        for (const message of messages) {
          const dbChange = decryptAndDecodeDbChange(deps)(
            message,
            owner.encryptionKey,
          );

          if (!dbChange.ok) {
            config.onError(dbChange.error);
            return false;
          }

          decodedAndDecryptedMessages.push({
            timestamp: message.timestamp,
            change: dbChange.value,
          });
        }

        let clockTimestamp = deps.clock.get();

        for (const message of messages) {
          const result = receiveTimestamp(deps)(
            clockTimestamp,
            message.timestamp,
          );
          if (!result.ok) {
            config.onError(result.error);
            return false;
          }
          clockTimestamp = result.value;
        }

        const applyMessagesResult = applyMessages({ ...deps, storage })(
          owner.id,
          decodedAndDecryptedMessages,
        );
        if (!applyMessagesResult.ok) {
          config.onError(applyMessagesResult.error);
          return false;
        }

        const saveResult = deps.clock.save(clockTimestamp);
        if (!saveResult.ok) {
          config.onError(saveResult.error);
          return false;
        }

        config.onReceive();

        return true;
      },

      readDbChange: (ownerId, timestamp) => {
        const owner = deps.getSyncOwner(binaryOwnerIdToOwnerId(ownerId));
        // Owner can be removed to stop syncing.
        if (!owner) return null;

        const result = deps.sqlite.exec<{
          table: string;
          id: BinaryId;
          column: string;
          value: SqliteValue;
        }>(sql`
          select "table", "id", "column", "value"
          from evolu_history
          where "ownerId" = ${ownerId} and "timestamp" = ${timestamp};
        `);
        if (!result.ok) {
          config.onError(result.error);
          return null;
        }

        const { rows } = result.value;
        assert(rows.length > 0, "Rows must not be empty");

        const { table, id } = rows[0];
        const values: Record<string, SqliteValue> = {};

        for (const r of rows) {
          assert(r.table === table, "All rows must have the same table");
          assert(eqArrayNumber(r.id, id), "All rows must have the same Id");
          values[r.column] = r.value;
        }

        const message: CrdtMessage = {
          timestamp: binaryTimestampToTimestamp(timestamp),
          change: {
            table: rows[0].table,
            id: binaryIdToId(rows[0].id),
            values,
          },
        };

        return encodeAndEncryptDbChange(deps)(message, owner.encryptionKey);
      },
    };

    return ok(storage);
  };

type TransportKey = string & Brand<"TransportKey">;

/** Creates a unique identifier for a transport configuration. */
const createTransportKey = (transportConfig: TransportConfig): TransportKey => {
  return `ws:${transportConfig.url}` as TransportKey;
};

const applyMessages =
  (deps: ClientStorageDep & ClockDep & RandomDep & SqliteDep) =>
  (
    ownerId: OwnerId,
    messages: ReadonlyArray<CrdtMessage>,
  ): Result<void, SqliteError> => {
    const binaryOwnerId = ownerIdToBinaryOwnerId(ownerId);

    for (const message of messages) {
      const result1 = applyMessageToAppTable(deps)(binaryOwnerId, message);
      if (!result1.ok) return result1;

      const result2 = applyMessageToTimestampAndHistoryTables(deps)(
        binaryOwnerId,
        message,
      );
      if (!result2.ok) return result2;
    }

    return ok();
  };

const applyMessageToAppTable =
  (deps: SqliteDep) =>
  (ownerId: BinaryOwnerId, message: CrdtMessage): Result<void, SqliteError> => {
    const timestamp = timestampToBinaryTimestamp(message.timestamp);
    const updatedAt = new Date(message.timestamp.millis).toISOString();

    for (const [column, value] of objectToEntries(message.change.values)) {
      const result = deps.sqlite.exec(sql.prepared`
        with
          lastTimestamp as (
            select "timestamp"
            from evolu_history
            where
              "ownerId" = ${ownerId}
              and "table" = ${message.change.table}
              and "id" = ${message.change.id}
              and "column" = ${column}
            order by "timestamp" desc
            limit 1
          )
        insert into ${sql.identifier(message.change.table)}
          ("id", ${sql.identifier(column)}, updatedAt)
        select ${message.change.id}, ${value}, ${updatedAt}
        where
          (select "timestamp" from lastTimestamp) is null
          or (select "timestamp" from lastTimestamp) < ${timestamp}
        on conflict ("id") do update
          set
            ${sql.identifier(column)} = ${value},
            updatedAt = ${updatedAt}
          where
            (select "timestamp" from lastTimestamp) is null
            or (select "timestamp" from lastTimestamp) < ${timestamp};
      `);

      if (!result.ok) return result;
    }

    return ok();
  };

export const applyMessageToTimestampAndHistoryTables =
  (deps: ClientStorageDep & SqliteDep) =>
  (ownerId: BinaryOwnerId, message: CrdtMessage): Result<void, SqliteError> => {
    const timestamp = timestampToBinaryTimestamp(message.timestamp);
    const id = idToBinaryId(message.change.id);

    const result = deps.storage.insertTimestamp(ownerId, timestamp);
    if (!result.ok) return result;

    for (const [column, value] of Object.entries(message.change.values)) {
      const result = deps.sqlite.exec(sql.prepared`
        insert into evolu_history
          ("ownerId", "table", "id", "column", "value", "timestamp")
        values
          (
            ${ownerId},
            ${message.change.table},
            ${id},
            ${column},
            ${value},
            ${timestamp}
          )
        on conflict do nothing;
      `);
      if (!result.ok) return result;
    }

    return ok();
  };

/**
 * The possible states of a synchronization process. The `SyncState` can be one
 * of the following:
 *
 * - {@link SyncStateInitial}
 * - {@link SyncStateIsSyncing}
 * - {@link SyncStateIsSynced}
 * - {@link SyncStateIsNotSynced}
 */
export type SyncState =
  | SyncStateInitial
  | SyncStateIsSyncing
  | SyncStateIsSynced
  | SyncStateIsNotSynced;

/**
 * The initial synchronization state when the app starts. In this state, the app
 * needs to determine whether the data is synced.
 */
export interface SyncStateInitial {
  readonly type: "SyncStateInitial";
}

export interface SyncStateIsSyncing {
  readonly type: "SyncStateIsSyncing";
}

export interface SyncStateIsSynced {
  readonly type: "SyncStateIsSynced";
  readonly time: Millis;
}

export interface SyncStateIsNotSynced {
  readonly type: "SyncStateIsNotSynced";
  readonly error: NetworkError | ServerError | PaymentRequiredError;
}

export interface NetworkError {
  readonly type: "NetworkError";
}

export interface ServerError {
  readonly type: "ServerError";
  readonly status: number;
}

export interface PaymentRequiredError {
  readonly type: "PaymentRequiredError";
}

export const initialSyncState: SyncStateInitial = { type: "SyncStateInitial" };
