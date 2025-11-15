/**
 * 🔒
 *
 * @module
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { Result, trySync } from "./Result.js";
import { brand, length, NonNegativeInt, Uint8Array } from "./Type.js";

export interface RandomBytes {
  /**
   * Creates cryptographically secure random bytes with type-safe length
   * branding.
   *
   * Uses the operating system's cryptographically secure random number
   * generator (crypto.getRandomValues) to generate high-quality entropy
   * suitable for cryptographic operations.
   *
   * ### Type Safety
   *
   * Returns specific branded types for common sizes:
   *
   * - `Random16` for 16-byte values (128 bits)
   * - `Random32` for 32-byte values (256 bits)
   * - `Random64` for 64-byte values (512 bits)
   * - `Random` for any other size
   *
   * ### Example
   *
   * ```ts
   * const nonce = randomBytes.create(16); // Type: Random16
   * const key = randomBytes.create(32); // Type: Random32
   * const seed = randomBytes.create(64); // Type: Random64
   * const custom = randomBytes.create(48); // Type: Random
   * ```
   */
  create(bytesLength: 16): Entropy16;
  create(bytesLength: 32): Entropy32;
  create(bytesLength: 64): Entropy64;
  create(bytesLength: number): Entropy;
}

export interface RandomBytesDep {
  readonly randomBytes: RandomBytes;
}

const Entropy = brand("Entropy", Uint8Array);
type Entropy = typeof Entropy.Type;

export const Entropy16 = length(16)(Entropy);
export type Entropy16 = typeof Entropy16.Type;

export const Entropy32 = length(32)(Entropy);
export type Entropy32 = typeof Entropy32.Type;

export const Entropy64 = length(64)(Entropy);
export type Entropy64 = typeof Entropy64.Type;

export const createRandomBytes = (): RandomBytes => ({
  create: randomBytes as RandomBytes["create"],
});

/**
 * SLIP21.
 *
 * https://github.com/satoshilabs/slips/blob/master/slip-0021.md
 */
export const createSlip21 = (
  seed: Entropy16 | Entropy32 | Entropy64,
  path: ReadonlyArray<string | number>,
): Entropy32 => {
  let currentNode = hmac(
    sha512,
    utf8ToBytes("Symmetric key seed"),
    seed,
  ) as Entropy64;

  for (const element of path) {
    const label = typeof element === "number" ? element.toString() : element;
    currentNode = deriveSlip21Node(label, currentNode);
  }

  return currentNode.slice(32, 64) as Entropy32;
};

/**
 * Derives a single node in the SLIP-21 hierarchical key derivation.
 *
 * @see {@link createSlip21}
 */
export const deriveSlip21Node = (
  label: string,
  parentNode: Entropy64,
): Entropy64 => {
  const labelBytes = utf8ToBytes(label);
  const message = new globalThis.Uint8Array(labelBytes.byteLength + 1);
  message[0] = 0;
  message.set(labelBytes, 1);
  return hmac(sha512, parentNode.slice(0, 32), message) as Entropy64;
};

/** The encryption key for {@link SymmetricCrypto}. */
export const EncryptionKey = brand("EncryptionKey", Entropy32);
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
  deps: RandomBytesDep,
): SymmetricCrypto => {
  const nonceLength = NonNegativeInt.orThrow(24);

  const symmetricCrypto: SymmetricCrypto = {
    nonceLength,

    encrypt: (plaintext, encryptionKey) => {
      const nonce = deps.randomBytes.create(nonceLength);
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
  if (length <= 0) return NonNegativeInt.orThrow(0);
  const e = 31 - Math.clz32(length >>> 0);
  const s = 32 - Math.clz32(e >>> 0);
  const z = Math.max(0, e - s);
  const mask = (1 << z) - 1;
  return NonNegativeInt.orThrow((length + mask) & ~mask);
};

/**
 * Returns the PADMÉ padding length for a given input length. Uses
 * {@link padmePaddedLength}.
 */
export const padmePaddingLength = (length: NonNegativeInt): NonNegativeInt => {
  return NonNegativeInt.orThrow(padmePaddedLength(length) - length);
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
