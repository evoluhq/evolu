import { flow, pipe } from "@effect/data/Function";
import * as Predicate from "@effect/data/Predicate";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as ReadonlyRecord from "@effect/data/ReadonlyRecord";
import * as String from "@effect/data/String";
import * as Effect from "@effect/io/Effect";
import * as S from "@effect/schema/Schema";
import {
  CommonColumns,
  Db,
  Message,
  TableDefinition,
  TablesDefinitions,
} from "./Types.js";

// To get commonColumns array.
export const commonColumnsObject: {
  [K in keyof CommonColumns]: null;
} = { createdAt: null, createdBy: null, updatedAt: null, isDeleted: null };

const commonColumns = Object.keys(commonColumnsObject);

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

const getTables: Effect.Effect<Db, never, ReadonlyArray<string>> = pipe(
  Effect.flatMap(Db, (db) =>
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
}: TableDefinition): Effect.Effect<Db, never, void> =>
  Effect.gen(function* ($) {
    const db = yield* $(Db);
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
}: TableDefinition): Effect.Effect<Db, never, void> =>
  Effect.flatMap(Db, (db) =>
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

export const updateSchema = (
  tablesDefinitions: TablesDefinitions
): Effect.Effect<Db, never, void> =>
  Effect.flatMap(getTables, (tables) =>
    Effect.forEachDiscard(tablesDefinitions, (tableDefinition) =>
      tables.includes(tableDefinition.name)
        ? updateTable(tableDefinition)
        : createTable(tableDefinition)
    )
  );

export const ensureSchema: (
  messages: ReadonlyArray.NonEmptyReadonlyArray<Message>
) => Effect.Effect<Db, never, void> = flow(
  ReadonlyArray.reduce(
    Object.create(null) as Record<string, Record<string, null>>,
    (record, { table, column }) => ({
      ...record,
      [table]: { ...record[table], [column]: null },
    })
  ),
  (record) =>
    Object.entries(record).map(
      ([name, columns]): TableDefinition => ({
        name,
        columns: Object.keys(columns),
      })
    ),
  updateSchema
);
