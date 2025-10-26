import {
  createRandomBytes,
  createSymmetricCrypto,
  createSlip21,
  EncryptionKey,
} from "@evolu/common";
import type { AuthResult, Entropy32 } from "@evolu/common";

const randomBytes = createRandomBytes();
const symmetricCrypto = createSymmetricCrypto({ randomBytes });

export const deriveEncryptionKey = (seed: Uint8Array): EncryptionKey => {
  const seed32 = seed.length === 32 ? seed : seed.slice(0, 32);
  return EncryptionKey.orThrow(
    createSlip21(seed32 as Entropy32, ["evolu", "auth"]),
  );
};

export const encryptAuthResult = (
  authResult: AuthResult,
  encryptionKey: EncryptionKey,
): {
  nonce: string;
  ciphertext: string;
} => {
  const plaintext = new TextEncoder().encode(JSON.stringify(authResult));
  const { nonce, ciphertext } = symmetricCrypto.encrypt(
    plaintext,
    encryptionKey,
  );
  return {
    nonce: toBase64(nonce),
    ciphertext: toBase64(ciphertext),
  };
};

export const decryptAuthResult = (
  encryptedData: { nonce: string; ciphertext: string },
  encryptionKey: EncryptionKey,
): string | null => {
  const nonce = fromBase64(encryptedData.nonce);
  const ciphertext = fromBase64(encryptedData.ciphertext);
  const result = symmetricCrypto.decrypt(ciphertext, encryptionKey, nonce);
  if (!result.ok) return null;
  return new TextDecoder().decode(result.value);
};

// TODO: This lost type  Uint8Array<ArrayBufferLike> & Brand<"Entropy"> & Brand<"Length32">
export const generateSeed = (): Uint8Array => {
  return randomBytes.create(32);
};

// TODO: We have uint8ArrayToBase64Url etc
export const toBase64 = (buffer: Uint8Array): string => {
  return btoa(String.fromCharCode(...buffer));
};

// TODO: We have uint8ArrayToBase64Url etc
export const fromBase64 = (base64: string): Uint8Array => {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};
