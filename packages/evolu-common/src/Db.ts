import * as AST from "@effect/schema/AST";
import * as S from "@effect/schema/Schema";
import { make } from "@effect/schema/Schema";
import { bytesToHex } from "@noble/ciphers/utils";
import * as Brand from "effect/Brand";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { pipe } from "effect/Function";
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
import { Bip39, Mnemonic, NanoId } from "./Crypto.js";
import { EvoluTypeError } from "./ErrorStore.js";
import { Id, SqliteBoolean, SqliteDate } from "./Model.js";
import { Owner, makeOwner } from "./Owner.js";
import {
  createMessageTable,
  createMessageTableIndex,
  createOwnerTable,
  insertOwner,
} from "./Sql.js";
import {
  JsonObjectOrArray,
  Sqlite,
  SqliteQuery,
  Value,
  isJsonObjectOrArray,
} from "./Sqlite.js";
import { Store, makeStore } from "./Store.js";

export type DatabaseSchema = ReadonlyRecord.ReadonlyRecord<TableSchema>;

type TableSchema = ReadonlyRecord.ReadonlyRecord<Value> & {
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
 *   type TodoId = S.Schema.To<typeof TodoId>;
 *
 *   const TodoTable = table({
 *     id: TodoId,
 *     title: NonEmptyString1000,
 *     isCompleted: S.nullable(SqliteBoolean),
 *   });
 *   type TodoTable = S.Schema.To<typeof TodoTable>;
 */
export const table = <Fields extends TableFields>(
  fields: Fields,
  // Because Schema is invariant, we have to do validation like this.
): ValidateFieldsTypes<Fields> extends true
  ? ValidateFieldsNames<Fields> extends true
    ? ValidateFieldsHasId<Fields> extends true
      ? S.Schema<
          Types.Simplify<
            S.ToStruct<Fields> & S.Schema.To<typeof ReservedColumns>
          >,
          Types.Simplify<
            S.FromStruct<Fields> & S.Schema.From<typeof ReservedColumns>
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
 *   type Database = S.Schema.To<typeof Database>;
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
}

// We use queries as keys, hence JSON.stringify.
export const serializeQuery = <R extends Row>({
  sql,
  parameters,
}: SqliteQuery): Query<R> => {
  const query: SerializedSqliteQuery = {
    sql,
    parameters: parameters.map((p) => {
      return Predicate.isUint8Array(p)
        ? Array.from(p)
        : isJsonObjectOrArray(p)
          ? { json: p }
          : p;
    }),
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

export type Row = ReadonlyRecord.ReadonlyRecord<
  | Value
  | Row // for jsonObjectFrom from kysely/helpers/sqlite
  | ReadonlyArray<Row> // for jsonArrayFrom from kysely/helpers/sqlite
>;

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

export type Tables = ReadonlyArray<Table>;

export interface Table {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

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

export const schemaToTables = (schema: S.Schema<any>): Tables =>
  pipe(
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
      sqlite.exec("BEGIN"),
      () => effect,
      (_, exit) =>
        Exit.isFailure(exit) ? sqlite.exec("ROLLBACK") : sqlite.exec("END"),
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
export type SqliteNoSuchTableOrColumnError = S.Schema.To<
  typeof SqliteNoSuchTableOrColumnError
>;

export const someDefectToNoSuchTableOrColumnError = Effect.catchSomeDefect(
  (error) =>
    S.is(SqliteNoSuchTableOrColumnError)(error)
      ? Option.some(
          Effect.fail<NoSuchTableOrColumnError>({
            _tag: "NoSuchTableOrColumnError",
          }),
        )
      : Option.none(),
);

export const lazyInit = (
  mnemonic?: Mnemonic,
): Effect.Effect<Owner, never, Sqlite | Bip39 | NanoId> =>
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
          sql: insertOwner,
          parameters: [
            owner.id,
            owner.mnemonic,
            // expo-sqlite 11.3.2 doesn't support Uint8Array
            bytesToHex(owner.encryptionKey),
            timestampToString(initialTimestampString),
            merkleTreeToString(initialMerkleTree),
          ],
        }),
      ]),
    );

    return owner;
  });

const getTables: Effect.Effect<
  ReadonlyArray<string>,
  never,
  Sqlite
> = Sqlite.pipe(
  Effect.flatMap((sqlite) =>
    sqlite.exec(`SELECT "name" FROM "sqlite_schema" WHERE "type" = 'table'`),
  ),
  Effect.map((result) => result.rows),
  Effect.map(ReadonlyArray.map((row) => (row.name as string) + "")),
  Effect.map(ReadonlyArray.filter(Predicate.not(String.startsWith("__")))),
  Effect.map(ReadonlyArray.dedupeWith(String.Equivalence)),
);

const updateTable = ({
  name,
  columns,
}: Table): Effect.Effect<void, never, Sqlite> =>
  Effect.gen(function* (_) {
    const sqlite = yield* _(Sqlite);
    const sql = yield* _(
      sqlite.exec(`PRAGMA table_info (${name})`),
      Effect.map((result) => result.rows),
      Effect.map(ReadonlyArray.map((row) => row.name as string)),
      Effect.map((existingColumns) =>
        ReadonlyArray.differenceWith(String.Equivalence)(existingColumns)(
          columns,
        ),
      ),
      Effect.map(
        ReadonlyArray.map(
          (newColumn) =>
            `ALTER TABLE "${name}" ADD COLUMN "${newColumn}" blob;`,
        ),
      ),
      Effect.map(ReadonlyArray.join("")),
    );
    if (sql) yield* _(sqlite.exec(sql));
  });

const createTable = ({
  name,
  columns,
}: Table): Effect.Effect<void, never, Sqlite> =>
  Effect.flatMap(Sqlite, (sqlite) =>
    sqlite.exec(`
      CREATE TABLE ${name} (
        "id" text primary key,
        ${columns
          .filter((c) => c !== "id")
          // "A column with affinity BLOB does not prefer one storage class over another
          // and no attempt is made to coerce data from one storage class into another."
          // https://www.sqlite.org/datatype3.html
          .map((name) => `"${name}" blob`)
          .join(", ")}
      );
    `),
  );

export const ensureSchema = (
  tables: Tables,
): Effect.Effect<void, never, Sqlite> =>
  Effect.flatMap(getTables, (existingTables) =>
    Effect.forEach(
      tables,
      (tableDefinition) =>
        existingTables.includes(tableDefinition.name)
          ? updateTable(tableDefinition)
          : createTable(tableDefinition),
      { discard: true },
    ),
  );

export type RowsStore = Store<RowsStoreValue>;
export const RowsStore = Context.GenericTag<RowsStore>("@services/RowsStore");

type RowsStoreValue = ReadonlyMap<Query, ReadonlyArray<Row>>;

export const RowsStoreLive = Layer.effect(
  RowsStore,
  makeStore<RowsStoreValue>(new Map()),
);
