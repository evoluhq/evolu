/**
 * 🔒
 *
 * @module
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { urlAlphabet } from "nanoid";
import { getOrThrow, Result, trySync } from "./Result.js";
import {
  brand,
  Id,
  length,
  Mnemonic,
  NonNegativeInt,
  Uint8Array,
} from "./Type.js";
import { Brand } from "./Types.js";

/** `Uint8Array` created by {@link createRandomBytes}. */
export type RandomBytes = Uint8Array & Brand<"RandomBytes">;

export type CreateRandomBytes = (bytesLength?: number) => RandomBytes;

export interface CreateRandomBytesDep {
  readonly createRandomBytes: CreateRandomBytes;
}

/** Cryptographically secure PRNG. Uses internal OS-level crypto.getRandomValues. */
export const createRandomBytes: CreateRandomBytes = (bytesLength = 32) =>
  randomBytes(bytesLength) as RandomBytes;

export type CreateMnemonic = () => Mnemonic;

export interface CreateMnemonicDep {
  readonly createMnemonic: CreateMnemonic;
}

export const createEnglishMnemonic: CreateMnemonic = () =>
  bip39.generateMnemonic(wordlist, 128) as Mnemonic;

export type MnemonicSeed = Uint8Array & Brand<"MnemonicSeed">;

export const mnemonicToMnemonicSeed = (mnemonic: Mnemonic): MnemonicSeed =>
  bip39.mnemonicToSeedSync(mnemonic) as MnemonicSeed;

/**
 * SLIP21.
 *
 * https://github.com/satoshilabs/slips/blob/master/slip-0021.md
 */
export const createSlip21 = (
  seed: MnemonicSeed,
  path: ReadonlyArray<string>,
): Uint8Array => {
  let m = hmac(sha512, "Symmetric key seed", seed);
  for (const component of path) {
    const p = new TextEncoder().encode(component);
    const e = new globalThis.Uint8Array(p.byteLength + 1);
    e[0] = 0;
    e.set(p, 1);
    m = hmac(sha512, m.slice(0, 32), e);
  }
  return m.slice(32, 64);
};

/**
 * Creates a 21-character Base64URL ID (also known as nanoid) from a SLIP-21
 * derived key.
 *
 * Reduces the 256-bit SLIP-21 output to 126 bits (21 chars × 6 bits) for a
 * compact, human-readable, and shareable identifier suitable for UI display or
 * URL use. While this lowers entropy, 126 bits remains cryptographically secure
 * for uniqueness and unpredictability in most applications (comparable to
 * UUIDv4's 122 bits).
 *
 * See https://github.com/satoshilabs/slips/blob/master/slip-0021.md
 */
export const createSlip21Id = (
  seed: MnemonicSeed,
  path: ReadonlyArray<string>,
): Id => {
  const slip21 = createSlip21(seed, path);
  let id = "" as Id;

  // Convert the key to the Id/NanoId/Base64Url format.
  for (let i = 0; i < 21; i++) {
    id = (id + urlAlphabet[slip21[i] & 63]) as Id;
  }

  return id;
};

/** The encryption key for {@link SymmetricCrypto}. */
export const EncryptionKey = brand("EncryptionKey", length(32)(Uint8Array));
export type EncryptionKey = typeof EncryptionKey.Type;

export const createEncryptionKey = (seed: MnemonicSeed): EncryptionKey =>
  createSlip21(seed, ["Evolu", "Encryption Key"]) as EncryptionKey;

/** Symmetric cryptography. */
export interface SymmetricCrypto {
  readonly nonceLength: NonNegativeInt;

  readonly encrypt: (
    plaintext: Uint8Array,
    encryptionKey: EncryptionKey,
  ) => {
    readonly nonce: Uint8Array;
    readonly ciphertext: Uint8Array;
  };

  readonly decrypt: (
    ciphertext: Uint8Array,
    encryptionKey: EncryptionKey,
    nonce: Uint8Array,
  ) => Result<Uint8Array, SymmetricCryptoDecryptError>;
}

export interface SymmetricCryptoDep {
  readonly symmetricCrypto: SymmetricCrypto;
}

export interface SymmetricCryptoDecryptError {
  readonly type: "SymmetricCryptoDecryptError";
  readonly error: unknown;
}

/**
 * XChaCha20-Poly1305 encryption
 *
 * https://github.com/paulmillr/noble-ciphers?tab=readme-ov-file#which-cipher-should-i-pick
 */
export const createSymmetricCrypto = (
  deps: CreateRandomBytesDep,
): SymmetricCrypto => {
  const nonceLength = getOrThrow(NonNegativeInt.from(24));

  const symmetricCrypto: SymmetricCrypto = {
    nonceLength,

    encrypt: (plaintext, encryptionKey) => {
      const nonce = deps.createRandomBytes(nonceLength);
      const ciphertext = xchacha20poly1305(encryptionKey, nonce).encrypt(
        plaintext,
      );
      return { nonce, ciphertext };
    },

    decrypt: (ciphertext, encryptionKey, nonce) =>
      trySync(
        () => xchacha20poly1305(encryptionKey, nonce).decrypt(ciphertext),
        (error): SymmetricCryptoDecryptError => ({
          type: "SymmetricCryptoDecryptError",
          error,
        }),
      ),
  };

  return symmetricCrypto;
};

/**
 * Returns the PADMÉ padded length for a given input length.
 *
 * PADMÉ limits information leakage about the length of the plain-text for a
 * wide range of encrypted data sizes. See the PURBs paper for details:
 * https://bford.info/pub/sec/purb.pdf
 */
export const padmePaddedLength = (length: NonNegativeInt): NonNegativeInt => {
  if (length <= 0) return 0 as NonNegativeInt;
  const e = 31 - Math.clz32(length >>> 0);
  const s = 32 - Math.clz32(e >>> 0);
  const z = Math.max(0, e - s);
  const mask = (1 << z) - 1;
  return ((length + mask) & ~mask) as NonNegativeInt;
};

/**
 * Returns the PADMÉ padding length for a given input length. Uses
 * {@link padmePaddedLength}.
 */

export const padmePaddingLength = (length: NonNegativeInt): NonNegativeInt => {
  return (padmePaddedLength(length) - length) as NonNegativeInt;
};
