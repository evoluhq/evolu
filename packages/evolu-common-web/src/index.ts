import {
  Bip39,
  EvoluCommonLive,
  InvalidMnemonicError,
  Mnemonic,
} from "@evolu/common";
import { Effect, Layer } from "effect";
import { DbWorkerLive } from "./DbWorkerLive.js";
import {
  AppStateLive,
  Bip39Live,
  FlushSyncLive,
  PlatformNameLive,
} from "./PlatformLive.js";

/**
 * Parse a string to {@link Mnemonic}.
 *
 * This function is async because Bip39 is imported dynamically.
 */
export const parseMnemonic: (
  mnemonic: string,
) => Effect.Effect<never, InvalidMnemonicError, Mnemonic> = Bip39.pipe(
  Effect.provide(Bip39Live),
  Effect.runSync,
).parse;

/** Evolu for web platform. */
export const EvoluWebLive = EvoluCommonLive.pipe(
  Layer.provide(Layer.merge(DbWorkerLive, AppStateLive)),
  Layer.provide(Layer.merge(PlatformNameLive, FlushSyncLive)),
);
