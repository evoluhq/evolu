import {setItem, getItem, deleteItem, getAllItems} from './lib/storage.js';
import {createOwner, createOwnerSecret, createRandomBytes, AUTH_DEFAULT_OPTIONS} from '@evolu/common';
import type {AuthProvider, AuthResult, OwnerId} from '@evolu/common';

const randomBytes = createRandomBytes();

export const authProvider: AuthProvider = {
  login: async ({ownerId, options}) => {
    const account = await getItem(ownerId, {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
    });
    if (!account?.value) {
      return null;
    }
    try {
      return JSON.parse(account.value) as AuthResult;
    } catch (error) {
      return null;
    }
  },
  register: async ({username, options}) => {
    const secret = createOwnerSecret({randomBytes});
    const owner = createOwner(secret);
    await setItem(owner.id, JSON.stringify({username, owner}), {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
    });
    return {owner, username};
  },
  unregister: async ({ownerId, options}) => {
    await deleteItem(ownerId, {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
    });
  },
  getOwnerIds:  async ({options}) => {
    const accounts = await getAllItems({
      ...AUTH_DEFAULT_OPTIONS,
      includeValues: false,
      ...options,
    });
    return accounts
      .map(account => account.key as OwnerId)
      .filter(Boolean);
  },
};
