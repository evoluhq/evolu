/**
 * Platform-agnostic Evolu DbWorker.
 *
 * ### Database version
 *
 * Every database records `dbVersion` in `evolu_version`. The version describes
 * Evolu's internal persisted format: the layout of its system tables and the
 * meaning of the data stored in them. It is independent of the application
 * schema, which evolves append-only through {@link ensureSqliteSchema}, and of
 * the network protocol version, which is checked per message. Many Evolu
 * releases can share one database version.
 *
 * Bump `dbVersion` for any change that older code would misread, not only for
 * changed SQL. A new quarantine reason, for example, changes what startup may
 * replay even when its columns are additive. Each bump ships with a migration
 * from the previous version; fresh databases are created at the latest layout
 * directly.
 *
 * Startup holds the database leader lock, then checks the stored version record
 * before it reads the clock, ensures the application schema, or replays
 * quarantine. Databases written before the version record existed hold one
 * `protocolVersion` row instead; that known legacy layout is converted to
 * version 1. A newer stored version refuses startup with
 * {@link UnsupportedDbVersionError}. The refusal returns from the startup
 * transaction before anything is written and is posted to the SharedWorker; the
 * worker then exits and releases its resources. The single version row is
 * created in the same transaction as the other system tables. Code released
 * before the version record existed never reads it and cannot be protected by
 * it.
 *
 * @module
 */

import {
  appendToArray,
  firstInArray,
  type NonEmptyArray,
  type NonEmptyReadonlyArray,
} from "../Array.ts";
import {
  assert,
  assertNonEmptyReadonlyArray,
  assertNonNullable,
  assertNotUndefined,
} from "../Assert.ts";
import type { ConsoleLevel } from "../Console.ts";
import { EncryptionKey, type RandomBytesDep } from "../Crypto.ts";
import { constFalse, constVoid } from "../Function.ts";
import type { LockManagerDep } from "../LockManager.ts";
import { acquireLeaderLock } from "../LockManager.ts";
import { createMutableRecord, getOwnProp, objectToEntries } from "../Object.ts";
import { err, ok, type Result } from "../Result.ts";
import type {
  CreateSqliteDriverDep,
  SqliteDep,
  SqliteRow,
  SqliteSchema,
} from "../Sqlite.ts";
import {
  booleanToSqliteBoolean,
  createSqlite,
  sql,
  SqliteBoolean,
  sqliteBooleanToBoolean,
  sqliteQueryStringToSqliteQuery,
  SqliteValue,
} from "../Sqlite.ts";
import { callback, type Run, type Task } from "../Task.ts";
import {
  millisToDateIso,
  saturateMillis,
  type Millis,
  type TimeDep,
} from "../Time.ts";
import {
  assertType,
  type FiniteNumber,
  Id,
  IdBytes,
  idBytesToId,
  idToIdBytes,
  NonNaNNumber,
  onePositiveInt,
  PositiveInt,
  type ExtractTyped,
  type Name,
  type Typed,
} from "../Type.ts";
import type {
  CreateBroadcastChannelDep,
  NativeMessagePort,
  Worker,
  WorkerDeps,
  WorkerSelf,
} from "../Worker.ts";
import type { OwnerId, OwnerIdBytes } from "./Owner.ts";
import { ownerIdBytesToOwnerId, ownerIdToOwnerIdBytes } from "./Owner.ts";
import {
  applyProtocolMessageAsClient,
  createProtocolMessageForSync,
  decryptAndDecodeDbChange,
  encodeAndEncryptDbChange,
  SubscriptionFlags,
  type ProtocolMessage,
} from "./Protocol.ts";
import type { Query, RowsByQueryMap } from "./Query.ts";
import type { MutationChange, SqliteSchemaDep } from "./Schema.ts";
import {
  ensureSqliteSchema,
  isLocalOnlyTable,
  QuarantineOrigin,
  QuarantineReason,
  systemColumns,
} from "./Schema.ts";
import type {
  ConsoleEntryOrError,
  DbWorkerInput,
  DbWorkerOutput,
  DbWorkerQueuedResponse,
  EvoluInput,
} from "./Shared.ts";
import { consoleEntryOrErrorBroadcastChannelName } from "./Shared.ts";
import {
  createBaseSqliteStorage,
  createBaseSqliteStorageTables,
  DbChange,
  getTimestampInsertStrategy,
  readOwnerUsageOrDefault,
  updateOwnerUsage,
  type BaseSqliteStorage,
  type BaseSqliteStorageDep,
  type CrdtMessage,
  type Storage,
} from "./Storage.ts";
import type { Timestamp, TimestampTimeOutOfRangeError } from "./Timestamp.ts";
import {
  createInitialTimestamp,
  defaultTimestampMaxDrift,
  isTimestampBeyondMaxDrift,
  maxCounter,
  maxNodeId,
  receiveTimestamp,
  sendTimestamp,
  TimestampBytes,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
  type TimestampConfigDep,
} from "./Timestamp.ts";

export type DbWorker = Worker<DbWorkerInit>;

export interface DbWorkerInit {
  readonly type: "DbWorkerInit";
  readonly name: Name;
  readonly consoleLevel: ConsoleLevel;
  readonly sqliteSchema: SqliteSchema;
  readonly encryptionKey: EncryptionKey;
  readonly memoryOnly: boolean;
  readonly port: NativeMessagePort<DbWorkerOutput, DbWorkerInput>;
}

export type CreateDbWorker = () => DbWorker;

export interface CreateDbWorkerDep {
  readonly createDbWorker: CreateDbWorker;
}

export type DbWorkerDeps = WorkerDeps &
  CreateBroadcastChannelDep &
  LockManagerDep &
  CreateSqliteDriverDep;

/** The database version this code creates and supports; see the module doc. */
const dbVersion = PositiveInt.orThrow(2);

/**
 * The stored database version is newer than this code supports. Newer code
 * created or migrated the database, which is left unchanged. This happens when
 * older code opens a database a newer build migrated, for example an older
 * build loaded from a cache, or when the app was downgraded after a newer
 * version migrated the local data. On the web, a refused tab reloads once for
 * each stored version, so it loads the build the server now serves, and the
 * error is reported when that build refuses too. Then close all tabs of the
 * app, which lets a service worker replace a cached older build, or update the
 * app to a version that supports `storedVersion`.
 */
export interface UnsupportedDbVersionError extends Typed<"UnsupportedDbVersionError"> {
  readonly storedVersion: PositiveInt;
  readonly supportedVersion: PositiveInt;
}

/**
 * Starts the platform-agnostic Evolu DbWorker and owns its resources until
 * startup is refused, the worker receives a dispose message, or its {@link Run}
 * is aborted.
 */
export const startDbWorker =
  (self: WorkerSelf<DbWorkerInit>): Task<void, never, DbWorkerDeps> =>
  async (run) => {
    await using disposer = new AsyncDisposableStack();
    disposer.use(self);
    const { deps } = run;

    const initMessage = await run.ok(
      callback<DbWorkerInit>(({ resolve }) => {
        self.onMessage = (message) => resolve(ok(message));
      }),
    );

    const port = disposer.use(
      deps.createMessagePort<DbWorkerOutput, DbWorkerInput>(initMessage.port),
    );
    const consoleEntryOrErrorBroadcastChannel = disposer.use(
      deps.createBroadcastChannel<ConsoleEntryOrError>(
        consoleEntryOrErrorBroadcastChannelName,
      ),
    );

    disposer.defer(
      deps.consoleStoreOutputEntry.subscribe(() => {
        const entry = deps.consoleStoreOutputEntry.get();
        if (entry)
          consoleEntryOrErrorBroadcastChannel.postMessage({
            type: "ConsoleEntry",
            entry,
          });
      }),
    );

    disposer.use(await run.ok(acquireLeaderLock(initMessage.name)));

    const sqlite = disposer.use(
      await run.ok(
        createSqlite(
          initMessage.name,
          initMessage.memoryOnly
            ? { mode: "memory" }
            : { mode: "encrypted", encryptionKey: initMessage.encryptionKey },
        ),
      ),
    );

    const baseSqliteStorage = createBaseSqliteStorage({ sqlite, ...deps });
    const dbDeps = {
      ...deps,
      sqlite,
      sqliteSchema: initMessage.sqliteSchema,
      baseSqliteStorage,
      timestampConfig: { maxDrift: defaultTimestampMaxDrift },
    };
    const startup = sqlite.transaction(
      (): Result<Timestamp, UnsupportedDbVersionError> => {
        // Only the version record is read before the version check, because a
        // newer database can hold schema objects this code cannot read.
        const { rows: versionColumnRows } = sqlite.exec<{ name: string }>(sql`
          select "name" from pragma_table_info('evolu_version');
        `);
        const versionColumns = new Set(
          versionColumnRows.map((row) => row.name),
        );
        let initialClock: Timestamp;
        if (versionColumns.size === 0) {
          initialClock = createInitialTimestamp(dbDeps);
          initializeDb(dbDeps)(initialClock);
        } else {
          const version = ensureDbVersion(dbDeps)(versionColumns);
          if (!version.ok) return version;
          const { rows } = sqlite.exec<{ clock: TimestampBytes }>(sql`
            select "clock" from evolu_config limit 1;
          `);
          assertNonEmptyReadonlyArray(rows);
          initialClock = timestampBytesToTimestamp(firstInArray(rows).clock);
        }
        ensureSqliteSchema(dbDeps)(initMessage.sqliteSchema);
        const released = releaseDriftQuarantine(dbDeps)(initialClock);
        if (released) {
          initialClock = released;
          saveClock(dbDeps)(released);
        }
        tryApplyQuarantinedMessages(dbDeps);
        return ok(initialClock);
      },
    );
    if (!startup.ok) {
      // Nothing was written. Returning lets the disposer close SQLite and
      // release the database lock, which the SharedWorker's tenant disposal
      // waits on. The tab leader lock is unaffected.
      port.postMessage({
        type: "LeaderRefused",
        name: initMessage.name,
        error: startup.error,
      });
      return ok();
    }
    const initialClock = startup.value;

    const storage = createClientStorage(dbDeps);
    const dbWorkerRun = disposer.use(run.create({ storage }));

    port.postMessage({
      type: "LeaderAcquired",
      name: initMessage.name,
      clock: initialClock,
    });

    await run.ok(
      callback<void>(({ resolve }) => {
        port.onMessage = (input) => {
          if (input.type === "Dispose") {
            resolve(ok());
            return;
          }

          const { attemptId } = input;
          const postQueuedResponse = (
            response: DbWorkerQueuedResponse,
          ): void => {
            port.postMessage(
              {
                type: "OnQueuedResponse",
                attemptId,
                response,
              },
              response.type === "ForEvolu" && response.message.type === "Export"
                ? [response.message.file.buffer]
                : undefined,
            );
          };

          if ("clock" in input) {
            const { clock: inputClock, now } = input;
            let committedClock = inputClock;
            const context: WriteContext = {
              now,
              clock: {
                get: () => committedClock,
                set: (timestamp) => {
                  committedClock = timestamp;
                },
              },
            };
            const request = input.request;
            if (request.type === "ForSharedWorker") {
              const { owner, inputMessage } = request.message;
              void dbWorkerRun(async (run) => {
                storage.setRequestContext(owner.encryptionKey, context);
                const result = await run.abortable(
                  applyProtocolMessageAsClient(inputMessage, {
                    writeKey: owner.writeKey,
                  }),
                );
                postQueuedResponse({
                  type: "ForSharedWorker",
                  message: {
                    type: "ApplySyncMessage",
                    clock: context.clock.get(),
                    ownerId: owner.id,
                    didWriteMessages: storage.didWriteMessages(),
                    result,
                  },
                });
                return ok();
              });
            } else {
              const result = handleMutation({
                ...dbDeps,
                clock: context.clock,
              })(request.message, now);
              if (!result.ok) {
                consoleEntryOrErrorBroadcastChannel.postMessage({
                  type: "Error",
                  error: result.error,
                });
                return;
              }
              postQueuedResponse({
                type: "ForEvolu",
                id: request.id,
                message: result.value,
              });
            }
            return;
          }

          const request = input.request;
          if (request.type === "ForSharedWorker") {
            const protocolMessagesByOwnerId = new Map<
              OwnerId,
              ProtocolMessage
            >();
            const failedOwnerIds = new Set<OwnerId>();

            // An unanswered attempt would block the tenant queue, so a failed
            // owner is logged and reported instead of thrown.
            for (const owner of request.message.owners) {
              storage.setRequestContext(owner.encryptionKey);
              try {
                protocolMessagesByOwnerId.set(
                  owner.id,
                  createProtocolMessageForSync({ storage })(
                    owner.id,
                    SubscriptionFlags.Subscribe,
                  ),
                );
              } catch (error) {
                deps.console.error(error);
                failedOwnerIds.add(owner.id);
              }
            }

            postQueuedResponse({
              type: "ForSharedWorker",
              message: {
                type: "CreateSyncMessages",
                protocolMessagesByOwnerId,
                failedOwnerIds,
              },
            });
            return;
          }

          if (request.message.type === "Query") {
            postQueuedResponse({
              type: "ForEvolu",
              id: request.id,
              message: {
                type: "Query",
                rowsByQuery: loadQueries(dbDeps)(request.message.queries),
              },
            });
            return;
          }

          if (request.message.type === "Export") {
            postQueuedResponse({
              type: "ForEvolu",
              id: request.id,
              message: {
                type: "Export",
                file: sqlite.export(),
              },
            });
          }
        };

        return () => {
          port.onMessage = null;
        };
      }),
    );

    return ok();
  };

/** Clock state owned by one write request; published only after commit. */
interface Clock {
  readonly get: () => Timestamp;
  readonly set: (timestamp: Timestamp) => void;
}

interface ClockDep {
  readonly clock: Clock;
}

interface WriteContext extends ClockDep {
  readonly now: Millis;
}

/**
 * Persists `timestamp` only when it is greater than the stored clock.
 *
 * Requests report their computed clock, which can be older than the stored
 * clock when replayed after startup release. The SQL guard keeps the stored
 * clock from moving backwards; the SharedWorker adopts response clocks only
 * when newer than its session clock.
 *
 * Timestamp bytes sort like their timestamps and SQLite compares blobs byte by
 * byte, so persistence takes one statement even when the clock does not
 * advance.
 *
 * Local-only mutations and sync requests that do not invoke `writeMessages`
 * skip this. Successfully processed batches in `writeMessages` call this even
 * when every message is duplicated or quarantined. Duplicate receipts within
 * the drift limit can advance the clock without storing new messages.
 */
const saveClock =
  (deps: SqliteDep) =>
  (timestamp: Timestamp): void => {
    const bytes = timestampToTimestampBytes(timestamp);
    deps.sqlite.exec(sql.prepared`
      update evolu_config
      set "clock" = ${bytes}
      where "clock" < ${bytes};
    `);
  };

/**
 * Checks the stored database version inside the startup transaction, before any
 * other read. The legacy layout, one `protocolVersion` row that was always 1,
 * is converted to database version 1 first. An older database is migrated one
 * version at a time, and the record is updated in the same transaction, so a
 * failed migration leaves both data and version unchanged.
 */
const ensureDbVersion =
  ({ sqlite }: SqliteDep) =>
  (
    versionColumns: ReadonlySet<string>,
  ): Result<void, UnsupportedDbVersionError> => {
    if (!versionColumns.has("dbVersion")) {
      sqlite.exec(sql`
        alter table evolu_version
        rename column "protocolVersion" to "dbVersion";
      `);
    }

    const { rows } = sqlite.exec<{ dbVersion: PositiveInt }>(sql`
      select "dbVersion" from evolu_version;
    `);
    const storedVersion = rows[0].dbVersion;
    if (storedVersion > dbVersion) {
      return err({
        type: "UnsupportedDbVersionError",
        storedVersion,
        supportedVersion: dbVersion,
      });
    }
    if (storedVersion < dbVersion) {
      if (storedVersion < 2) migrateToVersion2({ sqlite });
      sqlite.exec(sql`update evolu_version set "dbVersion" = ${dbVersion};`);
    }
    return ok();
  };

/**
 * Version 2 records why a message is quarantined, whether this database stamped
 * or received it, and when, and adds the index that startup release reads. Rows
 * from version 1 get the defaults: schema quarantine of a received message with
 * an unknown quarantine time. See {@link QuarantineReason}.
 */
const migrateToVersion2 = ({ sqlite }: SqliteDep): void => {
  for (const query of [
    sql`
      alter table evolu_message_quarantine
      add column "reason" integer not null default ${sql.raw(
        String(QuarantineReason.Schema),
      )};
    `,
    sql`
      alter table evolu_message_quarantine
      add column "origin" integer not null default ${sql.raw(
        String(QuarantineOrigin.ReceivedMessage),
      )};
    `,
    sql`
      alter table evolu_message_quarantine
      add column "quarantinedAt" integer;
    `,
    sql`
      create index evolu_message_quarantine_reason_timestamp on evolu_message_quarantine (
        "reason",
        "timestamp"
      );
    `,
  ]) {
    sqlite.exec(query);
  }
};

const initializeDb =
  ({ sqlite }: SqliteDep) =>
  (initialClock: Timestamp): void => {
    for (const query of [
      // The database version record; see the module documentation.
      sql`
        create table evolu_version (
          "dbVersion" integer not null
        )
        strict;
      `,

      sql`
        insert into evolu_version ("dbVersion")
        values (${dbVersion});
      `,

      sql`
        create table evolu_config (
          "clock" blob not null
        )
        strict;
      `,

      sql`
        insert into evolu_config ("clock")
        values (${timestampToTimestampBytes(initialClock)});
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

      /**
       * Stores unapplied messages with their quarantine reason.
       *
       * When a device receives sync messages containing tables or columns that
       * don't exist in its current schema (e.g., from a newer app version),
       * those messages are stored here instead of being discarded. This enables
       * forward compatibility:
       *
       * 1. Unknown data is preserved and can be applied when the app is updated
       * 2. Messages are still propagated to other devices that may understand them
       * 3. Partial messages work - known columns go to app tables, unknown to
       *    quarantine
       *
       * Clock-drift quarantine preserves every column of the affected message.
       * It is released at startup once system time comes within the drift limit
       * of the message's timestamp; see the Timestamp module.
       *
       * Each row records why it was not applied (`reason`), whether this
       * database stamped the message for a local mutation or received it
       * (`origin`), and the captured system time of the request that
       * quarantined it (`quarantinedAt`). Quarantine is not reported as an
       * error; applications watch this table through queries.
       *
       * The `union all` query in `readDbChange` combines `evolu_history` and
       * this table, ensuring all data (known and unknown) is included when
       * syncing to other devices.
       */
      sql`
        create table evolu_message_quarantine (
          "ownerId" blob not null,
          "timestamp" blob not null,
          "table" text not null,
          "id" blob not null,
          "column" text not null,
          "value" any,
          "reason" integer not null default ${sql.raw(
            String(QuarantineReason.Schema),
          )},
          "origin" integer not null default ${sql.raw(
            String(QuarantineOrigin.ReceivedMessage),
          )},
          "quarantinedAt" integer,
          primary key ("ownerId", "timestamp", "table", "id", "column")
        )
        strict;
      `,
    ]) {
      sqlite.exec(query);
    }

    createBaseSqliteStorageTables({ sqlite });

    // Startup release reads drift quarantine by reason and timestamp. Created
    // last, as the migration creates it, so Evolu's own indexes are listed in one
    // order in fresh and migrated databases.
    sqlite.exec(sql`
      create index evolu_message_quarantine_reason_timestamp on evolu_message_quarantine (
        "reason",
        "timestamp"
      );
    `);
  };

const tryApplyQuarantinedMessages = (
  deps: SqliteDep & SqliteSchemaDep,
): void => {
  const { rows } = deps.sqlite.exec<{
    ownerId: OwnerIdBytes;
    timestamp: TimestampBytes;
    table: string;
    id: IdBytes;
    column: string;
    value: SqliteValue;
  }>(sql`
    select "ownerId", "timestamp", "table", "id", "column", "value"
    from evolu_message_quarantine
    where "reason" = ${QuarantineReason.Schema};
  `);

  for (const row of rows) {
    if (!validateColumnValue(deps)(row.table, row.column, row.value)) continue;
    applyColumnChange(deps)(
      row.ownerId,
      ownerIdBytesToOwnerId(row.ownerId),
      row.table,
      row.id,
      idBytesToId(row.id),
      row.column,
      row.value,
      row.timestamp,
    );

    deps.sqlite.exec(sql.prepared`
      delete from evolu_message_quarantine
      where
        "ownerId" = ${row.ownerId}
        and "timestamp" = ${row.timestamp}
        and "table" = ${row.table}
        and "id" = ${row.id}
        and "column" = ${row.column};
    `);
  }
};

/**
 * Moves drift quarantine within the drift limit to schema quarantine for
 * application. Advances `clock` once per distinct timestamp in timestamp order,
 * using one captured system time, so later local changes sort after released
 * messages. Only timestamps within the drift limit are loaded. A range error
 * releases nothing. Returns the advanced clock, or `null` when nothing was
 * released. Runs inside the startup transaction, before saving the clock and
 * applying schema quarantine, so the SharedWorker learns the clock only after
 * release commits.
 */
const releaseDriftQuarantine =
  (deps: SqliteDep & TimeDep & TimestampConfigDep) =>
  (clock: Timestamp): Timestamp | null => {
    const now = deps.time.now();
    // Milliseconds are integers; floor the allowance before adding it so a
    // fractional allowance cannot round up near the timestamp range ceiling.
    const maxReleaseMillis = now + Math.floor(deps.timestampConfig.maxDrift);
    assertType(NonNaNNumber, maxReleaseMillis);
    const bound = timestampToTimestampBytes({
      millis: saturateMillis(maxReleaseMillis),
      counter: maxCounter,
      nodeId: maxNodeId,
    });
    const { rows } = deps.sqlite.exec<{ timestamp: TimestampBytes }>(sql`
      select distinct "timestamp"
      from evolu_message_quarantine
      where
        "reason" = ${QuarantineReason.TimestampDrift}
        and "timestamp" <= ${bound}
      order by "timestamp";
    `);
    if (rows.length === 0) return null;

    const receive = receiveTimestamp(deps);
    let nextClock = clock;
    for (const { timestamp } of rows) {
      const remote = timestampBytesToTimestamp(timestamp);
      const next = receive(nextClock, remote, now);
      if (next.ok) {
        nextClock = next.value;
      } else if (next.error.type === "TimestampDriftError") {
        assert(
          next.error.cause === "local",
          "The query bound excludes remote drift at the captured time.",
        );
        nextClock = next.error.timestamp;
      } else {
        // Every selected row stays quarantined on a range error.
        return null;
      }
    }

    // Drift checks passed; mark these rows for the next schema pass.
    deps.sqlite.exec(sql`
      update evolu_message_quarantine
      set "reason" = ${QuarantineReason.Schema}
      where
        "reason" = ${QuarantineReason.TimestampDrift}
        and "timestamp" <= ${bound};
    `);

    return nextClock;
  };

const validateColumnValue =
  (deps: SqliteSchemaDep) =>
  (table: string, column: string, _value: SqliteValue): boolean => {
    const schemaColumns = getOwnProp(deps.sqliteSchema.tables, table);
    return (
      schemaColumns != null &&
      (systemColumnsWithoutOwnerId.has(column) || schemaColumns.has(column))
    );
  };

const systemColumnsWithoutOwnerId = systemColumns.difference(
  new Set(["ownerId"]),
);

const applyColumnChange =
  (deps: SqliteDep) =>
  (
    ownerIdBytes: OwnerIdBytes,
    ownerId: OwnerId,
    table: string,
    idBytes: IdBytes,
    id: Id,
    column: string,
    value: SqliteValue,
    timestampBytes: TimestampBytes,
  ): void => {
    deps.sqlite.exec(sql.prepared`
      with
        existingTimestamp as (
          select 1
          from evolu_history
          where
            "ownerId" = ${ownerIdBytes}
            and "table" = ${table}
            and "id" = ${idBytes}
            and "column" = ${column}
            and "timestamp" >= ${timestampBytes}
          limit 1
        )
      insert into ${sql.identifier(table)}
        ("ownerId", "id", ${sql.identifier(column)})
      select ${ownerId}, ${id}, ${value}
      where not exists (select 1 from existingTimestamp)
      on conflict ("ownerId", "id") do update
        set ${sql.identifier(column)} = ${value}
        where not exists (select 1 from existingTimestamp);
    `);

    deps.sqlite.exec(sql.prepared`
      insert into evolu_history
        ("ownerId", "table", "id", "column", "value", "timestamp")
      values
        (
          ${ownerIdBytes},
          ${table},
          ${idBytes},
          ${column},
          ${value},
          ${timestampBytes}
        )
      on conflict do nothing;
    `);
  };

/**
 * The Db worker needs one object that can both satisfy sync code expecting
 * {@link Storage}, expose {@link BaseSqliteStorage} helpers to the local
 * implementation, and switch owner encryption keys between requests.
 */
interface ClientStorage extends Storage, BaseSqliteStorage {
  readonly setRequestContext: (
    encryptionKey: EncryptionKey,
    writeContext?: WriteContext,
  ) => void;
  readonly didWriteMessages: () => boolean;
}

const createClientStorage = (
  deps: BaseSqliteStorageDep &
    RandomBytesDep &
    SqliteDep &
    SqliteSchemaDep &
    TimestampConfigDep,
): ClientStorage => {
  let encryptionKey: EncryptionKey | null = null;
  let didWriteMessages = false;
  let writeContext: WriteContext | undefined;

  const getEncryptionKey = (): EncryptionKey => {
    assertNonNullable(
      encryptionKey,
      "ClientStorage encryption key must be set",
    );
    return encryptionKey;
  };

  return {
    ...deps.baseSqliteStorage,

    // SharedWorker waits for the response before dispatching another request,
    // so asynchronous sync processing cannot overlap this request context.
    setRequestContext: (nextEncryptionKey, nextWriteContext) => {
      encryptionKey = nextEncryptionKey;
      writeContext = nextWriteContext;
      didWriteMessages = false;
    },

    didWriteMessages: () => didWriteMessages,

    // Not implemented yet.
    validateWriteKey: constFalse,
    setWriteKey: constVoid,

    writeMessages: (ownerIdBytes, encryptedMessages) => () => {
      // TODO: Add quota checking for collaborative scenarios.
      // When receiving messages from other owners via relay broadcast,
      // check if this owner is within quota before accepting the data.
      // This prevents an owner from exceeding storage limits when receiving
      // data shared by other collaborators.

      const messages: Array<CrdtMessage> = [];
      const currentEncryptionKey = getEncryptionKey();

      for (const message of encryptedMessages) {
        const change = decryptAndDecodeDbChange(message, currentEncryptionKey);
        if (!change.ok) return err(change.error);
        messages.push({ timestamp: message.timestamp, change: change.value });
      }

      assertNonNullable(writeContext);
      const { clock, now } = writeContext;
      let clockTimestamp = clock.get();
      const receive = receiveTimestamp(deps);

      // The clock is computed over every message, duplicates included, so a
      // retry with the same inputs reports the same clock. Writes for
      // timestamps already in the owner's set are skipped by applyMessages.
      for (const message of messages) {
        const nextTimestamp = receive(clockTimestamp, message.timestamp, now);
        if (!nextTimestamp.ok) {
          if (nextTimestamp.error.type !== "TimestampDriftError")
            return err(nextTimestamp.error);
          if (nextTimestamp.error.cause === "remote") continue;
          clockTimestamp = nextTimestamp.error.timestamp;
        } else clockTimestamp = nextTimestamp.value;
      }

      assertNonEmptyReadonlyArray(messages);

      let wroteNewMessages = false;
      deps.sqlite.transaction(() => {
        wroteNewMessages = applyMessages(deps)(
          ownerIdBytesToOwnerId(ownerIdBytes),
          messages,
          QuarantineOrigin.ReceivedMessage,
          now,
        );
        saveClock(deps)(clockTimestamp);
      });
      clock.set(clockTimestamp);
      // A batch of duplicates changes no table, so queries need no refresh.
      if (wroteNewMessages) didWriteMessages = true;
      return ok();
    },

    readDbChange: (ownerId, timestamp) => {
      const result = deps.sqlite.exec<{
        readonly table: string;
        readonly id: IdBytes;
        readonly column: string;
        readonly value: SqliteValue;
      }>(sql`
        select "table", "id", "column", "value"
        from evolu_history
        where "ownerId" = ${ownerId} and "timestamp" = ${timestamp}
        union all
        select "table", "id", "column", "value"
        from evolu_message_quarantine
        where "ownerId" = ${ownerId} and "timestamp" = ${timestamp};
      `);

      const { rows } = result;
      assertNonEmptyReadonlyArray(rows, "Every timestamp must have rows");
      const firstRow = firstInArray(rows);

      const values = createMutableRecord<string, SqliteValue>();
      let isInsert: DbChange["isInsert"] = false;
      let isDelete: DbChange["isDelete"] = null;

      for (const r of rows) {
        switch (r.column) {
          case "createdAt":
            isInsert = true;
            break;
          case "updatedAt":
            isInsert = false;
            break;
          case "isDeleted":
            assertType(SqliteBoolean, r.value);
            isDelete = sqliteBooleanToBoolean(r.value);
            break;
          default:
            values[r.column] = r.value;
        }
      }

      const message: CrdtMessage = {
        timestamp: timestampBytesToTimestamp(timestamp),
        change: DbChange.orThrow({
          table: firstRow.table,
          id: idBytesToId(firstRow.id),
          values,
          isInsert,
          isDelete,
        }),
      };

      return encodeAndEncryptDbChange(deps)(message, getEncryptionKey());
    },
  };
};

const handleMutation =
  (
    deps: BaseSqliteStorageDep &
      ClockDep &
      SqliteDep &
      SqliteSchemaDep &
      TimestampConfigDep,
  ) =>
  (
    message: ExtractTyped<EvoluInput, "Mutate">,
    now: Millis,
  ): Result<
    {
      readonly type: "Mutate";
      readonly clock: Timestamp;
      readonly messagesByOwnerId: ReadonlyMap<
        OwnerId,
        NonEmptyReadonlyArray<CrdtMessage>
      >;
      readonly rowsByQuery: RowsByQueryMap;
    },
    TimestampTimeOutOfRangeError
  > =>
    deps.sqlite.transaction(() => {
      const messagesByOwnerId = new Map<OwnerId, NonEmptyArray<CrdtMessage>>();
      let clockTimestamp = deps.clock.get();

      for (const change of message.changes) {
        if (isLocalOnlyTable(change.table)) {
          applyLocalOnlyChange(deps)(change, now);
          continue;
        }

        // A drifted change still receives the next timestamp; applyMessages
        // stores it in quarantine instead of its table.
        const nextTimestamp = sendTimestamp(deps)(clockTimestamp, now);
        if (!nextTimestamp.ok) {
          if (nextTimestamp.error.type !== "TimestampDriftError")
            return err(nextTimestamp.error);
          clockTimestamp = nextTimestamp.error.timestamp;
        } else clockTimestamp = nextTimestamp.value;

        const { ownerId, ...dbChange } = change;
        const message: CrdtMessage = {
          timestamp: clockTimestamp,
          change: dbChange,
        };

        const messages = messagesByOwnerId.get(ownerId);
        if (messages) messages.push(message);
        else messagesByOwnerId.set(ownerId, [message]);
      }

      for (const [ownerId, messages] of messagesByOwnerId) {
        applyMessages(deps)(
          ownerId,
          messages,
          QuarantineOrigin.LocalMutation,
          now,
        );
      }

      if (messagesByOwnerId.size > 0) saveClock(deps)(clockTimestamp);

      return ok({
        type: "Mutate",
        clock: clockTimestamp,
        messagesByOwnerId,
        rowsByQuery: loadQueries(deps)(message.subscribedQueries),
      });
    });

const applyLocalOnlyChange =
  (deps: SqliteDep) =>
  (change: MutationChange, now: Millis): void => {
    if (change.isDelete) {
      deps.sqlite.exec(sql`
        delete from ${sql.identifier(change.table)}
        where "ownerId" = ${change.ownerId} and "id" = ${change.id};
      `);
    } else {
      const ownerId = change.ownerId;
      const columns = dbChangeToColumns(change, now);

      for (const [column, value] of columns) {
        assertNotUndefined(value);
        deps.sqlite.exec(sql.prepared`
          insert into ${sql.identifier(change.table)}
            ("ownerId", "id", ${sql.identifier(column)})
          values (${ownerId}, ${change.id}, ${value})
          on conflict ("ownerId", "id") do update
            set ${sql.identifier(column)} = ${value};
        `);
      }
    }
  };

/**
 * Stores messages for an owner and applies them to their tables. Drifted
 * messages and columns the schema does not define go to quarantine instead.
 * Uses the request's captured time to classify drift, matching timestamp
 * generation. Returns whether any message was new; the rest were stored
 * before.
 */
const applyMessages =
  (
    deps: BaseSqliteStorageDep &
      SqliteDep &
      SqliteSchemaDep &
      TimestampConfigDep,
  ) =>
  (
    ownerId: OwnerId,
    messages: NonEmptyReadonlyArray<CrdtMessage>,
    origin: QuarantineOrigin,
    now: Millis,
  ): boolean => {
    const ownerIdBytes = ownerIdToOwnerIdBytes(ownerId);
    let wroteNewMessages = false;

    const usage = readOwnerUsageOrDefault(deps)(
      ownerIdBytes,
      timestampToTimestampBytes(firstInArray(messages).timestamp),
    );

    let { firstTimestamp, lastTimestamp } = usage;

    for (const { timestamp, change } of messages) {
      const timestampBytes = timestampToTimestampBytes(timestamp);

      let strategy;
      [strategy, firstTimestamp, lastTimestamp] = getTimestampInsertStrategy(
        timestampBytes,
        firstTimestamp,
        lastTimestamp,
      );

      // A timestamp already in the set was applied or quarantined before.
      // Skipping it preserves that decision and makes duplicate delivery and
      // retries idempotent without a separate lookup.
      const isNew = deps.baseSqliteStorage.insertTimestamp(
        ownerIdBytes,
        timestampBytes,
        strategy,
      );
      if (!isNew) continue;
      wroteNewMessages = true;

      const hasDrift = isTimestampBeyondMaxDrift(deps)(timestamp.millis, now);
      const columns = dbChangeToColumns(change, timestamp.millis);
      const idBytes = idToIdBytes(change.id);

      for (const [column, value] of columns) {
        assertNotUndefined(value);
        if (
          !hasDrift &&
          validateColumnValue(deps)(change.table, column, value)
        ) {
          applyColumnChange(deps)(
            ownerIdBytes,
            ownerId,
            change.table,
            idBytes,
            change.id,
            column,
            value,
            timestampBytes,
          );
        } else {
          deps.sqlite.exec(sql.prepared`
            insert into evolu_message_quarantine
              (
                "ownerId",
                "timestamp",
                "table",
                "id",
                "column",
                "value",
                "reason",
                "origin",
                "quarantinedAt"
              )
            values
              (
                ${ownerIdBytes},
                ${timestampBytes},
                ${change.table},
                ${idBytes},
                ${column},
                ${value},
                ${hasDrift
                  ? QuarantineReason.TimestampDrift
                  : QuarantineReason.Schema},
                ${origin},
                ${now}
              )
            on conflict do nothing;
          `);
        }
      }
    }

    if (wroteNewMessages) {
      /**
       * TODO: Implement proper storedBytes tracking for client using received
       * and sent encrypted message sizes.
       */
      updateOwnerUsage(deps)(
        ownerIdBytes,
        // Placeholder until proper tracking implemented
        onePositiveInt,
        firstTimestamp,
        lastTimestamp,
      );
    }

    return wroteNewMessages;
  };

const dbChangeToColumns = (change: DbChange, now: Millis) => {
  let values = objectToEntries(change.values);

  // SystemColumns are not encoded in change.values.
  values = appendToArray(values, [
    change.isInsert ? "createdAt" : "updatedAt",
    millisToDateIso(now),
  ]);
  if (change.isDelete != null) {
    values = appendToArray(values, [
      "isDeleted",
      // SQLite boolean values are fixed to the finite numbers 0 and 1.
      booleanToSqliteBoolean(change.isDelete) as FiniteNumber,
    ]);
  }

  return values;
};

const loadQueries =
  (deps: SqliteDep) =>
  (queries: Iterable<Query>): Map<Query, ReadonlyArray<SqliteRow>> => {
    const rowsByQuery = new Map<Query, ReadonlyArray<SqliteRow>>();

    for (const query of queries) {
      const { rows } = deps.sqlite.exec(sqliteQueryStringToSqliteQuery(query));
      rowsByQuery.set(query, rows);
    }

    return rowsByQuery;
  };

//   reset: (deps) => (message) => {
//     const result = deps.sqlite.transaction(() => {
//       const sqliteSchema = getSqliteSchema(deps)();
//       if (!sqliteSchema.ok) return sqliteSchema;

//       for (const tableName in sqliteSchema.value.tables) {
//         /**
//          * The dropped table is completely removed from the database schema and
//          * the disk file. The table can not be recovered. All indices and
//          * triggers associated with the table are also deleted.
//          * https://sqlite.org/lang_droptable.html
//          */
//         const result = deps.sqlite.exec(sql`
//           drop table ${sql.identifier(tableName)};
//         `);
//         if (!result.ok) return result;
//       }

//       if (message.restore) {
//         const result = ensureSqliteSchema(deps)(message.restore.sqliteSchema);
//         if (!result.ok) return result;

//         const secret = mnemonicToOwnerSecret(message.restore.mnemonic);
//         const appOwner = createAppOwner(secret);
//         const clock = createClock(deps)();

//         return initializeDb(deps)(appOwner, clock.get());
//       }

//       return ok();
//     });

//     if (!result.ok) {
//       deps.postMessage({ type: "onError", error: result.error });
//       return;
//     }

//     deps.postMessage({
//       type: "onReset",
//       onCompleteId: message.onCompleteId,
//       reload: message.reload,
//     });
//   },

//   ensureSqliteSchema: (deps) => (message) => {
//     const result = deps.sqlite.transaction(() =>
//       ensureSqliteSchema(deps)(message.sqliteSchema),
//     );

//     if (!result.ok) {
//       deps.postMessage({ type: "onError", error: result.error });
//       return;
//     }
//   },
