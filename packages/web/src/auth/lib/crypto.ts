import {
  createRandomBytes,
  createSymmetricCrypto,
  createSlip21,
  EncryptionKey,
} from '@evolu/common';
import type {AuthResult, Entropy32} from '@evolu/common';
import {toBase64, fromBase64} from './encoding.js';

const randomBytes = createRandomBytes();
const symmetricCrypto = createSymmetricCrypto({randomBytes});

/**
 * Derive encryption key from seed using SLIP21.
 */
export function deriveEncryptionKey(seed: Uint8Array): EncryptionKey {
  const seed32 = seed.length === 32 ? seed : seed.slice(0, 32);
  return EncryptionKey.orThrow(createSlip21(seed32 as Entropy32, ['evolu', 'auth']));
}

/**
 * Encrypt auth result.
 */
export function encryptAuthResult(authResult: AuthResult, encryptionKey: EncryptionKey): {
  nonce: string;
  ciphertext: string;
} {
  const plaintext = new TextEncoder().encode(JSON.stringify(authResult));
  const {nonce, ciphertext} = symmetricCrypto.encrypt(plaintext, encryptionKey);
  return {
    nonce: toBase64(nonce),
    ciphertext: toBase64(ciphertext),
  };
}

/**
 * Decrypt auth result.
 */
export function decryptAuthResult(
  encryptedData: {nonce: string; ciphertext: string},
  encryptionKey: EncryptionKey
): AuthResult | null {
  const nonce = fromBase64(encryptedData.nonce);
  const ciphertext = fromBase64(encryptedData.ciphertext);
  
  const result = symmetricCrypto.decrypt(ciphertext, encryptionKey, nonce);
  
  if (!result.ok) {
    return null;
  }
  
  try {
    const json = new TextDecoder().decode(result.value);
    return JSON.parse(json) as AuthResult;
  } catch {
    return null;
  }
}

/**
 * Generate a random 32-byte seed.
 */
export function generateSeed(): Uint8Array {
  return randomBytes.create(32);
}

/**
 * Generate a random 32-byte challenge.
 */
export function generateChallenge(): Uint8Array {
  return randomBytes.create(32);
}

