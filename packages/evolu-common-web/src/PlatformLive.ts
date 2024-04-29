import {
  AppState,
  Bip39,
  Mnemonic,
  SyncLock,
  SyncLockAlreadySyncingError,
  SyncLockRelease,
  getLockName,
  validateMnemonicToEffect,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export const AppStateLive = Layer.succeed(AppState, {
  init: ({ reloadUrl, onRequestSync }) =>
    Effect.sync(() => {
      if (typeof document === "undefined") {
        return { reset: Effect.void };
      }

      const localStorageKey = "evolu:reloadAllTabs";

      const replaceLocation = () => {
        location.replace(reloadUrl);
      };

      window.addEventListener("storage", (e) => {
        if (e.key === localStorageKey) replaceLocation();
      });

      let timer: null | number;
      const handleRequestSyncEvents = () => {
        if (timer != null) return;
        onRequestSync();
        timer = window.setTimeout(() => {
          timer = null;
        }, 50);
      };

      window.addEventListener("online", handleRequestSyncEvents);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "hidden") handleRequestSyncEvents();
      });
      window.addEventListener("focus", handleRequestSyncEvents);

      const reset = Effect.sync(() => {
        localStorage.setItem(localStorageKey, Date.now().toString());
        replaceLocation();
      });

      return { reset };
    }),
});

export const SyncLockLive = Layer.succeed(SyncLock, {
  tryAcquire: Effect.gen(function* () {
    yield* Effect.logTrace("SyncLock tryAcquire");
    const lockName = yield* getLockName("SyncLock");
    const acquire = Effect.async<SyncLockRelease, SyncLockAlreadySyncingError>(
      (resume) => {
        navigator.locks.request(lockName, { ifAvailable: true }, (lock) => {
          if (lock == null) {
            Effect.logTrace("SyncLock not acquired").pipe(
              Effect.zipRight(Effect.fail(new SyncLockAlreadySyncingError())),
              resume,
            );
            return;
          }
          return new Promise<void>((resolve) => {
            Effect.logTrace("SyncLock acquired").pipe(
              Effect.zipRight(
                Effect.succeed({
                  release: Effect.logTrace("SyncLock released").pipe(
                    Effect.tap(Effect.sync(resolve)),
                  ),
                }),
              ),
              resume,
            );
          });
        });
      },
    );
    const release = ({ release }: SyncLockRelease) => release;
    return yield* Effect.acquireRelease(acquire, release);
  }),
});

const importBip39WithEnglish = Effect.all(
  [
    Effect.promise(() => import("@scure/bip39")),
    Effect.promise(() => import("@scure/bip39/wordlists/english")),
  ],
  { concurrency: "unbounded" },
);

export const Bip39Live = Layer.succeed(
  Bip39,
  Bip39.of({
    make: importBip39WithEnglish.pipe(
      Effect.map(
        ([{ generateMnemonic }, { wordlist }]) =>
          generateMnemonic(wordlist, 128) as Mnemonic,
      ),
    ),

    toSeed: (mnemonic) =>
      Effect.promise(() => import("@scure/bip39")).pipe(
        Effect.flatMap((a) => Effect.promise(() => a.mnemonicToSeed(mnemonic))),
      ),

    parse: (mnemonic) =>
      importBip39WithEnglish.pipe(
        Effect.flatMap(([{ validateMnemonic }, { wordlist }]) =>
          validateMnemonicToEffect(validateMnemonic)(mnemonic, wordlist),
        ),
      ),
  }),
);
