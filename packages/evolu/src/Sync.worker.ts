import { constFalse, pipe } from "@effect/data/Function";
import * as Option from "@effect/data/Option";
import * as Predicate from "@effect/data/Predicate";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import { createCreateSyncWorker } from "./SyncWorker.js";
import { SyncWorkerInput } from "./Types.js";

const syncLockName = "evolu:sync";

const hasLock: Predicate.Predicate<LockInfo[] | undefined> = (lockInfos) =>
  pipe(
    Option.fromNullable(lockInfos),
    Option.map(ReadonlyArray.some((a) => a.name === syncLockName)),
    Option.getOrElse(constFalse)
  );

const isSyncing: Effect.Effect<never, never, boolean> = pipe(
  Effect.promise(() => navigator.locks.query()),
  Effect.map(({ pending, held }) => hasLock(pending) || hasLock(held))
);

let isSyncingResolve: null | ((value: null) => void) = null;

const setIsSyncing = (isSyncing: boolean): void => {
  if (isSyncing) {
    if (isSyncingResolve) return;
    const promise = new Promise<null>((resolve) => {
      isSyncingResolve = resolve;
    });
    navigator.locks.request(syncLockName, () => promise);
  } else {
    if (isSyncingResolve) isSyncingResolve(null);
    isSyncingResolve = null;
  }
};

const syncWorker = createCreateSyncWorker({
  isSyncing,
  setIsSyncing,
})((message) => {
  postMessage(message);
});

onmessage = ({ data: message }: MessageEvent<SyncWorkerInput>): void => {
  syncWorker.post(message);
};
