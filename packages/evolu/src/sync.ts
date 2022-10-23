import { option, readerTaskEither } from "fp-ts";
import { flow, pipe } from "fp-ts/lib/function.js";
import { Option } from "fp-ts/Option";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { query } from "./query.js";
import { readClock } from "./readClock.js";
import { syncIsPendingOrHeld } from "./syncLock.js";
import {
  DbEnv,
  LockManagerEnv,
  OwnerEnv,
  PostDbWorkerOutputEnv,
  PostSyncWorkerInputEnv,
  QueriesRowsCacheEnv,
  SqlQueryString,
  UnknownError,
} from "./types.js";

const doSync: (
  queries: Option<ReadonlyNonEmptyArray<SqlQueryString>>
) => readerTaskEither.ReaderTaskEither<
  DbEnv &
    OwnerEnv &
    PostSyncWorkerInputEnv &
    QueriesRowsCacheEnv &
    PostDbWorkerOutputEnv,
  UnknownError,
  void | undefined
> = flow(
  option.match(() => readerTaskEither.right(undefined), query),
  readerTaskEither.chainW(() => readClock),
  readerTaskEither.chainW((clock) =>
    pipe(
      readerTaskEither.ask<PostSyncWorkerInputEnv & OwnerEnv>(),
      readerTaskEither.chainIOK(({ postSyncWorkerInput, owner }) =>
        postSyncWorkerInput({
          type: "sync",
          clock,
          owner,
          messages: option.none,
          previousDiff: option.none,
        })
      )
    )
  )
);

export const sync = (
  queries: Option<ReadonlyNonEmptyArray<SqlQueryString>>
): ReaderTaskEither<
  DbEnv &
    OwnerEnv &
    PostSyncWorkerInputEnv &
    LockManagerEnv &
    QueriesRowsCacheEnv &
    PostDbWorkerOutputEnv,
  UnknownError,
  void
> =>
  pipe(
    syncIsPendingOrHeld,
    readerTaskEither.chain((syncIsPendingOrHeld) =>
      syncIsPendingOrHeld ? readerTaskEither.right(undefined) : doSync(queries)
    )
  );
