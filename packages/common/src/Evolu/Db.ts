import { isNonEmptyArray, NonEmptyReadonlyArray } from "../Array.js";
import { CallbackId } from "../CallbackRegistry.js";
import { ConsoleConfig, ConsoleDep } from "../Console.js";
import {
  createSymmetricCrypto,
  EncryptionKey,
  RandomBytesDep,
  SymmetricCryptoDecryptError,
} from "../Crypto.js";
import { TransferableError } from "../Error.js";
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
} from "../Sqlite.js";
import { TimeDep } from "../Time.js";
import { Id, Mnemonic, SimpleName } from "../Type.js";
import { CreateWebSocketDep } from "../WebSocket.js";
import {
  createInitializedWorkerWithHandlers,
  MessageHandlers,
  Worker,
} from "../Worker.js";
import { makePatches, QueryPatches } from "./Diff.js";
import {
  AppOwner,
  createAppOwner,
  createOwnerSecret,
  mnemonicToOwnerSecret,
  OwnerId,
  TransportConfig,
  WriteKey,
} from "./Owner.js";
import { ProtocolError, protocolVersion } from "./Protocol.js";
import {
  createQueryRowsCache,
  deserializeQuery,
  emptyRows,
  Query,
  QueryRowsCache,
} from "./Query.js";
import {
  DbSchema,
  ensureDbSchema,
  getDbSchema,
  IndexesConfig,
  MutationChange,
} from "./Schema.js";
import { DbChange } from "./Storage.js";
import { Clock, createClock, createSync, SyncDep, SyncOwner } from "./Sync.js";
import {
  Timestamp,
  TimestampConfig,
  TimestampError,
  TimestampString,
  timestampStringToTimestamp,
  timestampToTimestampString,
} from "./Timestamp.js";

export interface DbConfig extends ConsoleConfig, TimestampConfig {
  /**
   * The name of the Evolu instance. Evolu is multitenant - it can run multiple
   * instances concurrently. Each instance must have a unique name.
   *
   * The instance name is used as the SQLite database filename for persistent
   * storage, ensuring that database files are separated and invisible to each
   * other.
   *
   * The default value is: `Evolu`.
   *
   * ### Example
   *
   * ```ts
   * // name: SimpleName.fromOrThrow("MyApp")
   * ```
   */
  readonly name: SimpleName;

  /**
   * Transport configuration for data sync and backup. Supports single transport
   * or multiple transports simultaneously for redundancy.
   *
   * Currently supports:
   *
   * - WebSocket: Real-time bidirectional communication with relay servers
   *
   * The default value is:
   *
   * `{ type: "WebSocket", url: "wss://free.evoluhq.com" }`.
   *
   * ### Example
   *
   * ```ts
   * // Single WebSocket relay
   * transports: [{ type: "WebSocket", url: "wss://relay1.example.com" }];
   *
   * // Multiple WebSocket relays for redundancy
   * transports: [
   *   { type: "WebSocket", url: "wss://relay1.example.com" },
   *   { type: "WebSocket", url: "wss://relay2.example.com" },
   *   { type: "WebSocket", url: "wss://relay3.example.com" },
   * ];
   *
   * // Local-only instance (no sync) - useful for device settings
   * transports: [];
   * ```
   */
  readonly transports: ReadonlyArray<TransportConfig>;

  /**
   * URL to reload browser tabs after reset or restore.
   *
   * The default value is `/`.
   */
  readonly reloadUrl: string;

  /**
   * Use the `indexes` option to define SQLite indexes.
   *
   * Table and column names are not typed because Kysely doesn't support it.
   *
   * https://medium.com/@JasonWyatt/squeezing-performance-from-sqlite-indexes-indexes-c4e175f3c346
   *
   * ### Example
   *
   * ```ts
   * const evolu = createEvolu(evoluReactDeps)(Schema, {
   *   indexes: (create) => [
   *     create("todoCreatedAt").on("todo").column("createdAt"),
   *     create("todoCategoryCreatedAt")
   *       .on("todoCategory")
   *       .column("createdAt"),
   *   ],
   * });
   * ```
   */
  readonly indexes?: IndexesConfig;

  /**
   * External AppOwner to use when creating Evolu instance. Use this when you
   * want to manage AppOwner creation and persistence externally (e.g., with
   * your own authentication system). If omitted, Evolu will automatically
   * create and persist an AppOwner locally.
   *
   * For device-specific settings and account management state, we can use a
   * separate local-only Evolu instance via `transports: []`.
   *
   * ### Example
   *
   * ```ts
   * const ConfigId = id("Config");
   * type ConfigId = typeof ConfigId.Type;
   *
   * const DeviceSchema = {
   *   config: {
   *     id: ConfigId,
   *     key: NonEmptyString50,
   *     value: NonEmptyString50,
   *   },
   * };
   *
   * // Local-only instance for device settings (no sync)
   * const deviceEvolu = createEvolu(evoluReactWebDeps)(DeviceSchema, {
   *   name: SimpleName.fromOrThrow("MyApp-Device"),
   *   transports: [], // No sync - stays local to device
   * });
   *
   * // Main synced instance for user data
   * const evolu = createEvolu(evoluReactWebDeps)(MainSchema, {
   *   name: SimpleName.fromOrThrow("MyApp"),
   *   // Default transports for sync
   * });
   * ```
   */
  readonly externalAppOwner?: AppOwner;

  /**
   * Use in-memory SQLite database instead of persistent storage. Useful for
   * testing or temporary data that doesn't need persistence.
   *
   * In-memory databases exist only in RAM and are completely destroyed when the
   * process ends, making them forensically safe for sensitive data.
   *
   * The default value is: `false`.
   */
  readonly inMemory?: boolean;
}

export const defaultDbConfig: DbConfig = {
  name: SimpleName.fromOrThrow("Evolu"),
  transports: [{ type: "WebSocket", url: "wss://free.evoluhq.com" }],
  reloadUrl: "/",
  maxDrift: 5 * 60 * 1000,
  enableLogging: false,
};

export type DbWorker = Worker<DbWorkerInput, DbWorkerOutput>;

export type CreateDbWorker = (name: SimpleName) => DbWorker;

export interface CreateDbWorkerDep {
  readonly createDbWorker: CreateDbWorker;
}

export type DbWorkerInput =
  | {
      readonly type: "init";
      readonly config: DbConfig;
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

export type DbWorkerOutput =
  | {
      readonly type: "onInit";
      readonly appOwner: AppOwner;
      readonly isFirst: boolean;
    }
  | {
      readonly type: "onError";
      readonly error:
        | ProtocolError
        | SqliteError
        | SymmetricCryptoDecryptError
        | TimestampError
        | TransferableError;
    }
  | {
      readonly type: "onQueryPatches";
      readonly tabId: Id;
      readonly queryPatches: ReadonlyArray<QueryPatches>;
      readonly onCompleteIds: ReadonlyArray<CallbackId>;
    }
  | {
      readonly type: "refreshQueries";
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
  CreateSqliteDriverDep &
  CreateWebSocketDep &
  NanoIdLibDep &
  RandomBytesDep &
  RandomDep &
  TimeDep;

type DbWorkerDeps = Omit<
  DbWorkerPlatformDeps,
  keyof CreateSqliteDriverDep | keyof CreateWebSocketDep
> &
  GetQueryRowsCacheDep &
  PostMessageDep &
  SqliteDep &
  SyncDep;

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

        clock = createClock({ ...platformDeps, sqlite })(
          timestampStringToTimestamp(config.clock),
        );
      } else {
        appOwner =
          initMessage.config.externalAppOwner ??
          createAppOwner(createOwnerSecret(platformDeps));

        clock = createClock({ ...platformDeps, sqlite })();

        const result = initializeDb({ sqlite })(appOwner, clock.get());
        if (!result.ok) return result;
      }

      const result = ensureDbSchema({ sqlite })(
        initMessage.dbSchema,
        currentDbSchema.value,
      );
      if (!result.ok) return result;

      const sync = createSync({
        ...platformDeps,
        clock,
        sqlite,
        symmetricCrypto: createSymmetricCrypto(platformDeps),
        timestampConfig: initMessage.config,
      })({
        appOwner,
        transports: initMessage.config.transports,
        onError: (error) => {
          postMessage({ type: "onError", error });
        },
        onReceive: () => {
          postMessage({ type: "refreshQueries" });
        },
      });
      if (!sync.ok) return sync;

      sync.value.useOwner(true, appOwner);

      postMessage({ type: "onInit", appOwner, isFirst: !dbIsInitialized });

      const tabQueryRowsCacheMap = new Map<Id, QueryRowsCache>();
      const getQueryRowsCache = (tabId: Id) => {
        let cache = tabQueryRowsCacheMap.get(tabId);
        if (!cache) {
          cache = createQueryRowsCache();
          tabQueryRowsCacheMap.set(tabId, cache);
        }
        return cache;
      };

      const deps: DbWorkerDeps = {
        ...platformDeps,
        getQueryRowsCache,
        postMessage,
        sqlite,
        sync: sync.value,
      };

      return ok(deps);
    });

    if (!deps.ok) {
      postMessage({ type: "onError", error: deps.error });
      return null;
    }

    return deps.value;
  };

const initializeDb =
  (deps: SqliteDep) =>
  (
    initialAppOwner: AppOwner,
    initialClock: Timestamp,
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
            ${timestampToTimestampString(initialClock)},
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
        const result = deps.sync.applyChanges(syncChanges);
        if (!result.ok) return result;
      }

      // Read writes before commit to update UI ASAP
      const queryPatches = loadQueries(deps)(
        message.tabId,
        message.subscribedQueries,
      );
      if (!queryPatches.ok) return queryPatches;

      // Update the tab that performed the mutation.
      deps.postMessage({
        type: "onQueryPatches",
        tabId: message.tabId,
        queryPatches: queryPatches.value,
        onCompleteIds: message.onCompleteIds,
      });

      // Notify other tabs to refresh their queries.
      deps.postMessage({ type: "refreshQueries", tabId: message.tabId });

      return ok();
    });

    if (!mutate.ok) {
      deps.postMessage({ type: "onError", error: mutate.error });
      return;
    }
  },

  query: (deps) => (message) => {
    const queryPatches = loadQueries(deps)(message.tabId, message.queries);

    if (!queryPatches.ok) {
      deps.postMessage({ type: "onError", error: queryPatches.error });
      return;
    }

    deps.postMessage({
      type: "onQueryPatches",
      tabId: message.tabId,
      queryPatches: queryPatches.value,
      onCompleteIds: [],
    });
  },

  reset: (deps) => (message) => {
    const resetResult = deps.sqlite.transaction(() => {
      const dbSchema = getDbSchema(deps)();
      if (!dbSchema.ok) return dbSchema;

      for (const table of dbSchema.value.tables) {
        /**
         * The dropped table is completely removed from the database schema and
         * the disk file. The table can not be recovered. All indices and
         * triggers associated with the table are also deleted.
         * https://sqlite.org/lang_droptable.html
         */
        const result = deps.sqlite.exec(sql`
          drop table ${sql.identifier(table.name)};
        `);
        if (!result.ok) return result;
      }

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

        const initializeDbResult = initializeDb(deps)(appOwner, clock.get());
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
