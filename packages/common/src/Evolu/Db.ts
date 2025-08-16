import { isNonEmptyArray, NonEmptyReadonlyArray } from "../Array.js";
import { assert, assertNonEmptyReadonlyArray } from "../Assert.js";
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
import { constFalse, exhaustiveCheck } from "../Function.js";
import { NanoIdLibDep } from "../NanoId.js";
import { objectToEntries } from "../Object.js";
import { RandomDep } from "../Random.js";
import { ok, Result } from "../Result.js";
import {
  createSqlite,
  CreateSqliteDriverDep,
  explainSqliteQueryPlan,
  SafeSql,
  sql,
  SqliteDep,
  SqliteError,
  SqliteQuery,
  SqliteRow,
  SqliteValue,
} from "../Sqlite.js";
import { TimeDep } from "../Time.js";
import { array, Id, Mnemonic, object, SimpleName, String } from "../Type.js";
import {
  createInitializedWorker,
  Worker,
  WorkerPostMessageDep,
} from "../Worker.js";
import { Config } from "./Config.js";
import { makePatches, QueryPatches } from "./Diff.js";
import {
  AppOwner,
  createAppOwner,
  createOwnerSecret,
  mnemonicToOwnerSecret,
  OwnerId,
  ShardOwner,
  SharedOwner,
  WriteKey,
} from "./Owner.js";
import {
  applyProtocolMessageAsClient,
  Base64Url256,
  BinaryId,
  binaryIdToId,
  BinaryOwnerId,
  binaryOwnerIdToOwnerId,
  CrdtMessage,
  createProtocolMessageForSync,
  createProtocolMessageFromCrdtMessages,
  DbChange,
  decryptAndDecodeDbChange,
  encodeAndEncryptDbChange,
  idToBinaryId,
  ownerIdToBinaryOwnerId,
  ProtocolError,
  protocolVersion,
  Storage,
  StorageDep,
} from "./Protocol.js";
import {
  createQueryRowsCache,
  deserializeQuery,
  emptyRows,
  Query,
  QueryRowsCache,
} from "./Query.js";
import {
  createSqliteStorageBase,
  CreateSqliteStorageBaseOptions,
  SqliteStorageBase,
} from "./Storage.js";
import { CreateSyncDep, SyncConfig, SyncDep } from "./Sync.js";
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

export const DbTable = object({
  name: Base64Url256,
  columns: array(Base64Url256),
});
export type DbTable = typeof DbTable.Type;

export const DbIndex = object({ name: String, sql: String });
export type DbIndex = typeof DbIndex.Type;

export const DbSchema = object({
  tables: array(DbTable),
  indexes: array(DbIndex),
});
export type DbSchema = typeof DbSchema.Type;

export interface MutationChange extends DbChange {
  readonly owner?: ShardOwner | SharedOwner | undefined;
}

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
    };

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

export type DbWorkerPlatformDeps = CreateSqliteDriverDep &
  CreateSyncDep &
  ConsoleDep &
  TimeDep &
  RandomDep &
  NanoIdLibDep &
  CreateRandomBytesDep;

type DbWorkerDeps = Omit<
  DbWorkerPlatformDeps,
  keyof CreateSqliteDriverDep | keyof CreateSyncDep
> &
  SqliteDep &
  SyncDep &
  TimestampConfigDep &
  SymmetricCryptoDep &
  PostMessageDep &
  OwnersDep &
  ClockDep &
  GetQueryRowsCacheDep &
  ClientStorageDep;

type PostMessageDep = WorkerPostMessageDep<DbWorkerOutput>;

interface OwnersDep {
  readonly owners: Owners;
}

type Owners = Map<OwnerId, AppOwner | ShardOwner | SharedOwner>;

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

const createClock =
  (deps: NanoIdLibDep & SqliteDep) =>
  (initialTimestamp = createInitialTimestamp(deps)): Clock => {
    let currentTimestamp = initialTimestamp;

    return {
      get: () => currentTimestamp,
      save: (timestamp) => {
        currentTimestamp = timestamp;

        const timestampString = timestampToTimestampString(timestamp);
        const saveTimestamp = deps.sqlite.exec(sql.prepared`
          update evolu_config set "clock" = ${timestampString};
        `);
        if (!saveTimestamp.ok) return saveTimestamp;

        return ok();
      },
    };
  };

export const createDbWorkerForPlatform = (
  platformDeps: DbWorkerPlatformDeps,
): DbWorker => {
  const tabQueryRowsCacheMap = new Map<Id, QueryRowsCache>();
  const getQueryRowsCache = (tabId: Id) => {
    let cache = tabQueryRowsCacheMap.get(tabId);
    if (!cache) {
      cache = createQueryRowsCache();
      tabQueryRowsCacheMap.set(tabId, cache);
    }
    return cache;
  };

  return createInitializedWorker<DbWorkerInput, DbWorkerOutput, DbWorkerDeps>({
    init: async (initMessage, postMessage, safeHandler) => {
      platformDeps.console.enabled = initMessage.config.enableLogging ?? false;

      const sqliteResult = await createSqlite(platformDeps)(
        initMessage.config.name,
        { memory: initMessage.config.inMemory ?? false },
      );
      if (!sqliteResult.ok) {
        postMessage({ type: "onError", error: sqliteResult.error });
        return null;
      }

      const sqlite = sqliteResult.value;
      const platformDepsWithSqlite = { ...platformDeps, sqlite };

      const deps = sqlite.transaction(() => {
        const currentDbSchema = getDbSchema({ sqlite })();
        if (!currentDbSchema.ok) return currentDbSchema;

        let appOwner: AppOwner;
        let clock: Clock;

        const dbIsInitialized = currentDbSchema.value.tables.some(
          (table) => table.name === "evolu_version",
        );

        if (dbIsInitialized) {
          const versionResult = sqlite.exec<{
            protocolVersion: number;
          }>(sql`select protocolVersion from evolu_version limit 1;`);
          if (!versionResult.ok) return versionResult;

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
            initMessage.config.initialAppOwner ??
            createAppOwner(createOwnerSecret(platformDeps));
          clock = createClock(platformDepsWithSqlite)();
          const initializeDbResult = initializeDb(platformDepsWithSqlite)(
            appOwner,
            clock,
          );
          if (!initializeDbResult.ok) return initializeDbResult;
        }

        const ensureDbSchemaResult = ensureDbSchema({ sqlite })(
          initMessage.dbSchema,
          currentDbSchema.value,
        );
        if (!ensureDbSchemaResult.ok) return ensureDbSchemaResult;

        const owners: Owners = new Map();
        owners.set(appOwner.id, appOwner);

        const depsWithoutSyncAndStorage = {
          ...platformDeps,
          postMessage,
          sqlite,
          timestampConfig: initMessage.config,
          symmetricCrypto: createSymmetricCrypto(platformDeps),
          getQueryRowsCache,
          clock,
          owners,
        };

        const storage = createClientStorage(depsWithoutSyncAndStorage)({
          onStorageError: (error) => {
            postMessage({ type: "onError", error });
          },
        });
        if (!storage.ok) return storage;

        const depsWithoutSync = {
          ...depsWithoutSyncAndStorage,
          storage: storage.value,
        };

        postMessage({
          type: "onInit",
          appOwner,
          isFirst: !dbIsInitialized,
        });

        const sync = platformDeps.createSync(platformDeps)({
          ...initMessage.config,
          transports: initMessage.config.transports,
          onOpen: safeHandler(handleSyncOpen(depsWithoutSync)),
          onMessage: safeHandler(createHandleSyncMessage(depsWithoutSync)),
        });

        return ok({ ...depsWithoutSync, sync });
      });

      if (!deps.ok) {
        postMessage({ type: "onError", error: deps.error });
        return null;
      }

      return deps.value;
    },

    onMessage: (deps) => (message) => {
      switch (message.type) {
        case "mutate": {
          const mutate = deps.sqlite.transaction(() => {
            // 1. Partition changes: local-only vs sync
            const syncChanges: Array<MutationChange> = [];
            const localOnlyChanges: Array<MutationChange> = [];

            for (const change of message.changes) {
              // Table name starting with '_' is local-only (not synced).
              if (change.table.startsWith("_")) localOnlyChanges.push(change);
              else syncChanges.push(change);
            }

            // 2. Apply local-only changes immediately (convert to DbChange for processing)
            for (const change of localOnlyChanges) {
              const dbChange: DbChange = {
                table: change.table,
                id: change.id,
                values: change.values,
              };
              const isDeletion =
                "isDeleted" in dbChange.values &&
                dbChange.values.isDeleted === 1;

              if (isDeletion) {
                const result = deps.sqlite.exec(sql`
                  delete from ${sql.identifier(dbChange.table)}
                  where id = ${dbChange.id};
                `);
                if (!result.ok) return result;
              } else {
                const date = new Date(deps.time.now()).toISOString();
                for (const [column, value] of objectToEntries(
                  dbChange.values,
                )) {
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
            }

            // 3. Define change notification handler
            // Note: We can call this before the transaction commits because
            // there's no reason why it should fail and we want to update
            // the UI as soon as possible.
            const onChange = () => {
              deps.console.log("[db]", "onChange", {
                subscribedQueries: message.subscribedQueries,
              });
              const patches = loadQueries(deps)(
                message.tabId,
                message.subscribedQueries,
              );
              if (!patches.ok) {
                deps.postMessage({ type: "onError", error: patches.error });
                return;
              }
              // Notify the tab that performed the mutation.
              deps.postMessage({
                type: "onChange",
                tabId: message.tabId,
                patches: patches.value,
                onCompleteIds: message.onCompleteIds,
              });
              // Notify other tabs to refresh their queries.
              deps.postMessage({ type: "onReceive", tabId: message.tabId });
            };

            // 4. Handle case with no sync changes
            if (!isNonEmptyArray(syncChanges)) {
              onChange();
              return ok();
            }

            // 5. Group sync changes by owner
            const appOwner = Array.from(deps.owners.values()).find(
              (owner) => owner.type === "AppOwner",
            );
            assert(appOwner, "app owner not found");

            const changesByOwner = new Map<
              OwnerId,
              [AppOwner | ShardOwner | SharedOwner, Array<DbChange>]
            >();
            for (const { owner, ...dbChange } of syncChanges) {
              const actualOwner = owner ?? appOwner;
              if (!changesByOwner.has(actualOwner.id)) {
                changesByOwner.set(actualOwner.id, [actualOwner, []]);
              }
              changesByOwner.get(actualOwner.id)![1].push(dbChange);
            }

            // 6. Apply changes and send protocol messages for each owner
            for (const [_ownerId, [owner, ownerChanges]] of changesByOwner) {
              if (!isNonEmptyArray(ownerChanges)) continue;

              const messages = applyChanges(deps)(owner, ownerChanges);
              if (!messages.ok) return messages;

              const protocolMessage = createProtocolMessageFromCrdtMessages(
                deps,
              )(owner, messages.value);

              deps.console.log(
                "[db]",
                "send data message for owner",
                owner.id,
                messages.value,
                protocolMessage,
              );
              deps.sync.send(protocolMessage);
            }

            onChange();

            return ok();
          });

          if (!mutate.ok) {
            deps.postMessage({ type: "onError", error: mutate.error });
            return;
          }

          break;
        }

        case "query": {
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
          break;
        }

        case "reset": {
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

          break;
        }

        case "ensureDbSchema": {
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
          break;
        }

        case "export": {
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
          break;
        }

        default:
          exhaustiveCheck(message);
      }
    },
  });
};

/**
 * Get the current database schema by reading SQLite metadata.
 *
 * TODO: Refactor out Evolu stuff and move it to Sqlite.
 */
export const getDbSchema =
  (deps: SqliteDep) =>
  ({ allIndexes = false }: { allIndexes?: boolean } = {}): Result<
    DbSchema,
    SqliteError
  > => {
    const map = new Map<Base64Url256, Array<Base64Url256>>();

    const tableAndColumnInfoRows = deps.sqlite.exec(sql`
      select
        sqlite_master.name as tableName,
        table_info.name as columnName
      from
        sqlite_master
        join pragma_table_info(sqlite_master.name) as table_info;
    `);

    if (!tableAndColumnInfoRows.ok) return tableAndColumnInfoRows;

    tableAndColumnInfoRows.value.rows.forEach((row) => {
      const { tableName, columnName } = row as unknown as {
        tableName: Base64Url256;
        columnName: Base64Url256;
      };
      if (!map.has(tableName)) map.set(tableName, []);
      map.get(tableName)?.push(columnName);
    });

    const tables = Array.from(map, ([name, columns]) => ({ name, columns }));

    const indexesRows = deps.sqlite.exec(
      allIndexes
        ? sql`
            select name, sql
            from sqlite_master
            where type = 'index' and name not like 'sqlite_%';
          `
        : sql`
            select name, sql
            from sqlite_master
            where
              type = 'index'
              and name not like 'sqlite_%'
              and name not like 'evolu_%';
          `,
    );

    if (!indexesRows.ok) return indexesRows;

    const indexes = indexesRows.value.rows.map(
      (row): DbIndex => ({
        name: row.name as string,
        /**
         * SQLite returns "CREATE INDEX" for "create index" for some reason.
         * Other keywords remain unchanged. We have to normalize the casing for
         * {@link indexesAreEqual} manually.
         */
        sql: (row.sql as string)
          .replace("CREATE INDEX", "create index")
          .replace("CREATE UNIQUE INDEX", "create unique index"),
      }),
    );

    return ok({ tables, indexes });
  };

const indexesAreEqual = (self: DbIndex, that: DbIndex): boolean =>
  self.name === that.name && self.sql === that.sql;

export interface DbSnapshot {
  readonly schema: DbSchema;
  readonly tables: Array<{
    name: string;
    rows: ReadonlyArray<SqliteRow>;
  }>;
}

// TODO: Move to test helpers.
export const getDbSnapshot = (deps: SqliteDep): DbSnapshot => {
  const schema = getDbSchema(deps)({ allIndexes: true });
  assert(schema.ok, "bug");

  const tables = [];

  for (const table of schema.value.tables) {
    const result = deps.sqlite.exec(sql`
      select * from ${sql.identifier(table.name)};
    `);
    assert(result.ok, "bug");

    tables.push({
      name: table.name,
      rows: result.value.rows,
    });
  }

  return { schema: schema.value, tables };
};

const ensureDbSchema =
  (deps: SqliteDep) =>
  (
    newSchema: DbSchema,
    currentSchema: DbSchema,
    options?: { ignoreIndexes: boolean },
  ): Result<void, SqliteError> => {
    const queries: Array<SqliteQuery> = [];

    newSchema.tables.forEach((newTable) => {
      const currentTable = currentSchema.tables.find(
        (t) => t.name === newTable.name,
      );
      if (!currentTable) {
        queries.push({
          sql: createAppTable(newTable.name, newTable.columns),
          parameters: [],
        });
      } else {
        newTable.columns
          .filter((newColumn) => !currentTable.columns.includes(newColumn))
          .forEach((newColumn) => {
            queries.push(sql`
              alter table ${sql.identifier(newTable.name)}
              add column ${sql.identifier(newColumn)} blob;
            `);
          });
      }
    });

    if (options?.ignoreIndexes !== true) {
      // Remove current indexes that are not in the newSchema.
      currentSchema.indexes
        .filter(
          (currentIndex) =>
            !newSchema.indexes.some((newIndex) =>
              indexesAreEqual(newIndex, currentIndex),
            ),
        )
        .forEach((index) => {
          queries.push(sql`drop index ${sql.identifier(index.name)};`);
        });

      // Add new indexes that are not in the currentSchema.
      newSchema.indexes
        .filter(
          (newIndex) =>
            !currentSchema.indexes.some((currentIndex) =>
              indexesAreEqual(newIndex, currentIndex),
            ),
        )
        .forEach((newIndex) => {
          queries.push({ sql: `${newIndex.sql};` as SafeSql, parameters: [] });
        });
    }

    for (const query of queries) {
      const result = deps.sqlite.exec(query);
      if (!result.ok) return result;
    }
    return ok();
  };

export const createAppTable = (
  tableName: string,
  columns: ReadonlyArray<string>,
): SafeSql =>
  `
    create table ${sql.identifier(tableName).sql} (
      "id" text primary key,
      ${columns
        // Add default columns.
        .concat(["createdAt", "updatedAt", "isDeleted"])
        .filter((c) => c !== "id")
        // "A column with affinity BLOB does not prefer one storage class over another
        // and no attempt is made to coerce data from one storage class into another."
        // https://www.sqlite.org/datatype3.html
        .map((name) => `${sql.identifier(name).sql} blob`)
        .join(", ")}
    );
  ` as SafeSql;

const initializeDb =
  (deps: SqliteDep & TimeDep & CreateRandomBytesDep) =>
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

const applyChanges =
  (
    deps: SqliteDep &
      TimeDep &
      TimestampConfigDep &
      RandomDep &
      ClientStorageDep &
      ClockDep,
  ) =>
  (
    owner: AppOwner | ShardOwner | SharedOwner,
    changes: NonEmptyReadonlyArray<DbChange>,
  ): Result<
    NonEmptyReadonlyArray<CrdtMessage>,
    | TimestampTimeOutOfRangeError
    | TimestampDriftError
    | TimestampCounterOverflowError
    | SqliteError
  > => {
    let clockTimestamp = deps.clock.get();

    const messages: Array<CrdtMessage> = [];

    for (const change of changes) {
      const nextTimestamp = sendTimestamp(deps)(clockTimestamp);
      if (!nextTimestamp.ok) return nextTimestamp;
      clockTimestamp = nextTimestamp.value;
      messages.push({ timestamp: clockTimestamp, change });
    }

    const apply = applyMessages(deps)(owner, messages, clockTimestamp);
    if (!apply.ok) return apply;

    assertNonEmptyReadonlyArray(messages);
    return ok(messages);
  };

const applyMessages =
  (deps: SqliteDep & RandomDep & ClientStorageDep & ClockDep) =>
  (
    owner: AppOwner | ShardOwner | SharedOwner,
    messages: ReadonlyArray<CrdtMessage>,
    clockTimestamp: Timestamp,
  ): Result<void, SqliteError> => {
    const ownerId = ownerIdToBinaryOwnerId(owner.id);

    for (const message of messages) {
      const result1 = applyMessageToAppTable(deps)(ownerId, message);
      if (!result1.ok) return result1;

      const result2 = applyMessageToTimestampAndHistoryTables(deps)(
        ownerId,
        message,
      );
      if (!result2.ok) return result2;
    }

    return deps.clock.save(clockTimestamp);
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
  (deps: SqliteDep & ClientStorageDep) =>
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
  (deps: StorageDep & ConsoleDep & OwnersDep): SyncConfig["onOpen"] =>
  (send) => {
    for (const [id] of deps.owners) {
      const message = createProtocolMessageForSync(deps)(id);
      if (!message) return;
      deps.console.log("[db]", "send initial sync message", message);
      send(message);
    }
  };

const createHandleSyncMessage =
  (
    deps: PostMessageDep & StorageDep & SqliteDep & ConsoleDep & OwnersDep,
  ): SyncConfig["onMessage"] =>
  (input, send) => {
    deps.console.log("[db]", "receive sync message", input);

    const output = deps.sqlite.transaction(() =>
      applyProtocolMessageAsClient(deps)(input, {
        getWriteKey: (ownerId) => deps.owners.get(ownerId)?.writeKey ?? null,
      }),
    );
    if (!output.ok) {
      deps.postMessage({ type: "onError", error: output.error });
      return;
    }

    if (output.value) {
      deps.console.log("[db]", "respond sync message", output.value);
      send(output.value);
    }
  };

export interface ClientStorageDep {
  readonly storage: ClientStorage;
}

export interface ClientStorage extends SqliteStorageBase, Storage {}

const createClientStorage =
  (
    deps: SqliteDep &
      PostMessageDep &
      SymmetricCryptoDep &
      RandomDep &
      TimeDep &
      OwnersDep &
      ClockDep &
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
        const owner = deps.owners.get(binaryOwnerIdToOwnerId(ownerId));
        if (!owner) {
          // Owner was removed to stop syncing for this owner
          return false;
        }

        const decodedAndDecryptedMessages: Array<CrdtMessage> = [];

        for (const message of messages) {
          const dbChange = decryptAndDecodeDbChange(deps)(
            message,
            owner.encryptionKey,
          );

          if (!dbChange.ok) {
            deps.postMessage({
              type: "onError",
              error: dbChange.error,
            });
            return false;
          }

          decodedAndDecryptedMessages.push({
            timestamp: message.timestamp,
            change: dbChange.value,
          });
        }

        let clockTimestamp = deps.clock.get();

        for (const message of messages) {
          const receive = receiveTimestamp(deps)(
            clockTimestamp,
            message.timestamp,
          );
          if (!receive.ok) {
            deps.postMessage({ type: "onError", error: receive.error });
            return false;
          }
          clockTimestamp = receive.value;
        }

        const applyMessagesResult = applyMessages({ ...deps, storage })(
          owner,
          decodedAndDecryptedMessages,
          clockTimestamp,
        );

        if (!applyMessagesResult.ok) {
          deps.postMessage({
            type: "onError",
            error: applyMessagesResult.error,
          });
          return false;
        }

        deps.postMessage({ type: "onReceive" });

        return true;
      },

      readDbChange: (ownerId, timestamp) => {
        const owner = deps.owners.get(binaryOwnerIdToOwnerId(ownerId));
        if (!owner) {
          // Owner was removed to stop syncing for this owner
          return null;
        }

        const result = deps.sqlite.exec<{
          table: Base64Url256;
          id: BinaryId;
          column: Base64Url256;
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
