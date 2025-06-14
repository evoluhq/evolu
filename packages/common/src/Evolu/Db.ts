import {
  isNonEmptyArray,
  isNonEmptyReadonlyArray,
  NonEmptyReadonlyArray,
} from "../Array.js";
import { assert, assertNonEmptyReadonlyArray } from "../Assert.js";
import { CallbackId } from "../Callbacks.js";
import { ConsoleDep } from "../Console.js";
import {
  CreateMnemonicDep,
  CreateRandomBytesDep,
  createSymmetricCrypto,
  SymmetricCryptoDecryptError,
  SymmetricCryptoDep,
} from "../Crypto.js";
import { eqArrayNumber } from "../Eq.js";
import { TransferableError } from "../Error.js";
import { constFalse, exhaustiveCheck } from "../Function.js";
import { NanoIdLibDep } from "../NanoId.js";
import { objectToEntries } from "../Object.js";
import { RandomDep } from "../Random.js";
import { createRef, Ref } from "../Ref.js";
import { err, ok, Result } from "../Result.js";
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
  createOwnerRow,
  OwnerRow,
  OwnerWithWriteAccess,
} from "./Owner.js";
import {
  applyProtocolMessageAsClient,
  Base64Url256,
  BinaryId,
  binaryIdToId,
  BinaryOwnerId,
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
  Millis,
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
      readonly initialData: ReadonlyArray<DbChange>;
    }
  | {
      readonly type: "mutate";
      readonly tabId: Id;
      readonly changes: NonEmptyReadonlyArray<DbChange>;
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
      readonly owner: AppOwner;
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
  CreateMnemonicDep &
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
  OwnerRowRefDep &
  GetQueryRowsCacheDep &
  ClientStorageDep;

type PostMessageDep = WorkerPostMessageDep<DbWorkerOutput>;

// TODO: More owners (the whole table with ad-hoc added)
export interface OwnerRowRefDep {
  readonly ownerRowRef: Ref<OwnerRow>;
}

interface GetQueryRowsCacheDep {
  readonly getQueryRowsCache: (tabId: Id) => QueryRowsCache;
}

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
      );

      if (!sqliteResult.ok) {
        postMessage({ type: "onError", error: sqliteResult.error });
        return null;
      }
      const sqlite = sqliteResult.value;

      const deps = sqlite.transaction(() => {
        const currentDbSchema = getDbSchema({ sqlite })();
        if (!currentDbSchema.ok) return currentDbSchema;

        const ensureDbSchemaResult = ensureDbSchema({ sqlite })(
          initMessage.dbSchema,
          currentDbSchema.value,
        );
        if (!ensureDbSchemaResult.ok) return ensureDbSchemaResult;

        const maybeMigrateToVersion0Result = maybeMigrateToVersion0({ sqlite })(
          currentDbSchema.value,
        );
        if (!maybeMigrateToVersion0Result.ok)
          return maybeMigrateToVersion0Result;

        const ownerExists = currentDbSchema.value.tables.some(
          (table) => table.name === "evolu_owner",
        );

        const appOwnerAndOwnerRow = ownerExists
          ? selectAppOwner({ sqlite })
          : initializeDb({ ...platformDeps, sqlite })(
              maybeMigrateToVersion0Result.value?.mnemonic ??
                initMessage.config.mnemonic,
            );
        if (!appOwnerAndOwnerRow.ok) return appOwnerAndOwnerRow;

        const [appOwner, ownerRow] = appOwnerAndOwnerRow.value;

        const depsWithoutSyncAndStorage = {
          ...platformDeps,
          postMessage,
          sqlite,
          timestampConfig: initMessage.config,
          symmetricCrypto: createSymmetricCrypto(platformDeps),
          getQueryRowsCache,
          ownerRowRef: createRef(ownerRow),
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

        if (maybeMigrateToVersion0Result.value) {
          const result = applyMessages(depsWithoutSync)(
            maybeMigrateToVersion0Result.value.messages,
            maybeMigrateToVersion0Result.value.lastTimestamp,
          );
          if (!result.ok) return result;
        }

        if (!ownerExists && isNonEmptyReadonlyArray(initMessage.initialData)) {
          const result = applyChanges(depsWithoutSync)(initMessage.initialData);
          if (!result.ok) return result;
        }

        postMessage({ type: "onInit", owner: appOwner });

        const sync = platformDeps.createSync(platformDeps)({
          ...initMessage.config,
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
            const toSyncChanges = [];
            const localOnlyChanges = [];

            for (const change of message.changes) {
              // Table name starting with '_' is local-only (not synced).
              if (change.table.startsWith("_")) localOnlyChanges.push(change);
              else toSyncChanges.push(change);
            }

            for (const change of localOnlyChanges) {
              if (
                "isDeleted" in change.values &&
                change.values.isDeleted === 1
              ) {
                const result = deps.sqlite.exec(sql`
                  delete from ${sql.identifier(change.table)}
                  where id = ${change.id};
                `);
                if (!result.ok) return result;
              } else {
                const millis = Millis.from(deps.time.now());
                if (!millis.ok) {
                  return err<TimestampTimeOutOfRangeError>({
                    type: "TimestampTimeOutOfRangeError",
                  });
                }
                const date = new Date(millis.value).toISOString();
                for (const [column, value] of objectToEntries(change.values)) {
                  const result = deps.sqlite.exec(sql.prepared`
                    insert into ${sql.identifier(change.table)}
                      ("id", ${sql.identifier(column)}, createdAt, updatedAt)
                    values (${change.id}, ${value}, ${date}, ${date})
                    on conflict ("id") do update
                      set
                        ${sql.identifier(column)} = ${value},
                        updatedAt = ${date};
                  `);
                  if (!result.ok) return result;
                }
              }
            }

            /**
             * We don't have to wait for the transaction to end because changes
             * are idempotent, so there is no reason why they should fail. We
             * want to call onChange ASAP.
             */
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

            if (!isNonEmptyArray(toSyncChanges)) {
              onChange();
              return ok();
            }

            const messages = applyChanges(deps)(toSyncChanges, onChange);
            if (!messages.ok) return messages;

            const owner = deps.ownerRowRef.get();
            // TODO: Check owner whether it's allowed to write, return an
            // error if not.
            if (owner.writeKey == null) {
              return ok();
            }

            const protocolMessage = createProtocolMessageFromCrdtMessages(deps)(
              owner as OwnerWithWriteAccess,
              messages.value,
            );

            deps.console.log(
              "[db]",
              "send data message",
              messages.value,
              protocolMessage,
            );
            deps.sync.send(protocolMessage);

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

              const initializeDbResult = initializeDb(deps)(
                message.restore.mnemonic,
              );
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

const selectAppOwner = (
  deps: SqliteDep,
): Result<[AppOwner, OwnerRow], SqliteError> => {
  const result = deps.sqlite.exec<OwnerRow>(sql`
    select mnemonic, id, createdAt, encryptionKey, writeKey, timestamp
    from evolu_owner
    order by createdAt asc
    limit 1;
  `);

  if (!result.ok) return result;

  const {
    rows: [ownerRow],
  } = result.value;

  assert(ownerRow.writeKey != null, "The writeKey is null");

  const appOwner: AppOwner = {
    type: "AppOwner",
    mnemonic: ownerRow.mnemonic,
    createdAt: ownerRow.createdAt,
    id: ownerRow.id,
    encryptionKey: ownerRow.encryptionKey,
    writeKey: ownerRow.writeKey,
  };

  return ok([appOwner, ownerRow]);
};

const initializeDb =
  (
    deps: SqliteDep &
      NanoIdLibDep &
      CreateMnemonicDep &
      TimeDep &
      CreateRandomBytesDep,
  ) =>
  (mnemonic?: Mnemonic): Result<[AppOwner, OwnerRow], SqliteError> => {
    for (const query of [
      sql`
        create table evolu_config (
          "key" text not null primary key,
          "value" any not null
        )
        strict;
      `,

      sql`
        insert into evolu_config ("key", "value")
        values ('protocolVersion', ${protocolVersion});
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

      sql`
        create table evolu_owner (
          "mnemonic" text not null primary key,
          "id" text not null,
          "encryptionKey" blob not null,
          "createdAt" text not null,
          "writeKey" blob,
          "timestamp" text not null
        )
        strict;
      `,
    ]) {
      const result = deps.sqlite.exec(query);
      if (!result.ok) return result;
    }

    const appOwner = createAppOwner(deps)(mnemonic);
    const ownerRow = createOwnerRow(deps)(appOwner);

    const result = deps.sqlite.exec(sql`
      insert into evolu_owner
        (
          "mnemonic",
          "id",
          "encryptionKey",
          "createdAt",
          "writeKey",
          "timestamp"
        )
      values
        (
          ${ownerRow.mnemonic},
          ${ownerRow.id},
          ${ownerRow.encryptionKey},
          ${ownerRow.createdAt},
          ${ownerRow.writeKey},
          ${ownerRow.timestamp}
        );
    `);

    if (!result.ok) return result;

    return ok([appOwner, ownerRow]);
  };

const applyChanges =
  (
    deps: SqliteDep &
      TimeDep &
      TimestampConfigDep &
      RandomDep &
      OwnerRowRefDep &
      ClientStorageDep,
  ) =>
  (
    changes: NonEmptyReadonlyArray<DbChange>,
    onChange?: () => void,
  ): Result<
    NonEmptyReadonlyArray<CrdtMessage>,
    | TimestampTimeOutOfRangeError
    | TimestampDriftError
    | TimestampCounterOverflowError
    | SqliteError
  > => {
    let lastTimestamp = timestampStringToTimestamp(
      deps.ownerRowRef.get().timestamp,
    );

    const messages: Array<CrdtMessage> = [];

    for (const change of changes) {
      const nextTimestamp = sendTimestamp(deps)(lastTimestamp);
      if (!nextTimestamp.ok) return nextTimestamp;
      lastTimestamp = nextTimestamp.value;
      messages.push({ timestamp: lastTimestamp, change });
    }

    const apply = applyMessages(deps)(messages, lastTimestamp);
    if (!apply.ok) return apply;

    if (onChange) onChange();

    assertNonEmptyReadonlyArray(messages);
    return ok(messages);
  };

const applyMessages =
  (deps: SqliteDep & RandomDep & OwnerRowRefDep & ClientStorageDep) =>
  (
    messages: ReadonlyArray<CrdtMessage>,
    lastTimestamp: Timestamp,
  ): Result<void, SqliteError> => {
    const ownerId = ownerIdToBinaryOwnerId(deps.ownerRowRef.get().id);

    for (const message of messages) {
      const result1 = applyMessageToAppTable(deps)(ownerId, message);
      if (!result1.ok) return result1;

      const result2 = applyMessageToTimestampAndHistoryTables(deps)(
        ownerId,
        message,
      );
      if (!result2.ok) return result2;
    }

    const timestamp = timestampToTimestampString(lastTimestamp);
    deps.ownerRowRef.modify((owner) => ({ ...owner, timestamp }));
    const saveTimestamp = deps.sqlite.exec(sql.prepared`
      update evolu_owner set "timestamp" = ${timestamp};
    `);
    if (!saveTimestamp.ok) return saveTimestamp;

    return ok();
  };

const applyMessageToAppTable =
  (deps: SqliteDep & OwnerRowRefDep) =>
  (ownerId: BinaryOwnerId, message: CrdtMessage): Result<void, SqliteError> => {
    const date = new Date(message.timestamp.millis).toISOString();
    const timestamp = timestampToBinaryTimestamp(message.timestamp);

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
          ("id", ${sql.identifier(column)}, createdAt, updatedAt)
        select ${message.change.id}, ${value}, ${date}, ${date}
        where
          (select "timestamp" from lastTimestamp) is null
          or (select "timestamp" from lastTimestamp) < ${timestamp}
        on conflict ("id") do update
          set
            ${sql.identifier(column)} = ${value},
            updatedAt = ${date}
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

export const maybeMigrateToVersion0 =
  (deps: SqliteDep) =>
  (
    schema: DbSchema,
  ): Result<
    {
      readonly messages: ReadonlyArray<CrdtMessage>;
      readonly mnemonic: Mnemonic;
      readonly lastTimestamp: Timestamp;
    } | null,
    SqliteError
  > => {
    // evolu_history is a new table
    const hasOwnerButNoHistory =
      schema.tables.some((t) => t.name === "evolu_owner") &&
      !schema.tables.some((t) => t.name === "evolu_history");
    if (!hasOwnerButNoHistory) {
      return ok(null);
    }

    const mnemonicAndLastTimestamp = deps.sqlite.exec<{
      mnemonic: Mnemonic;
      timestamp: TimestampString;
    }>(sql` select mnemonic, timestamp from evolu_owner limit 1; `);
    if (!mnemonicAndLastTimestamp.ok) return mnemonicAndLastTimestamp;

    const messagesRows = deps.sqlite.exec<{
      timestamp: TimestampString;
      table: Base64Url256;
      id: Id;
      column: Base64Url256;
      value: SqliteValue;
    }>(sql`
      select "timestamp", "table", "id", "column", "value" from evolu_message;
    `);

    if (!messagesRows.ok) return messagesRows;

    for (const query of [
      sql`drop table evolu_owner;`,
      sql`drop table evolu_message;`,
    ]) {
      const result = deps.sqlite.exec(query);
      if (!result.ok) return result;
    }

    const messages = messagesRows.value.rows.map((message) => ({
      timestamp: timestampStringToTimestamp(message.timestamp),
      change: {
        id: message.id,
        table: message.table,
        values: { [message.column]: message.value },
      },
    }));

    const {
      rows: [{ mnemonic, timestamp }],
    } = mnemonicAndLastTimestamp.value;
    const lastTimestamp = timestampStringToTimestamp(timestamp);

    return ok({ messages, mnemonic, lastTimestamp });
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
  (deps: OwnerRowRefDep & StorageDep & ConsoleDep): SyncConfig["onOpen"] =>
  (send) => {
    const ownerId = deps.ownerRowRef.get().id;
    const message = createProtocolMessageForSync(deps)(ownerId);
    if (message) {
      deps.console.log("[db]", "send initial sync message", message);
      send(message);
    }
  };

const createHandleSyncMessage =
  (
    deps: PostMessageDep & StorageDep & SqliteDep & ConsoleDep & OwnerRowRefDep,
  ): SyncConfig["onMessage"] =>
  (input, send) => {
    deps.console.log("[db]", "receive sync message", input);
    const { writeKey } = deps.ownerRowRef.get();

    const output = deps.sqlite.transaction(() =>
      applyProtocolMessageAsClient(deps)(input, {
        getWriteKey: (_ownerId) => writeKey,
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

export interface ClientStorage extends SqliteStorageBase, Storage {}

export interface ClientStorageDep {
  readonly storage: ClientStorage;
}

const createClientStorage =
  (
    deps: SqliteDep &
      PostMessageDep &
      SymmetricCryptoDep &
      OwnerRowRefDep &
      RandomDep &
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

      writeMessages: (_ownerId, messages) => {
        // TODO: Get owner by _ownerId when we support more.
        const owner = deps.ownerRowRef.get();
        const decodedAndDecryptedMessages: Array<CrdtMessage> = [];

        for (const message of messages) {
          const dbChange = decryptAndDecodeDbChange(deps)(
            message.change,
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

        let timestamp = timestampStringToTimestamp(owner.timestamp);

        for (const message of messages) {
          const receive = receiveTimestamp(deps)(timestamp, message.timestamp);
          if (!receive.ok) {
            deps.postMessage({ type: "onError", error: receive.error });
            return false;
          }
          timestamp = receive.value;
        }

        const applyMessagesResult = applyMessages({ ...deps, storage })(
          decodedAndDecryptedMessages,
          timestamp,
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

        const change: DbChange = {
          table: rows[0].table,
          id: binaryIdToId(rows[0].id),
          values,
        };

        const { encryptionKey } = deps.ownerRowRef.get();

        return encodeAndEncryptDbChange(deps)(change, encryptionKey);
      },
    };

    return ok(storage);
  };
