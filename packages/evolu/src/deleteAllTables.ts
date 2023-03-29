import { taskEither } from "fp-ts";
import { constVoid, pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/lib/ReaderTaskEither.js";
import { DbEnv, UnknownError } from "./types.js";

export const deleteAllTables: ReaderTaskEither<DbEnv, UnknownError, void> = ({
  db,
}) =>
  pipe(
    db.exec(`select name from sqlite_master where type='table'`),
    taskEither.chain(
      taskEither.traverseSeqArray(({ name }) =>
        // The dropped table is completely removed from the database schema and
        // the disk file. The table can not be recovered.
        // All indices and triggers associated with the table are also deleted.
        // https://sqlite.org/lang_droptable.html
        db.exec(`drop table ${name}`)
      )
    ),
    taskEither.map(constVoid)
  );
