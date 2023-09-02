import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import {
  generateMnemonic,
  mnemonicToSeed,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { Effect, Function, Layer } from "effect";
import { AppState as ReactNativeAppState } from "react-native";
import { Bip39, InvalidMnemonicError, Mnemonic } from "./Crypto.js";
import { AppState, FlushSync, Platform, SyncLock } from "./Platform.js";

export const PlatformLive = Layer.succeed(Platform, {
  name: "react-native",
});

export const FlushSyncLive = Layer.succeed(FlushSync, Function.constVoid);

export const SyncLockLive = Layer.effect(
  SyncLock,
  Effect.sync(() => {
    let hasLock = false;

    const acquire: SyncLock["acquire"] = Effect.sync(() => {
      if (hasLock) return false;
      hasLock = true;
      return true;
    });

    const release: SyncLock["release"] = Effect.sync(() => {
      hasLock = false;
    });

    return { acquire, release };
  }),
);

export const AppStateLive = Layer.effect(
  AppState,
  Effect.sync(() => {
    const onFocus: AppState["onFocus"] = (callback) => {
      let state = ReactNativeAppState.currentState;
      ReactNativeAppState.addEventListener("change", (nextState): void => {
        if (state.match(/inactive|background/) && nextState === "active")
          callback();
        state = nextState;
      });
    };

    const onReconnect: AppState["onReconnect"] = (callback) => {
      let state: NetInfoState | null = null;
      NetInfo.addEventListener((nextState) => {
        if (
          state?.isInternetReachable === false &&
          nextState.isConnected &&
          nextState.isInternetReachable
        )
          callback();
        state = nextState;
      });
    };

    const reset: AppState["reset"] = Effect.sync(() => {
      // TODO:
    });

    return AppState.of({ onFocus, onReconnect, reset });
  }),
);

export const Bip39Live = Layer.succeed(
  Bip39,
  Bip39.of({
    make: Effect.sync(() => generateMnemonic(wordlist, 128) as Mnemonic),

    toSeed: (mnemonic) => Effect.promise(() => mnemonicToSeed(mnemonic)),

    parse: (mnemonic) =>
      validateMnemonic(mnemonic, wordlist)
        ? Effect.succeed(mnemonic as Mnemonic)
        : Effect.fail<InvalidMnemonicError>({ _tag: "InvalidMnemonicError" }),
  }),
);
