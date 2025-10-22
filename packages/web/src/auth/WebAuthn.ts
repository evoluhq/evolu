import {set, get, del, keys} from 'idb-keyval';
import {createOwner, createOwnerSecret, createRandomBytes, AUTH_DEFAULT_OPTIONS} from '@evolu/common';
import type {AuthProvider, AuthResult, OwnerId} from '@evolu/common';

const randomBytes = createRandomBytes();

export const authProvider: AuthProvider = {
  login: async ({ownerId, options}) => {
    const account = await get<AuthResult>(ownerId);
    if (!account) {
      return null;
    }
    // TODO: navigator.credentials.get && decrypt
    return account;
  },
  register: async ({username, options}) => {
    const secret = createOwnerSecret({randomBytes});
    const owner = createOwner(secret);
    // TODO: navigator.credentials.create && encrypt
    await set(owner.id, {username, owner});
    return {owner, username};
  },
  unregister: async ({ownerId, options}) => {
    await del(ownerId);
  },
  getOwnerIds:  async ({options}) => {
    const accounts = await keys();
    return accounts
      .map(id => id.toString() as OwnerId)
      .filter(Boolean);
  },
};
