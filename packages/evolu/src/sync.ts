import { option, readerTaskEither } from "fp-ts";
import { flow, pipe } from "fp-ts/lib/function.js";
import { Option } from "fp-ts/lib/Option.js";
import { ReaderTaskEither } from "fp-ts/lib/ReaderTaskEither.js";
import { ReadonlyNonEmptyArray } from "fp-ts/lib/ReadonlyNonEmptyArray.js";
import { ConfigEnv } from "./config.js";
import { query } from "./query.js";
import { readClock } from "./readClock.js";
import { syncIsPendingOrHeld } from "./syncLock.js";
import {
  DbEnv,
  LockManagerEnv,
  OwnerEnv,
  PostDbWorkerOutputEnv,
  PostSyncWorkerInputEnv,
  QueryString,
  RowsCacheEnv,
  UnknownError,
} from "./types.js";

const doSync: (
  queries: Option<ReadonlyNonEmptyArray<QueryString>>
) => ReaderTaskEither<
  DbEnv &
    OwnerEnv &
    PostSyncWorkerInputEnv &
    RowsCacheEnv &
    PostDbWorkerOutputEnv &
    ConfigEnv,
  UnknownError,
  void | undefined
> = flow(
  option.match(
    () => readerTaskEither.right(undefined),
    (queries) => query({ queries })
  ),
  readerTaskEither.chainW(() => readClock),
  readerTaskEither.chainW((clock) =>
    pipe(
      readerTaskEither.ask<PostSyncWorkerInputEnv & OwnerEnv & ConfigEnv>(),
      readerTaskEither.chainIOK(({ postSyncWorkerInput, owner, config }) =>
        postSyncWorkerInput({
          syncUrl: config.syncUrl,
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
  queries: Option<ReadonlyNonEmptyArray<QueryString>>
): ReaderTaskEither<
  DbEnv &
    OwnerEnv &
    PostSyncWorkerInputEnv &
    LockManagerEnv &
    RowsCacheEnv &
    PostDbWorkerOutputEnv &
    ConfigEnv,
  UnknownError,
  void
> =>
  pipe(
    syncIsPendingOrHeld,
    readerTaskEither.chain((syncIsPendingOrHeld) =>
      syncIsPendingOrHeld ? readerTaskEither.right(undefined) : doSync(queries)
    )
  );
