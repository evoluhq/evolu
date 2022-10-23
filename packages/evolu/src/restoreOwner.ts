import { readerTaskEither } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { deleteAllTables } from "./deleteAllTables.js";
import { initDbModel } from "./initDbModel.js";
import { Mnemonic } from "./model.js";
import { DbEnv, PostDbWorkerOutputEnv, UnknownError } from "./types.js";

export const restoreOwner = (
  mnemonic: Mnemonic
): ReaderTaskEither<DbEnv & PostDbWorkerOutputEnv, UnknownError, void> =>
  pipe(
    deleteAllTables,
    readerTaskEither.chainW(() => initDbModel(mnemonic)),
    readerTaskEither.chainW(() =>
      pipe(
        readerTaskEither.ask<PostDbWorkerOutputEnv>(),
        readerTaskEither.chainIOK(({ postDbWorkerOutput }) =>
          postDbWorkerOutput({ type: "reloadAllTabs" })
        )
      )
    )
  );
