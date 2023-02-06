import { taskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { TaskEither } from "fp-ts/TaskEither";
import { Database, UnknownError } from "./types.js";

export const transaction =
  (db: Database) =>
  <E, A>(te: TaskEither<E, A>): TaskEither<E | UnknownError, A> =>
    pipe(
      db.exec("begin"),
      taskEither.chainW(() => te),
      taskEither.chainFirstW(() => db.exec("commit")),
      taskEither.orElse((originalError) =>
        pipe(
          db.exec("rollback"),
          taskEither.chain(() => taskEither.left(originalError))
        )
      )
    );
