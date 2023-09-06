import { Effect, Function, Layer, Predicate, ReadonlyArray } from "effect";
import { flushSync } from "react-dom";
import { Config } from "./Config.js";
import { Bip39, InvalidMnemonicError, Mnemonic } from "./Crypto.js";
import { AppState, FlushSync, Platform, SyncLock } from "./Platform.js";

const hasDoc = typeof document !== "undefined";

const isChromeWithOpfs = (): boolean =>
  navigator.userAgentData != null &&
  navigator.userAgentData.brands.find(
    ({ brand, version }) =>
      // Chrome or Chromium
      brand.includes("Chrom") && Number(version) >= 109,
  ) != null;

const isFirefoxWithOpfs = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.indexOf("firefox") === -1) return false;
  const matches = userAgent.match(/firefox\/([0-9]+\.*[0-9]*)/);
  if (matches == null) return false;
  return Number(matches[1]) >= 111;
};

const name = hasDoc
  ? isChromeWithOpfs() || isFirefoxWithOpfs()
    ? "web-with-opfs"
    : "web-without-opfs"
  : "server";

export const PlatformLive = Layer.succeed(Platform, { name });

export const FlushSyncLive = Layer.succeed(FlushSync, flushSync);

export const SyncLockLive = Layer.effect(
  SyncLock,
  Effect.sync(() => {
    const syncLockName = "evolu:sync";

    const hasLock: Predicate.Predicate<LockInfo[] | undefined> = (
      lockInfos,
    ) => {
      if (lockInfos == null) return false;
      return ReadonlyArray.some(
        lockInfos,
        (lockInfo) => lockInfo.name === syncLockName,
      );
    };

    const isSyncing = Effect.promise(() => navigator.locks.query()).pipe(
      Effect.map(({ pending, held }) => hasLock(pending) || hasLock(held)),
    );

    let isSyncingResolve: null | ((value: undefined) => void) = null;

    const acquire: SyncLock["acquire"] = Effect.gen(function* (_) {
      if (isSyncingResolve || (yield* _(isSyncing))) return false;
      const promise = new Promise<undefined>((resolve) => {
        isSyncingResolve = resolve;
      });
      void navigator.locks.request(syncLockName, () => promise);
      return true;
    });

    const release: SyncLock["release"] = Effect.sync(() => {
      if (isSyncingResolve) isSyncingResolve(undefined);
      isSyncingResolve = null;
    });

    return { acquire, release };
  }),
);

export const AppStateLive = Layer.effect(
  AppState,
  Effect.gen(function* (_) {
    const platform = yield* _(Platform);

    if (platform.name === "server")
      return AppState.of({
        onFocus: Function.constVoid,
        onReconnect: Function.constVoid,
        reset: Effect.succeed(undefined),
      });

    const config = yield* _(Config);

    const onFocus: AppState["onFocus"] = (callback) => {
      window.addEventListener("focus", () => callback());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "hidden") callback();
      });
    };

    // We can't use `navigator.onLine`.
    // https://bugs.chromium.org/p/chromium/issues/detail?id=678075
    const onReconnect: AppState["onReconnect"] = (callback) => {
      window.addEventListener("online", callback);
    };

    const localStorageKey = "evolu:reloadAllTabs";

    const reloadLocation = (): void => {
      location.assign(config.reloadUrl);
    };

    window.addEventListener("storage", (e) => {
      if (e.key === localStorageKey) reloadLocation();
    });

    const reset: AppState["reset"] = Effect.sync(() => {
      localStorage.setItem(localStorageKey, Date.now().toString());
      reloadLocation();
    });

    return AppState.of({ onFocus, onReconnect, reset });
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
