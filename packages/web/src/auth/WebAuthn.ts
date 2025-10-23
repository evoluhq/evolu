import {createOwner, createOwnerSecret, createRandomBytes, AUTH_DEFAULT_OPTIONS} from '@evolu/common';
import {setItem, getItem, deleteItem, getAllItems, getCredentialId} from './lib/storage.js';
import {createCredential, getCredential, extractSeedFromCredential, supportsWebAuthn} from './lib/credentials.js';
import {generateSeed} from './lib/crypto.js';
import type {AuthProvider, OwnerId} from '@evolu/common';

const randomBytes = createRandomBytes();

export const authProvider: AuthProvider = {
  login: async ({ownerId, options}) => {
    if (!(await supportsWebAuthn())) {
      throw new Error('WebAuthn not supported');
    }
    const credentialId = await getCredentialId(ownerId);
    if (!credentialId) {
      return null;
    }
    try {
      const credential = await getCredential(credentialId, options?.relyingPartyID);
      const seed = extractSeedFromCredential(credential);
      return await getItem(ownerId, seed);
    } catch (error) {
      console.error('WebAuthn login failed:', error);
      return null;
    }
  },
  register: async ({username, options}) => {
    if (!(await supportsWebAuthn())) {
      throw new Error('WebAuthn not supported');
    }
    const secret = createOwnerSecret({randomBytes});
    const owner = createOwner(secret);
    const seed = generateSeed();
    try {
      const credential = await createCredential(
        username,
        seed,
        options?.relyingPartyID,
        options?.relyingPartyName,
      );
      const authResult = {username, owner};
      await setItem(owner.id, authResult, seed, credential.rawId);
      return authResult;
    } catch (error) {
      throw new Error('WebAuthn registration failed: ' + (error as Error).message);
    }
  },
  unregister: async ({ownerId, options}) => {
    await deleteItem(ownerId);
  },
  getOwnerIds:  async ({options}) => {
    const accounts = await getAllItems({
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
    });
    return accounts
      .map(account => account.key as OwnerId)
      .filter(Boolean);
  },
};
