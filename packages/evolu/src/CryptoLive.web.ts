import { aes_decrypt, aes_encrypt } from "@noble/ciphers/simple";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
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

const importBip39WithEnglish = Effect.all(
  [
    Effect.promise(() => import("@scure/bip39")),
    Effect.promise(() => import("@scure/bip39/wordlists/english")),
  ],
  { concurrency: "unbounded" }
);

export const Bip39Live = Layer.succeed(
  Bip39,
  Bip39.of({
    make: importBip39WithEnglish.pipe(
      Effect.map(
        ([{ generateMnemonic }, { wordlist }]) =>
          generateMnemonic(wordlist, 128) as Mnemonic
      )
    ),

    toSeed: (mnemonic) =>
      Effect.promise(() => import("@scure/bip39")).pipe(
        Effect.flatMap((a) => Effect.promise(() => a.mnemonicToSeed(mnemonic)))
      ),

    parse: (mnemonic) =>
      importBip39WithEnglish.pipe(
        Effect.flatMap(([{ validateMnemonic }, { wordlist }]) =>
          validateMnemonic(mnemonic, wordlist)
            ? Effect.succeed(mnemonic as Mnemonic)
            : Effect.fail<InvalidMnemonicError>({
                _tag: "InvalidMnemonicError",
              })
        )
      ),
  })
);

export const HmacLive = Layer.succeed(Hmac, hmac);

export const Sha512Live = Layer.succeed(Sha512, sha512);

const nanoidForNodeId = customAlphabet(customAlphabetForNodeId, 16);

export const NanoIdLive = Layer.succeed(
  NanoId,
  NanoId.of({
    nanoid: Effect.sync(() => nanoid()),
    nanoidAsNodeId: Effect.sync(() => nanoidForNodeId() as NodeId),
  })
);

export const AesGcmLive = Layer.succeed(
  AesGcm,
  AesGcm.of({
    encrypt: (sharedKey, plaintext) =>
      Effect.promise(() => aes_encrypt(sharedKey, plaintext)),
    decrypt: (sharedKey, ciphertext) =>
      Effect.promise(() => aes_decrypt(sharedKey, ciphertext)),
  })
);
