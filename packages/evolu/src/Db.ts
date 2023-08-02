import * as AST from "@effect/schema/AST";
import * as S from "@effect/schema/Schema";
import { make } from "@effect/schema/Schema";
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
import { urlAlphabet } from "nanoid";
import {
  Bip39,
  Hmac,
  Mnemonic,
  NanoId,
  Sha512,
  slip21Derive,
} from "./Crypto.js";
import { initialMerkleTree, merkleTreeToString } from "./MerkleTree.js";
import { Id, SqliteBoolean, SqliteDate } from "./Model.js";
import { initDb, selectOwner } from "./Sql.js";
import { makeInitialTimestamp, timestampToString } from "./Timestamp.js";

export interface Db {
  readonly exec: (
    arg: string | QueryObject
  ) => Effect.Effect<never, never, ReadonlyArray<Row>>;

  readonly changes: Effect.Effect<never, never, number>;
}

export const Db = Context.Tag<Db>("evolu/Db");

export interface NoSuchTableOrColumnError {
  readonly _tag: "NoSuchTableOrColumnError";
  readonly what: "table" | "column";
  readonly name: string;
}

export interface QueryObject {
  readonly sql: string;
  readonly parameters: ReadonlyArray<Value>;
}

export type Query = string & Brand.Brand<"Query">;

export const queryObjectToQuery = ({ sql, parameters }: QueryObject): Query =>
  JSON.stringify({ sql, parameters }) as Query;

export const queryObjectFromQuery = (s: Query): QueryObject =>
  JSON.parse(s) as QueryObject;

export type Value = null | string | number | Uint8Array;

export type Row = ReadonlyRecord.ReadonlyRecord<Value>;

export type Schema = ReadonlyRecord.ReadonlyRecord<{ id: Id } & Row>;

export interface CommonColumns {
  readonly createdAt: SqliteDate;
  readonly createdBy: OwnerId;
  readonly updatedAt: SqliteDate;
  readonly isDeleted: SqliteBoolean;
}

const commonColumns = ["createdAt", "createdBy", "updatedAt", "isDeleted"];

export interface Table {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

// https://github.com/Effect-TS/schema/releases/tag/v0.18.0
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getPropertySignatures = <I extends { [K in keyof A]: any }, A>(
  schema: S.Schema<I, A>
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
  schema: S.Schema<any, any>
): ReadonlyArray<Table> =>
  pipe(
    getPropertySignatures(schema),
    ReadonlyRecord.toEntries,
    ReadonlyArray.map(
      ([name, schema]): Table => ({
        name,
        columns: Object.keys(getPropertySignatures(schema)).concat(
          commonColumns
        ),
      })
    )
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
  effect: Effect.Effect<R, E, A>
): Effect.Effect<Db | R, E, A> =>
  Effect.flatMap(Db, (db) =>
    Effect.acquireUseRelease(
      db.exec("BEGIN"),
      () => effect,
      (_, exit) =>
        Exit.isFailure(exit) ? db.exec("ROLLBACK") : db.exec("COMMIT")
    )
  );

export const defectToNoSuchTableOrColumnError = Effect.catchSomeDefect(
  (error) => {
    if (
      typeof error === "object" &&
      error != null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      const match = error.message.match(
        /sqlite3 result code 1: no such (table|column): (\S+)/
      );
      if (
        match &&
        (match[1] === "table" || match[1] === "column") &&
        typeof match[2] === "string"
      )
        return Option.some(
          Effect.fail<NoSuchTableOrColumnError>({
            _tag: "NoSuchTableOrColumnError",
            what: match[1],
            name: match[2],
          })
        );
    }

    return Option.none();
  }
);

export const makeOwner = (
  mnemonic?: Mnemonic
): Effect.Effect<Bip39 | Hmac | Sha512, never, Owner> =>
  Effect.gen(function* (_) {
    const bip39 = yield* _(Bip39);
    if (mnemonic == null) mnemonic = yield* _(bip39.makeMnemonic);
    const seed = yield* _(bip39.mnemonicToSeed(mnemonic));
    const id = yield* _(
      slip21Derive(seed, ["Evolu", "Owner Id"]).pipe(
        Effect.map((key) => {
          // convert key to nanoid
          let id = "";
          for (let i = 0; i < 21; i++) {
            id += urlAlphabet[key[i] & 63];
          }
          return id as OwnerId;
        })
      )
    );
    const encryptionKey = yield* _(
      slip21Derive(seed, ["Evolu", "Encryption Key"])
    );
    return { mnemonic, id, encryptionKey };
  });

const lazyInit = (
  mnemonic?: Mnemonic
): Effect.Effect<Db | Bip39 | Hmac | Sha512 | NanoId, never, Owner> =>
  Effect.all(
    [
      Db,
      makeOwner(mnemonic),
      makeInitialTimestamp.pipe(Effect.map(timestampToString)),
      Effect.succeed(merkleTreeToString(initialMerkleTree)),
    ],
    { concurrency: "unbounded" }
  ).pipe(
    Effect.tap(([db, owner, initialTimestamp, initialMerkleTree]) =>
      db.exec({
        sql: initDb(initialTimestamp, initialMerkleTree),
        parameters: [owner.mnemonic, owner.id, owner.encryptionKey],
      })
    ),
    Effect.map(([, owner]) => owner)
  );

const getOwner = Db.pipe(
  Effect.flatMap((db) => db.exec(selectOwner)),
  Effect.map(([owner]) => owner as unknown as Owner)
);

export const init = getOwner.pipe(
  defectToNoSuchTableOrColumnError,
  Effect.catchTag("NoSuchTableOrColumnError", () => lazyInit())
);

const getTables: Effect.Effect<Db, never, ReadonlyArray<string>> = Db.pipe(
  Effect.flatMap((db) =>
    db.exec(`SELECT "name" FROM "sqlite_schema" WHERE "type" = 'table'`)
  ),
  Effect.map(ReadonlyArray.map((row) => (row.name as string) + "")),
  Effect.map(ReadonlyArray.filter(Predicate.not(String.startsWith("__")))),
  Effect.map(ReadonlyArray.dedupeWith(String.Equivalence))
);

const updateTable = ({
  name,
  columns,
}: Table): Effect.Effect<Db, never, void> =>
  Effect.gen(function* ($) {
    const db = yield* $(Db);
    const sql = yield* $(
      db.exec(`PRAGMA table_info (${name})`),
      Effect.map(ReadonlyArray.map((row) => row.name as string)),
      Effect.map((existingColumns) =>
        ReadonlyArray.differenceWith(String.Equivalence)(existingColumns)(
          columns
        )
      ),
      Effect.map(
        ReadonlyArray.map(
          (newColumn) => `ALTER TABLE "${name}" ADD COLUMN "${newColumn}" blob;`
        )
      ),
      Effect.map(ReadonlyArray.join(""))
    );
    if (sql) yield* $(db.exec(sql));
  });

const createTable = ({
  name,
  columns,
}: Table): Effect.Effect<Db, never, void> =>
  Effect.flatMap(Db, (db) =>
    db.exec(`
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
    `)
  );

export const ensureSchema = (
  tables: ReadonlyArray<Table>
): Effect.Effect<Db, never, void> =>
  Effect.flatMap(getTables, (existingTables) =>
    Effect.forEach(
      tables,
      (tableDefinition) =>
        existingTables.includes(tableDefinition.name)
          ? updateTable(tableDefinition)
          : createTable(tableDefinition),
      { discard: true }
    )
  );
