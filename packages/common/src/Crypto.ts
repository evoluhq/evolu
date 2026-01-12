/**
 * Cryptographic utilities.
 *
 * Type-safe cryptographic operations including random bytes generation, SLIP21
 * key derivation, XChaCha20-Poly1305 symmetric encryption, PADMÉ padding, and
 * timing-safe comparisons.
 *
 * @module
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { Result } from "./Result.js";
import { trySync } from "./Result.js";
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
   * ## Type Safety
   *
   * Returns specific branded types for common sizes:
   *
   * - `Random16` for 16-byte values (128 bits)
   * - `Random24` for 24-byte values (192 bits)
   * - `Random32` for 32-byte values (256 bits)
   * - `Random64` for 64-byte values (512 bits)
   * - `Random` for any other size
   *
   * ### Example
   *
   * ```ts
   * const nonce = randomBytes.create(16); // Type: Random16
   * const nonce24 = randomBytes.create(24); // Type: Random24
   * const key = randomBytes.create(32); // Type: Random32
   * const seed = randomBytes.create(64); // Type: Random64
   * const custom = randomBytes.create(48); // Type: Random
   * ```
   */
  create(bytesLength: 16): Entropy16;
  create(bytesLength: 24): Entropy24;
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

export const Entropy24 = length(24)(Entropy);
export type Entropy24 = typeof Entropy24.Type;

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

/** The encryption key for symmetric encryption. */
export const EncryptionKey = brand("EncryptionKey", Entropy32);
export type EncryptionKey = typeof EncryptionKey.Type;

/** The nonce length for XChaCha20-Poly1305 encryption. */
export const xChaCha20Poly1305NonceLength = 24;

/**
 * Branded Uint8Array for XChaCha20-Poly1305 encryption.
 *
 * @see {@link encryptWithXChaCha20Poly1305}
 */
export const XChaCha20Poly1305Ciphertext = brand(
  "XChaCha20Poly1305Ciphertext",
  Uint8Array,
);
export type XChaCha20Poly1305Ciphertext =
  typeof XChaCha20Poly1305Ciphertext.Type;

/**
 * Encrypts plaintext with XChaCha20-Poly1305.
 *
 * Generates a random nonce internally and returns both the ciphertext and
 * nonce. The nonce must be stored alongside the ciphertext for decryption.
 *
 * ### Example
 *
 * ```ts
 * const deps = { randomBytes: createRandomBytes() };
 * const [ciphertext, nonce] = encryptWithXChaCha20Poly1305(deps)(
 *   utf8ToBytes("secret message"),
 *   encryptionKey,
 * );
 * ```
 *
 * @see https://github.com/paulmillr/noble-ciphers
 */
export const encryptWithXChaCha20Poly1305 =
  (deps: RandomBytesDep) =>
  (
    plaintext: Uint8Array,
    encryptionKey: EncryptionKey,
  ): [XChaCha20Poly1305Ciphertext, Entropy24] => {
    const nonce = deps.randomBytes.create(xChaCha20Poly1305NonceLength);
    const ciphertext = XChaCha20Poly1305Ciphertext.orThrow(
      xchacha20poly1305(encryptionKey, nonce).encrypt(plaintext),
    );
    return [ciphertext, nonce];
  };

export interface DecryptWithXChaCha20Poly1305Error {
  readonly type: "DecryptWithXChaCha20Poly1305Error";
  readonly error: unknown;
}

/**
 * Decrypts ciphertext with XChaCha20-Poly1305.
 *
 * Requires the same nonce that was used during encryption. Returns a
 * {@link Result} that may contain a decryption error if the ciphertext was
 * tampered with or the wrong key/nonce was used.
 *
 * ### Example
 *
 * ```ts
 * const result = decryptWithXChaCha20Poly1305(
 *   ciphertext,
 *   nonce,
 *   encryptionKey,
 * );
 * if (!result.ok) {
 *   // Handle decryption error
 *   return result;
 * }
 * const plaintext = result.value;
 * ```
 */
export const decryptWithXChaCha20Poly1305 = (
  ciphertext: XChaCha20Poly1305Ciphertext,
  nonce: Entropy24,
  encryptionKey: EncryptionKey,
): Result<Uint8Array, DecryptWithXChaCha20Poly1305Error> =>
  trySync(
    () => xchacha20poly1305(encryptionKey, nonce).decrypt(ciphertext),
    (error): DecryptWithXChaCha20Poly1305Error => ({
      type: "DecryptWithXChaCha20Poly1305Error",
      error,
    }),
  );

/**
 * Returns the PADMÉ padded length for a given input length.
 *
 * PADMÉ limits information leakage about the length of the plain-text for a
 * wide range of encrypted data sizes.
 *
 * See the PURBs paper for details: https://bford.info/pub/sec/purb.pdf
 */
export const createPadmePaddedLength = (
  length: NonNegativeInt,
): NonNegativeInt => {
  if (length <= 0) return NonNegativeInt.orThrow(0);
  const e = 31 - Math.clz32(length >>> 0);
  const s = 32 - Math.clz32(e >>> 0);
  const z = Math.max(0, e - s);
  const mask = (1 << z) - 1;
  return NonNegativeInt.orThrow((length + mask) & ~mask);
};

/** Creates a PADMÉ padding array of zeros for the given input length. */
export const createPadmePadding = (length: NonNegativeInt): Uint8Array => {
  const paddedLength = createPadmePaddedLength(length);
  const paddingLength = NonNegativeInt.orThrow(paddedLength - length);
  return new globalThis.Uint8Array(paddingLength);
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
