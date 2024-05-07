import {
  AppState,
  Bip39,
  Mnemonic,
  SyncLock,
  SyncLockAlreadySyncingError,
  SyncLockRelease,
  validateMnemonicToEffect,
} from "@evolu/common";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import {
  generateMnemonic,
  mnemonicToSeed,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { reloadAsync } from "expo-updates";
import { DevSettings, AppState as ReactNativeAppState } from "react-native";

export const AppStateLive = Layer.succeed(
  AppState,
  AppState.of({
    init: ({ onRequestSync }) =>
      Effect.sync(() => {
        let appStateStatus = ReactNativeAppState.currentState;
        ReactNativeAppState.addEventListener("change", (current) => {
          if (
            appStateStatus.match(/inactive|background/) &&
            current === "active"
          )
            onRequestSync();
          appStateStatus = current;
        });

        let netInfoState: NetInfoState | null = null;
        NetInfo.addEventListener((current) => {
          if (
            netInfoState?.isInternetReachable === false &&
            current.isConnected &&
            current.isInternetReachable
          )
            onRequestSync();
          netInfoState = current;
        });

        const reset =
          process.env.NODE_ENV === "development"
            ? Effect.sync(() => {
                DevSettings.reload();
              })
            : Effect.promise(() => reloadAsync());
        return { reset };
      }),
  }),
);

export const SyncLockLive = Layer.effect(
  SyncLock,
  Effect.sync(() => {
    let hasSyncLock = false;
    return SyncLock.of({
      tryAcquire: Effect.gen(function* () {
        yield* Effect.logTrace("SyncLock tryAcquire");
        const acquire = Effect.gen(function* () {
          if (hasSyncLock) {
            yield* Effect.logTrace("SyncLock not acquired");
            yield* Effect.fail(new SyncLockAlreadySyncingError());
          }
          yield* Effect.logTrace("SyncLock acquired");
          hasSyncLock = true;
          const syncLockRelease: SyncLockRelease = {
            release: Effect.gen(function* () {
              yield* Effect.logTrace("SyncLock released");
              hasSyncLock = false;
            }),
          };
          return syncLockRelease;
        });
        const release = ({ release }: SyncLockRelease) => release;
        return yield* Effect.acquireRelease(acquire, release);
      }),
    });
  }),
);

export const Bip39Live = Layer.succeed(
  Bip39,
  Bip39.of({
    make: Effect.sync(() => generateMnemonic(wordlist, 128) as Mnemonic),

    toSeed: (mnemonic) => Effect.promise(() => mnemonicToSeed(mnemonic)),

    parse: (mnemonic) =>
      validateMnemonicToEffect(validateMnemonic)(mnemonic, wordlist),
  }),
);
