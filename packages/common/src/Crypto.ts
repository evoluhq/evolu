/**
 * 🔒
 *
 * @module
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { assert } from "./Assert.js";
import { Result, trySync } from "./Result.js";
import { brand, length, NonNegativeInt, Uint8Array } from "./Type.js";

export type CreateRandomBytes = (bytesLength?: number) => Uint8Array;

export interface CreateRandomBytesDep {
  readonly createRandomBytes: CreateRandomBytes;
}

/** Cryptographically secure PRNG. Uses internal OS-level crypto.getRandomValues. */
export const createRandomBytes: CreateRandomBytes = (bytesLength = 32) =>
  randomBytes(bytesLength);

/**
 * SLIP21.
 *
 * https://github.com/satoshilabs/slips/blob/master/slip-0021.md
 */
export const createSlip21 = (
  seed: Uint8Array,
  path: ReadonlyArray<string>,
): Uint8Array => {
  assert(
    seed.length >= 16 && seed.length <= 64,
    `Unusual SLIP-0021 seed length: ${seed.length} bytes`,
  );

  let m = hmac(sha512, utf8ToBytes("Symmetric key seed"), seed);
  for (const component of path) {
    m = deriveSlip21Node(component, m);
  }
  return m.slice(32, 64);
};

/**
 * Derives a single node in the SLIP-21 hierarchical key derivation.
 *
 * @see {@link createSlip21}
 */
export const deriveSlip21Node = (
  component: string,
  m: Uint8Array,
): Uint8Array => {
  const p = utf8ToBytes(component);
  const e = new globalThis.Uint8Array(p.byteLength + 1);
  e[0] = 0;
  e.set(p, 1);
  return hmac(sha512, m.slice(0, 32), e);
};

/** The encryption key for {@link SymmetricCrypto}. */
export const EncryptionKey = brand("EncryptionKey", length(32)(Uint8Array));
export type EncryptionKey = typeof EncryptionKey.Type;

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
  const nonceLength = NonNegativeInt.fromOrThrow(24);

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

/**
 * Performs a timing-safe comparison of two Uint8Arrays. Returns true if they
 * are equal, false otherwise. Takes constant time regardless of where the
 * arrays differ.
 *
 * @see https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
 */
export type TimingSafeEqual = (a: Uint8Array, b: Uint8Array) => boolean;

export interface TimingSafeEqualDep {
  readonly timingSafeEqual: TimingSafeEqual;
}
