import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as ReadonlyArray from "effect/ReadonlyArray";
import * as ReadonlyRecord from "effect/ReadonlyRecord";
import { Config, ConfigLive } from "./Config.js";
import {
  MerkleTree,
  Millis,
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
import { Bip39, Mnemonic, NanoIdGenerator } from "./Crypto.js";
import {
  Queries,
  Query,
  RowsStore,
  RowsStoreLive,
  Table,
  Tables,
  deserializeQuery,
  ensureSchema,
  lazyInit,
  someDefectToNoSuchTableOrColumnError,
  transaction,
} from "./Db.js";
import { QueryPatches, makePatches } from "./Diff.js";
import { EvoluError, makeUnexpectedError } from "./ErrorStore.js";
import { Id, cast } from "./Model.js";
import { OnCompleteId } from "./OnCompletes.js";
import { Owner, OwnerId } from "./Owner.js";
import { DbWorkerLock } from "./Platform.js";
import * as Sql from "./Sql.js";
import { Sqlite, Value } from "./Sqlite.js";
import {
  Message,
  NewMessage,
  NewMessageEquivalence,
  SyncState,
  SyncWorker,
  SyncWorkerOutputSyncResponse,
  SyncWorkerPostMessage,
} from "./SyncWorker.js";
import { Messaging } from "./Types.js";

export interface DbWorker extends Messaging<DbWorkerInput, DbWorkerOutput> {}
export const DbWorker = Context.GenericTag<DbWorker>("@services/DbWorker");

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
}

interface DbWorkerInputQuery {
  readonly _tag: "query";
  readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Query>;
}

interface DbWorkerInputMutate {
  readonly _tag: "mutate";
  readonly mutations: ReadonlyArray.NonEmptyReadonlyArray<Mutation>;
  readonly queries: Queries;
}

interface DbWorkerInputSync {
  readonly _tag: "sync";
  readonly queries: Queries;
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

const DbWorkerOnMessage = Context.GenericTag<DbWorkerOnMessage>(
  "@services/DbWorkerOnMessage",
);

export type DbWorkerOutput =
  | DbWorkerOutputOnError
  | DbWorkerOutputOnOwner
  | DbWorkerOutputOnQuery
  | DbWorkerOutputOnReceive
  | DbWorkerOutputOnResetOrRestore
  | DbWorkerOutputOnSyncState;

export interface DbWorkerOutputOnError {
  readonly _tag: "onError";
  readonly error: EvoluError;
}

export interface DbWorkerOutputOnOwner {
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

export interface Mutation {
  readonly table: string;
  readonly id: Id;
  readonly values: ReadonlyRecord.ReadonlyRecord<
    string,
    Value | Date | boolean | undefined
  >;
  readonly isInsert: boolean;
  readonly onCompleteId: OnCompleteId | null;
}

const init = Effect.gen(function* (_) {
  const sqlite = yield* _(Sqlite);

  return yield* _(
    sqlite.exec(Sql.selectOwner),
    Effect.map(
      ({ rows: [row] }): Owner => ({
        id: row.id as OwnerId,
        mnemonic: row.mnemonic as Mnemonic,
        encryptionKey: row.encryptionKey as Uint8Array,
      }),
    ),
    someDefectToNoSuchTableOrColumnError,
    Effect.catchTag("NoSuchTableOrColumnError", () => lazyInit()),
  );
});

const query = ({
  queries,
  onCompleteIds = [],
}: {
  readonly queries: Queries;
  readonly onCompleteIds?: ReadonlyArray<OnCompleteId>;
}): Effect.Effect<void, never, Sqlite | RowsStore | DbWorkerOnMessage> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);
    const rowsStore = yield* _(RowsStore);
    const dbWorkerOnMessage = yield* _(DbWorkerOnMessage);

    const queriesRows = yield* _(
      ReadonlyArray.dedupe(queries),
      Effect.forEach((query) =>
        sqlite
          .exec(deserializeQuery(query))
          .pipe(Effect.map((result) => [query, result.rows] as const)),
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
  Effect.map(
    ({ rows: [{ timestamp, merkleTree }] }): TimestampAndMerkleTree => ({
      timestamp: unsafeTimestampFromString(timestamp as TimestampString),
      merkleTree: merkleTree as MerkleTree,
    }),
  ),
);

export const mutationsToNewMessages = (
  mutations: ReadonlyArray<Mutation>,
): ReadonlyArray<NewMessage> =>
  pipe(
    mutations,
    ReadonlyArray.map(({ id, isInsert, table, values }) =>
      pipe(
        Object.entries(values),
        // Filter values.
        ReadonlyArray.filterMap(([key, value]) =>
          // The value can be undefined if exactOptionalPropertyTypes isn't true.
          // Don't insert nulls because null is the default value.
          value === undefined || (isInsert && value == null)
            ? Option.none()
            : Option.some([key, value] as const),
        ),
        // Cast values.
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
    (a) => a.flat(),
    ReadonlyArray.dedupeWith(NewMessageEquivalence),
  );

const ensureSchemaByNewMessages = (
  messages: ReadonlyArray<NewMessage>,
): Effect.Effect<void, never, Sqlite> =>
  Effect.gen(function* (_) {
    const tablesMap = new Map<string, Table>();
    messages.forEach((message) => {
      const table = tablesMap.get(message.table);
      if (table == null) {
        tablesMap.set(message.table, {
          name: message.table,
          columns: [message.column, "createdAt", "updatedAt"],
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
  millis: Millis,
): Effect.Effect<void, never, Sqlite> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);
    const createdAtOrUpdatedAt = cast(new Date(millis));
    const insert = sqlite.exec({
      sql: `
insert into
  "${message.table}" ("id", "${message.column}", "createdAt", "updatedAt")
values
  (?, ?, ?, ?)
on conflict do update set
  "${message.column}" = ?,
  "updatedAt" = ?
`.trim(),
      parameters: [
        message.row,
        message.value,
        createdAtOrUpdatedAt,
        createdAtOrUpdatedAt,
        message.value,
        createdAtOrUpdatedAt,
      ],
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
}): Effect.Effect<MerkleTree, never, Sqlite> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);

    for (const message of messages) {
      const timestamp: TimestampString | null = yield* _(
        sqlite.exec({
          ...Sql.selectLastTimestampForTableRowColumn,
          parameters: [message.table, message.row, message.column, 1],
        }),
        Effect.map((result) => result.rows),
        Effect.flatMap(ReadonlyArray.head),
        Effect.map((row) => row.timestamp as TimestampString),
        Effect.catchTag("NoSuchElementException", () => Effect.succeed(null)),
      );

      if (timestamp == null || timestamp < message.timestamp) {
        const { millis } = unsafeTimestampFromString(message.timestamp);
        yield* _(upsertValueIntoTableRowColumn(message, messages, millis));
      }

      if (timestamp == null || timestamp !== message.timestamp) {
        const { changes } = yield* _(
          sqlite.exec({
            ...Sql.insertIntoMessagesIfNew,
            parameters: [
              message.timestamp,
              message.table,
              message.row,
              message.column,
              message.value,
            ],
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
}: TimestampAndMerkleTree): Effect.Effect<void, never, Sqlite> =>
  Effect.flatMap(Sqlite, (sqlite) =>
    sqlite.exec({
      ...Sql.updateOwnerTimestampAndMerkleTree,
      parameters: [
        merkleTreeToString(merkleTree),
        timestampToString(timestamp),
      ],
    }),
  );

const mutate = ({
  mutations,
  queries,
}: DbWorkerInputMutate): Effect.Effect<
  void,
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampTimeOutOfRangeError,
  | Sqlite
  | Owner
  | Time
  | Config
  | RowsStore
  | DbWorkerOnMessage
  | SyncWorkerPostMessage
> =>
  Effect.gen(function* (_) {
    const [toSync, localOnly] = ReadonlyArray.partition(mutations, (item) =>
      item.table.startsWith("_"),
    );
    const [toUpsert, toDelete] = ReadonlyArray.partition(localOnly, (item) =>
      mutationsToNewMessages([item]).some(
        (message) => message.column === "isDeleted" && message.value === 1,
      ),
    ).map(mutationsToNewMessages);

    const time = yield* _(Time);
    for (const messageToUpsert of toUpsert) {
      const now = yield* _(time.now);
      yield* _(upsertValueIntoTableRowColumn(messageToUpsert, toUpsert, now));
    }

    const { exec } = yield* _(Sqlite);
    yield* _(
      Effect.forEach(toDelete, ({ table, row }) =>
        exec({
          sql: `
            delete from "${table}"
            where
              "id" = ?;
            `.trim(),
          parameters: [row],
        }),
      ),
    );

    if (toSync.length > 0) {
      let { timestamp, merkleTree } = yield* _(readTimestampAndMerkleTree);

      const messages = yield* _(
        mutationsToNewMessages(toSync),
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

    const onCompleteIds = ReadonlyArray.filterMap(mutations, (item) =>
      Option.fromNullable(item.onCompleteId),
    );
    if (queries.length > 0 || onCompleteIds.length > 0)
      yield* _(query({ queries, onCompleteIds }));
  });

const handleSyncResponse = ({
  messages,
  ...response
}: SyncWorkerOutputSyncResponse): Effect.Effect<
  void,
  TimestampError,
  Sqlite | Time | Config | DbWorkerOnMessage | SyncWorkerPostMessage | Owner
> =>
  Effect.gen(function* (_) {
    let { timestamp, merkleTree } = yield* _(readTimestampAndMerkleTree);

    const dbWorkerOnMessage = yield* _(DbWorkerOnMessage);
    if (messages.length > 0) {
      for (const message of messages)
        timestamp = yield* _(
          unsafeTimestampFromString(message.timestamp),
          (remote) => receiveTimestamp({ local: timestamp, remote }),
        );
      merkleTree = yield* _(applyMessages({ merkleTree, messages }));
      yield* _(writeTimestampAndMerkleTree({ timestamp, merkleTree }));
      dbWorkerOnMessage({ _tag: "onReceive" });
    }

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
    const config = yield* _(Config);
    const owner = yield* _(Owner);

    const messagesToSync = yield* _(
      sqlite.exec({
        ...Sql.selectMessagesToSync,
        parameters: [timestampToString(makeSyncTimestamp(diff.value))],
      }),
      Effect.map(({ rows }) => rows as unknown as ReadonlyArray<Message>),
    );

    if (response.syncLoopCount > 100) {
      // TODO: dbWorkerOnMessage({ _tag: "onError" });
      // eslint-disable-next-line no-console
      console.error("Evolu: syncLoopCount > 100");
      return;
    }

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
  void,
  never,
  | Sqlite
  | Config
  | DbWorkerOnMessage
  | SyncWorkerPostMessage
  | Owner
  | RowsStore
> =>
  Effect.gen(function* (_) {
    if (queries.length > 0) yield* _(query({ queries }));
    const syncWorkerPostMessage = yield* _(SyncWorkerPostMessage);
    syncWorkerPostMessage({
      _tag: "sync",
      ...(yield* _(readTimestampAndMerkleTree)),
      syncUrl: (yield* _(Config)).syncUrl,
      owner: yield* _(Owner),
      messages: [],
      syncLoopCount: 0,
    });
  });

const reset = (
  input: DbWorkerInputReset,
): Effect.Effect<
  void,
  never,
  Sqlite | Bip39 | NanoIdGenerator | DbWorkerOnMessage
> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);

    yield* _(
      sqlite.exec({
        sql: `SELECT "name" FROM "sqlite_master" WHERE "type" = 'table'`,
      }),
      Effect.map((result) => result.rows),
      Effect.flatMap(
        // The dropped table is completely removed from the database schema and
        // the disk file. The table can not be recovered.
        // All indices and triggers associated with the table are also deleted.
        // https://sqlite.org/lang_droptable.html
        Effect.forEach(
          ({ name }) => sqlite.exec({ sql: `DROP TABLE "${name as string}"` }),
          { discard: true },
        ),
      ),
    );

    if (input.mnemonic) yield* _(lazyInit(input.mnemonic));

    const onMessage = yield* _(DbWorkerOnMessage);
    onMessage({ _tag: "onResetOrRestore" });
  });

export const DbWorkerCommonLive = Layer.effect(
  DbWorker,
  Effect.gen(function* (_) {
    const syncWorker = yield* _(SyncWorker);

    const onError = (error: EvoluError): Effect.Effect<void> =>
      Effect.sync(() => {
        dbWorker.onMessage({ _tag: "onError", error });
      });

    syncWorker.onMessage = (output): void => {
      switch (output._tag) {
        case "UnexpectedError":
          onError(output).pipe(Effect.runSync);
          break;
        case "SyncWorkerOutputSyncResponse":
          dbWorker.postMessage(output);
          break;
        default:
          dbWorker.onMessage({ _tag: "onSyncState", state: output });
      }
    };

    const runContext = Context.empty().pipe(
      Context.add(Sqlite, yield* _(Sqlite)),
      Context.add(Bip39, yield* _(Bip39)),
      Context.add(NanoIdGenerator, yield* _(NanoIdGenerator)),
      Context.add(DbWorkerOnMessage, (output) => {
        dbWorker.onMessage(output);
      }),
    );

    const run = (
      effect: Effect.Effect<
        void,
        EvoluError,
        Sqlite | Bip39 | NanoIdGenerator | DbWorkerOnMessage
      >,
    ): Promise<void> =>
      effect.pipe(
        Effect.catchAllDefect(makeUnexpectedError),
        transaction,
        Effect.catchAll(onError),
        Effect.provide(runContext),
        Effect.runPromise,
      );

    type HandleInput = (input: DbWorkerInput) => Promise<void>;

    /** If init fails, we have to allow reset at least. */
    const handleInputForInitFail: HandleInput = (input): Promise<void> => {
      if (input._tag !== "reset") return Promise.resolve(undefined);
      return reset(input).pipe(run);
    };

    const makeHandleInputForInitSuccess = (
      config: Config,
      owner: Owner,
    ): HandleInput => {
      let skipAllBecauseOfReset = false;

      const layer = Layer.mergeAll(
        ConfigLive(config),
        Layer.succeed(Owner, owner),
        Layer.succeed(SyncWorkerPostMessage, syncWorker.postMessage),
        RowsStoreLive,
        TimeLive,
      ).pipe(Layer.memoize, Effect.scoped, Effect.runSync);

      return (input) => {
        if (skipAllBecauseOfReset) return Promise.resolve(undefined);
        return Match.value(input).pipe(
          Match.tagsExhaustive({
            init: () =>
              makeUnexpectedError(new Error("init must be called once")),
            query,
            mutate,
            sync,
            reset: (input) => {
              skipAllBecauseOfReset = true;
              return reset(input);
            },
            ensureSchema: ({ tables }) => ensureSchema(tables),
            SyncWorkerOutputSyncResponse: handleSyncResponse,
          }),
          Effect.provide(layer),
          run,
        );
      };
    };

    let handleInput: HandleInput = (input) => {
      if (input._tag !== "init")
        return run(makeUnexpectedError(new Error("init must be called first")));
      handleInput = handleInputForInitFail;
      return init.pipe(
        Effect.map((owner) => {
          dbWorker.onMessage({ _tag: "onOwner", owner });
          handleInput = makeHandleInputForInitSuccess(input.config, owner);
        }),
        run,
      );
    };

    const dbWorkerLock = yield* _(DbWorkerLock);

    const dbWorker: DbWorker = {
      postMessage: (input) => {
        dbWorkerLock(() => handleInput(input));
      },
      onMessage: Function.constVoid,
    };

    return dbWorker;
  }),
);
