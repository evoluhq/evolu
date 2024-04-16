import {
  AppState,
  Bip39,
  Mnemonic,
  SyncLock,
  validateMnemonicToEffect,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import { constVoid } from "effect/Function";
import * as Layer from "effect/Layer";

export const AppStateLive = Layer.succeed(AppState, {
  init: ({ reloadUrl, onRequestSync }) => {
    if (typeof document === "undefined") {
      return Effect.succeed(Effect.void);
    }

    const localStorageKey = "evolu:reloadAllTabs";

    const replaceLocation = () => {
      location.replace(reloadUrl);
    };

    window.addEventListener("storage", (e) => {
      if (e.key === localStorageKey) replaceLocation();
    });

    window.addEventListener("online", onRequestSync);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden") onRequestSync();
    });
    window.addEventListener("focus", onRequestSync);

    const resetAppState = Effect.sync(() => {
      localStorage.setItem(localStorageKey, Date.now().toString());
      replaceLocation();
    });

    return Effect.succeed(resetAppState);
  },
});

export const SyncLockLive = Layer.effect(
  SyncLock,
  Effect.sync(() => {
    // No multitenantLockName because this will be redesigned.
    const lockName = "evolu:sync";
    let release: null | (() => void) = null;

    return SyncLock.of({
      acquire: Effect.gen(function* (_) {
        if (release) return false;
        release = constVoid;
        return yield* _(
          Effect.async<boolean>((resume) => {
            navigator.locks.request(lockName, { ifAvailable: true }, (lock) => {
              if (lock == null) {
                release = null;
                resume(Effect.succeed(false));
                return;
              }
              resume(Effect.succeed(true));
              return new Promise<void>((resolve) => {
                release = resolve;
              });
            });
          }),
        );
      }),

      release: Effect.sync(() => {
        if (release) release();
        release = null;
      }),
    });
  }),
);

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
