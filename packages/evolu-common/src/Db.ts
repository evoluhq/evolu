import * as AST from "@effect/schema/AST";
import * as S from "@effect/schema/Schema";
import { make } from "@effect/schema/Schema";
import { bytesToHex } from "@noble/ciphers/utils";
import {
  Brand,
  Context,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  ReadonlyArray,
  ReadonlyRecord,
  String,
  pipe,
} from "effect";
import * as Kysely from "kysely";
import {
  initialMerkleTree,
  makeInitialTimestamp,
  merkleTreeToString,
  timestampToString,
} from "./Crdt.js";
import { Bip39, Mnemonic, NanoId } from "./Crypto.js";
import { Id } from "./Model.js";
import { Owner, makeOwner } from "./Owner.js";
import {
  createMessageTable,
  createMessageTableIndex,
  createOwnerTable,
  insertOwner,
} from "./Sql.js";
import { Sqlite, SqliteQuery, SqliteValue } from "./Sqlite.js";
import { Store, makeStore } from "./Store.js";

export type Schema = ReadonlyRecord.ReadonlyRecord<TableSchema>;

export type TableSchema = ReadonlyRecord.ReadonlyRecord<Value> & {
  readonly id: Id;
};

export type Value = SqliteValue | JsonObjectOrArray;

export type JsonObjectOrArray = JsonObject | JsonArray;

type JsonObject = ReadonlyRecord.ReadonlyRecord<Json>;
type JsonArray = ReadonlyArray<Json>;
type Json = string | number | boolean | null | JsonObject | JsonArray;

export const isJsonObjectOrArray: Predicate.Refinement<
  Value,
  JsonObjectOrArray
> = (value): value is JsonObjectOrArray =>
  value !== null && typeof value === "object" && !(value instanceof Uint8Array);

export const valuesToSqliteValues = (
  values: ReadonlyArray<Value>,
): SqliteValue[] =>
  values.map((value) =>
    isJsonObjectOrArray(value) ? JSON.stringify(value) : value,
  );

export type Query<R extends Row = Row> = string & Brand.Brand<"Query"> & R;

export const queryFromSqliteQuery = <R extends Row>({
  sql,
  parameters,
}: SqliteQuery): Query<R> => JSON.stringify({ sql, parameters }) as Query<R>;

export const queryToSqliteQuery = <R extends Row>(
  query: Query<R>,
): SqliteQuery => JSON.parse(query) as SqliteQuery;

export type Row = ReadonlyRecord.ReadonlyRecord<
  | Value
  | Row // for jsonObjectFrom from kysely/helpers/sqlite
  | ReadonlyArray<Row> // for jsonArrayFrom from kysely/helpers/sqlite
>;

export const emptyRows: ReadonlyArray<Row> = [];

export interface QueryResult<R extends Row> {
  readonly rows: ReadonlyArray<Readonly<Kysely.Simplify<R>>>;
  readonly firstRow: Readonly<Kysely.Simplify<R>> | null;
}

export const queryResultFromRows = <R extends Row>(
  rows: ReadonlyArray<R>,
): QueryResult<R> => ({ rows, firstRow: rows[0] });

export type Tables = ReadonlyArray<Table>;

export interface Table {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

// https://github.com/Effect-TS/schema/releases/tag/v0.18.0
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getPropertySignatures = <I extends { [K in keyof A]: any }, A>(
  schema: S.Schema<I, A>,
): { [K in keyof A]: S.Schema<I[K], A[K]> } => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<PropertyKey, S.Schema<any>> = {};
  const propertySignatures = AST.getPropertySignatures(schema.ast);
  for (let i = 0; i < propertySignatures.length; i++) {
    const propertySignature = propertySignatures[i];
    out[propertySignature.name] = make(propertySignature.type);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
  return out as any;
};

const commonColumns = ["createdAt", "updatedAt", "isDeleted"];

export const schemaToTables = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: S.Schema<any, any>,
): Tables =>
  pipe(
    getPropertySignatures(schema),
    ReadonlyRecord.toEntries,
    ReadonlyArray.map(
      ([name, schema]): Table => ({
        name,
        columns: Object.keys(getPropertySignatures(schema)).concat(
          commonColumns,
        ),
      }),
    ),
  );

export const transaction = <R, E, A>(
  effect: Effect.Effect<R, E, A>,
): Effect.Effect<Sqlite | R, E, A> =>
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
): Effect.Effect<Sqlite | Bip39 | NanoId, never, Owner> =>
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
  Sqlite,
  never,
  ReadonlyArray<string>
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
}: Table): Effect.Effect<Sqlite, never, void> =>
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
}: Table): Effect.Effect<Sqlite, never, void> =>
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
): Effect.Effect<Sqlite, never, void> =>
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
export const RowsStore = Context.Tag<RowsStore>();

type RowsStoreValue = ReadonlyMap<Query, ReadonlyArray<Row>>;

export const RowsStoreLive = Layer.effect(
  RowsStore,
  makeStore<RowsStoreValue>(() => new Map()),
);
