import { hexToBytes } from "@noble/ciphers/utils";
import {
  Brand,
  Context,
  Effect,
  Function,
  Layer,
  Option,
  ReadonlyArray,
  ReadonlyRecord,
  pipe,
} from "effect";
import { Config, ConfigLive } from "./Config.js";
import {
  MerkleTree,
  Time,
  TimeLive,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampError,
  TimestampString,
  TimestampTimeOutOfRangeError,
  diffMerkleTrees,
  insertIntoMerkleTree,
  makeSyncTimestamp,
  merkleTreeToString,
  receiveTimestamp,
  sendTimestamp,
  timestampToString,
  unsafeTimestampFromString,
} from "./Crdt.js";
import { Bip39, Mnemonic, NanoId } from "./Crypto.js";
import {
  Query,
  RowsStore,
  RowsStoreLive,
  Table,
  Tables,
  Value,
  ensureSchema,
  lazyInit,
  queryToSqliteQuery,
  someDefectToNoSuchTableOrColumnError,
  transaction,
  valuesToSqliteValues,
} from "./Db.js";
import { QueryPatches, makePatches } from "./Diff.js";
import {
  EvoluError,
  UnexpectedError,
  makeUnexpectedError,
} from "./ErrorStore.js";
import { Id, SqliteDate, cast } from "./Model.js";
import { Owner, OwnerId } from "./Owner.js";
import * as Sql from "./Sql.js";
import { Sqlite, maybeParseJson } from "./Sqlite.js";
import {
  Message,
  NewMessage,
  NewMessageEquivalence,
  SyncState,
  SyncWorker,
  SyncWorkerOutputSyncResponse,
  SyncWorkerPostMessage,
} from "./SyncWorker.js";

export interface DbWorker {
  readonly postMessage: (input: DbWorkerInput) => void;
  onMessage: (output: DbWorkerOutput) => void;
}

export const DbWorker = Context.Tag<DbWorker>();

export type DbWorkerInput =
  | DbWorkerInputInit
  | DbWorkerInputQuery
  | DbWorkerInputMutate
  | DbWorkerInputSync
  | DbWorkerInputReset
  | DbWorkerInputEnsureSchema
  | SyncWorkerOutputSyncResponse;

interface DbWorkerInputInit {
  readonly _tag: "init";
  readonly config: Config;
  readonly tables: Tables;
}

interface DbWorkerInputQuery {
  readonly _tag: "query";
  readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Query>;
}

interface DbWorkerInputMutate {
  readonly _tag: "mutate";
  readonly items: ReadonlyArray.NonEmptyReadonlyArray<MutateItem>;
  readonly queries: ReadonlyArray<Query>;
}

interface DbWorkerInputSync {
  readonly _tag: "sync";
  readonly queries: ReadonlyArray<Query>;
}

interface DbWorkerInputReset {
  readonly _tag: "reset";
  readonly mnemonic?: Mnemonic;
}

interface DbWorkerInputEnsureSchema {
  readonly _tag: "ensureSchema";
  readonly tables: Tables;
}

type DbWorkerOnMessage = DbWorker["onMessage"];

const DbWorkerOnMessage = Context.Tag<DbWorkerOnMessage>();

export type DbWorkerOutput =
  | DbWorkerOutputOnError
  | DbWorkerOutputOnOwner
  | DbWorkerOutputOnQuery
  | DbWorkerOutputOnReceive
  | DbWorkerOutputOnResetOrRestore
  | DbWorkerOutputOnSyncState;

interface DbWorkerOutputOnError {
  readonly _tag: "onError";
  readonly error: EvoluError;
}

interface DbWorkerOutputOnOwner {
  readonly _tag: "onOwner";
  readonly owner: Owner;
}

export interface DbWorkerOutputOnQuery {
  readonly _tag: "onQuery";
  readonly queriesPatches: ReadonlyArray<QueryPatches>;
  readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
}

export type OnCompleteId = string &
  Brand.Brand<"Id"> &
  Brand.Brand<"OnComplete">;

interface DbWorkerOutputOnReceive {
  readonly _tag: "onReceive";
}

interface DbWorkerOutputOnResetOrRestore {
  readonly _tag: "onResetOrRestore";
}

interface DbWorkerOutputOnSyncState {
  readonly _tag: "onSyncState";
  readonly state: SyncState;
}

export interface MutateItem {
  readonly table: string;
  readonly id: Id;
  readonly values: ReadonlyRecord.ReadonlyRecord<
    Value | Date | boolean | undefined
  >;
  readonly isInsert: boolean;
  readonly now: SqliteDate;
  readonly onCompleteId: OnCompleteId | null;
}

const init = (
  input: DbWorkerInputInit,
): Effect.Effect<Sqlite | Bip39 | NanoId, never, Owner> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);

    return yield* _(
      sqlite.exec(Sql.selectOwner),
      Effect.map(
        ({ rows: [row] }): Owner => ({
          id: row.id as OwnerId,
          mnemonic: row.mnemonic as Mnemonic,
          // expo-sqlite 11.3.2 doesn't support Uint8Array
          encryptionKey: hexToBytes(row.encryptionKey as string),
        }),
      ),
      someDefectToNoSuchTableOrColumnError,
      Effect.catchTag("NoSuchTableOrColumnError", () => lazyInit()),
      Effect.tap(() => ensureSchema(input.tables)),
    );
  });

const query = ({
  queries,
  onCompleteIds = [],
}: {
  readonly queries: ReadonlyArray<Query>;
  readonly onCompleteIds?: ReadonlyArray<OnCompleteId>;
}): Effect.Effect<Sqlite | RowsStore | DbWorkerOnMessage, never, void> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);
    const rowsStore = yield* _(RowsStore);
    const dbWorkerOnMessage = yield* _(DbWorkerOnMessage);

    const queriesRows = yield* _(
      ReadonlyArray.dedupe(queries),
      Effect.forEach((query) =>
        sqlite
          .exec(queryToSqliteQuery(query))
          .pipe(
            Effect.map(
              (result) => [query, maybeParseJson(result.rows)] as const,
            ),
          ),
      ),
    );

    const previous = rowsStore.getState();
    yield* _(rowsStore.setState(new Map([...previous, ...queriesRows])));

    const queriesPatches = queriesRows.map(
      ([query, rows]): QueryPatches => ({
        query,
        patches: makePatches(previous.get(query), rows),
      }),
    );

    dbWorkerOnMessage({ _tag: "onQuery", queriesPatches, onCompleteIds });
  });

interface TimestampAndMerkleTree {
  readonly timestamp: Timestamp;
  readonly merkleTree: MerkleTree;
}

const readTimestampAndMerkleTree = Sqlite.pipe(
  Effect.flatMap((sqlite) =>
    sqlite.exec(Sql.selectOwnerTimestampAndMerkleTree),
  ),
  Effect.map((result) => result.rows),
  Effect.map(
    ([{ timestamp, merkleTree }]): TimestampAndMerkleTree => ({
      timestamp: unsafeTimestampFromString(timestamp as TimestampString),
      merkleTree: merkleTree as MerkleTree,
    }),
  ),
);

export const mutateItemsToNewMessages = (
  items: ReadonlyArray<MutateItem>,
): ReadonlyArray<NewMessage> =>
  pipe(
    items,
    ReadonlyArray.map(({ id, isInsert, now, table, values }) =>
      pipe(
        Object.entries(values),
        ReadonlyArray.filterMap(([key, value]) =>
          // The value can be undefined if exactOptionalPropertyTypes isn't true.
          // Don't insert nulls because null is the default value.
          value === undefined || (isInsert && value == null)
            ? Option.none()
            : Option.some([key, value] as const),
        ),
        ReadonlyArray.map(
          ([key, value]) =>
            [
              key,
              typeof value === "boolean"
                ? cast(value)
                : value instanceof Date
                ? cast(value)
                : value,
            ] as const,
        ),
        ReadonlyArray.append([isInsert ? "createdAt" : "updatedAt", now]),
        ReadonlyArray.map(
          ([key, value]): NewMessage => ({
            table,
            row: id,
            column: key,
            value,
          }),
        ),
      ),
    ),
    ReadonlyArray.flatten,
    ReadonlyArray.dedupeWith(NewMessageEquivalence),
  );

const ensureSchemaByNewMessages = (
  messages: ReadonlyArray<NewMessage>,
): Effect.Effect<Sqlite, never, void> =>
  Effect.gen(function* (_) {
    const tablesMap = new Map<string, Table>();
    messages.forEach((message) => {
      const table = tablesMap.get(message.table);
      if (table == null) {
        tablesMap.set(message.table, {
          name: message.table,
          columns: [message.column],
        });
        return;
      }
      if (table.columns.includes(message.column)) return;
      tablesMap.set(message.table, {
        name: message.table,
        columns: table.columns.concat(message.column),
      });
    });
    yield* _(ensureSchema(Array.from(tablesMap.values())));
  });

export const upsertValueIntoTableRowColumn = (
  message: NewMessage,
  messages: ReadonlyArray<NewMessage>,
): Effect.Effect<Sqlite, never, void> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);

    const insert = sqlite.exec({
      sql: Sql.upsertValueIntoTableRowColumn(message.table, message.column),
      parameters: valuesToSqliteValues([
        message.row,
        message.value,
        message.value,
      ]),
    });

    yield* _(
      insert,
      someDefectToNoSuchTableOrColumnError,
      Effect.catchTag("NoSuchTableOrColumnError", () =>
        // If one message fails, we ensure schema for all messages.
        ensureSchemaByNewMessages(messages).pipe(Effect.zipRight(insert)),
      ),
    );
  });

const applyMessages = ({
  merkleTree,
  messages,
}: {
  merkleTree: MerkleTree;
  messages: ReadonlyArray<Message>;
}): Effect.Effect<Sqlite, never, MerkleTree> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);

    for (const message of messages) {
      const timestamp: TimestampString | null = yield* _(
        sqlite.exec({
          sql: Sql.selectLastTimestampForTableRowColumn,
          parameters: [message.table, message.row, message.column],
        }),
        Effect.map((result) => result.rows),
        Effect.flatMap(ReadonlyArray.head),
        Effect.map((row) => row.timestamp as TimestampString),
        Effect.catchTag("NoSuchElementException", () => Effect.succeed(null)),
      );

      if (timestamp == null || timestamp < message.timestamp) {
        yield* _(upsertValueIntoTableRowColumn(message, messages));
      }

      if (timestamp == null || timestamp !== message.timestamp) {
        const { changes } = yield* _(
          sqlite.exec({
            sql: Sql.insertIntoMessagesIfNew,
            parameters: valuesToSqliteValues([
              message.timestamp,
              message.table,
              message.row,
              message.column,
              message.value,
            ]),
          }),
        );
        if (changes > 0) {
          const timestamp = unsafeTimestampFromString(message.timestamp);
          merkleTree = insertIntoMerkleTree(timestamp)(merkleTree);
        }
      }
    }

    return merkleTree;
  });

const writeTimestampAndMerkleTree = ({
  timestamp,
  merkleTree,
}: TimestampAndMerkleTree): Effect.Effect<Sqlite, never, void> =>
  Effect.flatMap(Sqlite, (sqlite) =>
    sqlite.exec({
      sql: Sql.updateOwnerTimestampAndMerkleTree,
      parameters: [
        timestampToString(timestamp),
        merkleTreeToString(merkleTree),
      ],
    }),
  );

const mutate = ({
  items,
  queries,
}: DbWorkerInputMutate): Effect.Effect<
  | Sqlite
  | Owner
  | Time
  | Config
  | RowsStore
  | DbWorkerOnMessage
  | SyncWorkerPostMessage,
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampTimeOutOfRangeError,
  void
> =>
  Effect.gen(function* (_) {
    const [toSync, localOnlyItems] = ReadonlyArray.partition(items, (item) =>
      item.table.startsWith("_"),
    );
    const [toUpsert, toDelete] = ReadonlyArray.partition(
      localOnlyItems,
      (item) =>
        mutateItemsToNewMessages([item]).some(
          (message) => message.column === "isDeleted" && message.value === 1,
        ),
    ).map(mutateItemsToNewMessages);

    yield* _(
      Effect.forEach(toUpsert, (message) =>
        upsertValueIntoTableRowColumn(message, toUpsert),
      ),
    );

    const { exec } = yield* _(Sqlite);
    yield* _(
      Effect.forEach(toDelete, ({ table, row }) =>
        exec({ sql: Sql.deleteTableRow(table), parameters: [row] }),
      ),
    );

    if (toSync.length > 0) {
      let { timestamp, merkleTree } = yield* _(readTimestampAndMerkleTree);

      const messages = yield* _(
        mutateItemsToNewMessages(toSync),
        Effect.forEach((message) =>
          Effect.map(sendTimestamp(timestamp), (nextTimestamp): Message => {
            timestamp = nextTimestamp;
            return { ...message, timestamp: timestampToString(timestamp) };
          }),
        ),
      );

      merkleTree = yield* _(applyMessages({ merkleTree, messages }));

      yield* _(writeTimestampAndMerkleTree({ timestamp, merkleTree }));

      (yield* _(SyncWorkerPostMessage))({
        _tag: "sync",
        syncUrl: (yield* _(Config)).syncUrl,
        messages,
        timestamp,
        merkleTree,
        owner: yield* _(Owner),
        syncLoopCount: 0,
      });
    }

    const onCompleteIds = ReadonlyArray.filterMap(items, (item) =>
      Option.fromNullable(item.onCompleteId),
    );
    if (queries.length > 0 || onCompleteIds.length > 0)
      yield* _(query({ queries, onCompleteIds }));
  });

const handleSyncResponse = ({
  messages,
  ...response
}: SyncWorkerOutputSyncResponse): Effect.Effect<
  Sqlite | Time | Config | DbWorkerOnMessage | SyncWorkerPostMessage | Owner,
  TimestampError,
  void
> =>
  Effect.gen(function* (_) {
    let { timestamp, merkleTree } = yield* _(readTimestampAndMerkleTree);

    if (messages.length > 0) {
      for (const message of messages)
        timestamp = yield* _(
          unsafeTimestampFromString(message.timestamp),
          (remote) => receiveTimestamp({ local: timestamp, remote }),
        );
      merkleTree = yield* _(applyMessages({ merkleTree, messages }));
      yield* _(writeTimestampAndMerkleTree({ timestamp, merkleTree }));
    }

    const dbWorkerOnMessage = yield* _(DbWorkerOnMessage);
    dbWorkerOnMessage({ _tag: "onReceive" });

    const diff = diffMerkleTrees(response.merkleTree, merkleTree);

    const syncWorkerPostMessage = yield* _(SyncWorkerPostMessage);

    if (Option.isNone(diff)) {
      syncWorkerPostMessage({ _tag: "syncCompleted" });
      dbWorkerOnMessage({
        _tag: "onSyncState",
        state: {
          _tag: "SyncStateIsSynced",
          time: yield* _(Time.pipe(Effect.flatMap((time) => time.now))),
        },
      });
      return;
    }

    const [sqlite, config, owner] = yield* _(
      Effect.all([Sqlite, Config, Owner]),
    );
    const messagesToSync = yield* _(
      sqlite.exec({
        sql: Sql.selectMessagesToSync,
        parameters: [timestampToString(makeSyncTimestamp(diff.value))],
      }),
      Effect.map(({ rows }) => rows as unknown as ReadonlyArray<Message>),
    );
    syncWorkerPostMessage({
      _tag: "sync",
      syncUrl: config.syncUrl,
      messages: messagesToSync,
      timestamp,
      merkleTree,
      owner,
      syncLoopCount: response.syncLoopCount + 1,
    });
  });

const sync = ({
  queries,
}: DbWorkerInputSync): Effect.Effect<
  | Sqlite
  | Config
  | DbWorkerOnMessage
  | SyncWorkerPostMessage
  | Owner
  | RowsStore,
  never,
  void
> =>
  Effect.gen(function* (_) {
    if (queries.length > 0) yield* _(query({ queries }));

    const [syncWorkerPostMessage, config, owner, timestampAndMerkleTree] =
      yield* _(
        Effect.all([
          SyncWorkerPostMessage,
          Config,
          Owner,
          readTimestampAndMerkleTree,
        ]),
      );

    syncWorkerPostMessage({
      ...timestampAndMerkleTree,
      _tag: "sync",
      syncUrl: config.syncUrl,
      owner,
      messages: [],
      syncLoopCount: 0,
    });
  });

const reset = (
  input: DbWorkerInputReset,
): Effect.Effect<Sqlite | Bip39 | NanoId | DbWorkerOnMessage, never, void> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);

    yield* _(
      sqlite.exec(`SELECT "name" FROM "sqlite_master" WHERE "type" = 'table'`),
      Effect.map((result) => result.rows),
      Effect.flatMap(
        // The dropped table is completely removed from the database schema and
        // the disk file. The table can not be recovered.
        // All indices and triggers associated with the table are also deleted.
        // https://sqlite.org/lang_droptable.html
        Effect.forEach(
          ({ name }) => sqlite.exec(`DROP TABLE "${name as string}"`),
          { discard: true },
        ),
      ),
    );

    if (input.mnemonic) yield* _(lazyInit(input.mnemonic));

    const onMessage = yield* _(DbWorkerOnMessage);
    onMessage({ _tag: "onResetOrRestore" });
  });

export const DbWorkerLive = Layer.effect(
  DbWorker,
  Effect.gen(function* (_) {
    const syncWorker = yield* _(SyncWorker);

    const onError = (error: EvoluError): Effect.Effect<never, never, void> =>
      Effect.sync(() => {
        dbWorker.onMessage({ _tag: "onError", error });
      });

    syncWorker.onMessage = (output): void => {
      switch (output._tag) {
        case "UnexpectedError":
          onError(output).pipe(Effect.runSync);
          break;
        case "SyncWorkerOutputSyncResponse":
          postMessage(output);
          break;
        default:
          dbWorker.onMessage({ _tag: "onSyncState", state: output });
      }
    };

    const context = Context.empty().pipe(
      Context.add(Sqlite, yield* _(Sqlite)),
      Context.add(Bip39, yield* _(Bip39)),
      Context.add(NanoId, yield* _(NanoId)),
    );

    const run = (
      effect: Effect.Effect<Sqlite | Bip39 | NanoId, EvoluError, void>,
    ): Promise<void> =>
      effect.pipe(
        Effect.catchAllDefect(makeUnexpectedError),
        transaction,
        Effect.catchAll(onError),
        Effect.provide(context),
        Effect.runPromise,
      );

    type Write = (input: DbWorkerInput) => Promise<void>;

    // Write for reset only in case init fails.
    const writeForInitFail: Write = (input): Promise<void> => {
      if (input._tag !== "reset") return Promise.resolve(undefined);
      return reset(input).pipe(
        Effect.provideService(DbWorkerOnMessage, dbWorker.onMessage),
        Effect.provide(context),
        run,
      );
    };

    const makeWriteForInitSuccess = (owner: Owner, config: Config): Write => {
      let skipAllBecauseOfReset = false;

      const layer = Layer.mergeAll(
        ConfigLive(config),
        Layer.succeed(DbWorkerOnMessage, dbWorker.onMessage),
        Layer.succeed(Owner, owner),
        Layer.succeed(SyncWorkerPostMessage, syncWorker.postMessage),
        RowsStoreLive,
        TimeLive,
      );

      const mapInputToEffect = (
        input: DbWorkerInput,
      ): Effect.Effect<
        | Sqlite
        | RowsStore
        | DbWorkerOnMessage
        | Owner
        | Time
        | Config
        | SyncWorkerPostMessage
        | Bip39
        | NanoId,
        | UnexpectedError
        | TimestampDriftError
        | TimestampCounterOverflowError
        | TimestampError,
        void
      > => {
        switch (input._tag) {
          case "init":
            return makeUnexpectedError(new Error("init must be called once"));
          case "query":
            return query(input);
          case "mutate":
            return mutate(input);
          case "sync":
            return sync(input);
          case "reset":
            skipAllBecauseOfReset = true;
            return reset(input);
          case "ensureSchema":
            return ensureSchema(input.tables);
          case "SyncWorkerOutputSyncResponse":
            return handleSyncResponse(input);
        }
      };

      return (input) => {
        if (skipAllBecauseOfReset) return Promise.resolve(undefined);
        return mapInputToEffect(input).pipe(Effect.provide(layer), run);
      };
    };

    let write: Write = (input) => {
      if (input._tag !== "init")
        return run(makeUnexpectedError(new Error("init must be called first")));
      write = writeForInitFail;
      return init(input).pipe(
        Effect.map((owner) => {
          dbWorker.onMessage({ _tag: "onOwner", owner });
          write = makeWriteForInitSuccess(owner, input.config);
        }),
        run,
      );
    };

    let messageQueue: Promise<void> = Promise.resolve(undefined);

    const postMessage: DbWorker["postMessage"] = (input) => {
      messageQueue = messageQueue.then(() => write(input));
    };

    const dbWorker: DbWorker = {
      postMessage,
      onMessage: Function.constVoid,
    };

    return dbWorker;
  }),
);
