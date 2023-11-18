import {
  AppState,
  Bip39,
  Config,
  FlushSync,
  InvalidMnemonicError,
  Mnemonic,
  PlatformName,
  SyncLock,
  canUseDom,
} from "@evolu/common";
import { Effect, Function, Layer, Predicate, ReadonlyArray } from "effect";
import { flushSync } from "react-dom";

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

const isSafariWithOpfs = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.indexOf("safari") === -1) return false;
  const matches = userAgent.match(/version\/([0-9]+)/);
  if (matches == null) return false;
  return Number(matches[1]) >= 17;
};

export const PlatformNameLive = Layer.succeed(
  PlatformName,
  canUseDom
    ? isChromeWithOpfs() || isFirefoxWithOpfs() || isSafariWithOpfs()
      ? "web-with-opfs"
      : "web-without-opfs"
    : "server",
);

// TODO: Move to @evolu/react and make effectul.
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
      navigator.locks.request(syncLockName, () => promise);
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
      init: ({ onFocus, onReconnect }) => {
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "hidden") onFocus();
        });

        // We can't use `navigator.onLine`.
        // https://bugs.chromium.org/p/chromium/issues/detail?id=678075
        window.addEventListener("online", onReconnect);

        onReconnect();
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
