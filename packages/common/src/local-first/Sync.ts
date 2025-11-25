import {
  appendToArray,
  firstInArray,
  isNonEmptyReadonlyArray,
  NonEmptyArray,
  NonEmptyReadonlyArray,
} from "../Array.js";
import { assert, assertNonEmptyReadonlyArray } from "../Assert.js";
import { Brand } from "../Brand.js";
import { ConsoleDep } from "../Console.js";
import {
  RandomBytesDep,
  SymmetricCryptoDecryptError,
  SymmetricCryptoDep,
} from "../Crypto.js";
import { eqArrayNumber } from "../Eq.js";
import { createTransferableError, TransferableError } from "../Error.js";
import { constFalse, constTrue } from "../Function.js";
import { createRecord, objectToEntries } from "../Object.js";
import { RandomDep } from "../Random.js";
import { createResources } from "../Resources.js";
import { err, ok, Result } from "../Result.js";
import {
  booleanToSqliteBoolean,
  sql,
  SqliteBoolean,
  sqliteBooleanToBoolean,
  SqliteDep,
  SqliteError,
  SqliteValue,
} from "../Sqlite.js";
import { AbortError, createMutex } from "../Task.js";
import { TimeDep } from "../Time.js";
import {
  Boolean,
  DateIso,
  IdBytes,
  idBytesToId,
  idToIdBytes,
  PositiveInt,
} from "../Type.js";
import { CreateWebSocketDep, WebSocket } from "../WebSocket.js";
import type { AppOwnerDep, PostMessageDep } from "./Db.js";
import {
  AppOwner,
  Owner,
  OwnerId,
  ownerIdBytesToOwnerId,
  ownerIdToOwnerIdBytes,
  OwnerTransport,
  ReadonlyOwner,
} from "./Owner.js";
import {
  applyProtocolMessageAsClient,
  createProtocolMessageForSync,
  createProtocolMessageForUnsubscribe,
  createProtocolMessageFromCrdtMessages,
  decryptAndDecodeDbChange,
  encodeAndEncryptDbChange,
  ProtocolError,
  ProtocolInvalidDataError,
  ProtocolTimestampMismatchError,
  SubscriptionFlags,
} from "./Protocol.js";
import { DbSchemaDep, MutationChange } from "./Schema.js";
import {
  BaseSqliteStorage,
  CrdtMessage,
  createBaseSqliteStorage,
  DbChange,
  getOwnerUsage,
  getTimestampInsertStrategy,
  Storage,
  StorageWriteError,
  updateOwnerUsage,
} from "./Storage.js";
import {
  createInitialTimestamp,
  Millis,
  receiveTimestamp,
  sendTimestamp,
  Timestamp,
  timestampBytesToTimestamp,
  TimestampConfigDep,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampTimeOutOfRangeError,
  timestampToDateIso,
  timestampToTimestampBytes,
} from "./Timestamp.js";

export interface Sync extends Disposable {
  /**
   * Assigns or removes an owner to/from transports with reference counting.
   *
   * Owners are only synced if assigned to at least one transport. Uses
   * `owner.transports` or falls back to {@link SyncConfig} transports. Multiple
   * calls increment/decrement reference counts (useful for React Hooks).
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
 * Represents an owner for sync operations.
 *
 * Includes readonly owner fields plus optional write key (for clients that
 * write) and optional transports to override SyncConfig transports per owner.
 */
export interface SyncOwner extends ReadonlyOwner {
  readonly writeKey?: Owner["writeKey"];
  readonly transports?: ReadonlyArray<OwnerTransport>;
}

export interface SyncConfig {
  readonly appOwner: AppOwner;

  readonly transports: ReadonlyArray<OwnerTransport>;

  /**
   * Delay in milliseconds before disposing unused WebSocket connections.
   * Defaults to 100ms.
   */
  readonly disposalDelayMs?: number;

  readonly onError: (
    error:
      | ProtocolError
      | ProtocolInvalidDataError
      | ProtocolTimestampMismatchError
      | SqliteError
      | SymmetricCryptoDecryptError
      | TimestampCounterOverflowError
      | TimestampDriftError
      | TimestampTimeOutOfRangeError
      | TransferableError,
  ) => void;

  readonly onReceive: () => void;
}

export const createSync =
  (
    deps: ClockDep &
      ConsoleDep &
      CreateWebSocketDep &
      DbSchemaDep &
      PostMessageDep &
      RandomBytesDep &
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
      return resources.getConsumer(ownerId);
    };

    const storageResult = createClientStorage({
      ...deps,
      getSyncOwner,
    })(config);

    if (!storageResult.ok) return storageResult;
    const storage = storageResult.value;

    const createResource = (transport: OwnerTransport): WebSocket => {
      const transportKey = createTransportKey(transport);

      deps.console.log("[sync]", "createWebSocket", {
        transportKey,
        url: transport.url,
      });

      return deps.createWebSocket(transport.url, {
        binaryType: "arraybuffer",

        onOpen: () => {
          if (isDisposed) return;

          const webSocket = resources.getResource(transportKey);
          if (!webSocket) return;

          const ownerIds = resources.getConsumersForResource(transportKey);
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

          const webSocket = resources.getResource(transportKey);
          if (!webSocket) return;

          const input = new Uint8Array(data);
          deps.console.log("[sync]", "onMessage", {
            transportKey,
            message: input,
          });

          applyProtocolMessageAsClient({ storage })(input, {
            // No write key, no sync (for a case when an owner was unused).
            getWriteKey: (ownerId) => getSyncOwner(ownerId)?.writeKey ?? null,
          })
            .then((message) => {
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
            })
            .catch((error: unknown) => {
              config.onError(createTransferableError(error));
            });
        },
      });
    };

    const resources = createResources<
      WebSocket,
      TransportKey,
      OwnerTransport,
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
        const transports = owner.transports ?? config.transports;

        if (use) {
          resources.addConsumer(owner, transports);
        } else {
          const result = resources.removeConsumer(owner, transports);

          if (!result.ok) {
            deps.console.warn("[sync]", "Failed to remove consumer", {
              transports,
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
          const message: CrdtMessage = {
            timestamp: clockTimestamp,
            change: dbChange,
          };

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

          const transports = owner.transports ?? config.transports;

          // Send message to all transports for this owner
          for (const transport of transports) {
            const transportKey = createTransportKey(transport);

            const webSocket = resources.getResource(transportKey);
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
        resources[Symbol.dispose]();
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
  (deps: RandomBytesDep & SqliteDep) =>
  (initialTimestamp = createInitialTimestamp(deps)): Clock => {
    let currentTimestamp = initialTimestamp;

    return {
      get: () => currentTimestamp,
      save: (timestamp) => {
        currentTimestamp = timestamp;

        const result = deps.sqlite.exec(sql.prepared`
          update evolu_config
          set "clock" = ${timestampToTimestampBytes(timestamp)};
        `);
        if (!result.ok) return result;

        return ok();
      },
    };
  };

interface GetSyncOwnerDep {
  readonly getSyncOwner: (ownerId: OwnerId) => SyncOwner | null;
}

export interface ClientStorage extends Storage, BaseSqliteStorage {}

export interface ClientStorageDep {
  readonly storage: ClientStorage;
}

const createClientStorage =
  (
    deps: ClockDep &
      DbSchemaDep &
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
    const sqliteStorageBase = createBaseSqliteStorage(deps)({
      onStorageError: config.onError,
      isOwnerWithinQuota: constTrue, // Clients don't have quota limits
    });

    // TODO: Mutex per OwnerId
    const mutex = createMutex();

    const storage: ClientStorage = {
      ...sqliteStorageBase,

      // Not implemented yet.
      validateWriteKey: constFalse,
      setWriteKey: constFalse,

      writeMessages: async (ownerIdBytes, encryptedMessages) => {
        const ownerId = ownerIdBytesToOwnerId(ownerIdBytes);

        // Everything is sync now, but we will need async crypto in the future.
        const writeResult = await mutex.withLock<
          boolean,
          | AbortError
          | ProtocolInvalidDataError
          | ProtocolTimestampMismatchError
          | SqliteError
          | SymmetricCryptoDecryptError
          | TimestampCounterOverflowError
          | TimestampDriftError
          | TimestampTimeOutOfRangeError
          // eslint-disable-next-line @typescript-eslint/require-await
        >(async () => {
          const owner = deps.getSyncOwner(ownerId);
          // Owner can be removed during syncing.
          // `ok(true)` means success, we just skipped the write.
          if (!owner) return ok(true);

          // TODO: Add quota checking for collaborative scenarios.
          // When receiving messages from other owners via relay broadcast,
          // check if this owner is within quota before accepting the data.
          // This prevents an owner from exceeding storage limits when receiving
          // data shared by other collaborators.

          const messages: Array<CrdtMessage> = [];

          for (const message of encryptedMessages) {
            const change = decryptAndDecodeDbChange(deps)(
              message,
              owner.encryptionKey,
            );
            if (!change.ok) return change;

            messages.push({
              timestamp: message.timestamp,
              change: change.value,
            });
          }

          const transaction = deps.sqlite.transaction(() => {
            let clockTimestamp = deps.clock.get();

            for (const message of messages) {
              const nextTimestamp = receiveTimestamp(deps)(
                clockTimestamp,
                message.timestamp,
              );
              if (!nextTimestamp.ok) return nextTimestamp;

              clockTimestamp = nextTimestamp.value;
            }

            if (isNonEmptyReadonlyArray(messages)) {
              const applyMessagesResult = applyMessages({ ...deps, storage })(
                owner.id,
                messages,
              );
              if (!applyMessagesResult.ok) return applyMessagesResult;
            }

            return deps.clock.save(clockTimestamp);
          });

          if (!transaction.ok) return transaction;

          return ok(true);
        })();

        if (!writeResult.ok) {
          if (writeResult.error.type !== "AbortError") {
            config.onError(writeResult.error);
          }
          return err<StorageWriteError>({ type: "StorageWriteError", ownerId });
        }

        config.onReceive();

        return ok();
      },

      readDbChange: (ownerId, timestamp) => {
        const owner = deps.getSyncOwner(ownerIdBytesToOwnerId(ownerId));
        // Owner can be removed to stop syncing.
        if (!owner) return null;

        const result = deps.sqlite.exec<{
          table: string;
          id: IdBytes;
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
        assertNonEmptyReadonlyArray(rows, "Every timestamp must have rows");

        const { table, id } = firstInArray(rows);
        const values = createRecord<string, SqliteValue>();
        let isInsert;
        let isDelete: boolean | null = null;

        for (const r of rows) {
          assert(r.table === table, "All rows must have the same table");
          assert(eqArrayNumber(r.id, id), "All rows must have the same Id");
          switch (r.column) {
            case "createdAt":
              isInsert = true;
              break;
            case "updatedAt":
              isInsert = false;
              break;
            case "isDeleted":
              assert(
                SqliteBoolean.is(r.value),
                "isDeleted column must contain a valid SqliteBoolean",
              );
              isDelete = sqliteBooleanToBoolean(r.value);
              break;
            default:
              values[r.column] = r.value;
          }
        }

        assert(Boolean.is(isInsert), "isInsert must be in evolu_history");

        const message: CrdtMessage = {
          timestamp: timestampBytesToTimestamp(timestamp),
          change: DbChange.orThrow({
            table: rows[0].table,
            id: idBytesToId(rows[0].id),
            values,
            isInsert,
            isDelete,
          }),
        };

        return encodeAndEncryptDbChange(deps)(message, owner.encryptionKey);
      },
    };

    return ok(storage);
  };

type TransportKey = string & Brand<"TransportKey">;

/** Creates a unique identifier for a {@link OwnerTransport}. */
const createTransportKey = (transport: OwnerTransport): TransportKey => {
  return `${transport.type}:${transport.url}` as TransportKey;
};

const dbChangeToColumns = (change: DbChange, now: DateIso) => {
  let values = objectToEntries(change.values);

  // SystemColumns are not encoded in change.values.
  values = appendToArray(values, [
    change.isInsert ? "createdAt" : "updatedAt",
    now,
  ]);
  if (change.isDelete != null) {
    values = appendToArray(values, [
      "isDeleted",
      booleanToSqliteBoolean(change.isDelete),
    ]);
  }

  return values;
};

export const applyLocalOnlyChange =
  (deps: SqliteDep & TimeDep & AppOwnerDep) =>
  (change: MutationChange): Result<void, SqliteError> => {
    if (change.isDelete) {
      const result = deps.sqlite.exec(sql`
        delete from ${sql.identifier(change.table)}
        where id = ${change.id};
      `);
      if (!result.ok) return result;
    } else {
      const ownerId = deps.appOwner.id;
      const columns = dbChangeToColumns(change, deps.time.nowIso());

      for (const [column, value] of columns) {
        const result = deps.sqlite.exec(sql.prepared`
          insert into ${sql.identifier(change.table)}
            ("ownerId", "id", ${sql.identifier(column)})
          values (${ownerId}, ${change.id}, ${value})
          on conflict ("ownerId", "id") do update
            set ${sql.identifier(column)} = ${value};
        `);
        if (!result.ok) return result;
      }
    }

    return ok();
  };

const applyMessages =
  (deps: ClientStorageDep & ClockDep & DbSchemaDep & RandomDep & SqliteDep) =>
  (
    ownerId: OwnerId,
    messages: NonEmptyReadonlyArray<CrdtMessage>,
  ): Result<void, SqliteError> => {
    const ownerIdBytes = ownerIdToOwnerIdBytes(ownerId);

    const usage = getOwnerUsage(deps)(
      ownerIdBytes,
      timestampToTimestampBytes(firstInArray(messages).timestamp),
    );
    if (!usage.ok) return usage;

    let { firstTimestamp, lastTimestamp } = usage.value;

    // const tableColumnsMap = new Map(
    //   deps.dbSchema.tables.map((table) => [table.name, new Set(table.columns)]),
    // );

    for (const message of messages) {
      // const tableColumns = tableColumnsMap.get(message.change.table);
      // const isValidMessage =
      //   tableColumns != null &&
      //   new Set(Object.keys(message.change.values)).isSubsetOf(tableColumns);

      // console.log({ isValidMessage });

      const timestampBytes = timestampToTimestampBytes(message.timestamp);
      const idBytes = idToIdBytes(message.change.id);
      const columns = dbChangeToColumns(
        message.change,
        timestampToDateIso(message.timestamp),
      );

      for (const [column, value] of columns) {
        const updateAppTable = deps.sqlite.exec(sql.prepared`
          with
            existingTimestamp as (
              select 1
              from evolu_history
              where
                "ownerId" = ${ownerIdBytes}
                and "table" = ${message.change.table}
                and "id" = ${idBytes}
                and "column" = ${column}
                and "timestamp" >= ${timestampBytes}
              limit 1
            )
          insert into ${sql.identifier(message.change.table)}
            ("ownerId", "id", ${sql.identifier(column)})
          select ${ownerId}, ${message.change.id}, ${value}
          where not exists (select 1 from existingTimestamp)
          on conflict ("ownerId", "id") do update
            set ${sql.identifier(column)} = ${value}
            where not exists (select 1 from existingTimestamp);
        `);

        if (!updateAppTable.ok) return updateAppTable;

        const insertHistory = deps.sqlite.exec(sql.prepared`
          insert into evolu_history
            ("ownerId", "table", "id", "column", "value", "timestamp")
          values
            (
              ${ownerIdBytes},
              ${message.change.table},
              ${idBytes},
              ${column},
              ${value},
              ${timestampBytes}
            )
          on conflict do nothing;
        `);

        if (!insertHistory.ok) return insertHistory;
      }

      let strategy;
      [strategy, firstTimestamp, lastTimestamp] = getTimestampInsertStrategy(
        timestampBytes,
        firstTimestamp,
        lastTimestamp,
      );

      const insertTimestamp = deps.storage.insertTimestamp(
        ownerIdBytes,
        timestampBytes,
        strategy,
      );
      if (!insertTimestamp.ok) return insertTimestamp;
    }

    /**
     * TODO: Implement proper storedBytes tracking for client using received and
     * sent encrypted message sizes.
     */
    const updateUsage = updateOwnerUsage(deps)(
      ownerIdBytes,
      1 as PositiveInt, // Placeholder until proper tracking implemented
      firstTimestamp,
      lastTimestamp,
    );
    if (!updateUsage.ok) return updateUsage;

    return ok();
  };

/**
 * TODO: Rework for the new owners API.
 *
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
