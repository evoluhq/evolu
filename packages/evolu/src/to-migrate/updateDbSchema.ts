import {
  predicate,
  readerTaskEither,
  readonlyArray,
  string,
  taskEither,
} from "fp-ts";
import { constVoid, flow, pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/lib/ReaderTaskEither.js";
import { DbEnv, TableDefinition, UnknownError } from "./types.js";

const getExistingTables: ReaderTaskEither<
  DbEnv,
  UnknownError,
  ReadonlySet<string>
> = ({ db }) =>
  pipe(
    db.exec(`select "name" from sqlite_schema where type='table'`),
    taskEither.map(
      flow(
        readonlyArray.map((row) => row.name + ""),
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
      db.exec(`pragma table_info (${name})`),
      taskEither.map(
        flow(
          readonlyArray.map((a) => a.name as string),
          (existingColumns) =>
            readonlyArray.difference(string.Eq)(existingColumns)(columns)
        )
      ),
      taskEither.chain((newColumns) =>
        !newColumns.length
          ? taskEither.right(readonlyArray.empty)
          : pipe(
              newColumns.map(
                (column) => `alter table "${name}" add column "${column}" blob;`
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
