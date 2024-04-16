import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as ReadonlyArray from "effect/ReadonlyArray";
import * as Scope from "effect/Scope";
import { Config } from "./Config.js";
import {
  Time,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampTimeOutOfRangeError,
} from "./Crdt.js";
import { Bip39, Mnemonic, NanoIdGenerator } from "./Crypto.js";
import {
  DbSchema,
  Mutation,
  Query,
  applyMutations,
  deserializeQuery,
  dropAllTables,
  ensureSchema,
  init,
  isDeleteMutation,
  isLocalOnlyMutation,
  lazyInit,
  makeRowsStore,
  maybeExplainQueryPlan,
  mutationToNewMessages,
  upsertValueIntoTableRowColumn,
} from "./Db.js";
import { QueryPatches, makePatches } from "./Diff.js";
import { Owner } from "./Owner.js";
import { Sqlite, SqliteFactory, SqliteTransactionMode } from "./Sqlite.js";

export interface DbWorker {
  readonly init: (
    schema: DbSchema,
  ) => Effect.Effect<Owner, NotSupportedPlatformError, Config>;

  readonly loadQueries: (
    queries: ReadonlyArray<Query>,
  ) => Effect.Effect<ReadonlyArray<QueryPatches>>;

  readonly mutate: (
    mutations: ReadonlyArray<Mutation>,
    queriesToRefresh: ReadonlyArray<Query>,
  ) => Effect.Effect<
    ReadonlyArray<QueryPatches>,
    | TimestampTimeOutOfRangeError
    | TimestampDriftError
    | TimestampCounterOverflowError,
    Config
  >;

  readonly resetOwner: () => Effect.Effect<void>;

  readonly restoreOwner: (
    schema: DbSchema,
    mnemonic: Mnemonic,
  ) => Effect.Effect<void>;

  readonly ensureSchema: (schema: DbSchema) => Effect.Effect<void>;

  readonly dispose: () => Effect.Effect<void>;
}

export interface NotSupportedPlatformError {
  readonly _tag: "NotSupportedPlatformError";
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
      Effect.flatMap(Deferred.await(afterInitContext), (context) =>
        Sqlite.pipe(
          Effect.flatMap((sqlite) =>
            sqlite.transaction(options.transaction)(effect),
          ),
          Effect.provide(context),
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
        yield* _(Effect.logDebug(["DbWorker init", schema]));
        const sqlite = yield* _(createSqlite, Scope.extend(scope));
        const contextWithSqlite = Context.add(initContext, Sqlite, sqlite);
        const owner = yield* _(
          init(schema),
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

    mutate: (mutations, queriesToRefresh) =>
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
          yield* _(applyMutations(toSyncMutations));
          // TODO: Sync
        }
        return yield* _(loadQueries(queriesToRefresh));
      }).pipe(afterInit({ transaction: "exclusive" })),

    resetOwner: () =>
      Effect.logTrace("DbWorker resetOwner").pipe(
        Effect.tap(dropAllTables),
        afterInit({ transaction: "last" }),
      ),

    restoreOwner: (schema, mnemonic) =>
      Effect.logTrace("DbWorker restoreOwner").pipe(
        Effect.tap(dropAllTables),
        Effect.tap(lazyInit({ schema, mnemonic, isRestore: true })),
        afterInit({ transaction: "last" }),
      ),

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

/** It fails on init, and there is no-op for the rest. */
export const notSupportedPlatformWorker: DbWorker = {
  init: () =>
    Effect.fail<NotSupportedPlatformError>({
      _tag: "NotSupportedPlatformError",
    }),
  loadQueries: () => Effect.succeed([]),
  mutate: () => Effect.succeed([]),
  resetOwner: () => Effect.unit,
  restoreOwner: () => Effect.unit,
  ensureSchema: () => Effect.unit,
  dispose: () => Effect.unit,
};
