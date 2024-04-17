import * as AST from "@effect/schema/AST";
import * as S from "@effect/schema/Schema";
import { make } from "@effect/schema/Schema";
import * as Array from "effect/Array";
import * as Brand from "effect/Brand";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Equivalence } from "effect/Equivalence";
import { constVoid, pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as String from "effect/String";
import * as Types from "effect/Types";
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
  initialMerkleTree,
  insertIntoMerkleTree,
  makeInitialTimestamp,
  merkleTreeToString,
  sendTimestamp,
  timestampToString,
  unsafeTimestampFromString,
} from "./Crdt.js";
import { Bip39, Mnemonic, NanoIdGenerator } from "./Crypto.js";
import { Id, SqliteBoolean, SqliteDate, cast } from "./Model.js";
import { Owner, OwnerId, makeOwner } from "./Owner.js";
import {
  createMessageTable,
  createMessageTableIndex,
  createOwnerTable,
  insertIntoMessagesIfNew,
  insertOwner,
  selectLastTimestampForTableRowColumn,
  selectOwner,
  selectOwnerTimestampAndMerkleTree,
  updateOwnerTimestampAndMerkleTree,
} from "./Sql.js";
import {
  JsonObjectOrArray,
  Sqlite,
  SqliteQuery,
  SqliteQueryOptions,
  SqliteQueryPlanRow,
  Value,
  drawSqliteQueryPlan,
  isJsonObjectOrArray,
} from "./Sqlite.js";
import { makeStore } from "./Store.js";

interface EvoluTypeError<E extends string> {
  readonly __evoluTypeError__: E;
}

/**
 * Create table schema.
 *
 * Supported types are null, string, number, Uint8Array, JSON Object, and JSON
 * Array. Use SqliteDate for dates and SqliteBoolean for booleans.
 *
 * Reserved columns are createdAt, updatedAt, isDeleted. Those columns are added
 * by default.
 *
 * @example
 *   const TodoId = id("Todo");
 *   type TodoId = S.Schema.Type<typeof TodoId>;
 *
 *   const TodoTable = table({
 *     id: TodoId,
 *     title: NonEmptyString1000,
 *     isCompleted: S.nullable(SqliteBoolean),
 *   });
 *   type TodoTable = S.Schema.Type<typeof TodoTable>;
 */
export const table = <Fields extends TableFields>(
  fields: Fields,
  // Because Schema is invariant, we have to do validation like this.
): ValidateFieldsTypes<Fields> extends true
  ? ValidateFieldsNames<Fields> extends true
    ? ValidateFieldsHasId<Fields> extends true
      ? S.Schema<
          Types.Simplify<
            S.Struct.Type<Fields> & S.Schema.Type<typeof ReservedColumns>
          >,
          Types.Simplify<
            S.Struct.Encoded<Fields> & S.Schema.Encoded<typeof ReservedColumns>
          >
        >
      : EvoluTypeError<"table() called without id column.">
    : EvoluTypeError<"table() called with a reserved column. Reserved columns are createdAt, updatedAt, isDeleted. Those columns are added by default.">
  : EvoluTypeError<"table() called with unsupported type. Supported types are null, string, number, Uint8Array, JSON Object, and JSON Array. Use SqliteDate for dates and SqliteBoolean for booleans."> =>
  S.Struct(fields).pipe(S.extend(ReservedColumns)) as never;

const ReservedColumns = S.Struct({
  createdAt: SqliteDate,
  updatedAt: SqliteDate,
  isDeleted: SqliteBoolean,
});

type TableFields = Record<string, S.Schema<any>>;

type ValidateFieldsTypes<Fields extends TableFields> =
  keyof Fields extends infer K
    ? K extends keyof Fields
      ? Fields[K] extends TableFields
        ? ValidateFieldsTypes<Fields[K]>
        : // eslint-disable-next-line @typescript-eslint/no-unused-vars
          Fields[K] extends S.Schema<infer A, infer _I>
          ? A extends Value
            ? true
            : false
          : never
      : never
    : never;

type ValidateFieldsNames<Fields extends TableFields> =
  keyof Fields extends infer K
    ? K extends keyof Fields
      ? K extends "createdAt" | "updatedAt" | "isDeleted"
        ? false
        : true
      : never
    : never;

type ValidateFieldsHasId<Fields extends TableFields> = "id" extends keyof Fields
  ? true
  : false;

/**
 * Create database schema.
 *
 * Tables with a name prefixed with _ are local-only, which means they are not
 * synced. Local-only tables are useful for device-specific or temporal data.
 *
 * @example
 *   const Database = database({
 *     // A local-only table.
 *     _todo: TodoTable,
 *     todo: TodoTable,
 *     todoCategory: TodoCategoryTable,
 *   });
 *   type Database = S.Schema.Type<typeof Database>;
 */
export const database = S.Struct;

// https://blog.beraliv.dev/2021-05-07-opaque-type-in-typescript
declare const __queryBrand: unique symbol;

/**
 * The query is an SQL query serialized as a string with a branded type
 * representing a row it returns.
 */
export type Query<R extends Row = Row> = string &
  Brand.Brand<"Query"> & { readonly [__queryBrand]: R };

export type Queries<R extends Row = Row> = ReadonlyArray<Query<R>>;

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
        ? Array.fromIterable(p)
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
      Array.isArray(p)
        ? new Uint8Array(p)
        : typeof p === "object" && p != null
          ? p.json
          : p,
    ),
  };
};

export type Row = {
  [key: string]:
    | Value
    | Row // for jsonObjectFrom from kysely/helpers/sqlite
    | Rows; // for jsonArrayFrom from kysely/helpers/sqlite
};

export type Rows = ReadonlyArray<Row>;

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
const _emptyRows: Rows = [];
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

export type QueryResultsFromQueries<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<infer R> ? QueryResult<R> : never;
};

export type QueryResultsPromisesFromQueries<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<infer R> ? Promise<QueryResult<R>> : never;
};

const queryResultCache = new WeakMap<Rows, QueryResult<Row>>();

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

export interface NoSuchTableOrColumnError {
  readonly _tag: "NoSuchTableOrColumnError";
}

export const SqliteNoSuchTableOrColumnError = S.Struct({
  message: S.Union(
    S.String.pipe(S.includes("no such table")),
    S.String.pipe(S.includes("no such column")),
    S.String.pipe(S.includes("has no column")),
  ),
});
export type SqliteNoSuchTableOrColumnError = S.Schema.Type<
  typeof SqliteNoSuchTableOrColumnError
>;

export const sqliteDefectToNoSuchTableOrColumnError = Effect.catchSomeDefect(
  (error) =>
    S.is(SqliteNoSuchTableOrColumnError)(error)
      ? Option.some(
          Effect.fail<NoSuchTableOrColumnError>({
            _tag: "NoSuchTableOrColumnError",
          }),
        )
      : Option.none(),
);

export const init = (
  schema: DbSchema,
): Effect.Effect<Owner, never, Sqlite | Bip39 | NanoIdGenerator> =>
  Sqlite.pipe(
    Effect.flatMap((sqlite) => sqlite.exec(selectOwner)),
    Effect.map(
      ({ rows: [row] }): Owner => ({
        id: row.id as OwnerId,
        mnemonic: row.mnemonic as Mnemonic,
        encryptionKey: row.encryptionKey as Uint8Array,
      }),
    ),
    Effect.tap(ensureSchema(schema)),
    sqliteDefectToNoSuchTableOrColumnError,
    Effect.catchTag("NoSuchTableOrColumnError", () => lazyInit({ schema })),
  );

export const lazyInit = ({
  schema,
  mnemonic,
  isRestore,
}: {
  readonly schema: DbSchema;
  readonly mnemonic?: Mnemonic;
  readonly isRestore?: boolean;
}): Effect.Effect<Owner, never, Sqlite | Bip39 | NanoIdGenerator> =>
  Effect.logTrace("Db lazyInit").pipe(
    Effect.zipRight(
      Effect.all([makeOwner(mnemonic), Sqlite, makeInitialTimestamp]),
    ),
    Effect.tap(([owner, sqlite, initialTimestampString]) =>
      Effect.all([
        sqlite.exec(createMessageTable),
        sqlite.exec(createMessageTableIndex),
        sqlite.exec(createOwnerTable),
        sqlite.exec({
          ...insertOwner,
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
    Effect.tap(ensureSchema(schema)),
    Effect.tap(() => {
      if (!schema.initialData || isRestore) return;
      return Effect.logTrace("Db initialData").pipe(
        Effect.zipRight(applyMutations(schema.initialData)),
      );
    }),
    Effect.map(([owner]) => owner),
  );

const getSchema: Effect.Effect<DbSchema, never, Sqlite> = Effect.gen(
  function* (_) {
    const sqlite = yield* _(Sqlite);

    const tables = yield* _(
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
      Effect.map(({ rows }) => {
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
      }),
    );

    const indexes = yield* _(
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
      Effect.map((result) =>
        Array.map(
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
      ),
    );

    return { tables, indexes, initialData: [] };
  },
);

export const ensureSchema = (
  schema: DbSchema,
): Effect.Effect<void, never, Sqlite> =>
  Effect.gen(function* (_) {
    yield* _(Effect.logTrace("Db ensureSchema"));
    const sqlite = yield* _(Sqlite);
    const currentSchema = yield* _(getSchema);

    const sql: string[] = [];

    schema.tables.forEach((table) => {
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
        Array.differenceWith(String.Equivalence)(
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
    Array.differenceWith(indexEquivalence)(
      currentSchema.indexes || [],
      Array.intersectionWith(indexEquivalence)(
        currentSchema.indexes || [],
        schema.indexes || [],
      ),
    ).forEach((indexToDrop) => {
      sql.push(`drop index "${indexToDrop.name}";`);
    });

    // Add new indexes.
    Array.differenceWith(indexEquivalence)(
      schema.indexes || [],
      currentSchema.indexes || [],
    ).forEach((newIndex) => {
      sql.push(`${newIndex.sql};`);
    });

    if (sql.length > 0) yield* _(sqlite.exec({ sql: sql.join("\n") }));
  });

export const dropAllTables: Effect.Effect<void, never, Sqlite> = Effect.gen(
  function* (_) {
    yield* _(Effect.logTrace("Db dropAllTables"));
    const sqlite = yield* _(Sqlite);
    const schema = yield* _(getSchema);
    const sql = schema.tables
      // The dropped table is completely removed from the database schema and
      // the disk file. The table can not be recovered.
      // All indices and triggers associated with the table are also deleted.
      // https://sqlite.org/lang_droptable.html
      .map((table) => `drop table "${table.name}";`)
      .join("");
    yield* _(sqlite.exec({ sql }));
  },
);

export type RowsStoreState = ReadonlyMap<Query, Rows>;

export const makeRowsStore = makeStore<RowsStoreState>(new Map());

export const maybeExplainQueryPlan = (
  sqliteQuery: SqliteQuery,
): Effect.Effect<void, never, Sqlite> => {
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

export interface Mutation {
  readonly table: string;
  readonly id: Id;
  readonly values: Record.ReadonlyRecord<
    string,
    Value | Date | boolean | undefined
  >;
  readonly isInsert: boolean;
}

export interface NewMessage {
  readonly table: string;
  readonly row: Id;
  readonly column: string;
  readonly value: Value;
}

export interface Message extends NewMessage {
  readonly timestamp: TimestampString;
}

/** A table name starting with '_' (underscore) is local only (no sync). */
export const isLocalOnlyMutation: Predicate.Predicate<Mutation> = (mutation) =>
  mutation.table.startsWith("_");

export const isDeleteMutation: Predicate.Predicate<Mutation> = (mutation) =>
  mutationToNewMessages(mutation).some(
    ({ column, value }) => column === "isDeleted" && value === 1,
  );

export const applyMutations = (
  mutations: ReadonlyArray<Mutation>,
): Effect.Effect<
  void,
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampTimeOutOfRangeError,
  Config | Sqlite | Time
> =>
  Effect.gen(function* (_) {
    const { timestamp, merkleTree } = yield* _(getTimestampAndMerkleTree);
    const [nextTimestamp, messages] = yield* _(
      mutations.flatMap(mutationToNewMessages),
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
  });

export const mutationToNewMessages = (mutation: Mutation): NewMessage[] =>
  pipe(
    Object.entries(mutation.values),
    Array.filterMap(([column, value]) =>
      // The value can be undefined if exactOptionalPropertyTypes isn't true.
      // Don't insert nulls because null is the default value.
      value === undefined || (mutation.isInsert && value == null)
        ? Option.none()
        : Option.some([column, value] as const),
    ),
    Array.map(
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
    const tables = Array.fromIterable(tablesMap.values());
    yield* _(ensureSchema({ tables }));
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
  Effect.logDebug(["Db applyMessages", { merkleTree, messages }]).pipe(
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

export interface DbSchema {
  readonly tables: ReadonlyArray<Table>;
  readonly indexes?: ReadonlyArray<Index> | undefined;
  readonly initialData?: ReadonlyArray<Mutation> | undefined;
}

export const schemaToTables = (schema: S.Schema<any>): ReadonlyArray<Table> =>
  pipe(
    getPropertySignatures(schema),
    Record.toEntries,
    Array.map(
      ([name, schema]): Table => ({
        name,
        columns: Object.keys(getPropertySignatures(schema)),
      }),
    ),
  );

// TODO: https://discord.com/channels/795981131316985866/1218626687546294386/1218796529725476935
// https://github.com/Effect-TS/schema/releases/tag/v0.18.0
const getPropertySignatures = <I extends { [K in keyof A]: any }, A>(
  schema: S.Schema<A, I>,
): { [K in keyof A]: S.Schema<A[K], I[K]> } => {
  const out: Record<PropertyKey, S.Schema<any>> = {};
  const propertySignatures = AST.getPropertySignatures(schema.ast);
  for (let i = 0; i < propertySignatures.length; i++) {
    const propertySignature = propertySignatures[i];
    out[propertySignature.name] = make(propertySignature.type);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return out as any;
};

export interface Table {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

export const Index = S.Struct({
  name: S.String,
  sql: S.String,
});
export type Index = S.Schema.Type<typeof Index>;

export const indexEquivalence: Equivalence<Index> = (self, that) =>
  self.name === that.name && self.sql === that.sql;
