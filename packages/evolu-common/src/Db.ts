import * as S from "@effect/schema/Schema";
import * as Arr from "effect/Array";
import * as Brand from "effect/Brand";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import { Equivalence } from "effect/Equivalence";
import { constVoid, pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as String from "effect/String";
import * as SynchronizedRef from "effect/SynchronizedRef";
import * as Kysely from "kysely";
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
  diffMerkleTrees,
  initialMerkleTree,
  insertIntoMerkleTree,
  makeInitialTimestamp,
  makeSyncTimestamp,
  merkleTreeToString,
  receiveTimestamp,
  sendTimestamp,
  timestampToString,
  unsafeTimestampFromString,
} from "./Crdt.js";
import { Bip39, Mnemonic, NanoIdGenerator } from "./Crypto.js";
import { QueryPatches, makePatches } from "./Diff.js";
import {
  EvoluError,
  ensureTransferableError,
  makeUnexpectedError,
} from "./Error.js";
import { Id, cast } from "./Model.js";
import { Owner, OwnerId, makeOwner } from "./Owner.js";
import { SyncLock } from "./Platform.js";
import * as Sql from "./Sql.js";
import {
  JsonObjectOrArray,
  Sqlite,
  SqliteExecResult,
  SqliteFactory,
  SqliteQuery,
  SqliteQueryOptions,
  SqliteQueryPlanRow,
  SqliteTransactionMode,
  Value,
  drawSqliteQueryPlan,
  isJsonObjectOrArray,
} from "./Sqlite.js";
import {
  Message,
  NewMessage,
  Sync,
  SyncData,
  SyncFactory,
  SyncResult,
  SyncState,
} from "./Sync.js";

export interface Db {
  readonly init: (
    schema: DbSchema,
    initialData: ReadonlyArray<Mutation>,
    onError: Callbacks["onError"],
    onSyncStateChange: Callbacks["onSyncStateChange"],
    onReceive: Callbacks["onReceive"],
  ) => Effect.Effect<
    Owner,
    | NotSupportedPlatformError
    | TimestampTimeOutOfRangeError
    | TimestampDriftError
    | TimestampCounterOverflowError,
    Config
  >;

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

  readonly sync: (
    queriesToRefresh: ReadonlyArray<Query>,
  ) => Effect.Effect<ReadonlyArray<QueryPatches>, never, Config>;

  readonly exportDatabase: () => Effect.Effect<Uint8Array>;
}

export interface DbSchema {
  readonly tables: ReadonlyArray<Table>;
  readonly indexes: ReadonlyArray<Index>;
}

export interface Table {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

export const Index = S.Struct({
  name: S.String,
  sql: S.String,
});
export type Index = S.Schema.Type<typeof Index>;

export interface Mutation {
  readonly table: string;
  readonly id: Id;
  readonly values: Record.ReadonlyRecord<
    string,
    Value | Date | boolean | undefined
  >;
  readonly isInsert: boolean;
}

export interface NotSupportedPlatformError {
  readonly _tag: "NotSupportedPlatformError";
}

// https://blog.beraliv.dev/2021-05-07-opaque-type-in-typescript
declare const __queryBrand: unique symbol;

/**
 * Query is SQL query serialized as a string with a branded type representing a
 * row it returns.
 */
export type Query<R extends Row = Row> = string &
  Brand.Brand<"Query"> & { readonly [__queryBrand]: R };

export type Row = {
  [key: string]:
    | Value
    | Row // for jsonObjectFrom from kysely/helpers/sqlite
    | ReadonlyArray<Row>; // for jsonArrayFrom from kysely/helpers/sqlite
};

export class DbFactory extends Context.Tag("DbFactory")<
  DbFactory,
  {
    readonly createDb: Effect.Effect<Db>;
  }
>() {}

export const createDb: Effect.Effect<
  Db,
  never,
  SqliteFactory | Bip39 | NanoIdGenerator | Time | SyncFactory | SyncLock
> = Effect.gen(function* () {
  const { createSqlite } = yield* SqliteFactory;
  const { createSync } = yield* SyncFactory;

  const initContext = Context.empty().pipe(
    Context.add(Bip39, yield* Bip39),
    Context.add(NanoIdGenerator, yield* NanoIdGenerator),
    Context.add(Time, yield* Time),
    Context.add(SyncLock, yield* SyncLock),
  );

  const afterInitContext =
    yield* Deferred.make<
      Context.Context<
        | Bip39
        | NanoIdGenerator
        | Time
        | SyncLock
        | Sqlite
        | Owner
        | Sync
        | Callbacks
      >
    >();

  const afterInit =
    (options: { readonly transaction: SqliteTransactionMode }) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.flatMap(Deferred.await(afterInitContext), (context) =>
        Effect.flatMap(Sqlite, (sqlite) =>
          sqlite.transaction(options.transaction)(effect),
        ).pipe(Effect.provide(context)),
      );

  const queryRowsRef = yield* SynchronizedRef.make<QueryRowsMap>(new Map());

  const db: Db = {
    init: (schema, initialData, onError, onSyncStateChange, onReceive) =>
      Effect.gen(function* () {
        yield* Effect.logDebug(["Db init", { schema }]);
        const sqlite = yield* createSqlite;
        const contextWithSqlite = Context.add(initContext, Sqlite, sqlite);
        const owner = yield* getSchema.pipe(
          Effect.tap(ensureSchema(schema)),
          Effect.flatMap((currentSchema) => {
            if (currentSchema.tables.map((t) => t.name).includes("evolu_owner"))
              return readOwner;
            return createOwner().pipe(Effect.tap(applyMutations(initialData)));
          }),
          sqlite.transaction("exclusive"),
          Effect.provide(contextWithSqlite),
        );
        const sync = yield* createSync.pipe(Effect.provide(initContext));
        yield* sync.init(owner);
        Deferred.unsafeDone(
          afterInitContext,
          Effect.succeed(
            contextWithSqlite.pipe(
              Context.add(Owner, owner),
              Context.add(Sync, sync),
              Context.add(Callbacks, { onError, onSyncStateChange, onReceive }),
            ),
          ),
        );
        return owner;
      }),

    loadQueries: (queries) =>
      Effect.logDebug(["Db loadQueries", { queries }]).pipe(
        Effect.zipRight(loadQueries(queries, queryRowsRef)),
        afterInit({ transaction: "shared" }),
      ),

    mutate: (mutations, queriesToRefresh) =>
      Effect.gen(function* () {
        yield* Effect.logDebug(["Db mutate", { mutations, queriesToRefresh }]);
        const time = yield* Time;
        const sqlite = yield* Sqlite;

        const [toSyncMutations, localOnlyMutations] = Arr.partition(
          mutations,
          /** Table name starting with '_' is local only (not synced). */
          (mutation) => mutation.table.startsWith("_"),
        );

        for (const mutation of localOnlyMutations) {
          const isDeleteMutation = mutationToNewMessages(mutation).some(
            ({ column, value }) => column === "isDeleted" && value === 1,
          );
          if (isDeleteMutation) {
            yield* sqlite.exec({
              sql: `delete from "${mutation.table}" where "id" = ?;`,
              parameters: [mutation.id],
            });
          } else {
            const messages = mutationToNewMessages(mutation);
            for (const message of messages) {
              const now = yield* time.now;
              yield* upsertValueIntoTableRowColumn(message, messages, now);
            }
          }
        }
        if (toSyncMutations.length > 0) {
          yield* Effect.tap(applyMutations(toSyncMutations), forkSync);
        }
        return yield* loadQueries(queriesToRefresh, queryRowsRef);
      }).pipe(afterInit({ transaction: "exclusive" })),

    resetOwner: () =>
      Effect.logTrace("Db resetOwner").pipe(
        Effect.tap(dropAllTables),
        afterInit({ transaction: "last" }),
      ),

    restoreOwner: (schema, mnemonic) =>
      Effect.logTrace("Db restoreOwner").pipe(
        Effect.tap(dropAllTables),
        Effect.tap(Effect.flatMap(getSchema, ensureSchema(schema))),
        Effect.tap(createOwner(mnemonic)),
        afterInit({ transaction: "last" }),
      ),

    ensureSchema: (schema) =>
      getSchema.pipe(
        Effect.flatMap(ensureSchema(schema)),
        afterInit({ transaction: "exclusive" }),
      ),

    sync: (queriesToRefresh) =>
      Effect.logDebug(["Db sync", { queriesToRefresh }]).pipe(
        Effect.zipRight(forkSync()),
        Effect.zipRight(loadQueries(queriesToRefresh, queryRowsRef)),
        afterInit({ transaction: "shared" }),
      ),

    exportDatabase: () =>
      Effect.logTrace("Db exportDatabase").pipe(
        Effect.zipRight(Sqlite),
        Effect.flatMap((sqlite) => sqlite.export()),
        afterInit({ transaction: "exclusive" }),
      ),

    // TODO:
    // dispose: () =>
    //   Effect.logTrace("Db dispose").pipe(
    //     Effect.tap(Scope.close(scope, Exit.succeed("Db disposed"))),
    //     afterInit({ transaction: "last" }),
    //   ),
  };

  return db;
});

export interface Callbacks {
  readonly onError: (error: EvoluError) => void;
  readonly onSyncStateChange: (state: SyncState) => void;
  readonly onReceive: () => void;
}

export const Callbacks = Context.GenericTag<Callbacks>("Callbacks");

export type QueryRowsMap = ReadonlyMap<Query, ReadonlyArray<Row>>;

const loadQueries = (
  queries: ReadonlyArray<Query>,
  queryRowsRef: SynchronizedRef.SynchronizedRef<QueryRowsMap>,
) =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite;
    const previousState = yield* SynchronizedRef.getAndUpdateEffect(
      queryRowsRef,
      (previousState) =>
        Effect.map(
          Effect.forEach(queries, (query) => {
            const sqliteQuery = deserializeQuery(query);
            return sqlite.exec(sqliteQuery).pipe(
              Effect.tap(maybeExplainQueryPlan(sqliteQuery)),
              Effect.map(({ rows }) => [query, rows] as const),
            );
          }),
          (queriesRows) => new Map([...previousState, ...queriesRows]),
        ),
    );
    const currentState = yield* SynchronizedRef.get(queryRowsRef);
    return queries.map(
      (query): QueryPatches => ({
        query,
        patches: makePatches(
          previousState.get(query),
          currentState.get(query) || [],
        ),
      }),
    );
  });

const maybeExplainQueryPlan = (sqliteQuery: SqliteQuery) => {
  if (!sqliteQuery.options?.logExplainQueryPlan) return Effect.void;
  return Sqlite.pipe(
    Effect.flatMap((sqlite) =>
      sqlite.exec({
        ...sqliteQuery,
        sql: `EXPLAIN QUERY PLAN ${sqliteQuery.sql}`,
      }),
    ),
    Effect.tap(Console.log("ExplainQueryPlan", sqliteQuery)),
    Effect.tap(({ rows }) =>
      Console.log(drawSqliteQueryPlan(rows as SqliteQueryPlanRow[])),
    ),
    Effect.map(constVoid),
  );
};

const getSchema: Effect.Effect<DbSchema, never, Sqlite> = Effect.gen(
  function* (_) {
    yield* Effect.logTrace("Db getSchema");
    const sqlite = yield* Sqlite;
    const tables = yield* Effect.map(
      sqlite.exec({
        // https://til.simonwillison.net/sqlite/list-all-columns-in-a-database
        sql: `
select
  sqlite_master.name as tableName,
  table_info.name as columnName
from
  sqlite_master
  join pragma_table_info(sqlite_master.name) as table_info
    `.trim(),
      }),
      ({ rows }) => {
        const map = new Map<string, string[]>();
        rows.forEach((row) => {
          const { tableName, columnName } = row as {
            tableName: string;
            columnName: string;
          };
          if (!map.has(tableName)) map.set(tableName, []);
          map.get(tableName)?.push(columnName);
        });
        return globalThis.Array.from(map, ([name, columns]) => ({
          name,
          columns,
        }));
      },
    );

    const indexes = yield* Effect.map(
      sqlite.exec({
        sql: `
select
  name, sql
from
  sqlite_master
where
  type='index' and
  name not like 'sqlite_%' and
  name not like 'index_evolu_%'
`.trim(),
      }),
      (result) =>
        Arr.map(
          result.rows,
          (row): Index => ({
            name: row.name as string,
            /**
             * SQLite returns "CREATE INDEX" for "create index" for some reason.
             * Other keywords remain unchanged. We have to normalize the casing
             * for `indexEquivalence` manually.
             */
            sql: (row.sql as string).replace("CREATE INDEX", "create index"),
          }),
        ),
    );

    return { tables, indexes };
  },
);

const ensureSchema = (newSchema: DbSchema) => (currentSchema: DbSchema) =>
  Effect.gen(function* () {
    yield* Effect.logTrace("Db ensureSchema");
    const sql: string[] = [];

    newSchema.tables.forEach((table) => {
      const currentTable = currentSchema.tables.find(
        (t) => t.name === table.name,
      );
      if (!currentTable) {
        sql.push(
          `
  create table ${table.name} (
    "id" text primary key,
    ${table.columns
      .filter((c) => c !== "id")
      // "A column with affinity BLOB does not prefer one storage class over another
      // and no attempt is made to coerce data from one storage class into another."
      // https://www.sqlite.org/datatype3.html
      .map((name) => `"${name}" blob`)
      .join(", ")}
  );`.trim(),
        );
      } else {
        Arr.differenceWith(String.Equivalence)(
          table.columns,
          currentTable.columns,
        ).forEach((newColumn) => {
          sql.push(
            `alter table "${table.name}" add column "${newColumn}" blob;`,
          );
        });
      }
    });

    // Remove old indexes.
    Arr.differenceWith(indexEquivalence)(
      currentSchema.indexes,
      Arr.intersectionWith(indexEquivalence)(
        currentSchema.indexes,
        newSchema.indexes,
      ),
    ).forEach((indexToDrop) => {
      sql.push(`drop index "${indexToDrop.name}";`);
    });

    // Add new indexes.
    Arr.differenceWith(indexEquivalence)(
      newSchema.indexes,
      currentSchema.indexes,
    ).forEach((newIndex) => {
      sql.push(`${newIndex.sql};`);
    });
    if (sql.length > 0) {
      const sqlite = yield* Sqlite;
      yield* sqlite.exec({ sql: sql.join("\n") });
    }
  });

const indexEquivalence: Equivalence<Index> = (self, that) =>
  self.name === that.name && self.sql === that.sql;

const readOwner = Effect.logTrace("Db readOwner").pipe(
  Effect.zipRight(Sqlite),
  Effect.flatMap((sqlite) => sqlite.exec(Sql.selectOwner)),
  Effect.map(
    ({ rows: [row] }): Owner => ({
      id: row.id as OwnerId,
      mnemonic: row.mnemonic as Mnemonic,
      encryptionKey: row.encryptionKey as Uint8Array,
    }),
  ),
);

const createOwner = (mnemonic?: Mnemonic) =>
  Effect.logTrace("Db createOwner").pipe(
    Effect.zipRight(
      Effect.all([makeOwner(mnemonic), Sqlite, makeInitialTimestamp]),
    ),
    Effect.tap(([owner, sqlite, initialTimestampString]) =>
      Effect.all([
        sqlite.exec(Sql.createMessageTable),
        sqlite.exec(Sql.createMessageTableIndex),
        sqlite.exec(Sql.createOwnerTable),
        sqlite.exec({
          ...Sql.insertOwner,
          parameters: [
            owner.id,
            owner.mnemonic,
            owner.encryptionKey,
            timestampToString(initialTimestampString),
            merkleTreeToString(initialMerkleTree),
          ],
        }),
      ]),
    ),
    Effect.map(([owner]) => owner),
  );

const applyMutations = (mutations: ReadonlyArray<Mutation>) =>
  Effect.gen(function* (_) {
    const { timestamp, merkleTree } = yield* readTimestampAndMerkleTree;
    const [nextTimestamp, messages] = yield* Effect.mapAccum(
      mutations.flatMap(mutationToNewMessages),
      timestamp,
      (currentTimestamp, newMessage) =>
        Effect.map(sendTimestamp(currentTimestamp), (nextTimestamp) => {
          const message: Message = {
            ...newMessage,
            timestamp: timestampToString(nextTimestamp),
          };
          return [nextTimestamp, message];
        }),
    );
    const nextMerkleTree = yield* applyMessages(merkleTree, messages);
    yield* writeTimestampAndMerkleTree(nextTimestamp, nextMerkleTree);
    return messages;
  });

const readTimestampAndMerkleTree = Sqlite.pipe(
  Effect.flatMap((sqlite) =>
    sqlite.exec(Sql.selectOwnerTimestampAndMerkleTree),
  ),
  Effect.map(({ rows: [{ timestamp, merkleTree }] }) => ({
    timestamp: unsafeTimestampFromString(timestamp as TimestampString),
    merkleTree: merkleTree as MerkleTree,
  })),
);

const mutationToNewMessages = (mutation: Mutation) =>
  pipe(
    Object.entries(mutation.values),
    Arr.filterMap(([column, value]) =>
      // The value can be undefined if exactOptionalPropertyTypes isn't true.
      // Don't insert nulls because null is the default value.
      value === undefined || (mutation.isInsert && value == null)
        ? Option.none()
        : Option.some([column, value] as const),
    ),
    Arr.map(
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

const applyMessages = (
  merkleTree: MerkleTree,
  messages: ReadonlyArray<Message>,
): Effect.Effect<MerkleTree, never, Sqlite> =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite;
    for (const message of messages) {
      const messageTimestamp = unsafeTimestampFromString(message.timestamp);
      const lastTimestamp = yield* Effect.map(
        sqlite.exec({
          ...Sql.selectLastTimestampForTableRowColumn,
          parameters: [message.table, message.row, message.column, 1],
        }),
        ({ rows }) =>
          rows.length > 0 ? (rows[0].timestamp as TimestampString) : null,
      );
      if (lastTimestamp == null || lastTimestamp < message.timestamp) {
        yield* upsertValueIntoTableRowColumn(
          message,
          messages,
          messageTimestamp.millis,
        );
      }
      if (lastTimestamp == null || lastTimestamp !== message.timestamp) {
        const { changes } = yield* sqlite.exec({
          ...Sql.insertIntoMessagesIfNew,
          parameters: [
            message.timestamp,
            message.table,
            message.row,
            message.column,
            message.value,
          ],
        });
        if (changes === 1)
          merkleTree = insertIntoMerkleTree(merkleTree, messageTimestamp);
      }
    }
    return merkleTree;
  });

export const upsertValueIntoTableRowColumn = (
  message: NewMessage,
  messages: ReadonlyArray<NewMessage>,
  millis: Millis,
): Effect.Effect<SqliteExecResult, never, Sqlite> =>
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
      Effect.catchSomeDefect(insert, (error) =>
        S.is(SqliteNoSuchTableOrColumnError)(error)
          ? Option.some(
              // If one message fails, we ensure schema for all messages.
              ensureSchemaByNewMessages(messages).pipe(Effect.zipRight(insert)),
            )
          : Option.none(),
      ),
    ),
  );

const SqliteNoSuchTableOrColumnError = S.Struct({
  message: S.Union(
    S.String.pipe(S.includes("no such table")),
    S.String.pipe(S.includes("no such column")),
    S.String.pipe(S.includes("has no column")),
  ),
});

const ensureSchemaByNewMessages = (messages: ReadonlyArray<NewMessage>) =>
  Effect.gen(function* () {
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
    const tables = Arr.fromIterable(tablesMap.values());
    yield* Effect.flatMap(getSchema, ensureSchema({ tables, indexes: [] }));
  });

const writeTimestampAndMerkleTree = (
  timestamp: Timestamp,
  merkleTree: MerkleTree,
) =>
  Effect.flatMap(Sqlite, (sqlite) =>
    sqlite.exec({
      ...Sql.updateOwnerTimestampAndMerkleTree,
      parameters: [
        merkleTreeToString(merkleTree),
        timestampToString(timestamp),
      ],
    }),
  );

const dropAllTables = Effect.gen(function* () {
  yield* Effect.logTrace("Db dropAllTables");
  const sqlite = yield* Sqlite;
  const schema = yield* getSchema;
  yield* Effect.forEach(schema.tables, (table) =>
    // The dropped table is completely removed from the database schema and
    // the disk file. The table can not be recovered.
    // All indices and triggers associated with the table are also deleted.
    // https://sqlite.org/lang_droptable.html
    sqlite.exec({ sql: `drop table "${table.name}"` }),
  );
});

const forkSync = (messages: ReadonlyArray<Message> = []) =>
  SyncLock.pipe(
    Effect.flatMap((syncLock) => syncLock.tryAcquire),
    Effect.matchEffect({
      onFailure: () => Effect.void,
      onSuccess: () => syncLoop(messages),
    }),
    Effect.scoped,
    Effect.forkDaemon,
  );

const syncLoop = (
  messages: ReadonlyArray<Message> = [],
): Effect.Effect<void, never, Sync | Callbacks | Time | Sqlite | Config> =>
  Effect.gen(function* (_) {
    const sqlite = yield* Sqlite;
    const sync = yield* Sync;
    const callbacks = yield* Callbacks;
    const time = yield* Time;

    const syncDataRef = yield* readTimestampAndMerkleTree.pipe(
      sqlite.transaction("shared"),
      Effect.map((a): SyncData => ({ ...a, messages })),
      Effect.flatMap(Ref.make),
    );

    callbacks.onSyncStateChange({ _tag: "SyncStateIsSyncing" });

    yield* Ref.get(syncDataRef).pipe(
      Effect.flatMap(sync.sync),
      Effect.flatMap(handleSyncResult),
      Effect.repeat({
        // TODO: Schedule.jittered(Schedule.exponential("10 millis"))
        schedule: Schedule.recurs(50),
        until: Option.match({
          onNone: () =>
            Effect.gen(function* () {
              callbacks.onSyncStateChange({
                _tag: "SyncStateIsSynced",
                time: yield* time.now,
              });
              return true;
            }),
          onSome: (syncData) =>
            Effect.gen(function* () {
              yield* Ref.set(syncDataRef, syncData);
              return false;
            }),
        }),
      }),
      Effect.catchAllDefect((error) =>
        // Db can run in a Web Worker, so we must ensure transferable error.
        Effect.fail(makeUnexpectedError(ensureTransferableError(error))),
      ),
      Effect.catchTag("SyncStateIsNotSynced", (state) =>
        Effect.succeed(callbacks.onSyncStateChange(state)),
      ),
      Effect.catchAll((error) => Effect.succeed(callbacks.onError(error))),
    );
  });

const handleSyncResult = (result: SyncResult) =>
  Effect.flatMap(Sqlite, (sqlite) =>
    Effect.gen(function* (_) {
      const { onReceive } = yield* Callbacks;
      const current = yield* readTimestampAndMerkleTree;
      const nextTimestamp = yield* Effect.reduce(
        result.messages,
        current.timestamp,
        (local, message) =>
          receiveTimestamp({
            local,
            remote: unsafeTimestampFromString(message.timestamp),
          }),
      );
      const nextMerkleTree = yield* applyMessages(
        current.merkleTree,
        result.messages,
      );
      if (result.messages.length > 0) {
        yield* writeTimestampAndMerkleTree(nextTimestamp, nextMerkleTree);
        onReceive();
      }
      return yield* diffMerkleTrees(result.merkleTree, nextMerkleTree).pipe(
        Effect.flatMap((diff) =>
          sqlite.exec({
            ...Sql.selectMessagesToSync,
            parameters: [timestampToString(makeSyncTimestamp(diff))],
          }),
        ),
        Effect.map(
          ({ rows }): SyncData => ({
            messages: rows as unknown as ReadonlyArray<Message>,
            merkleTree: nextMerkleTree,
            timestamp: nextTimestamp,
          }),
        ),
        Effect.option,
      );
    }).pipe(sqlite.transaction("exclusive")),
  );

interface SerializedSqliteQuery {
  readonly sql: string;
  readonly parameters: (
    | null
    | string
    | number
    | Array<number>
    | { json: JsonObjectOrArray }
  )[];
  readonly options?: SqliteQueryOptions;
}

// We use queries as keys, hence JSON.stringify.
export const serializeQuery = <R extends Row>({
  sql,
  parameters = [],
  options,
}: SqliteQuery): Query<R> => {
  const query: SerializedSqliteQuery = {
    sql,
    parameters: parameters.map((p) =>
      Predicate.isUint8Array(p)
        ? Arr.fromIterable(p)
        : isJsonObjectOrArray(p)
          ? { json: p }
          : p,
    ),
    ...(options && { options }),
  };
  return JSON.stringify(query) as Query<R>;
};

export const deserializeQuery = <R extends Row>(
  query: Query<R>,
): SqliteQuery => {
  const serializedSqliteQuery = JSON.parse(query) as SerializedSqliteQuery;
  return {
    ...serializedSqliteQuery,
    parameters: serializedSqliteQuery.parameters.map((p) =>
      Arr.isArray(p)
        ? new Uint8Array(p)
        : typeof p === "object" && p != null
          ? p.json
          : p,
    ),
  };
};

/**
 * Extract {@link Row} from {@link Query} instance.
 *
 * @example
 *   const allTodos = evolu.createQuery((db) =>
 *     db.selectFrom("todo").selectAll(),
 *   );
 *   type AllTodosRow = ExtractRow<typeof allTodos>;
 */
export type ExtractRow<T extends Query> = T extends Query<infer R> ? R : never;

// To preserve identity.
const _emptyRows: ReadonlyArray<Row> = [];
export const emptyRows = <R extends Row>(): ReadonlyArray<R> =>
  _emptyRows as ReadonlyArray<R>;

/** An object with rows and row properties. */
export interface QueryResult<R extends Row = Row> {
  /** An array containing all the rows returned by the query. */
  readonly rows: ReadonlyArray<Readonly<Kysely.Simplify<R>>>;

  /**
   * The first row returned by the query, or null if no rows were returned. This
   * property is useful for queries that are expected to return a single row.
   */
  readonly row: Readonly<Kysely.Simplify<R>> | null;
}

export type Queries<R extends Row = Row> = ReadonlyArray<Query<R>>;

export type QueryResultsFromQueries<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<infer R> ? QueryResult<R> : never;
};

export type QueryResultsPromisesFromQueries<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<infer R> ? Promise<QueryResult<R>> : never;
};

// To preserve identity.
const queryResultCache = new WeakMap<ReadonlyArray<Row>, QueryResult<Row>>();
export const queryResultFromRows = <R extends Row>(
  rows: ReadonlyArray<R>,
): QueryResult<R> => {
  let queryResult = queryResultCache.get(rows);
  if (queryResult == null) {
    queryResult = { rows, row: rows[0] };
    queryResultCache.set(rows, queryResult);
  }
  return queryResult as QueryResult<R>;
};

export const notSupportedPlatformWorker: Db = {
  init: () =>
    Effect.fail<NotSupportedPlatformError>({
      _tag: "NotSupportedPlatformError",
    }),
  loadQueries: () => Effect.succeed([]),
  mutate: () => Effect.succeed([]),
  resetOwner: () => Effect.void,
  restoreOwner: () => Effect.void,
  ensureSchema: () => Effect.void,
  sync: () => Effect.succeed([]),
  exportDatabase: () => Effect.succeed(new Uint8Array()),
};
