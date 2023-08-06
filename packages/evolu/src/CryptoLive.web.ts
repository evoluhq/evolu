import { Effect, Layer } from "effect";
import { customAlphabet, nanoid } from "nanoid";
import {
  Bip39,
  Hmac,
  Mnemonic,
  NanoId,
  NodeId,
  Sha512,
  customAlphabetForNodeId,
} from "./Crypto.js";

export const Bip39Live = Layer.succeed(
  Bip39,
  Bip39.of({
    makeMnemonic: Effect.all(
      [
        Effect.promise(() => import("@scure/bip39")),
        Effect.promise(() => import("@scure/bip39/wordlists/english")),
      ],
      { concurrency: "unbounded" }
    ).pipe(
      Effect.map(
        ([{ generateMnemonic }, { wordlist }]) =>
          generateMnemonic(wordlist, 128) as Mnemonic
      )
    ),
    mnemonicToSeed: (mnemonic) =>
      Effect.promise(() => import("@scure/bip39")).pipe(
        Effect.flatMap((a) => Effect.promise(() => a.mnemonicToSeed(mnemonic)))
      ),
  })
);

export const HmacLive = Layer.succeed(
  Hmac,
  Hmac.of({
    make: Effect.promise(() => import("@noble/hashes/hmac")).pipe(
      Effect.map(({ hmac }) => hmac)
    ),
  })
);

export const Sha512Live = Layer.succeed(
  Sha512,
  Sha512.of({
    make: Effect.promise(() => import("@noble/hashes/sha512")).pipe(
      Effect.map(({ sha512 }) => sha512)
    ),
  })
);

const nanoidForNodeId = customAlphabet(customAlphabetForNodeId, 16);

export const NanoIdLive = Layer.succeed(
  NanoId,
  NanoId.of({
    nanoid: Effect.sync(() => nanoid()),
    nanoidAsNodeId: Effect.sync(() => nanoidForNodeId() as NodeId),
  })
);
