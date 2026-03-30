/**
 * Local-first Db worker.
 *
 * @module
 */

import {
  appendToArray,
  firstInArray,
  type NonEmptyArray,
  type NonEmptyReadonlyArray,
} from "../Array.js";
import { assert, assertNonEmptyReadonlyArray } from "../Assert.js";
import type { ConsoleLevel } from "../Console.js";
import {
  EncryptionKey,
  type DecryptWithXChaCha20Poly1305Error,
  type RandomBytesDep,
} from "../Crypto.js";
import { exhaustiveCheck, lazyFalse, lazyVoid } from "../Function.js";
import { createRecord, getProperty, objectToEntries } from "../Object.js";
import { ok, type Result } from "../Result.js";
import type {
  CreateSqliteDriverDep,
  SqliteDep,
  SqliteRow,
  SqliteSchema,
} from "../Sqlite.js";
import {
  booleanToSqliteBoolean,
  createSqlite,
  sql,
  SqliteBoolean,
  sqliteBooleanToBoolean,
  sqliteQueryStringToSqliteQuery,
  SqliteValue,
} from "../Sqlite.js";
import { type LeaderLockDep, type Task } from "../Task.js";
import { Millis, millisToDateIso, type TimeDep } from "../Time.js";
import type { Name } from "../Type.js";
import {
  Id,
  IdBytes,
  idBytesToId,
  idToIdBytes,
  onePositiveInt,
} from "../Type.js";
import type { ExtractType } from "../Types.js";
import type {
  MessagePort,
  NativeMessagePort,
  Worker,
  WorkerDeps,
  WorkerSelf,
} from "../Worker.js";
import type { OwnerId, OwnerIdBytes } from "./Owner.js";
import { ownerIdBytesToOwnerId, ownerIdToOwnerIdBytes } from "./Owner.js";
import {
  applyProtocolMessageAsClient,
  createProtocolMessageForSync,
  decryptAndDecodeDbChange,
  encodeAndEncryptDbChange,
  protocolVersion,
  SubscriptionFlags,
  type ProtocolInvalidDataError,
  type ProtocolMessage,
  type ProtocolTimestampMismatchError,
} from "./Protocol.js";
import type { Query, RowsByQueryMap } from "./Query.js";
import type { MutationChange, SqliteSchemaDep } from "./Schema.js";
import {
  ensureSqliteSchema,
  getEvoluSqliteSchema,
  systemColumns,
} from "./Schema.js";
import type { DbWorkerInput, DbWorkerOutput } from "./Shared.js";
import {
  createBaseSqliteStorage,
  createBaseSqliteStorageTables,
  DbChange,
  getOwnerUsage,
  getTimestampInsertStrategy,
  updateOwnerUsage,
  type BaseSqliteStorage,
  type BaseSqliteStorageDep,
  type CrdtMessage,
  type Storage,
} from "./Storage.js";
import type {
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampTimeOutOfRangeError,
} from "./Timestamp.js";
import {
  createInitialTimestamp,
  defaultTimestampMaxDrift,
  receiveTimestamp,
  sendTimestamp,
  TimestampBytes,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
  type TimestampConfigDep,
} from "./Timestamp.js";

export type DbWorker = Worker<DbWorkerInit>;

export interface DbWorkerInit {
  readonly type: "Init";
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
  LeaderLockDep &
  CreateSqliteDriverDep &
  RandomBytesDep;

export interface PortDep {
  readonly port: MessagePort<DbWorkerOutput, DbWorkerInput>;
}

export const initDbWorker =
  (
    self: WorkerSelf<DbWorkerInit>,
  ): Task<AsyncDisposableStack, never, DbWorkerDeps> =>
  (run) => {
    const { leaderLock, createMessagePort, consoleStoreOutputEntry } = run.deps;
    const stack = new AsyncDisposableStack();

    let initialized = false;

    self.onMessage = ({
      name,
      consoleLevel,
      sqliteSchema,
      encryptionKey,
      memoryOnly,
      port: nativeLeaderPort,
    }) => {
      assert(!initialized, "DbWorker must be initialized only once");
      initialized = true;

      const console = run.deps.console.child(name).child("DbWorker");
      const port = stack.use(
        createMessagePort<DbWorkerOutput, DbWorkerInput>(nativeLeaderPort),
      );

      stack.defer(
        consoleStoreOutputEntry.subscribe(() => {
          const entry = consoleStoreOutputEntry.get();
          if (entry) port.postMessage({ type: "OnConsoleEntry", entry });
        }),
      );

      // One DbWorker serves multiple tabs, so console level is global
      // here. The most recently initialized tab's level wins.
      console.setLevel(consoleLevel);
      console.info("initDbWorker");

      void run.daemon(async (run) => {
        const lockResult = await run(leaderLock.lock(name));
        if (lockResult.ok) stack.use(lockResult.value);
        console.info("leaderLock acquired");
        port.postMessage({ type: "LeaderAcquired", name });
        return run.addDeps({
          port,
          timestampConfig: { maxDrift: defaultTimestampMaxDrift },
        })(startDbWorker(name, sqliteSchema, encryptionKey, memoryOnly));
      });
    };

    return ok(stack);
  };

const startDbWorker =
  (
    name: Name,
    sqliteSchema: SqliteSchema,
    encryptionKey: EncryptionKey,
    memoryOnly: boolean,
  ): Task<
    globalThis.AsyncDisposableStack,
    never,
    DbWorkerDeps & PortDep & TimestampConfigDep
  > =>
  async (run) => {
    await using stack = new AsyncDisposableStack();

    const console = run.deps.console.child(name).child("DbWorker");
    console.info("startDbWorker");

    const sqliteResult = await run(
      createSqlite(
        name,
        memoryOnly ? { mode: "memory" } : { mode: "encrypted", encryptionKey },
      ),
    );
    if (!sqliteResult.ok) return sqliteResult;
    const sqlite = stack.use(sqliteResult.value);
    console.debug("SQLite created");

    const baseSqliteStorage = createBaseSqliteStorage({ sqlite, ...run.deps });

    const deps = {
      ...run.deps,
      sqlite,
      sqliteSchema,
      baseSqliteStorage,
    };

    const currentSchema = getEvoluSqliteSchema(deps)();
    const dbIsInitialized = "evolu_version" in currentSchema.tables;
    const clock = createClock(deps)(dbIsInitialized);

    sqlite.transaction(() => {
      if (!dbIsInitialized) initializeDb(deps)(clock.get());
      ensureSqliteSchema(deps)(sqliteSchema, currentSchema);
      tryApplyQuarantinedMessages(deps);
    });

    const { port } = run.deps;
    const storage = createClientStorage({ ...deps, clock })({
      onError: (error) => {
        port.postMessage({ type: "OnError", error });
      },
    });
    const dbWorkerRun = run.create().addDeps({ storage });

    stack.use(dbWorkerRun);

    /**
     * SharedWorker repeats sends until it gets a response, so handling here
     * must be idempotent and ignore already processed IDs.
     *
     * TODO: Bound memory growth by evicting old IDs.
     */
    const processedRequestIds = new Set<Id>();

    port.onMessage = ({ callbackId, request }) => {
      if (processedRequestIds.has(callbackId)) return;
      processedRequestIds.add(callbackId);

      const postQueuedResponse = (
        response: ExtractType<DbWorkerOutput, "OnQueuedResponse">["response"],
      ): void => {
        port.postMessage(
          { type: "OnQueuedResponse", callbackId, response },
          response.type === "ForEvolu" && response.message.type === "Export"
            ? [response.message.file.buffer]
            : undefined,
        );
      };

      switch (request.type) {
        case "ForEvolu": {
          switch (request.message.type) {
            case "Mutate": {
              const result = handleMutation({ ...deps, clock })(
                request.message,
              );
              if (!result.ok) {
                port.postMessage({ type: "OnError", error: result.error });
              } else {
                postQueuedResponse({
                  type: "ForEvolu",
                  evoluPortId: request.evoluPortId,
                  message: result.value,
                });
              }
              break;
            }

            case "Query":
              postQueuedResponse({
                type: "ForEvolu",
                evoluPortId: request.evoluPortId,
                message: {
                  type: "Query",
                  rowsByQuery: loadQueries(deps)(request.message.queries),
                },
              });
              break;

            case "Export":
              postQueuedResponse({
                type: "ForEvolu",
                evoluPortId: request.evoluPortId,
                message: {
                  type: "Export",
                  file: deps.sqlite.export(),
                },
              });
              break;

            default:
              exhaustiveCheck(request.message);
          }
          break;
        }

        case "ForSharedWorker": {
          switch (request.message.type) {
            case "CreateSyncMessages": {
              const protocolMessagesByOwnerId = new Map<
                OwnerId,
                ProtocolMessage
              >();

              for (const owner of request.message.owners) {
                storage.setOwnerState(owner.encryptionKey);
                const protocolMessage = createProtocolMessageForSync({
                  storage,
                  console,
                })(owner.id, SubscriptionFlags.Subscribe);

                if (protocolMessage) {
                  protocolMessagesByOwnerId.set(owner.id, protocolMessage);
                }
              }

              postQueuedResponse({
                type: "ForSharedWorker",
                message: {
                  type: "CreateSyncMessages",
                  protocolMessagesByOwnerId,
                },
              });
              break;
            }

            case "ApplySyncMessage": {
              const { owner, inputMessage } = request.message;

              void dbWorkerRun(async (run) => {
                storage.setOwnerState(owner.encryptionKey);

                const result = await run(
                  applyProtocolMessageAsClient(inputMessage, {
                    writeKey: owner.writeKey,
                  }),
                );

                const didWriteMessages = storage.didWriteMessages();

                postQueuedResponse({
                  type: "ForSharedWorker",
                  message: {
                    type: "ApplySyncMessage",
                    ownerId: owner.id,
                    didWriteMessages,
                    result,
                  },
                });

                return ok();
              });
              break;
            }

            default:
              exhaustiveCheck(request.message);
          }
          break;
        }

        default:
          exhaustiveCheck(request);
      }
    };

    return ok(stack.move());

    // TODO: Add parallel stale-leader detection.
    // Heartbeat is emitted by the active DB worker and sent to
    // SharedWorker. SharedWorker tracks last-seen heartbeat per Evolu
    // name and if silent for 10 seconds, it waits for another DB worker
    // to announce itself alive and then routes requests to that worker.
  };

/**
 * Hybrid Logical Clock. Keeps the current timestamp in memory to avoid frequent
 * SQLite reads.
 */
interface Clock {
  readonly get: () => Timestamp;
  readonly save: (timestamp: Timestamp) => void;
}

interface ClockDep {
  readonly clock: Clock;
}

const createClock =
  (deps: RandomBytesDep & SqliteDep) =>
  (dbIsInitialized: boolean): Clock => {
    let currentTimestamp: Timestamp;

    if (dbIsInitialized) {
      const { rows } = deps.sqlite.exec<{ clock: TimestampBytes }>(sql`
        select clock
        from evolu_config
        limit 1;
      `);
      assertNonEmptyReadonlyArray(rows);
      currentTimestamp = timestampBytesToTimestamp(firstInArray(rows).clock);
    } else {
      currentTimestamp = createInitialTimestamp(deps);
    }

    return {
      get: () => currentTimestamp,

      save: (timestamp) => {
        currentTimestamp = timestamp;

        deps.sqlite.exec(sql.prepared`
          update evolu_config
          set "clock" = ${timestampToTimestampBytes(timestamp)};
        `);
      },
    };
  };

const initializeDb =
  ({ sqlite }: SqliteDep) =>
  (initialClock: Timestamp): void => {
    for (const query of [
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
       * Stores messages with unknown schema in a quarantine table.
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
          primary key ("ownerId", "timestamp", "table", "id", "column")
        )
        strict;
      `,
    ]) {
      sqlite.exec(query);
    }

    createBaseSqliteStorageTables({ sqlite });
  };

const tryApplyQuarantinedMessages = (
  deps: SqliteDep & SqliteSchemaDep,
): void => {
  const rows = deps.sqlite.exec<{
    readonly ownerId: OwnerIdBytes;
    readonly timestamp: TimestampBytes;
    readonly table: string;
    readonly id: IdBytes;
    readonly column: string;
    readonly value: SqliteValue;
  }>(sql`
    select "ownerId", "timestamp", "table", "id", "column", "value"
    from evolu_message_quarantine;
  `);

  for (const row of rows.rows) {
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

    deps.sqlite.exec(sql`
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

const validateColumnValue =
  (deps: SqliteSchemaDep) =>
  (table: string, column: string, _value: SqliteValue): boolean => {
    const schemaColumns = getProperty(deps.sqliteSchema.tables, table);
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
  readonly setOwnerState: (encryptionKey: EncryptionKey) => void;
  readonly didWriteMessages: () => boolean;
}

const createClientStorage =
  (
    deps: BaseSqliteStorageDep &
      ClockDep &
      SqliteSchemaDep &
      RandomBytesDep &
      SqliteDep &
      TimeDep &
      TimestampConfigDep,
  ) =>
  ({
    onError,
  }: {
    onError: (
      error:
        | ProtocolInvalidDataError
        | ProtocolTimestampMismatchError
        | DecryptWithXChaCha20Poly1305Error
        | TimestampCounterOverflowError
        | TimestampDriftError
        | TimestampTimeOutOfRangeError,
    ) => void;
  }): ClientStorage => {
    let encryptionKey: EncryptionKey | null = null;
    let didWriteMessages = false;

    const getEncryptionKey = (): EncryptionKey => {
      assert(encryptionKey != null, "ClientStorage encryption key must be set");
      return encryptionKey;
    };

    return {
      ...deps.baseSqliteStorage,

      // DEV: ClientStorage was designed when Storage and Sync lived in the
      // same file.
      // This is safe because the worker handles one message at a time. We will
      // refactor it later, we will probably have to change Protocol API.
      setOwnerState: (nextEncryptionKey) => {
        encryptionKey = nextEncryptionKey;
        didWriteMessages = false;
      },

      didWriteMessages: () => didWriteMessages,

      // Not implemented yet.
      validateWriteKey: lazyFalse,
      setWriteKey: lazyVoid,

      writeMessages: (ownerIdBytes, encryptedMessages) => () => {
        // TODO: Add quota checking for collaborative scenarios.
        // When receiving messages from other owners via relay broadcast,
        // check if this owner is within quota before accepting the data.
        // This prevents an owner from exceeding storage limits when receiving
        // data shared by other collaborators.

        const messages: Array<CrdtMessage> = [];
        const currentEncryptionKey = getEncryptionKey();

        for (const message of encryptedMessages) {
          const change = decryptAndDecodeDbChange(
            message,
            currentEncryptionKey,
          );
          if (!change.ok) {
            onError(change.error);
            return ok();
          }
          messages.push({ timestamp: message.timestamp, change: change.value });
        }

        let clockTimestamp = deps.clock.get();

        for (const message of messages) {
          const nextTimestamp = receiveTimestamp(deps)(
            clockTimestamp,
            message.timestamp,
          );
          if (!nextTimestamp.ok) {
            onError(nextTimestamp.error);
            return ok();
          }
          clockTimestamp = nextTimestamp.value;
        }

        assertNonEmptyReadonlyArray(messages);

        return deps.sqlite.transaction(() => {
          applyMessages(deps)(ownerIdBytesToOwnerId(ownerIdBytes), messages);
          deps.clock.save(clockTimestamp);
          didWriteMessages = true;
          return ok();
        });
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

        const values = createRecord<string, SqliteValue>();
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
              if (SqliteBoolean.is(r.value)) {
                isDelete = sqliteBooleanToBoolean(r.value);
              }
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
      SqliteSchemaDep &
      RandomBytesDep &
      SqliteDep &
      TimeDep &
      TimestampConfigDep,
  ) =>
  (
    message: ExtractType<
      ExtractType<DbWorkerInput["request"], "ForEvolu">["message"],
      "Mutate"
    >,
  ): Result<
    {
      readonly type: "Mutate";
      readonly messagesByOwnerId: ReadonlyMap<
        OwnerId,
        NonEmptyReadonlyArray<CrdtMessage>
      >;
      readonly rowsByQuery: RowsByQueryMap;
    },
    | TimestampDriftError
    | TimestampCounterOverflowError
    | TimestampTimeOutOfRangeError
  > =>
    deps.sqlite.transaction(() => {
      const messagesByOwnerId = new Map<OwnerId, NonEmptyArray<CrdtMessage>>();
      let clockTimestamp = deps.clock.get();
      let clockChanged = false;

      for (const change of message.changes) {
        if (change.table.startsWith("_")) {
          applyLocalOnlyChange(deps)(change);
          continue;
        }

        const nextTimestamp = sendTimestamp(deps)(clockTimestamp);
        if (!nextTimestamp.ok) return nextTimestamp;

        clockTimestamp = nextTimestamp.value;
        clockChanged = true;

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
        applyMessages(deps)(ownerId, messages);
      }

      if (clockChanged) deps.clock.save(clockTimestamp);

      return ok({
        type: "Mutate",
        messagesByOwnerId,
        rowsByQuery: loadQueries(deps)(message.subscribedQueries),
      });
    });

const applyLocalOnlyChange =
  (deps: SqliteDep & TimeDep) =>
  (change: MutationChange): void => {
    if (change.isDelete) {
      deps.sqlite.exec(sql`
        delete from ${sql.identifier(change.table)}
        where id = ${change.id};
      `);
    } else {
      const ownerId = change.ownerId;
      const columns = dbChangeToColumns(change, deps.time.now());

      for (const [column, value] of columns) {
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

const applyMessages =
  (deps: BaseSqliteStorageDep & ClockDep & SqliteSchemaDep & SqliteDep) =>
  (ownerId: OwnerId, messages: NonEmptyReadonlyArray<CrdtMessage>): void => {
    const ownerIdBytes = ownerIdToOwnerIdBytes(ownerId);

    const usage = getOwnerUsage(deps)(
      ownerIdBytes,
      timestampToTimestampBytes(firstInArray(messages).timestamp),
    );
    if (!usage.ok) return;

    let { firstTimestamp, lastTimestamp } = usage.value;

    for (const { timestamp, change } of messages) {
      const columns = dbChangeToColumns(change, timestamp.millis);
      const idBytes = idToIdBytes(change.id);
      const timestampBytes = timestampToTimestampBytes(timestamp);

      for (const [column, value] of columns) {
        if (validateColumnValue(deps)(change.table, column, value)) {
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
              ("ownerId", "timestamp", "table", "id", "column", "value")
            values
              (
                ${ownerIdBytes},
                ${timestampBytes},
                ${change.table},
                ${idBytes},
                ${column},
                ${value}
              )
            on conflict do nothing;
          `);
        }
      }

      let strategy;
      [strategy, firstTimestamp, lastTimestamp] = getTimestampInsertStrategy(
        timestampBytes,
        firstTimestamp,
        lastTimestamp,
      );

      deps.baseSqliteStorage.insertTimestamp(
        ownerIdBytes,
        timestampBytes,
        strategy,
      );
    }

    /**
     * TODO: Implement proper storedBytes tracking for client using received and
     * sent encrypted message sizes.
     */
    updateOwnerUsage(deps)(
      ownerIdBytes,
      onePositiveInt, // Placeholder until proper tracking implemented
      firstTimestamp,
      lastTimestamp,
    );
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
      booleanToSqliteBoolean(change.isDelete),
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
