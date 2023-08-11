import { Effect, Layer, Predicate, ReadonlyArray } from "effect";
import { flushSync } from "react-dom";
import { FlushSync, SyncLock } from "./Platform.js";

export const FlushSyncLive = Layer.succeed(FlushSync, FlushSync.of(flushSync));

const syncLockName = "evolu:sync";

const hasLock: Predicate.Predicate<LockInfo[] | undefined> = (lockInfos) => {
  if (lockInfos == null) return false;
  return ReadonlyArray.some(
    lockInfos,
    (lockInfo) => lockInfo.name === syncLockName
  );
};

const isSyncing: SyncLock["isSyncing"] = Effect.promise(() =>
  navigator.locks.query()
).pipe(Effect.map(({ pending, held }) => hasLock(pending) || hasLock(held)));

let isSyncingResolve: null | ((value: null) => void) = null;

const setIsSyncing: SyncLock["setIsSyncing"] = (isSyncing) =>
  Effect.sync(() => {
    if (isSyncing) {
      if (isSyncingResolve) return;
      const promise = new Promise<null>((resolve) => {
        isSyncingResolve = resolve;
      });
      // ok, co se stane v jinem tabu?
      // isSyncing by to tam nemelo pustit, to je async, ok
      // ale co kdyz to nastavim? imho blbe api, ne?
      // nemelo by stacit request a release?
      // co se stane, kdyz to nahodou v jinem tabu zavolam?
      // will be queued, jasny, coz ale nechci imho

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      navigator.locks.request(syncLockName, () => promise);
    } else {
      if (isSyncingResolve) isSyncingResolve(null);
      isSyncingResolve = null;
    }
  });

export const SyncLockLive = Layer.succeed(SyncLock, {
  isSyncing,
  setIsSyncing,
});
