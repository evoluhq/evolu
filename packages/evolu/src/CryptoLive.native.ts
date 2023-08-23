import "react-native-get-random-values";
import "fast-text-encoding";

import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import { Effect, Layer } from "effect";
import { customAlphabet, nanoid } from "nanoid";
import {
  AesGcm,
  Bip39,
  Hmac,
  NanoId,
  NodeId,
  Sha512,
  customAlphabetForNodeId,
} from "./Crypto.js";

export const Bip39Live = Layer.succeed(
  Bip39,
  Bip39.of({
    make: Effect.sync(() => {
      throw "TODO";
    }),

    toSeed: () =>
      Effect.sync(() => {
        throw "TODO";
      }),

    parse: () =>
      Effect.sync(() => {
        throw "TODO";
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

export const AesGcmLive = Layer.succeed(
  AesGcm,
  AesGcm.of({
    encrypt: (_sharedKey, _plaintext) =>
      Effect.sync(() => {
        throw "TODO";
      }),
    decrypt: (_sharedKey, _ciphertext) =>
      Effect.sync(() => {
        throw "TODO";
      }),
  }),
);
