import {createOwner, createOwnerSecret, createRandomBytes} from '@evolu/common';
import type {AuthProvider} from '@evolu/common';
import {supportsWebAuthn} from './lib/support.js';
import {
  generateSeed,
  deriveEncryptionKey,
  encryptAuthResult,
  decryptAuthResult,
} from './lib/crypto.js';
import {
  createCredential,
  getCredential,
  extractSeedFromCredential,
} from './lib/credentials.js';
import {
  storeEncryptedData,
  retrieveEncryptedData,
  deleteEncryptedData,
  getAllOwnerIds,
} from './lib/storage.js';
import {toBase64} from './lib/encoding.js';
import type {WebAuthnOptions} from './lib/types.js';

const randomBytes = createRandomBytes();

export const authProvider: AuthProvider = {
  login: async ({ownerId, options}) => {
    if (!(await supportsWebAuthn())) {
      throw new Error('WebAuthn not supported');
    }

    const webAuthnOptions = options as WebAuthnOptions | undefined;
    const encryptedData = await retrieveEncryptedData(ownerId);

    if (!encryptedData) {
      return null;
    }

    try {
      const credential = await getCredential(
        encryptedData.credentialId,
        webAuthnOptions?.relyingPartyID
      );
      const seed = extractSeedFromCredential(credential);
      const encryptionKey = deriveEncryptionKey(seed);
      const authResult = decryptAuthResult(encryptedData, encryptionKey);

      return authResult;
    } catch (error) {
      console.error('WebAuthn login failed:', error);
      return null;
    }
  },

  register: async ({username, options}) => {
    if (!(await supportsWebAuthn())) {
      throw new Error('WebAuthn not supported');
    }

    const webAuthnOptions = options as WebAuthnOptions | undefined;
    const secret = createOwnerSecret({randomBytes});
    const owner = createOwner(secret);
    const seed = generateSeed();

    try {
      const credential = await createCredential(
        username,
        seed,
        webAuthnOptions?.relyingPartyID,
        webAuthnOptions?.relyingPartyName
      );

      const encryptionKey = deriveEncryptionKey(seed);
      const authResult = {username, owner};
      const encryptedData = encryptAuthResult(authResult, encryptionKey);

      await storeEncryptedData(owner.id, {
        ...encryptedData,
        credentialId: toBase64(new Uint8Array(credential.rawId)),
      });

      return authResult;
    } catch (error) {
      throw new Error('WebAuthn registration failed: ' + (error as Error).message);
    }
  },

  unregister: async ({ownerId, options}) => {
    await deleteEncryptedData(ownerId);
  },

  getOwnerIds: async ({options}) => {
    return await getAllOwnerIds();
  },
};
