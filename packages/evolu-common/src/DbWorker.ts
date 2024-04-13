import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as ReadonlyArray from "effect/ReadonlyArray";
import * as ReadonlyRecord from "effect/ReadonlyRecord";
import * as Scope from "effect/Scope";
import { Config } from "./Config.js";
import {
  MerkleTree,
  Millis,
  Time,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampString,
  TimestampTimeOutOfRangeError,
  insertIntoMerkleTree,
  merkleTreeToString,
  sendTimestamp,
  timestampToString,
  unsafeTimestampFromString,
} from "./Crdt.js";
import { Bip39, NanoIdGenerator } from "./Crypto.js";
import {
  Query,
  deserializeQuery,
  ensureSchema,
  getOrCreateOwner,
  makeRowsStore,
  maybeExplainQueryPlan,
  sqliteDefectToNoSuchTableOrColumnError,
} from "./Db.js";
import { QueryPatches, makePatches } from "./Diff.js";
import { Id, cast } from "./Model.js";
import { Owner } from "./Owner.js";
import {
  insertIntoMessagesIfNew,
  selectLastTimestampForTableRowColumn,
  selectOwnerTimestampAndMerkleTree,
  updateOwnerTimestampAndMerkleTree,
} from "./Sql.js";
import {
  Sqlite,
  SqliteFactory,
  SqliteSchema,
  SqliteTransactionMode,
  Table,
  Value,
} from "./Sqlite.js";
import { Message, NewMessage } from "./SyncWorker.js";

export interface DbWorker {
  readonly init: (
    sqliteSchema: SqliteSchema,
  ) => Effect.Effect<Owner, NotSupportedPlatformError, Config>;

  readonly loadQueries: (
    queries: ReadonlyArray<Query>,
  ) => Effect.Effect<ReadonlyArray<QueryPatches>>;

  readonly mutate: (params: {
    readonly mutations: ReadonlyArray<Mutation>;
    readonly queriesToRefresh: ReadonlyArray<Query>;
  }) => Effect.Effect<
    ReadonlyArray<QueryPatches>,
    | TimestampTimeOutOfRangeError
    | TimestampDriftError
    | TimestampCounterOverflowError,
    Config
  >;

  readonly ensureSchema: (schema: SqliteSchema) => Effect.Effect<void>;

  readonly dispose: () => Effect.Effect<void>;
}

export interface NotSupportedPlatformError {
  readonly _tag: "NotSupportedPlatformError";
}

export interface Mutation {
  readonly table: string;
  readonly id: Id;
  readonly values: ReadonlyRecord.ReadonlyRecord<
    string,
    Value | Date | boolean | undefined
  >;
  readonly isInsert: boolean;
}

export class DbWorkerFactory extends Context.Tag("DbWorkerFactory")<
  DbWorkerFactory,
  {
    readonly createDbWorker: Effect.Effect<DbWorker, never, Config>;
  }
>() {}

export const createDbWorker: Effect.Effect<
  DbWorker,
  never,
  SqliteFactory | Bip39 | NanoIdGenerator | Time
> = Effect.gen(function* (_) {
  const { createSqlite } = yield* _(SqliteFactory);

  const initContext = Context.empty().pipe(
    Context.add(Bip39, yield* _(Bip39)),
    Context.add(NanoIdGenerator, yield* _(NanoIdGenerator)),
    Context.add(Time, yield* _(Time)),
  );

  const afterInitContext = yield* _(
    Deferred.make<
      Context.Context<Bip39 | NanoIdGenerator | Time | Sqlite | Owner>
    >(),
  );

  const afterInit =
    (options: { readonly transaction: SqliteTransactionMode }) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Deferred.await(afterInitContext).pipe(
        Effect.flatMap((context) =>
          Sqlite.pipe(
            Effect.flatMap((sqlite) =>
              sqlite.transaction(options.transaction)(effect),
            ),
            Effect.provide(context),
          ),
        ),
      );

  const scope = yield* _(Scope.make());
  const rowsStore = yield* _(makeRowsStore);

  const loadQueries = (queries: ReadonlyArray<Query>) =>
    Sqlite.pipe(
      Effect.bind("queriesRows", (sqlite) =>
        Effect.forEach(ReadonlyArray.dedupe(queries), (query) => {
          const sqliteQuery = deserializeQuery(query);
          return sqlite.exec(sqliteQuery).pipe(
            Effect.tap(maybeExplainQueryPlan(sqliteQuery)),
            Effect.map(({ rows }) => [query, rows] as const),
          );
        }),
      ),
      Effect.let("previousState", () => rowsStore.getState()),
      Effect.tap(({ queriesRows, previousState }) =>
        rowsStore.setState(new Map([...previousState, ...queriesRows])),
      ),
      Effect.map(({ queriesRows, previousState }) =>
        queriesRows.map(
          ([query, rows]): QueryPatches => ({
            query,
            patches: makePatches(previousState.get(query), rows),
          }),
        ),
      ),
    );

  const dbWorker: DbWorker = {
    init: (schema) =>
      Effect.gen(function* (_) {
        yield* _(Effect.logTrace("DbWorker init"));
        const sqlite = yield* _(createSqlite, Scope.extend(scope));

        const contextWithSqlite = Context.add(initContext, Sqlite, sqlite);
        const owner = yield* _(
          getOrCreateOwner,
          Effect.tap(ensureSchema(schema)),
          sqlite.transaction("exclusive"),
          Effect.provide(contextWithSqlite),
        );
        Deferred.unsafeDone(
          afterInitContext,
          Effect.succeed(Context.add(contextWithSqlite, Owner, owner)),
        );
        return owner;
      }),

    loadQueries: (queries) =>
      Effect.logDebug(["DbWorker loadQueries", queries]).pipe(
        Effect.zipRight(loadQueries(queries)),
        afterInit({ transaction: "shared" }),
      ),

    mutate: ({ mutations, queriesToRefresh }) =>
      Effect.gen(function* (_) {
        yield* _(
          Effect.logDebug(["DbWorker mutate", { mutations, queriesToRefresh }]),
        );
        const time = yield* _(Time);
        const sqlite = yield* _(Sqlite);

        const [toSyncMutations, localOnlyMutations] = ReadonlyArray.partition(
          mutations,
          isLocalOnlyMutation,
        );

        for (const mutation of localOnlyMutations)
          if (isDeleteMutation(mutation)) {
            yield* _(
              sqlite.exec({
                sql: `delete from "${mutation.table}" where "id" = ?;`,
                parameters: [mutation.id],
              }),
            );
          } else {
            const messages = mutationToNewMessages(mutation);
            for (const message of messages) {
              const now = yield* _(time.now);
              yield* _(upsertValueIntoTableRowColumn(message, messages, now));
            }
          }

        if (toSyncMutations.length > 0) {
          const { timestamp, merkleTree } = yield* _(getTimestampAndMerkleTree);
          const [nextTimestamp, messages] = yield* _(
            toSyncMutations.flatMap(mutationToNewMessages),
            Effect.mapAccum(timestamp, (currentTimestamp, newMessage) =>
              Effect.map(sendTimestamp(currentTimestamp), (nextTimestamp) => {
                const message: Message = {
                  ...newMessage,
                  timestamp: timestampToString(nextTimestamp),
                };
                return [nextTimestamp, message];
              }),
            ),
          );
          const nextMerkleTree = yield* _(applyMessages(merkleTree, messages));
          yield* _(setTimestampAndMerkleTree(nextTimestamp, nextMerkleTree));
          // TODO: Sync
        }
        return yield* _(loadQueries(queriesToRefresh));
      }).pipe(afterInit({ transaction: "exclusive" })),

    ensureSchema: (schema) =>
      ensureSchema(schema).pipe(afterInit({ transaction: "exclusive" })),

    dispose: () =>
      Effect.logTrace("DbWorker dispose").pipe(
        Effect.zipRight(Scope.close(scope, Exit.succeed("DbWorker disposed"))),
        afterInit({ transaction: "exclusive" }),
      ),
  };

  return dbWorker;
});

/** A table name starting with '_' (underscore) is local only (no sync). */
const isLocalOnlyMutation: Predicate.Predicate<Mutation> = (mutation) =>
  mutation.table.startsWith("_");

const isDeleteMutation: Predicate.Predicate<Mutation> = (mutation) =>
  mutationToNewMessages(mutation).some(
    ({ column, value }) => column === "isDeleted" && value === 1,
  );

const mutationToNewMessages = (mutation: Mutation) =>
  pipe(
    Object.entries(mutation.values),
    ReadonlyArray.filterMap(([column, value]) =>
      // The value can be undefined if exactOptionalPropertyTypes isn't true.
      // Don't insert nulls because null is the default value.
      value === undefined || (mutation.isInsert && value == null)
        ? Option.none()
        : Option.some([column, value] as const),
    ),
    ReadonlyArray.map(
      ([column, value]): NewMessage => ({
        table: mutation.table,
        row: mutation.id,
        column,
        value:
          typeof value === "boolean"
            ? cast(value)
            : value instanceof Date
              ? cast(value)
              : value,
      }),
    ),
  );

export const upsertValueIntoTableRowColumn = (
  message: NewMessage,
  messages: ReadonlyArray<NewMessage>,
  millis: Millis,
): Effect.Effect<void, never, Sqlite> =>
  Sqlite.pipe(
    Effect.map((sqlite) => {
      const now = cast(new Date(millis));
      return sqlite.exec({
        sql: `
insert into
  "${message.table}" ("id", "${message.column}", "createdAt", "updatedAt")
values
  (?, ?, ?, ?)
on conflict do update set
  "${message.column}" = ?,
  "updatedAt" = ?
    `.trim(),
        parameters: [message.row, message.value, now, now, message.value, now],
      });
    }),
    Effect.flatMap((insert) =>
      insert.pipe(
        sqliteDefectToNoSuchTableOrColumnError,
        Effect.catchTag("NoSuchTableOrColumnError", () =>
          // If one message fails, we ensure schema for all messages.
          ensureSchemaByNewMessages(messages).pipe(Effect.zipRight(insert)),
        ),
      ),
    ),
  );

const ensureSchemaByNewMessages = (messages: ReadonlyArray<NewMessage>) =>
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
    const tables = Array.from(tablesMap.values());
    yield* _(ensureSchema({ tables, indexes: [] }));
  });

const getTimestampAndMerkleTree = Sqlite.pipe(
  Effect.flatMap((sqlite) => sqlite.exec(selectOwnerTimestampAndMerkleTree)),
  Effect.map(({ rows: [{ timestamp, merkleTree }] }) => ({
    timestamp: unsafeTimestampFromString(timestamp as TimestampString),
    merkleTree: merkleTree as MerkleTree,
  })),
);

const applyMessages = (
  merkleTree: MerkleTree,
  messages: ReadonlyArray<Message>,
): Effect.Effect<MerkleTree, never, Sqlite> =>
  Effect.logDebug(["DbWorker applyMessages", { merkleTree, messages }]).pipe(
    Effect.zipRight(Sqlite),
    Effect.flatMap((sqlite) =>
      Effect.reduce(messages, merkleTree, (currentMerkleTree, message) =>
        sqlite
          .exec({
            ...selectLastTimestampForTableRowColumn,
            parameters: [message.table, message.row, message.column, 1],
          })
          .pipe(
            Effect.map(({ rows }) =>
              rows.length > 0 ? (rows[0].timestamp as TimestampString) : null,
            ),
            Effect.tap((timestamp) => {
              if (timestamp != null && timestamp >= message.timestamp) return;
              const { millis } = unsafeTimestampFromString(message.timestamp);
              return upsertValueIntoTableRowColumn(message, messages, millis);
            }),
            Effect.flatMap((timestamp) => {
              if (timestamp != null && timestamp === message.timestamp)
                return Effect.succeed(currentMerkleTree);
              return Effect.map(
                sqlite.exec({
                  ...insertIntoMessagesIfNew,
                  parameters: [
                    message.timestamp,
                    message.table,
                    message.row,
                    message.column,
                    message.value,
                  ],
                }),
                ({ changes }) => {
                  if (changes === 0) return currentMerkleTree;
                  return insertIntoMerkleTree(
                    currentMerkleTree,
                    unsafeTimestampFromString(message.timestamp),
                  );
                },
              );
            }),
          ),
      ),
    ),
  );

const setTimestampAndMerkleTree = (
  timestamp: Timestamp,
  merkleTree: MerkleTree,
): Effect.Effect<void, never, Sqlite> =>
  Effect.flatMap(Sqlite, (sqlite) =>
    sqlite.exec({
      ...updateOwnerTimestampAndMerkleTree,
      parameters: [
        merkleTreeToString(merkleTree),
        timestampToString(timestamp),
      ],
    }),
  );

// TODO: Write

// import * as Context from "effect/Context";
// import * as Effect from "effect/Effect";
// import * as Function from "effect/Function";
// import { pipe } from "effect/Function";
// import * as Layer from "effect/Layer";
// import * as Match from "effect/Match";
// import * as Option from "effect/Option";
// import * as ReadonlyArray from "effect/ReadonlyArray";
// import * as ReadonlyRecord from "effect/ReadonlyRecord";
// import { Config, ConfigLive } from "./Config.js";
// import {
//   MerkleTree,
//   Millis,
//   Time,
//   TimeLive,
//   Timestamp,
//   TimestampCounterOverflowError,
//   TimestampDriftError,
//   TimestampError,
//   TimestampString,
//   TimestampTimeOutOfRangeError,
//   diffMerkleTrees,
//   insertIntoMerkleTree,
//   makeSyncTimestamp,
//   merkleTreeToString,
//   receiveTimestamp,
//   sendTimestamp,
//   timestampToString,
//   unsafeTimestampFromString,
// } from "./Crdt.js";
// import { Bip39, Mnemonic, NanoIdGenerator } from "./Crypto.js";
// import {
//   Queries,
//   Query,
//   RowsStore,
//   RowsStoreLive,
//   deserializeQuery,
//   dropAllTables,
//   ensureSchema,
//   lazyInit,
//   someDefectToNoSuchTableOrColumnError,
//   transaction,
// } from "./Db.js";
// import { QueryPatches, makePatches } from "./Diff.js";
// import { EvoluError, makeUnexpectedError } from "./ErrorStore.js";
// import { Id, cast } from "./Model.js";
// import { OnCompleteId } from "./OnCompletes.js";
// import { Owner, OwnerId } from "./Owner.js";
// import { DbWorkerLock } from "./Platform.js";
// import * as Sql from "./Sql.js";
// import {
//   Sqlite,
//   SqliteQueryPlanRow,
//   SqliteSchema,
//   Table,
//   Value,
//   drawSqliteQueryPlan as drawExplainQueryPlan,
// } from "./Sqlite.js";
// import {
//   Message,
//   NewMessage,
//   NewMessageEquivalence,
//   SyncState,
//   SyncWorker,
//   SyncWorkerOutputSyncResponse,
//   SyncWorkerPostMessage,
// } from "./SyncWorker.js";
// import { Messaging } from "./Types.js";

// export interface DbWorker extends Messaging<DbWorkerInput, DbWorkerOutput> {}
// export const DbWorker = Context.GenericTag<DbWorker>("@services/DbWorker");

// export type DbWorkerInput =
//   | DbWorkerInputInit
//   | DbWorkerInputQuery
//   | DbWorkerInputMutate
//   | DbWorkerInputSync
//   | DbWorkerInputReset
//   | DbWorkerInputEnsureSchema
//   | SyncWorkerOutputSyncResponse;

// interface DbWorkerInputInit {
//   readonly _tag: "init";
//   readonly config: Config;
// }

// interface DbWorkerInputQuery {
//   readonly _tag: "query";
//   readonly queries: ReadonlyArray.NonEmptyReadonlyArray<Query>;
// }

// interface DbWorkerInputMutate {
//   readonly _tag: "mutate";
//   readonly mutations: ReadonlyArray.NonEmptyReadonlyArray<Mutation>;
//   readonly queries: Queries;
// }

// interface DbWorkerInputSync {
//   readonly _tag: "sync";
//   readonly queries: Queries;
// }

// interface DbWorkerInputReset {
//   readonly _tag: "reset";
//   readonly mnemonic?: Mnemonic;
// }

// interface DbWorkerInputEnsureSchema extends SqliteSchema {
//   readonly _tag: "ensureSchema";
// }

// type DbWorkerOnMessage = DbWorker["onMessage"];

// const DbWorkerOnMessage = Context.GenericTag<DbWorkerOnMessage>(
//   "@services/DbWorkerOnMessage",
// );

// export type DbWorkerOutput =
//   | DbWorkerOutputOnError
//   | DbWorkerOutputOnOwner
//   | DbWorkerOutputOnQuery
//   | DbWorkerOutputOnReceive
//   | DbWorkerOutputOnResetOrRestore
//   | DbWorkerOutputOnSyncState;

// export interface DbWorkerOutputOnError {
//   readonly _tag: "onError";
//   readonly error: EvoluError;
// }

// export interface DbWorkerOutputOnOwner {
//   readonly _tag: "onOwner";
//   readonly owner: Owner;
// }

// export interface DbWorkerOutputOnQuery {
//   readonly _tag: "onQuery";
//   readonly queriesPatches: ReadonlyArray<QueryPatches>;
//   readonly onCompleteIds: ReadonlyArray<OnCompleteId>;
// }

// interface DbWorkerOutputOnReceive {
//   readonly _tag: "onReceive";
// }

// interface DbWorkerOutputOnResetOrRestore {
//   readonly _tag: "onResetOrRestore";
// }

// interface DbWorkerOutputOnSyncState {
//   readonly _tag: "onSyncState";
//   readonly state: SyncState;
// }

// export interface Mutation {
//   readonly table: string;
//   readonly id: Id;
//   readonly values: ReadonlyRecord.ReadonlyRecord<
//     string,
//     Value | Date | boolean | undefined
//   >;
//   readonly isInsert: boolean;
//   readonly onCompleteId: OnCompleteId | null;
// }

// const init = Effect.gen(function* (_) {
//   const sqlite = yield* _(Sqlite);

//   return yield* _(
//     sqlite.exec(Sql.selectOwner),
//     Effect.map(
//       ({ rows: [row] }): Owner => ({
//         id: row.id as OwnerId,
//         mnemonic: row.mnemonic as Mnemonic,
//         encryptionKey: row.encryptionKey as Uint8Array,
//       }),
//     ),
//     someDefectToNoSuchTableOrColumnError,
//     Effect.catchTag("NoSuchTableOrColumnError", () => lazyInit()),
//   );
// });

// const query = ({
//   queries,
//   onCompleteIds = [],
// }: {
//   readonly queries: Queries;
//   readonly onCompleteIds?: ReadonlyArray<OnCompleteId>;
// }): Effect.Effect<void, never, Sqlite | RowsStore | DbWorkerOnMessage> =>
//   Effect.gen(function* (_) {
//     const sqlite = yield* _(Sqlite);
//     const rowsStore = yield* _(RowsStore);
//     const dbWorkerOnMessage = yield* _(DbWorkerOnMessage);

//     const queriesRows = yield* _(
//       ReadonlyArray.dedupe(queries),
//       Effect.forEach((query) => {
//         const sqliteQuery = deserializeQuery(query);
//         return sqlite.exec(sqliteQuery).pipe(
//           Effect.map((result) => [query, result.rows] as const),
//           Effect.tap(() => {
//             if (!sqliteQuery.options?.logExplainQueryPlan) return;
//             return sqlite
//               .exec({
//                 ...sqliteQuery,
//                 sql: `EXPLAIN QUERY PLAN ${sqliteQuery.sql}`,
//               })
//               .pipe(
//                  // TODO: Fix that double log.
//                 Effect.tap(() => Effect.log("ExplainQueryPlan")),
//                 Effect.tap(({ rows }) => {
//                   // Not using Effect.log because of formating
//                   // eslint-disable-next-line no-console
//                   console.log(
//                     drawExplainQueryPlan(rows as SqliteQueryPlanRow[]),
//                   );
//                 }),
//               );
//           }),
//         );
//       }),
//     );

//     const previous = rowsStore.getState();
//     yield* _(rowsStore.setState(new Map([...previous, ...queriesRows])));

//     const queriesPatches = queriesRows.map(
//       ([query, rows]): QueryPatches => ({
//         query,
//         patches: makePatches(previous.get(query), rows),
//       }),
//     );

//     dbWorkerOnMessage({ _tag: "onQuery", queriesPatches, onCompleteIds });
//   });

//     return merkleTree;
//   });

// const mutate = ({
//   mutations,
//   queries,
// }: DbWorkerInputMutate): Effect.Effect<
//   void,
//   | TimestampDriftError
//   | TimestampCounterOverflowError
//   | TimestampTimeOutOfRangeError,
//   | Sqlite
//   | Owner
//   | Time
//   | Config
//   | RowsStore
//   | DbWorkerOnMessage
//   | SyncWorkerPostMessage
// > =>

// const handleSyncResponse = ({
//   messages,
//   ...response
// }: SyncWorkerOutputSyncResponse): Effect.Effect<
//   void,
//   TimestampError,
//   Sqlite | Time | Config | DbWorkerOnMessage | SyncWorkerPostMessage | Owner
// > =>
//   Effect.gen(function* (_) {
//     let { timestamp, merkleTree } = yield* _(readTimestampAndMerkleTree);

//     const dbWorkerOnMessage = yield* _(DbWorkerOnMessage);
//     if (messages.length > 0) {
//       for (const message of messages)
//         timestamp = yield* _(
//           unsafeTimestampFromString(message.timestamp),
//           (remote) => receiveTimestamp({ local: timestamp, remote }),
//         );
//       merkleTree = yield* _(applyMessages({ merkleTree, messages }));
//       yield* _(writeTimestampAndMerkleTree({ timestamp, merkleTree }));
//       dbWorkerOnMessage({ _tag: "onReceive" });
//     }

//     const diff = diffMerkleTrees(response.merkleTree, merkleTree);

//     const syncWorkerPostMessage = yield* _(SyncWorkerPostMessage);

//     if (Option.isNone(diff)) {
//       syncWorkerPostMessage({ _tag: "syncCompleted" });
//       dbWorkerOnMessage({
//         _tag: "onSyncState",
//         state: {
//           _tag: "SyncStateIsSynced",
//           time: yield* _(Time.pipe(Effect.flatMap((time) => time.now))),
//         },
//       });
//       return;
//     }

//     const sqlite = yield* _(Sqlite);
//     const config = yield* _(Config);
//     const owner = yield* _(Owner);

//     const messagesToSync = yield* _(
//       sqlite.exec({
//         ...Sql.selectMessagesToSync,
//         parameters: [timestampToString(makeSyncTimestamp(diff.value))],
//       }),
//       Effect.map(({ rows }) => rows as unknown as ReadonlyArray<Message>),
//     );

//     if (response.syncLoopCount > 100) {
//       // TODO: dbWorkerOnMessage({ _tag: "onError" });
//       // eslint-disable-next-line no-console
//       console.error("Evolu: syncLoopCount > 100");
//       return;
//     }

//     syncWorkerPostMessage({
//       _tag: "sync",
//       syncUrl: config.syncUrl,
//       messages: messagesToSync,
//       timestamp,
//       merkleTree,
//       owner,
//       syncLoopCount: response.syncLoopCount + 1,
//     });
//   });

// const sync = ({
//   queries,
// }: DbWorkerInputSync): Effect.Effect<
//   void,
//   never,
//   | Sqlite
//   | Config
//   | DbWorkerOnMessage
//   | SyncWorkerPostMessage
//   | Owner
//   | RowsStore
// > =>
//   Effect.gen(function* (_) {
//     if (queries.length > 0) yield* _(query({ queries }));
//     const syncWorkerPostMessage = yield* _(SyncWorkerPostMessage);
//     syncWorkerPostMessage({
//       _tag: "sync",
//       ...(yield* _(readTimestampAndMerkleTree)),
//       syncUrl: (yield* _(Config)).syncUrl,
//       owner: yield* _(Owner),
//       messages: [],
//       syncLoopCount: 0,
//     });
//   });

// const reset = (
//   input: DbWorkerInputReset,
// ): Effect.Effect<
//   void,
//   never,
//   Sqlite | Bip39 | NanoIdGenerator | DbWorkerOnMessage
// > =>
//   Effect.gen(function* (_) {
//     yield* _(dropAllTables);
//     if (input.mnemonic) yield* _(lazyInit(input.mnemonic));
//     const onMessage = yield* _(DbWorkerOnMessage);
//     onMessage({ _tag: "onResetOrRestore" });
//   });

// export const DbWorkerCommonLive = Layer.effect(
//   DbWorker,
//   Effect.gen(function* (_) {
//     const syncWorker = yield* _(SyncWorker);

//     const onError = (error: EvoluError): Effect.Effect<void> =>
//       Effect.sync(() => {
//         dbWorker.onMessage({ _tag: "onError", error });
//       });

//     syncWorker.onMessage = (output): void => {
//       switch (output._tag) {
//         case "UnexpectedError":
//           onError(output).pipe(Effect.runSync);
//           break;
//         case "SyncWorkerOutputSyncResponse":
//           dbWorker.postMessage(output);
//           break;
//         default:
//           dbWorker.onMessage({ _tag: "onSyncState", state: output });
//       }
//     };

//     const runContext = Context.empty().pipe(
//       Context.add(Sqlite, yield* _(Sqlite)),
//       Context.add(Bip39, yield* _(Bip39)),
//       Context.add(NanoIdGenerator, yield* _(NanoIdGenerator)),
//       Context.add(DbWorkerOnMessage, (output) => {
//         dbWorker.onMessage(output);
//       }),
//     );

//     const run = (
//       effect: Effect.Effect<
//         void,
//         EvoluError,
//         Sqlite | Bip39 | NanoIdGenerator | DbWorkerOnMessage
//       >,
//     ): Promise<void> =>
//       effect.pipe(
//         Effect.catchAllDefect(makeUnexpectedError),
//         transaction,
//         Effect.catchAll(onError),
//         Effect.provide(runContext),
//         Effect.runPromise,
//       );

//     type HandleInput = (input: DbWorkerInput) => Promise<void>;

//     /** If init fails, we have to allow reset at least. */
//     const handleInputForInitFail: HandleInput = (input): Promise<void> => {
//       if (input._tag !== "reset") return Promise.resolve(undefined);
//       return reset(input).pipe(run);
//     };

//     const makeHandleInputForInitSuccess = (
//       config: Config,
//       owner: Owner,
//     ): HandleInput => {
//       let skipAllBecauseOfReset = false;

//       const layer = Layer.mergeAll(
//         ConfigLive(config),
//         Layer.succeed(Owner, owner),
//         Layer.succeed(SyncWorkerPostMessage, syncWorker.postMessage),
//         RowsStoreLive,
//         TimeLive,
//       ).pipe(Layer.memoize, Effect.scoped, Effect.runSync);

//       return (input) => {
//         if (skipAllBecauseOfReset) return Promise.resolve(undefined);
//         return Match.value(input).pipe(
//           Match.tagsExhaustive({
//             init: () =>
//               makeUnexpectedError(new Error("init must be called once")),
//             query,
//             mutate,
//             sync,
//             reset: (input) => {
//               skipAllBecauseOfReset = true;
//               return reset(input);
//             },
//             ensureSchema,
//             SyncWorkerOutputSyncResponse: handleSyncResponse,
//           }),
//           Effect.provide(layer),
//           run,
//         );
//       };
//     };

//     let handleInput: HandleInput = (input) => {
//       if (input._tag !== "init")
//         return run(makeUnexpectedError(new Error("init must be called first")));
//       handleInput = handleInputForInitFail;
//       return init.pipe(
//         Effect.map((owner) => {
//           dbWorker.onMessage({ _tag: "onOwner", owner });
//           handleInput = makeHandleInputForInitSuccess(input.config, owner);
//         }),
//         run,
//       );
//     };

//     const dbWorkerLock = yield* _(DbWorkerLock);

//     const dbWorker: DbWorker = {
//       postMessage: (input) => {
//         dbWorkerLock(() => handleInput(input));
//       },
//       onMessage: Function.constVoid,
//     };

//     return dbWorker;
//   }),
// );
