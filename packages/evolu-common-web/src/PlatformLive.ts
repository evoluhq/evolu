import {
  AppState,
  Bip39,
  Config,
  Mnemonic,
  SyncLock,
  canUseDom,
  validateMnemonicToEffect,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import { constVoid } from "effect/Function";
import * as Layer from "effect/Layer";

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

export const AppStateLive = Layer.effect(
  AppState,
  Effect.gen(function* (_) {
    if (!canUseDom)
      return AppState.of({
        init: constVoid,
        reset: Effect.succeed(undefined),
      });

    const { reloadUrl } = yield* _(Config);
    const localStorageKey = "evolu:reloadAllTabs";

    const reloadLocation = () => {
      /**
       * Using replace() will not save the current page in session History,
       * meaning the user will not be able to use the back button to navigate to
       * it.
       *
       * It also fixes a bug in Safari, probably related to leaking SQLite WASM.
       */
      location.replace(reloadUrl);
    };

    window.addEventListener("storage", (e) => {
      if (e.key === localStorageKey) reloadLocation();
    });

    return AppState.of({
      init: ({ onRequestSync }) => {
        // On network reconnect.
        window.addEventListener("online", onRequestSync);

        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "hidden") onRequestSync();
        });
        // visibilitychange isn't enough
        window.addEventListener("focus", onRequestSync);
      },

      reset: Effect.sync(() => {
        localStorage.setItem(localStorageKey, Date.now().toString());
        reloadLocation();
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
