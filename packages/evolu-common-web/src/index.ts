import {
  Bip39,
  EvoluCommonLive,
  InvalidMnemonicError,
  Mnemonic,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DbWorkerLive } from "./DbWorkerLive.js";
import { AppStateLive, Bip39Live, PlatformNameLive } from "./PlatformLive.js";

export const EvoluWebLive = EvoluCommonLive.pipe(
  Layer.provide(Layer.merge(DbWorkerLive, AppStateLive)),
  Layer.provide(PlatformNameLive),
);

/**
 * Parse a string to {@link Mnemonic}.
 *
 * This function is async because Bip39 is imported dynamically.
 */
export const parseMnemonic: (
  mnemonic: string,
) => Effect.Effect<Mnemonic, InvalidMnemonicError> = Bip39.pipe(
  Effect.provide(Bip39Live),
  Effect.runSync,
).parse;
