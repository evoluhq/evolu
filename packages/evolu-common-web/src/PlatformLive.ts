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
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Layer from "effect/Layer";
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

export const FlushSyncLive = Layer.succeed(FlushSync, flushSync);

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
