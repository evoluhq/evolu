import {
  AppState,
  Bip39,
  Mnemonic,
  SyncLock,
  SyncLockRelease,
  lockName,
  validateMnemonicToEffect,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

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

// TODO: Ask the Effect team for review.
export const SyncLockLive = Layer.succeed(SyncLock, {
  tryAcquire: Effect.logTrace("SyncLock acquire").pipe(
    Effect.zipRight(lockName("SyncLock")),
    Effect.flatMap((lockName) =>
      Effect.async<Option.Option<SyncLockRelease>>((resume) => {
        navigator.locks.request(lockName, { ifAvailable: true }, (lock) => {
          if (lock == null) {
            resume(Effect.succeed(Option.none()));
            return;
          }
          return new Promise<void>((resolve) => {
            resume(
              Effect.succeed(
                Option.some({
                  release: Effect.zipRight(
                    Effect.logTrace("SyncLock release"),
                    Effect.sync(resolve),
                  ),
                }),
              ),
            );
          });
        });
      }),
    ),
  ),
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
