import {
  Cause,
  Context,
  Effect,
  Either,
  Function,
  Layer,
  Match,
  Option,
  ReadonlyArray,
  ReadonlyRecord,
  Ref,
  pipe,
} from "effect";
import { Config, ConfigLive } from "./Config.js";
import { Bip39, Mnemonic, NanoId, Slip21 } from "./Crypto.js";
import {
  Owner,
  Table,
  ensureSchema,
  lazyInit,
  someDefectToNoSuchTableOrColumnError,
  transaction,
} from "./Db.js";
import { QueryPatches, makePatches } from "./Diff.js";
import { EvoluError, makeUnexpectedError } from "./Errors.js";
import {
  MerkleTree,
  MerkleTreeString,
  diffMerkleTrees,
  insertIntoMerkleTree,
  merkleTreeToString,
  unsafeMerkleTreeFromString,
} from "./MerkleTree.js";
import { CastableForMutate, Id, SqliteDate, cast } from "./Model.js";
import { OnCompleteId } from "./OnCompletes.js";
import { RowsCacheRef, RowsCacheRefLive } from "./RowsCache.js";
import {
  insertIntoMessagesIfNew,
  insertValueIntoTableRowColumn,
  selectLastTimestampForTableRowColumn,
  selectMessagesToSync,
  selectOwner,
  selectOwnerTimestampAndMerkleTree,
  updateOwnerTimestampAndMerkleTree,
} from "./Sql.js";
import { Query, Sqlite, Value, queryObjectFromQuery } from "./Sqlite.js";
import {
  Message,
  NewMessage,
  SyncState,
  SyncWorker,
  SyncWorkerOutputSyncResponse,
  SyncWorkerPostMessage,
} from "./SyncWorker.js";
import {
  Time,
  TimeLive,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampError,
  TimestampString,
  makeSyncTimestamp,
  receiveTimestamp,
  sendTimestamp,
  timestampToString,
  unsafeTimestampFromString,
} from "./Timestamp.js";

export interface DbWorker {
  readonly postMessage: (input: DbWorkerInput) => void;
  onMessage: (output: DbWorkerOutput) => void;
}

export const DbWorker = Context.Tag<DbWorker>("evolu/DbWorker");

export type DbWorkerInput =
  | DbWorkerInputInit
  | DbWorkerInputQuery
  | DbWorkerInputMutate
  | DbWorkerInputSync
  | DbWorkerInputReset
  | SyncWorkerOutputSyncResponse;

interface DbWorkerInputInit {
  readonly _tag: "init";
  readonly config: Config;
  readonly tables: ReadonlyArray<Table>;
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

type DbWorkerOnMessage = DbWorker["onMessage"];

const DbWorkerOnMessage = Context.Tag<DbWorkerOnMessage>(
  "evolu/DbWorkerOnMessage",
);

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
  readonly values: ReadonlyRecord.ReadonlyRecord<CastableForMutate<Value>>;
  readonly isInsert: boolean;
  readonly now: SqliteDate;
  readonly onCompleteId: OnCompleteId | null;
}

const init = (
  input: DbWorkerInputInit,
): Effect.Effect<Sqlite | Bip39 | Slip21 | NanoId, never, Owner> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);

    return yield* _(
      sqlite.exec(selectOwner),
      Effect.map(([owner]) => owner as unknown as Owner),
      someDefectToNoSuchTableOrColumnError,
      Effect.catchTag("NoSuchTableOrColumnError", () => lazyInit()),
      Effect.tap(() => ensureSchema(input.tables)),
    );
  });

const query = ({
  queries,
  onCompleteIds = ReadonlyArray.empty(),
}: {
  readonly queries: ReadonlyArray<Query>;
  readonly onCompleteIds?: ReadonlyArray<OnCompleteId>;
}): Effect.Effect<Sqlite | RowsCacheRef | DbWorkerOnMessage, never, void> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);
    const queriesRows = yield* _(
      Effect.forEach(queries, (query) =>
        sqlite
          .exec(queryObjectFromQuery(query))
          .pipe(Effect.map((rows) => [query, rows] as const)),
      ),
    );
    const rowsCache = yield* _(RowsCacheRef);
    const previous = yield* _(Ref.get(rowsCache));
    yield* _(Ref.set(rowsCache, new Map([...previous, ...queriesRows])));
    const queriesPatches = queriesRows.map(
      ([query, rows]): QueryPatches => ({
        query,
        patches: makePatches(previous.get(query), rows),
      }),
    );
    const dbWorkerOnMessage = yield* _(DbWorkerOnMessage);
    dbWorkerOnMessage({ _tag: "onQuery", queriesPatches, onCompleteIds });
  });

interface TimestampAndMerkleTree {
  readonly timestamp: Timestamp;
  readonly merkleTree: MerkleTree;
}

const readTimestampAndMerkleTree = Sqlite.pipe(
  Effect.flatMap((sqlite) => sqlite.exec(selectOwnerTimestampAndMerkleTree)),
  Effect.map(
    ([{ timestamp, merkleTree }]): TimestampAndMerkleTree => ({
      timestamp: unsafeTimestampFromString(timestamp as TimestampString),
      merkleTree: unsafeMerkleTreeFromString(merkleTree as MerkleTreeString),
    }),
  ),
);

const mutateItemsToNewMessages = (
  items: ReadonlyArray.NonEmptyReadonlyArray<MutateItem>,
): ReadonlyArray.NonEmptyReadonlyArray<NewMessage> =>
  pipe(
    items,
    ReadonlyArray.mapNonEmpty(({ id, isInsert, now, table, values }) =>
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
        ReadonlyArray.mapNonEmpty(
          ([key, value]): NewMessage => ({
            table,
            row: id,
            column: key,
            value,
          }),
        ),
      ),
    ),
    ReadonlyArray.flattenNonEmpty,
  );

const ensureSchemaByMessages = (
  messages: ReadonlyArray.NonEmptyReadonlyArray<Message>,
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

const applyMessages = ({
  merkleTree,
  messages,
}: {
  merkleTree: MerkleTree;
  messages: ReadonlyArray.NonEmptyReadonlyArray<Message>;
}): Effect.Effect<Sqlite, never, MerkleTree> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);

    for (const message of messages) {
      const timestamp: TimestampString | null = yield* _(
        sqlite.exec({
          sql: selectLastTimestampForTableRowColumn,
          parameters: [message.table, message.row, message.column],
        }),
        Effect.flatMap(ReadonlyArray.head),
        Effect.map((row) => row.timestamp as TimestampString),
        Effect.catchTag("NoSuchElementException", () => Effect.succeed(null)),
      );

      if (timestamp == null || timestamp < message.timestamp) {
        const insert = sqlite.exec({
          sql: insertValueIntoTableRowColumn(message.table, message.column),
          parameters: [message.row, message.value, message.value],
        });
        yield* _(
          insert,
          someDefectToNoSuchTableOrColumnError,
          Effect.catchTag("NoSuchTableOrColumnError", () =>
            ensureSchemaByMessages(messages).pipe(Effect.flatMap(() => insert)),
          ),
        );
      }

      if (timestamp == null || timestamp !== message.timestamp) {
        yield* _(
          sqlite.exec({
            sql: insertIntoMessagesIfNew,
            parameters: [
              message.timestamp,
              message.table,
              message.row,
              message.column,
              message.value,
            ],
          }),
        );

        const changes = yield* _(sqlite.changes);

        if (changes > 0)
          merkleTree = insertIntoMerkleTree(
            unsafeTimestampFromString(message.timestamp),
          )(merkleTree);
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
      sql: updateOwnerTimestampAndMerkleTree,
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
  | RowsCacheRef
  | DbWorkerOnMessage
  | SyncWorkerPostMessage,
  TimestampDriftError | TimestampCounterOverflowError,
  void
> =>
  Effect.gen(function* (_) {
    const owner = yield* _(Owner);
    let { timestamp, merkleTree } = yield* _(readTimestampAndMerkleTree);

    const messages = yield* _(
      mutateItemsToNewMessages(items),
      Effect.forEach((newMessage) =>
        Effect.map(sendTimestamp(timestamp), (nextTimestamp): Message => {
          timestamp = nextTimestamp;
          return { ...newMessage, timestamp: timestampToString(timestamp) };
        }),
      ),
    );

    if (ReadonlyArray.isNonEmptyReadonlyArray(messages)) {
      merkleTree = yield* _(applyMessages({ merkleTree, messages }));
      yield* _(writeTimestampAndMerkleTree({ timestamp, merkleTree }));
    }

    const onCompleteIds = ReadonlyArray.filterMap(items, (item) =>
      Option.fromNullable(item.onCompleteId),
    );

    if (queries.length > 0 || onCompleteIds.length > 0)
      yield* _(query({ queries, onCompleteIds }));

    const [config, syncWorkerPostMessage] = yield* _(
      Effect.all([Config, SyncWorkerPostMessage]),
    );

    syncWorkerPostMessage({
      _tag: "sync",
      syncUrl: config.syncUrl,
      messages,
      timestamp,
      merkleTree,
      owner,
      syncLoopCount: 0,
    });
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

    if (ReadonlyArray.isNonEmptyReadonlyArray(messages)) {
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

    const sqlite = yield* _(Sqlite);
    const messagesToSync = yield* _(
      sqlite.exec({
        sql: selectMessagesToSync,
        parameters: [timestampToString(makeSyncTimestamp(diff.value))],
      }),
      Effect.map((a) => a as unknown as ReadonlyArray<Message>),
    );

    const [config, owner] = yield* _(Effect.all([Config, Owner]));
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
  | RowsCacheRef,
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
      messages: ReadonlyArray.empty(),
      syncLoopCount: 0,
    });
  });

const reset = (
  input: DbWorkerInputReset,
): Effect.Effect<
  Sqlite | Bip39 | Slip21 | NanoId | DbWorkerOnMessage,
  never,
  void
> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);

    yield* _(
      sqlite.exec(`SELECT "name" FROM "sqlite_master" WHERE "type" = 'table'`),
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

    const handleError = (error: EvoluError): void => {
      dbWorker.onMessage({ _tag: "onError", error });
    };

    syncWorker.onMessage = (output): void => {
      switch (output._tag) {
        case "UnexpectedError":
          handleError(output);
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
      Context.add(Slip21, yield* _(Slip21)),
      Context.add(NanoId, yield* _(NanoId)),
    );

    const run = (
      effect: Effect.Effect<Sqlite | Bip39 | Slip21 | NanoId, EvoluError, void>,
    ): Promise<void> =>
      effect.pipe(
        transaction,
        Effect.provideContext(context),
        Effect.catchAllCause((cause) =>
          Cause.failureOrCause(cause).pipe(
            Either.match({
              onLeft: handleError,
              onRight: (cause) =>
                handleError(makeUnexpectedError(Cause.squash(cause))),
            }),
            () => Effect.succeed(undefined),
          ),
        ),
        Effect.runPromise,
      );

    type Write = (input: DbWorkerInput) => Promise<void>;

    const makeWriteAfterInit = (owner: Owner, config: Config): Write => {
      let skipAllBecauseOfReset = false;

      const write: Write = (input) => {
        if (skipAllBecauseOfReset) return Promise.resolve(undefined);

        return Match.value(input).pipe(
          Match.tagsExhaustive({
            init: () => {
              throw new Error("init must be called once");
            },
            query,
            mutate,
            sync,
            reset: (input) => {
              skipAllBecauseOfReset = true;
              return reset(input);
            },
            SyncWorkerOutputSyncResponse: handleSyncResponse,
          }),
          Effect.provideSomeLayer(
            Layer.mergeAll(
              ConfigLive(config),
              Layer.succeed(DbWorkerOnMessage, dbWorker.onMessage),
              Layer.succeed(Owner, owner),
              Layer.succeed(SyncWorkerPostMessage, syncWorker.postMessage),
              RowsCacheRefLive,
              TimeLive,
            ),
          ),
          run,
        );
      };

      return write;
    };

    let write: Write = (input) => {
      if (input._tag !== "init") throw new Error("init must be called first");
      return init(input).pipe(
        Effect.map((owner) => {
          dbWorker.onMessage({ _tag: "onOwner", owner });
          write = makeWriteAfterInit(owner, input.config);
        }),
        run,
      );
    };

    const stream = new WritableStream<DbWorkerInput>({
      write: (input): Promise<void> => write(input),
    });

    const postMessage: DbWorker["postMessage"] = (input) => {
      const writer = stream.getWriter();
      void writer.write(input);
      writer.releaseLock();
    };

    const dbWorker: DbWorker = {
      postMessage,
      onMessage: Function.constVoid,
    };

    return dbWorker;
  }),
);
