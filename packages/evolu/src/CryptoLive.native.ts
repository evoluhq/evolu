import "fast-text-encoding";
import "react-native-get-random-values";

import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import {
  generateMnemonic,
  mnemonicToSeed,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { Effect, Layer } from "effect";
import { customAlphabet, nanoid } from "nanoid";
import {
  AesGcm,
  Bip39,
  Hmac,
  InvalidMnemonicError,
  Mnemonic,
  NanoId,
  NodeId,
  Sha512,
  customAlphabetForNodeId,
} from "./Crypto.js";

export const Bip39Live = Layer.succeed(
  Bip39,
  Bip39.of({
    make: Effect.sync(() => generateMnemonic(wordlist, 128) as Mnemonic),

    toSeed: (mnemonic) => Effect.promise(() => mnemonicToSeed(mnemonic)),

    parse: (mnemonic) =>
      validateMnemonic(mnemonic, wordlist)
        ? Effect.succeed(mnemonic as Mnemonic)
        : Effect.fail<InvalidMnemonicError>({
            _tag: "InvalidMnemonicError",
          }),
  }),
);

export const HmacLive = Layer.succeed(Hmac, hmac);

export const Sha512Live = Layer.succeed(Sha512, sha512);

const nanoidForNodeId = customAlphabet(customAlphabetForNodeId, 16);

export const NanoIdLive = Layer.succeed(
  NanoId,
  NanoId.of({
    nanoid: Effect.sync(() => nanoid()),
    nanoidAsNodeId: Effect.sync(() => nanoidForNodeId() as NodeId),
  }),
);

// TODO:
export const AesGcmLive = Layer.succeed(
  AesGcm,
  AesGcm.of({
    encrypt: (_sharedKey, _plaintext) =>
      Effect.sync(() => {
        return _plaintext;
      }),
    decrypt: (_sharedKey, _ciphertext) =>
      Effect.sync(() => {
        return _ciphertext;
      }),
  }),
);
