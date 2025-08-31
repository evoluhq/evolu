import assert from "assert";
import {
  isNonEmptyArray,
  NonEmptyArray,
  NonEmptyReadonlyArray,
} from "../Array.js";
import { CallbackId } from "../Callbacks.js";
import { ConsoleDep } from "../Console.js";
import {
  CreateRandomBytesDep,
  createSymmetricCrypto,
  EncryptionKey,
  SymmetricCryptoDecryptError,
  SymmetricCryptoDep,
} from "../Crypto.js";
import { eqArrayNumber } from "../Eq.js";
import { TransferableError } from "../Error.js";
import { constFalse } from "../Function.js";
import { NanoIdLibDep } from "../NanoId.js";
import { objectToEntries } from "../Object.js";
import { RandomDep } from "../Random.js";
import { ok, Result } from "../Result.js";
import {
  createSqlite,
  CreateSqliteDriverDep,
  explainSqliteQueryPlan,
  sql,
  SqliteDep,
  SqliteError,
  SqliteValue,
} from "../Sqlite.js";
import { TimeDep } from "../Time.js";
import {
  BinaryId,
  binaryIdToId,
  Id,
  idToBinaryId,
  Mnemonic,
  SimpleName,
} from "../Type.js";
import { CreateWebSocketDep } from "../WebSocket.js";
import {
  createInitializedWorkerWithHandlers,
  MessageHandlers,
  WithErrorReporting,
  Worker,
} from "../Worker.js";
import { Config } from "./Config.js";
import { makePatches, QueryPatches } from "./Diff.js";
import {
  AppOwner,
  BinaryOwnerId,
  binaryOwnerIdToOwnerId,
  createAppOwner,
  createOwnerSecret,
  mnemonicToOwnerSecret,
  OwnerId,
  ownerIdToBinaryOwnerId,
  WriteKey,
} from "./Owner.js";
import {
  applyProtocolMessageAsClient,
  createProtocolMessageForSync,
  createProtocolMessageFromCrdtMessages,
  decryptAndDecodeDbChange,
  encodeAndEncryptDbChange,
  ProtocolError,
  protocolVersion,
  SubscriptionFlags,
} from "./Protocol.js";
import {
  createQueryRowsCache,
  deserializeQuery,
  emptyRows,
  Query,
  QueryRowsCache,
} from "./Query.js";
import { DbSchema, ensureDbSchema, getDbSchema } from "./Schema.js";
import {
  CrdtMessage,
  createSqliteStorageBase,
  CreateSqliteStorageBaseOptions,
  DbChange,
  SqliteStorageBase,
  Storage,
} from "./Storage.js";
import { createSync, SyncConfig, SyncDep, SyncOwner } from "./Sync.js";
import {
  binaryTimestampToTimestamp,
  createInitialTimestamp,
  receiveTimestamp,
  sendTimestamp,
  Timestamp,
  TimestampConfigDep,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampError,
  TimestampString,
  timestampStringToTimestamp,
  TimestampTimeOutOfRangeError,
  timestampToBinaryTimestamp,
  timestampToTimestampString,
} from "./Timestamp.js";

export type DbWorker = Worker<DbWorkerInput, DbWorkerOutput>;

export type CreateDbWorker = (name: SimpleName) => DbWorker;

export interface CreateDbWorkerDep {
  readonly createDbWorker: CreateDbWorker;
}

export type DbWorkerInput =
  | {
      readonly type: "init";
      readonly config: Config;
      readonly dbSchema: DbSchema;
    }
  | {
      readonly type: "mutate";
      readonly tabId: Id;
      readonly changes: NonEmptyReadonlyArray<MutationChange>;
      readonly onCompleteIds: ReadonlyArray<CallbackId>;
      readonly subscribedQueries: ReadonlyArray<Query>;
    }
  | {
      readonly type: "query";
      readonly tabId: Id;
      readonly queries: NonEmptyReadonlyArray<Query>;
    }
  | {
      readonly type: "reset";
      readonly onCompleteId: CallbackId;
      readonly reload: boolean;
      readonly restore?: {
        readonly dbSchema: DbSchema;
        readonly mnemonic: Mnemonic;
      };
    }
  | {
      readonly type: "ensureDbSchema";
      readonly dbSchema: DbSchema;
    }
  | {
      readonly type: "export";
      readonly onCompleteId: CallbackId;
    }
  | {
      readonly type: "useOwner";
      readonly use: boolean;
      readonly owner: SyncOwner;
    };

export interface MutationChange extends DbChange {
  /** Owner of the change. If undefined, the change belongs to the AppOwner. */
  readonly ownerId?: OwnerId | undefined;
}

export type DbWorkerOutput =
  | {
      readonly type: "onInit";
      readonly appOwner: AppOwner;
      readonly isFirst: boolean;
    }
  | {
      readonly type: "onError";
      readonly error:
        | SqliteError
        | TransferableError
        | TimestampError
        | ProtocolError
        | SymmetricCryptoDecryptError;
    }
  | {
      readonly type: "onChange";
      readonly tabId: Id;
      readonly patches: ReadonlyArray<QueryPatches>;
      readonly onCompleteIds: ReadonlyArray<CallbackId>;
    }
  | {
      readonly type: "onReceive";
      readonly tabId?: Id;
    }
  | {
      readonly type: "onReset";
      readonly onCompleteId: CallbackId;
      readonly reload: boolean;
    }
  | {
      readonly type: "onExport";
      readonly onCompleteId: CallbackId;
      readonly file: Uint8Array;
    };

export type DbWorkerPlatformDeps = ConsoleDep &
  CreateRandomBytesDep &
  CreateSqliteDriverDep &
  CreateWebSocketDep &
  NanoIdLibDep &
  RandomDep &
  TimeDep;

type DbWorkerDeps = Omit<
  DbWorkerPlatformDeps,
  keyof CreateSqliteDriverDep | keyof CreateWebSocketDep
> &
  AppOwnerDep &
  ClientStorageDep &
  ClockDep &
  GetQueryRowsCacheDep &
  PostMessageDep &
  SqliteDep &
  SymmetricCryptoDep &
  SyncDep &
  TimestampConfigDep;

interface AppOwnerDep {
  readonly appOwner: AppOwner;
}

interface ClockDep {
  readonly clock: Clock;
}

interface Clock {
  readonly get: () => Timestamp;
  readonly save: (timestamp: Timestamp) => Result<void, SqliteError>;
}

interface GetQueryRowsCacheDep {
  readonly getQueryRowsCache: (tabId: Id) => QueryRowsCache;
}

interface PostMessageDep {
  readonly postMessage: (message: DbWorkerOutput) => void;
}

export const createDbWorkerForPlatform = (
  platformDeps: DbWorkerPlatformDeps,
): DbWorker =>
  createInitializedWorkerWithHandlers<
    DbWorkerInput,
    DbWorkerOutput,
    DbWorkerDeps
  >({ init: createDbWorkerDeps(platformDeps), handlers });

const createDbWorkerDeps =
  (platformDeps: DbWorkerPlatformDeps) =>
  async (
    initMessage: Extract<DbWorkerInput, { type: "init" }>,
    postMessage: (msg: DbWorkerOutput) => void,
    withErrorReporting: WithErrorReporting,
  ): Promise<DbWorkerDeps | null> => {
    platformDeps.console.enabled = initMessage.config.enableLogging ?? false;

    const sqliteResult = await createSqlite(platformDeps)(
      initMessage.config.name,
      {
        memory: initMessage.config.inMemory ?? false,
      },
    );
    if (!sqliteResult.ok) {
      postMessage({ type: "onError", error: sqliteResult.error });
      return null;
    }
    const sqlite = sqliteResult.value;

    const deps = sqlite.transaction(() => {
      const currentDbSchema = getDbSchema({ sqlite })();
      if (!currentDbSchema.ok) return currentDbSchema;

      let appOwner: AppOwner;
      let clock: Clock;

      const dbIsInitialized = currentDbSchema.value.tables.some(
        (table) => table.name === "evolu_version",
      );

      const platformDepsWithSqlite = { ...platformDeps, sqlite };

      if (dbIsInitialized) {
        const currentVersion = sqlite.exec<{
          protocolVersion: number;
        }>(sql`select protocolVersion from evolu_version limit 1;`);
        if (!currentVersion.ok) return currentVersion;

        // TODO: Handle version migrations here if needed
        // const [{ protocolVersion }] = protocolVersionResult.value.rows;
        // if (protocolVersion < currentProtocolVersion) {
        //   const migrateResult = migrateDatabase({ sqlite })(
        //     protocolVersion,
        //     currentProtocolVersion
        //   );
        //   if (!migrateResult.ok) return migrateResult;
        // }
        const configResult = sqlite.exec<{
          clock: TimestampString;
          appOwnerId: OwnerId;
          appOwnerEncryptionKey: EncryptionKey;
          appOwnerWriteKey: WriteKey;
          appOwnerMnemonic: Mnemonic | null;
        }>(sql`
          select
            clock,
            appOwnerId,
            appOwnerEncryptionKey,
            appOwnerWriteKey,
            appOwnerMnemonic
          from evolu_config
          limit 1;
        `);
        if (!configResult.ok) return configResult;

        const [config] = configResult.value.rows;

        appOwner = {
          type: "AppOwner",
          id: config.appOwnerId,
          encryptionKey: config.appOwnerEncryptionKey,
          writeKey: config.appOwnerWriteKey,
          mnemonic: config.appOwnerMnemonic,
        };
        clock = createClock(platformDepsWithSqlite)(
          timestampStringToTimestamp(config.clock),
        );
      } else {
        appOwner =
          initMessage.config.externalAppOwner ??
          createAppOwner(createOwnerSecret(platformDeps));
        clock = createClock(platformDepsWithSqlite)();

        const result = initializeDb(platformDepsWithSqlite)(appOwner, clock);
        if (!result.ok) return result;
      }

      // Return onInit ASAP, schema updates and sync setup can happen after.
      postMessage({ type: "onInit", appOwner, isFirst: !dbIsInitialized });

      const result = ensureDbSchema({ sqlite })(
        initMessage.dbSchema,
        currentDbSchema.value,
      );
      if (!result.ok) return result;

      const tabQueryRowsCacheMap = new Map<Id, QueryRowsCache>();
      const getQueryRowsCache = (tabId: Id) => {
        let cache = tabQueryRowsCacheMap.get(tabId);
        if (!cache) {
          cache = createQueryRowsCache();
          tabQueryRowsCacheMap.set(tabId, cache);
        }
        return cache;
      };

      const depsWithoutStorage = {
        ...platformDepsWithSqlite,
        appOwner,
        clock,
        getQueryRowsCache,
        postMessage,
        symmetricCrypto: createSymmetricCrypto(platformDeps),
        timestampConfig: initMessage.config,
      };

      const storage = createClientStorage({
        ...depsWithoutStorage,
        getSyncOwner: (ownerId) => sync.getOwner(ownerId),
      })({
        onStorageError: (error) => {
          postMessage({ type: "onError", error });
        },
      });
      if (!storage.ok) return storage;

      const depsWithoutSync = { ...depsWithoutStorage, storage: storage.value };

      const sync = createSync(depsWithoutStorage)({
        transports: initMessage.config.transports,
        onOpen: withErrorReporting(handleSyncOpen(depsWithoutSync)),
        onMessage: withErrorReporting(handleSyncMessage(depsWithoutSync)),
      });

      sync.useOwner(true, appOwner);

      return ok({ ...depsWithoutSync, sync });
    });

    if (!deps.ok) {
      postMessage({ type: "onError", error: deps.error });
      return null;
    }

    return deps.value;
  };

const createClock =
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

const initializeDb =
  (deps: CreateRandomBytesDep & SqliteDep & TimeDep) =>
  (
    initialAppOwner: AppOwner,
    initialClock: Clock,
  ): Result<void, SqliteError> => {
    for (const query of [
      // Never change structure to ensure all versions can read it.
      sql`
        create table evolu_version (
          "protocolVersion" integer not null
        )
        strict;
      `,

      sql`
        insert into evolu_version ("protocolVersion")
        values (${protocolVersion});
      `,

      sql`
        create table evolu_config (
          "clock" text not null,
          "appOwnerId" text not null,
          "appOwnerEncryptionKey" blob not null,
          "appOwnerWriteKey" blob not null,
          "appOwnerMnemonic" text
        )
        strict;
      `,

      sql`
        insert into evolu_config
          (
            "clock",
            "appOwnerId",
            "appOwnerEncryptionKey",
            "appOwnerWriteKey",
            "appOwnerMnemonic"
          )
        values
          (
            ${timestampToTimestampString(initialClock.get())},
            ${initialAppOwner.id},
            ${initialAppOwner.encryptionKey},
            ${initialAppOwner.writeKey},
            ${initialAppOwner.mnemonic ?? null}
          );
      `,

      /**
       * The History table stores all values per ownerId, timestamp, table, id,
       * and column for conflict-free merging using last-write-win CRDT.
       * Denormalizes Timestamp and DbChange for covering index performance.
       * Time travel is available when last-write-win isn't desired. Future
       * optimization will store history more efficiently.
       */
      sql`
        create table evolu_history (
          "ownerId" blob not null,
          "table" text not null,
          "id" blob not null,
          "column" text not null,
          "timestamp" blob not null,
          "value" any
        )
        strict;
      `,

      // Index for reading database changes by owner and timestamp.
      // Timestamp always corresponds to a DbChange.
      sql`
        create index evolu_history_ownerId_timestamp on evolu_history (
          "ownerId",
          "timestamp"
        );
      `,

      sql`
        create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
          "ownerId",
          "table",
          "id",
          "column",
          "timestamp" desc
        );
      `,
    ]) {
      const result = deps.sqlite.exec(query);
      if (!result.ok) return result;
    }

    return ok();
  };

const handlers: Omit<MessageHandlers<DbWorkerInput, DbWorkerDeps>, "init"> = {
  mutate: (deps) => (message) => {
    const mutate = deps.sqlite.transaction(() => {
      const syncChanges: Array<MutationChange> = [];

      for (const change of message.changes) {
        const isLocalOnlyChange = change.table.startsWith("_");
        if (isLocalOnlyChange) {
          const result = applyLocalOnlyChange(deps)(change);
          if (!result.ok) return result;
        } else {
          syncChanges.push(change);
        }
      }

      if (isNonEmptyArray(syncChanges)) {
        const result = applySyncChanges(deps)(syncChanges);
        if (!result.ok) return result;
      }

      // Read writes before commit to update UI ASAP
      const patches = loadQueries(deps)(
        message.tabId,
        message.subscribedQueries,
      );
      if (!patches.ok) return patches;

      // Notify the tab that performed the mutation.
      deps.postMessage({
        type: "onChange",
        tabId: message.tabId,
        patches: patches.value,
        onCompleteIds: message.onCompleteIds,
      });

      // Notify other tabs to refresh their queries.
      deps.postMessage({ type: "onReceive", tabId: message.tabId });

      return ok();
    });

    if (!mutate.ok) {
      deps.postMessage({ type: "onError", error: mutate.error });
      return;
    }
  },

  query: (deps) => (message) => {
    const patches = loadQueries(deps)(message.tabId, message.queries);

    if (!patches.ok) {
      deps.postMessage({ type: "onError", error: patches.error });
      return;
    }

    deps.postMessage({
      type: "onChange",
      tabId: message.tabId,
      patches: patches.value,
      onCompleteIds: [],
    });
  },

  reset: (deps) => (message) => {
    const resetResult = deps.sqlite.transaction(() => {
      const dropAllTablesResult = dropAllTables(deps);
      if (!dropAllTablesResult.ok) return dropAllTablesResult;

      if (message.restore) {
        const dbSchema = getDbSchema(deps)();
        if (!dbSchema.ok) return dbSchema;

        const ensureDbSchemaResult = ensureDbSchema(deps)(
          message.restore.dbSchema,
          dbSchema.value,
        );
        if (!ensureDbSchemaResult.ok) return ensureDbSchemaResult;

        const secret = mnemonicToOwnerSecret(message.restore.mnemonic);
        const appOwner = createAppOwner(secret);
        const clock = createClock(deps)();

        const initializeDbResult = initializeDb(deps)(appOwner, clock);
        if (!initializeDbResult.ok) return initializeDbResult;
      }
      return ok();
    });

    if (!resetResult.ok) {
      deps.postMessage({ type: "onError", error: resetResult.error });
      return;
    }

    deps.postMessage({
      type: "onReset",
      onCompleteId: message.onCompleteId,
      reload: message.reload,
    });
  },

  ensureDbSchema: (deps) => (message) => {
    const ensureSchema = deps.sqlite.transaction(() => {
      const dbSchema = getDbSchema(deps)();
      if (!dbSchema.ok) return dbSchema;

      const ensureDbSchemaResult = ensureDbSchema(deps)(
        message.dbSchema,
        dbSchema.value,
      );
      if (!ensureDbSchemaResult.ok) return ensureDbSchemaResult;

      return ok();
    });

    if (!ensureSchema.ok) {
      deps.postMessage({ type: "onError", error: ensureSchema.error });
      return;
    }
  },

  export: (deps) => (message) => {
    const file = deps.sqlite.export();

    if (!file.ok) {
      deps.postMessage({ type: "onError", error: file.error });
      return;
    }

    deps.postMessage({
      type: "onExport",
      onCompleteId: message.onCompleteId,
      file: file.value,
    });
  },

  useOwner: (deps) => (message) => {
    deps.sync.useOwner(message.use, message.owner);
  },
};

const applyLocalOnlyChange =
  (deps: SqliteDep & TimeDep) => (change: MutationChange) => {
    const dbChange: DbChange = {
      table: change.table,
      id: change.id,
      values: change.values,
    };

    const isDeletion =
      "isDeleted" in dbChange.values && dbChange.values.isDeleted === 1;

    if (isDeletion) {
      const result = deps.sqlite.exec(sql`
        delete from ${sql.identifier(dbChange.table)}
        where id = ${dbChange.id};
      `);
      if (!result.ok) return result;
    } else {
      const date = new Date(deps.time.now()).toISOString();

      for (const [column, value] of objectToEntries(dbChange.values)) {
        const result = deps.sqlite.exec(sql.prepared`
          insert into ${sql.identifier(dbChange.table)}
            ("id", ${sql.identifier(column)}, createdAt, updatedAt)
          values (${dbChange.id}, ${value}, ${date}, ${date})
          on conflict ("id") do update
            set
              ${sql.identifier(column)} = ${value},
              updatedAt = ${date};
        `);
        if (!result.ok) return result;
      }
    }

    return ok();
  };

const applySyncChanges =
  (
    deps: AppOwnerDep &
      ClientStorageDep &
      ClockDep &
      ConsoleDep &
      CreateRandomBytesDep &
      RandomDep &
      SqliteDep &
      SymmetricCryptoDep &
      SyncDep &
      TimeDep &
      TimestampConfigDep,
  ) =>
  (
    changes: NonEmptyReadonlyArray<MutationChange>,
  ): Result<
    void,
    | SqliteError
    | TimestampCounterOverflowError
    | TimestampDriftError
    | TimestampTimeOutOfRangeError
  > => {
    let clockTimestamp = deps.clock.get();
    const ownerMessages = new Map<OwnerId, NonEmptyArray<CrdtMessage>>();

    for (const change of changes) {
      const nextTimestamp = sendTimestamp(deps)(clockTimestamp);
      if (!nextTimestamp.ok) return nextTimestamp;
      clockTimestamp = nextTimestamp.value;

      const { ownerId = deps.appOwner.id, ...dbChange } = change;
      const message = { timestamp: clockTimestamp, change: dbChange };

      const messages = ownerMessages.get(ownerId);
      if (messages) messages.push(message);
      else ownerMessages.set(ownerId, [message]);
    }

    for (const [ownerId, messages] of ownerMessages) {
      const result = applyMessages(deps)(ownerId, messages);
      if (!result.ok) return result;

      const owner = deps.sync.getOwner(ownerId);
      if (!owner?.writeKey) continue;

      const protocolMessage = createProtocolMessageFromCrdtMessages(deps)(
        {
          id: owner.id,
          encryptionKey: owner.encryptionKey,
          writeKey: owner.writeKey,
        },
        messages,
      );
      deps.sync.send(ownerId, protocolMessage);
    }

    return deps.clock.save(clockTimestamp);
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

const loadQueries =
  (deps: GetQueryRowsCacheDep & SqliteDep) =>
  (
    tabId: Id,
    queries: ReadonlyArray<Query>,
  ): Result<ReadonlyArray<QueryPatches>, SqliteError> => {
    const queriesRows = [];

    for (const query of queries) {
      const sqlQuery = deserializeQuery(query);
      const result = deps.sqlite.exec(sqlQuery);
      if (!result.ok) return result;

      queriesRows.push([query, result.value.rows] as const);
      if (sqlQuery.options?.logExplainQueryPlan) {
        explainSqliteQueryPlan(deps)(sqlQuery);
      }
    }

    const queryRowsCache = deps.getQueryRowsCache(tabId);

    const previousState = queryRowsCache.get();
    queryRowsCache.set(queriesRows);

    const currentState = queryRowsCache.get();

    const queryPatchesArray = queries.map(
      (query): QueryPatches => ({
        query,
        patches: makePatches(
          previousState.get(query),
          currentState.get(query) ?? emptyRows,
        ),
      }),
    );
    return ok(queryPatchesArray);
  };

const dropAllTables = (deps: SqliteDep): Result<void, SqliteError> => {
  const schema = getDbSchema(deps)();
  if (!schema.ok) return schema;
  for (const table of schema.value.tables) {
    /**
     * The dropped table is completely removed from the database schema and the
     * disk file. The table can not be recovered. All indices and triggers
     * associated with the table are also deleted.
     * https://sqlite.org/lang_droptable.html
     */
    const result = deps.sqlite.exec(sql`
      drop table ${sql.identifier(table.name)};
    `);
    if (!result.ok) return result;
  }
  return ok();
};

const handleSyncOpen =
  (deps: ClientStorageDep & ConsoleDep): SyncConfig["onOpen"] =>
  (ownerIds, send) => {
    for (const ownerId of ownerIds) {
      const message = createProtocolMessageForSync(deps)(
        ownerId,
        SubscriptionFlags.Subscribe,
      );
      // Errors are handled in ClientStorageDep.
      if (message) send(message);
    }
  };

const handleSyncMessage =
  (
    deps: ClientStorageDep & ConsoleDep & PostMessageDep & SqliteDep,
  ): SyncConfig["onMessage"] =>
  (input, send, getOwner) => {
    const output = deps.sqlite.transaction(() =>
      applyProtocolMessageAsClient(deps)(input, {
        // Returns the write key for an owner if available. When an owner is
        // removed, getOwner returns null, effectively stopping sync.
        getWriteKey: (ownerId) => getOwner(ownerId)?.writeKey ?? null,
      }),
    );

    if (!output.ok) {
      deps.postMessage({ type: "onError", error: output.error });
      return;
    }

    if (output.value) send(output.value);
  };

export interface ClientStorageDep {
  readonly storage: ClientStorage;
}

export interface ClientStorage extends SqliteStorageBase, Storage {}

interface GetSyncOwnerDep {
  readonly getSyncOwner: (ownerId: OwnerId) => SyncOwner | null;
}

const createClientStorage =
  (
    deps: ClockDep &
      GetSyncOwnerDep &
      PostMessageDep &
      RandomDep &
      SqliteDep &
      SymmetricCryptoDep &
      TimeDep &
      TimestampConfigDep,
  ) =>
  (
    options: CreateSqliteStorageBaseOptions,
  ): Result<ClientStorage, SqliteError> => {
    const sqliteStorageBase = createSqliteStorageBase(deps)(options);
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
            deps.postMessage({ type: "onError", error: dbChange.error });
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
            deps.postMessage({ type: "onError", error: result.error });
            return false;
          }
          clockTimestamp = result.value;
        }

        const applyMessagesResult = applyMessages({ ...deps, storage })(
          owner.id,
          decodedAndDecryptedMessages,
        );
        if (!applyMessagesResult.ok) {
          deps.postMessage({
            type: "onError",
            error: applyMessagesResult.error,
          });
          return false;
        }

        const saveResult = deps.clock.save(clockTimestamp);
        if (!saveResult.ok) {
          deps.postMessage({ type: "onError", error: saveResult.error });
          return false;
        }

        deps.postMessage({ type: "onReceive" });

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
          deps.postMessage({ type: "onError", error: result.error });
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
