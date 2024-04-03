import * as AST from "@effect/schema/AST";
import * as S from "@effect/schema/Schema";
import { make } from "@effect/schema/Schema";
import * as Brand from "effect/Brand";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Function from "effect/Function";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as ReadonlyArray from "effect/ReadonlyArray";
import * as ReadonlyRecord from "effect/ReadonlyRecord";
import * as String from "effect/String";
import * as Types from "effect/Types";
import * as Kysely from "kysely";
import {
  initialMerkleTree,
  makeInitialTimestamp,
  merkleTreeToString,
  timestampToString,
} from "./Crdt.js";
import { Bip39, Mnemonic, NanoIdGenerator } from "./Crypto.js";
import { EvoluTypeError } from "./ErrorStore.js";
import { Id, SqliteBoolean, SqliteDate } from "./Model.js";
import { Owner, OwnerId, makeOwner } from "./Owner.js";
import {
  createMessageTable,
  createMessageTableIndex,
  createOwnerTable,
  insertOwner,
  selectOwner,
} from "./Sql.js";
import {
  Index,
  JsonObjectOrArray,
  Sqlite,
  SqliteQuery,
  SqliteQueryOptions,
  SqliteQueryPlanRow,
  SqliteSchema,
  Table,
  Value,
  drawSqliteQueryPlan,
  indexEquivalence,
  isJsonObjectOrArray,
} from "./Sqlite.js";
import { Store, makeStore } from "./Store.js";

export type DatabaseSchema = ReadonlyRecord.ReadonlyRecord<string, TableSchema>;

type TableSchema = ReadonlyRecord.ReadonlyRecord<string, Value> & {
  readonly id: Id;
};

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
  S.struct(fields).pipe(S.extend(ReservedColumns)) as never;

const ReservedColumns = S.struct({
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
export const database = S.struct;

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
        ? Array.from(p)
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
    | ReadonlyArray<Row>; // for jsonArrayFrom from kysely/helpers/sqlite
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

export type QueryResultsFromQueries<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<infer R> ? QueryResult<R> : never;
};

export type QueryResultsPromisesFromQueries<Q extends Queries> = {
  [P in keyof Q]: Q[P] extends Query<infer R> ? Promise<QueryResult<R>> : never;
};

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

export const schemaToTables = (schema: S.Schema<any>): ReadonlyArray<Table> =>
  Function.pipe(
    getPropertySignatures(schema),
    ReadonlyRecord.toEntries,
    ReadonlyArray.map(
      ([name, schema]): Table => ({
        name,
        columns: Object.keys(getPropertySignatures(schema)),
      }),
    ),
  );

export const transaction = <R, E, A>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Sqlite | R> =>
  Effect.flatMap(Sqlite, (sqlite) =>
    Effect.acquireUseRelease(
      sqlite.exec({ sql: "begin" }),
      () => effect,
      (_, exit) =>
        Exit.isFailure(exit)
          ? sqlite.exec({ sql: "rollback" })
          : sqlite.exec({ sql: "end" }),
    ),
  );

export interface NoSuchTableOrColumnError {
  readonly _tag: "NoSuchTableOrColumnError";
}

export const SqliteNoSuchTableOrColumnError = S.struct({
  message: S.union(
    S.string.pipe(S.includes("no such table")),
    S.string.pipe(S.includes("no such column")),
    S.string.pipe(S.includes("has no column")),
  ),
});
export type SqliteNoSuchTableOrColumnError = S.Schema.Type<
  typeof SqliteNoSuchTableOrColumnError
>;

export const ensureDbSchemaWithOwner = Effect.gen(function* (_) {
  const sqlite = yield* _(Sqlite);

  return yield* _(
    sqlite.exec(selectOwner),
    Effect.map(
      ({ rows: [row] }): Owner => ({
        id: row.id as OwnerId,
        mnemonic: row.mnemonic as Mnemonic,
        encryptionKey: row.encryptionKey as Uint8Array,
      }),
    ),
    sqliteDefectToNoSuchTableOrColumnError,
    Effect.catchTag("NoSuchTableOrColumnError", () =>
      createDbSchemaWithOwner(),
    ),
  );
});

const sqliteDefectToNoSuchTableOrColumnError = Effect.catchSomeDefect(
  (error) =>
    S.is(SqliteNoSuchTableOrColumnError)(error)
      ? Option.some(
          Effect.fail<NoSuchTableOrColumnError>({
            _tag: "NoSuchTableOrColumnError",
          }),
        )
      : Option.none(),
);

export const createDbSchemaWithOwner = (
  mnemonic?: Mnemonic,
): Effect.Effect<Owner, never, Sqlite | Bip39 | NanoIdGenerator> =>
  Effect.gen(function* (_) {
    const [owner, sqlite, initialTimestampString] = yield* _(
      Effect.all([makeOwner(mnemonic), Sqlite, makeInitialTimestamp], {
        concurrency: "unbounded",
      }),
    );

    yield* _(
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
    );

    return owner;
  });

const getSchema: Effect.Effect<SqliteSchema, never, Sqlite> = Effect.gen(
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
        return Array.from(map, ([name, columns]) => ({
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
        ReadonlyArray.map(
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

    return { tables, indexes };
  },
);

export const ensureSchema = (
  schema: SqliteSchema,
): Effect.Effect<void, never, Sqlite> =>
  Effect.gen(function* (_) {
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
        ReadonlyArray.differenceWith(String.Equivalence)(
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
    ReadonlyArray.differenceWith(indexEquivalence)(
      currentSchema.indexes,
      ReadonlyArray.intersectionWith(indexEquivalence)(
        currentSchema.indexes,
        schema.indexes,
      ),
    ).forEach((indexToDrop) => {
      sql.push(`drop index "${indexToDrop.name}";`);
    });

    // Add new indexes.
    ReadonlyArray.differenceWith(indexEquivalence)(
      schema.indexes,
      currentSchema.indexes,
    ).forEach((newIndex) => {
      sql.push(`${newIndex.sql};`);
    });

    if (sql.length > 0)
      yield* _(
        sqlite.exec({
          sql: sql.join("\n"),
        }),
      );
  });

export const dropAllTables: Effect.Effect<void, never, Sqlite> = Effect.gen(
  function* (_) {
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

export type RowsStore = Store<RowsStoreValue>;
export const RowsStore = Context.GenericTag<RowsStore>("@services/RowsStore");

type RowsStoreValue = ReadonlyMap<Query, ReadonlyArray<Row>>;

export const RowsStoreLive = Layer.effect(
  RowsStore,
  makeStore<RowsStoreValue>(new Map()),
);

export const maybeExplainQueryPlan = (
  sqliteQuery: SqliteQuery,
): Effect.Effect<void, never, Sqlite> => {
  if (!sqliteQuery.options?.logExplainQueryPlan) return Effect.unit;
  return Sqlite.pipe(
    Effect.flatMap((sqlite) =>
      sqlite.exec({
        ...sqliteQuery,
        sql: `EXPLAIN QUERY PLAN ${sqliteQuery.sql}`,
      }),
    ),
    // TODO: Use new Effect log variadic
    Effect.tap(() => Effect.log("ExplainQueryPlan")),
    Effect.tap(({ rows }) => {
      // Not using Effect.log because of formating
      // eslint-disable-next-line no-console
      console.log(drawSqliteQueryPlan(rows as SqliteQueryPlanRow[]));
    }),
    Effect.map(Function.constVoid),
  );
};
