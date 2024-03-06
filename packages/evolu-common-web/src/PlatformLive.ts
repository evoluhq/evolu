import { DbWorkerLock } from "@evolu/common";
import {
  AppState,
  Bip39,
  Config,
  InvalidMnemonicError,
  Mnemonic,
  PlatformName,
  SyncLock,
  canUseDom,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Layer from "effect/Layer";

export const PlatformNameLive = Layer.succeed(
  PlatformName,
  canUseDom ? "web" : "server",
);

export const SyncLockLive = Layer.effect(
  SyncLock,
  Effect.sync(() => {
    const lockName = "evolu:sync";
    let release: null | (() => void) = null;

    return SyncLock.of({
      acquire: Effect.gen(function* (_) {
        if (release) return false;
        release = Function.constVoid;
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

interface LockManager {
  request: <T>(name: string, callback: () => Promise<T>) => void;
}

let lockPromise = Promise.resolve();
export const fakeLocksForBuggySafari: LockManager = {
  request: (name, callback) => {
    lockPromise = lockPromise.then(() => callback().then(Function.constVoid));
  },
};

export const DbWorkerLockLive = Layer.succeed(DbWorkerLock, (callback) => {
  (navigator.locks || fakeLocksForBuggySafari).request(
    "evolu:DbWorker",
    callback,
  );
});

export const AppStateLive = Layer.effect(
  AppState,
  Effect.gen(function* (_) {
    if ((yield* _(PlatformName)) === "server")
      return AppState.of({
        init: Function.constVoid,
        reset: Effect.succeed(undefined),
      });

    const { reloadUrl } = yield* _(Config);
    const localStorageKey = "evolu:reloadAllTabs";

    const reloadLocation = (): void => {
      location.assign(reloadUrl);
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
          validateMnemonic(mnemonic, wordlist)
            ? Effect.succeed(mnemonic as Mnemonic)
            : Effect.fail<InvalidMnemonicError>({
                _tag: "InvalidMnemonicError",
              }),
        ),
      ),
  }),
);
