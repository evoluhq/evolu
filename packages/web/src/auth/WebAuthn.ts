import {setItem, getItem, deleteItem, getAllItems} from './lib/storage.js';
import {createAuthProvider, createRandomBytes} from '@evolu/common';
import type {SecureStorage} from '@evolu/common';

const secureStorage: SecureStorage = {
  setItem,
  getItem,
  deleteItem,
  getAllItems,
};

export const authProvider = createAuthProvider(secureStorage, createRandomBytes());
