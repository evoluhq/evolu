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
import { Mnemonic } from "./Crypto.js";
import { DbInit, Owner, Table, transaction } from "./Db.js";
import { QueryPatches, makePatches } from "./Diff.js";
import { EvoluError, makeUnexpectedError } from "./Errors.js";
import {
  MerkleTree,
  MerkleTreeString,
  insertIntoMerkleTree,
  merkleTreeToString,
  unsafeMerkleTreeFromString,
} from "./MerkleTree.js";
import { Message, NewMessage } from "./Message.js";
import { CastableForMutate, Id, SqliteDate, cast } from "./Model.js";
import { OnCompleteId } from "./OnCompletes.js";
import { RowsCacheRef, RowsCacheRefLive } from "./RowsCache.js";
import {
  insertValueIntoTableRowColumn,
  selectLastTimestampForTableRowColumn,
  selectOwnerTimestampAndMerkleTree,
  tryInsertIntoMessages,
  updateOwnerTimestampAndMerkleTree,
} from "./Sql.js";
import { Query, Sqlite, Value, queryObjectFromQuery } from "./Sqlite.js";
import {
  SyncState,
  SyncWorker,
  SyncWorkerInputReceiveMessages,
  SyncWorkerPostMessage,
} from "./SyncWorker.js";
import {
  Time,
  TimeLive,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampString,
  sendTimestamp,
  timestampToString,
  unsafeTimestampFromString,
} from "./Timestamp.js";

export interface DbWorker {
  readonly postMessage: (input: DbWorkerInput) => void;
  readonly onMessage: (callback: DbWorkerOnMessageCallback) => void;
}

export const DbWorker = Context.Tag<DbWorker>("evolu/DbWorker");

export type DbWorkerInput =
  | DbWorkerInputInit
  | DbWorkerInputQuery
  | DbWorkerInputMutate
  | DbWorkerInputSync
  | DbWorkerInputReset
  | SyncWorkerInputReceiveMessages;

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
  readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Query> | null;
}

interface DbWorkerInputReset {
  readonly _tag: "reset";
  readonly mnemonic?: Mnemonic;
}

type DbWorkerOnMessageCallback = (output: DbWorkerOutput) => void;

const DbWorkerOnMessageCallback = Context.Tag<DbWorkerOnMessageCallback>(
  "evolu/DbWorkerOnMessageCallback"
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

const query = ({
  queries,
  onCompleteIds = ReadonlyArray.empty(),
}: {
  readonly queries: ReadonlyArray<Query>;
  readonly onCompleteIds?: ReadonlyArray<OnCompleteId>;
}): Effect.Effect<
  Sqlite | RowsCacheRef | DbWorkerOnMessageCallback,
  never,
  void
> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);
    const queriesRows = yield* _(
      Effect.forEach(queries, (query) =>
        sqlite
          .exec(queryObjectFromQuery(query))
          .pipe(Effect.map((rows) => [query, rows] as const))
      )
    );
    const rowsCache = yield* _(RowsCacheRef);
    const previous = yield* _(Ref.get(rowsCache));
    yield* _(Ref.set(rowsCache, new Map([...previous, ...queriesRows])));
    const queriesPatches = queriesRows.map(
      ([query, rows]): QueryPatches => ({
        query,
        patches: makePatches(previous.get(query), rows),
      })
    );
    const onMessageCallback = yield* _(DbWorkerOnMessageCallback);
    onMessageCallback({ _tag: "onQuery", queriesPatches, onCompleteIds });
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
    })
  )
);

const mutateItemsToNewMessages = (
  items: ReadonlyArray.NonEmptyReadonlyArray<MutateItem>,
  owner: Owner
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
            : Option.some([key, value] as const)
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
            ] as const
        ),
        ReadonlyArray.appendAllNonEmpty(
          isInsert
            ? ReadonlyArray.make(["createdAt", now], ["createdBy", owner.id])
            : ReadonlyArray.make(["updatedAt", now])
        ),
        ReadonlyArray.mapNonEmpty(
          ([key, value]): NewMessage => ({
            table,
            row: id,
            column: key,
            value,
          })
        )
      )
    ),
    ReadonlyArray.flattenNonEmpty
  );

const applyMessages = ({
  merkleTree,
  messages,
}: {
  merkleTree: MerkleTree;
  messages: ReadonlyArray<Message>;
}): Effect.Effect<Sqlite, never, MerkleTree> =>
  Effect.gen(function* ($) {
    const sqlite = yield* $(Sqlite);

    for (const message of messages) {
      const timestamp: TimestampString | null = yield* $(
        sqlite.exec({
          sql: selectLastTimestampForTableRowColumn,
          parameters: [message.table, message.row, message.column],
        }),
        Effect.flatMap(ReadonlyArray.head),
        Effect.map((row) => row.timestamp as TimestampString),
        Effect.catchTag("NoSuchElementException", () => Effect.succeed(null))
      );

      if (timestamp == null || timestamp < message.timestamp)
        yield* $(
          sqlite.exec({
            sql: insertValueIntoTableRowColumn(message.table, message.column),
            parameters: [message.row, message.value, message.value],
          })
        );

      if (timestamp == null || timestamp !== message.timestamp) {
        yield* $(
          sqlite.exec({
            sql: tryInsertIntoMessages,
            parameters: [
              message.timestamp,
              message.table,
              message.row,
              message.column,
              message.value,
            ],
          })
        );

        const changes = yield* $(sqlite.changes);

        if (changes > 0)
          merkleTree = insertIntoMerkleTree(
            unsafeTimestampFromString(message.timestamp)
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
    })
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
  | DbWorkerOnMessageCallback
  | SyncWorkerPostMessage,
  TimestampDriftError | TimestampCounterOverflowError,
  void
> =>
  Effect.gen(function* (_) {
    const owner = yield* _(Owner);
    let { timestamp, merkleTree } = yield* _(readTimestampAndMerkleTree);

    const messages = yield* _(
      mutateItemsToNewMessages(items, owner),
      Effect.forEach((newMessage) =>
        Effect.map(sendTimestamp(timestamp), (nextTimestamp): Message => {
          timestamp = nextTimestamp;
          return { ...newMessage, timestamp: timestampToString(timestamp) };
        })
      )
    );

    merkleTree = yield* _(applyMessages({ merkleTree, messages }));

    yield* _(writeTimestampAndMerkleTree({ timestamp, merkleTree }));

    const onCompleteIds = ReadonlyArray.filterMap(items, (item) =>
      Option.fromNullable(item.onCompleteId)
    );

    if (queries.length > 0 || onCompleteIds.length > 0)
      yield* _(query({ queries, onCompleteIds }));

    const [config, syncWorkerPostMessage] = yield* _(
      Effect.all([Config, SyncWorkerPostMessage])
    );

    syncWorkerPostMessage({
      _tag: "sync",
      syncUrl: config.syncUrl,
      messages,
      timestamp,
      merkleTree,
      owner,
      syncCount: 0,
    });
  });

export const DbWorkerLive = Layer.effect(
  DbWorker,
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);
    const dbInit = yield* _(DbInit);
    const syncWorker = yield* _(SyncWorker);

    let dbWorkerOnMessageCallback: DbWorkerOnMessageCallback =
      Function.constVoid;

    const handleError = (error: EvoluError): void => {
      dbWorkerOnMessageCallback({ _tag: "onError", error });
    };

    syncWorker.onMessage((_output) => {
      //
    });

    const run = (
      effect: Effect.Effect<Sqlite, EvoluError, void>
    ): Promise<void> =>
      effect.pipe(
        transaction,
        Effect.provideService(Sqlite, sqlite),
        Effect.catchAllCause((cause) =>
          Cause.failureOrCause(cause).pipe(
            Either.match({
              onLeft: handleError,
              onRight: (cause) =>
                handleError(makeUnexpectedError(Cause.squash(cause))),
            }),
            () => Effect.succeed(undefined)
          )
        ),
        Effect.runPromise
      );

    type Write = (input: DbWorkerInput) => Promise<void>;

    const makeWriteAfterInit = (owner: Owner, config: Config): Write => {
      const writeLayer = Layer.mergeAll(
        Layer.succeed(Sqlite, sqlite),
        TimeLive,
        RowsCacheRefLive,
        Layer.succeed(DbWorkerOnMessageCallback, dbWorkerOnMessageCallback),
        Layer.succeed(Owner, owner),
        Layer.succeed(SyncWorkerPostMessage, syncWorker.postMessage),
        ConfigLive(config)
      );

      const write: Write = (input) =>
        Match.value(input).pipe(
          Match.tagsExhaustive({
            init: () => {
              throw new self.Error("Init must be called once.");
            },
            query,
            mutate,
            receiveMessages: () => Effect.succeed(undefined),
            reset: () => Effect.succeed(undefined),
            sync: () => Effect.succeed(undefined),
          }),
          Effect.provideLayer(writeLayer),
          run
        );

      return write;
    };

    let write: Write = (input) => {
      if (input._tag !== "init")
        throw new self.Error("Init must be called first.");

      return dbInit(input).pipe(
        Effect.map((owner) => {
          dbWorkerOnMessageCallback({ _tag: "onOwner", owner });
          write = makeWriteAfterInit(owner, input.config);
        }),
        run
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

    const onMessage: DbWorker["onMessage"] = (callback) => {
      dbWorkerOnMessageCallback = callback;
    };

    return { postMessage, onMessage };
  })
);
