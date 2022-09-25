import {
  predicate,
  readerTaskEither,
  readonlyArray,
  string,
  taskEither,
} from "fp-ts";
import { constVoid, flow, pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { DbEnv, TableDefinition, UnknownError } from "./types.js";

export const getExistingTables: ReaderTaskEither<
  DbEnv,
  UnknownError,
  ReadonlySet<string>
> = ({ db }) =>
  pipe(
    db.exec(`
      SELECT "name" FROM sqlite_schema WHERE type='table'
    `),
    taskEither.map(
      flow(
        readonlyArray.map((row) => row[0] + ""),
        readonlyArray.filter(predicate.not(string.startsWith("__"))),
        (a) => new Set(a)
      )
    )
  );

const updateTable =
  ({
    name,
    columns,
  }: TableDefinition): ReaderTaskEither<DbEnv, UnknownError, void> =>
  ({ db }) =>
    pipe(
      db.exec(`
        PRAGMA table_info (${name})
      `),
      taskEither.map(
        flow(
          readonlyArray.map((a) => a[1] as string),
          (existingColumns) =>
            readonlyArray.difference(string.Eq)(existingColumns)(columns)
        )
      ),
      taskEither.chain((newColumns) =>
        !newColumns.length
          ? taskEither.right(readonlyArray.empty)
          : pipe(
              newColumns.map(
                (column) => `ALTER TABLE "${name}" ADD COLUMN "${column}" BLOB;`
              ),
              (a) => a.join(""),
              db.exec
            )
      ),
      taskEither.map(constVoid)
    );

const createTable =
  ({
    name,
    columns,
  }: TableDefinition): ReaderTaskEither<DbEnv, UnknownError, void> =>
  ({ db }) =>
    pipe(
      db.exec(`
        CREATE TABLE ${name} (
          "id" TEXT PRIMARY KEY,
          ${columns
            // Some people hate SQLite general dynamic type system.
            // Some people love new SQLite strict tables.
            // For Evolu, the BLOB behavior is the best.
            // "A column with affinity BLOB does not prefer one storage class over another
            // and no attempt is made to coerce data from one storage class into another."
            // https://www.sqlite.org/datatype3.html
            .map((name) => `"${name}" BLOB`)
            .join(", ")}
        );
      `),
      taskEither.map(constVoid)
    );

export const updateDbSchema = ({
  tableDefinitions,
}: {
  readonly tableDefinitions: readonly TableDefinition[];
}): ReaderTaskEither<DbEnv, UnknownError, void> =>
  pipe(
    getExistingTables,
    readerTaskEither.chain((existingTables) =>
      pipe(
        tableDefinitions,
        readerTaskEither.traverseSeqArray((tableDefinition) =>
          existingTables.has(tableDefinition.name)
            ? updateTable(tableDefinition)
            : createTable(tableDefinition)
        )
      )
    ),
    readerTaskEither.map(constVoid)
  );
