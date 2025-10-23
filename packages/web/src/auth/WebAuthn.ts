import {createOwner, createOwnerSecret, createRandomBytes} from '@evolu/common';
import {createCredential, getCredential, extractSeedFromCredential} from './lib/credentials.js';
import {storeAuthResult, retrieveAuthResult, getCredentialId, deleteAuthData, getAllOwnerIds} from './lib/storage.js';
import {supportsWebAuthn} from './lib/support.js';
import {generateSeed} from './lib/crypto.js';

import type {AuthProvider} from '@evolu/common';
import type {WebAuthnOptions} from './lib/types.js';

const randomBytes = createRandomBytes();

export const authProvider: AuthProvider = {
  login: async ({ownerId, options}) => {
    if (!(await supportsWebAuthn())) {
      throw new Error('WebAuthn not supported');
    }
    const webAuthnOptions = options as WebAuthnOptions | undefined;
    const credentialId = await getCredentialId(ownerId);
    if (!credentialId) {
      return null;
    }
    try {
      const credential = await getCredential(credentialId, webAuthnOptions?.relyingPartyID);
      const seed = extractSeedFromCredential(credential);
      return await retrieveAuthResult(ownerId, seed);
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
      const authResult = {username, owner};
      await storeAuthResult(owner.id, authResult, seed, credential.rawId);
      return authResult;
    } catch (error) {
      throw new Error('WebAuthn registration failed: ' + (error as Error).message);
    }
  },

  unregister: async ({ownerId, options}) => {
    await deleteAuthData(ownerId);
  },

  getOwnerIds: async ({options}) => {
    return await getAllOwnerIds();
  },
};
