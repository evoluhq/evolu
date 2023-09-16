import * as AST from "@effect/schema/AST";
import * as S from "@effect/schema/Schema";
import { make } from "@effect/schema/Schema";
import { bytesToHex } from "@noble/ciphers/utils";
import {
  Brand,
  Context,
  Effect,
  Exit,
  Option,
  Predicate,
  ReadonlyArray,
  ReadonlyRecord,
  String,
  pipe,
} from "effect";
import * as Kysely from "kysely";
import { urlAlphabet } from "nanoid";
import { Bip39, Mnemonic, NanoId, slip21Derive } from "./Crypto.js";
import { initialMerkleTree, merkleTreeToString } from "./MerkleTree.js";
import { Id, SqliteBoolean, SqliteDate } from "./Model.js";
import {
  createMessageTable,
  createMessageTableIndex,
  createOwnerTable,
  insertOwner,
} from "./Sql.js";
import {
  JsonObjectOrArray,
  Query,
  QueryObject,
  Row,
  Sqlite,
  Value,
  queryObjectToQuery,
} from "./Sqlite.js";
import { makeInitialTimestamp, timestampToString } from "./Timestamp.js";

export type Schema = ReadonlyRecord.ReadonlyRecord<
  // musim to bejt objekt kterej ma value Value nebo
  { id: Id } & ReadonlyRecord.ReadonlyRecord<Value | JsonObjectOrArray>
  // { id: Id } & Row & ReadonlyRecord.ReadonlyRecord<JsonObjectOrArray>
>;

export type CreateQuery<S extends Schema> = (
  queryCallback: QueryCallback<S, Row>,
) => Query;

export type QueryCallback<S extends Schema, QueryRow> = (
  db: KyselyWithoutMutation<SchemaForQuery<S>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Kysely.SelectQueryBuilder<any, any, QueryRow>;

type KyselyWithoutMutation<DB> = Pick<Kysely.Kysely<DB>, "selectFrom" | "fn">;

type SchemaForQuery<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & CommonColumns
  >;
};

export type NullableExceptOfId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

export interface CommonColumns {
  readonly createdAt: SqliteDate;
  readonly updatedAt: SqliteDate;
  readonly isDeleted: SqliteBoolean;
}

export interface Table {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

export type Tables = ReadonlyArray<Table>;

const commonColumns = ["createdAt", "updatedAt", "isDeleted"];

const kysely: Kysely.Kysely<SchemaForQuery<Schema>> = new Kysely.Kysely({
  dialect: {
    createAdapter: () => new Kysely.SqliteAdapter(),
    createDriver: () => new Kysely.DummyDriver(),
    createIntrospector(): Kysely.DatabaseIntrospector {
      throw "Not implemeneted";
    },
    createQueryCompiler: () => new Kysely.SqliteQueryCompiler(),
  },
});

export const makeCreateQuery =
  <T extends Schema>(): CreateQuery<T> =>
  (queryCallback) =>
    queryObjectToQuery(queryCallback(kysely as never).compile() as QueryObject);

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

/**
 * `Owner` represents the Evolu database owner. Evolu auto-generates `Owner`
 * on the first run. `Owner` can be reset on the current device and restored
 * on a different one.
 */
export interface Owner {
  /** The `Mnemonic` associated with `Owner`. */
  readonly mnemonic: Mnemonic;
  /** The unique identifier of `Owner` safely derived from its `Mnemonic`. */
  readonly id: OwnerId;
  /* The encryption key used by `Owner` derived from its `Mnemonic`. */
  readonly encryptionKey: Uint8Array;
}

export const Owner = Context.Tag<Owner>("evolu/Owner");

/**
 * The unique identifier of `Owner` safely derived from its `Mnemonic`.
 */
export type OwnerId = Id & Brand.Brand<"Owner">;

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

export const someDefectToNoSuchTableOrColumnError = Effect.catchSomeDefect(
  (error) => {
    if (
      typeof error === "object" &&
      error != null &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.includes("code 1") &&
      (error.message.includes("no such table") ||
        error.message.includes("no such column") ||
        error.message.includes("has no column"))
    )
      return Option.some(
        Effect.fail<NoSuchTableOrColumnError>({
          _tag: "NoSuchTableOrColumnError",
        }),
      );

    return Option.none();
  },
);

export const makeOwner = (
  mnemonic?: Mnemonic,
): Effect.Effect<Bip39, never, Owner> =>
  Effect.gen(function* (_) {
    const bip39 = yield* _(Bip39);

    if (mnemonic == null) mnemonic = yield* _(bip39.make);

    const seed = yield* _(bip39.toSeed(mnemonic));

    const id = yield* _(
      slip21Derive(seed, ["Evolu", "Owner Id"]).pipe(
        Effect.map((key) => {
          // convert key to nanoid
          let id = "";
          for (let i = 0; i < 21; i++) {
            id += urlAlphabet[key[i] & 63];
          }
          return id as OwnerId;
        }),
      ),
    );

    const encryptionKey = yield* _(
      slip21Derive(seed, ["Evolu", "Encryption Key"]),
    );

    return { mnemonic, id, encryptionKey };
  });

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
