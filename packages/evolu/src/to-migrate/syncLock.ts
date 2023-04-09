import { array, option, taskEither } from "fp-ts";
import { constFalse, flow, pipe } from "fp-ts/lib/function.js";
import { Predicate } from "fp-ts/lib/Predicate.js";
import { ReaderTaskEither } from "fp-ts/lib/ReaderTaskEither.js";
import { Task } from "fp-ts/lib/Task.js";
import { errorToUnknownError, LockManagerEnv, UnknownError } from "./types.js";

const syncLockName = "evolu_sync";

export const requestSync = (sync: Task<void>): void => {
  navigator.locks.request(syncLockName, sync);
};

const hasLock: Predicate<LockInfo[] | undefined> = flow(
  option.fromNullable,
  option.map(array.some((a) => a.name === syncLockName)),
  option.getOrElse(constFalse)
);

export const syncIsPendingOrHeld: ReaderTaskEither<
  LockManagerEnv,
  UnknownError,
  boolean
> = ({ locks }) =>
  pipe(
    taskEither.tryCatch(() => locks.query(), errorToUnknownError),
    taskEither.map(({ pending, held }) => hasLock(pending) || hasLock(held))
  );
