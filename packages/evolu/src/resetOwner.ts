import { readerTaskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { deleteAllTables } from "./deleteAllTables.js";
import { DbEnv, PostDbWorkerOutputEnv, UnknownError } from "./types.js";

export const resetOwner: ReaderTaskEither<
  DbEnv & PostDbWorkerOutputEnv,
  UnknownError,
  void
> = pipe(
  deleteAllTables,
  readerTaskEither.chainW(() =>
    pipe(
      readerTaskEither.ask<PostDbWorkerOutputEnv>(),
      readerTaskEither.chainIOK(({ postDbWorkerOutput }) =>
        postDbWorkerOutput({ type: "reloadAllTabs" })
      )
    )
  )
);
