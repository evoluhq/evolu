import * as ReadonlyRecord from "@effect/data/ReadonlyRecord";
import * as String from "@effect/data/String";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Predicate from "@effect/data/Predicate";
import { Simplify } from "kysely";
import * as Model from "./Model.js";
import * as Owner from "./Owner.js";
import * as Db from "./Db.js";
import * as S from "@effect/schema/Schema";
import { flow, pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";

export type Schema = ReadonlyRecord.ReadonlyRecord<
  { id: Model.Id } & Record<string, Db.Value>
>;

type NullableExceptOfId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

interface CommonColumns {
  readonly createdAt: Model.SqliteDate;
  readonly createdBy: Owner.Id;
  readonly updatedAt: Model.SqliteDate;
  readonly isDeleted: Model.SqliteBoolean;
}

const commonColumns = ["createdAt", "createdBy", "updatedAt", "isDeleted"];

type SchemaForMutate<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & Pick<CommonColumns, "isDeleted">
  >;
};

export type AllowAutoCasting<T> = {
  readonly [K in keyof T]: T[K] extends Model.SqliteBoolean
    ? boolean | Model.SqliteBoolean
    : T[K] extends null | Model.SqliteBoolean
    ? null | boolean | Model.SqliteBoolean
    : T[K] extends Model.SqliteDate
    ? Date | Model.SqliteDate
    : T[K] extends null | Model.SqliteDate
    ? null | Date | Model.SqliteDate
    : T[K];
};

export type Mutate<S extends Schema> = <
  U extends SchemaForMutate<S>,
  T extends keyof U
>(
  table: T,
  values: Simplify<Partial<AllowAutoCasting<U[T]>>>,
  onComplete?: () => void
) => {
  readonly id: U[T]["id"];
};

// https://stackoverflow.com/a/54713648/233902
type NullablePartial<
  T,
  NK extends keyof T = {
    [K in keyof T]: null extends T[K] ? K : never;
  }[keyof T],
  NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>
> = { [K in keyof NP]: NP[K] };

export type Create<S extends Schema> = <T extends keyof S>(
  table: T,
  values: Simplify<NullablePartial<AllowAutoCasting<Omit<S[T], "id">>>>,
  onComplete?: () => void
) => {
  readonly id: S[T]["id"];
};

export type Update<S extends Schema> = <T extends keyof S>(
  table: T,
  values: Simplify<
    Partial<
      AllowAutoCasting<Omit<S[T], "id"> & Pick<CommonColumns, "isDeleted">>
    > & { id: S[T]["id"] }
  >,
  onComplete?: () => void
) => {
  readonly id: S[T]["id"];
};

export type SchemaForQuery<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & CommonColumns
  >;
};

export interface TableDefinition {
  readonly name: string;
  readonly columns: ReadonlyArray<string>;
}

export type TablesDefinitions = ReadonlyArray<TableDefinition>;

export const schemaToTablesDefinitions = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: S.Schema<any, any>
): TablesDefinitions =>
  pipe(
    S.getPropertySignatures(schema),
    ReadonlyRecord.toEntries,
    ReadonlyArray.map(
      ([name, schema]): TableDefinition => ({
        name,
        columns: Object.keys(S.getPropertySignatures(schema)).concat(
          commonColumns
        ),
      })
    )
  );

const getExistingTables: Effect.Effect<
  Db.Db,
  never,
  ReadonlyArray<string>
> = pipe(
  Effect.flatMap(Db.Db, (db) =>
    db.exec(`select "name" from sqlite_schema where type='table'`)
  ),
  Effect.map(
    flow(
      ReadonlyArray.map((row) => row.name + ""),
      ReadonlyArray.filter(Predicate.not(String.startsWith("__"))),
      ReadonlyArray.uniq(String.Equivalence)
    )
  )
);

const updateTable = ({
  name,
  columns,
}: TableDefinition): Effect.Effect<Db.Db, never, void> =>
  Effect.gen(function* ($) {
    const db = yield* $(Db.Db);
    const sql = yield* $(
      db.exec(`pragma table_info (${name})`),
      Effect.map(ReadonlyArray.map((row) => row.name as string)),
      Effect.map((existingColumns) =>
        ReadonlyArray.difference(String.Equivalence)(existingColumns)(columns)
      ),
      Effect.map(
        ReadonlyArray.map(
          (newColumn) => `alter table "${name}" add column "${newColumn}" blob;`
        )
      ),
      Effect.map(ReadonlyArray.join(""))
    );
    if (sql) yield* $(db.exec(sql));
  });

const createTable = ({
  name,
  columns,
}: TableDefinition): Effect.Effect<Db.Db, never, void> =>
  Effect.flatMap(Db.Db, (db) =>
    db.exec(`
      create table ${name} (
        "id" text primary key,
        ${columns
          .filter((c) => c !== "id")
          // "A column with affinity BLOB does not prefer one storage class over another
          // and no attempt is made to coerce data from one storage class into another."
          // https://www.sqlite.org/datatype3.html
          .map((name) => `"${name}" blob`)
          .join(", ")}
      ) without rowid;
    `)
  );

export const updateDbSchema = (
  tablesDefinitions: TablesDefinitions
): Effect.Effect<Db.Db, never, void> =>
  Effect.flatMap(getExistingTables, (existingTables) =>
    Effect.forEachDiscard(tablesDefinitions, (tableDefinition) =>
      existingTables.includes(tableDefinition.name)
        ? updateTable(tableDefinition)
        : createTable(tableDefinition)
    )
  );
