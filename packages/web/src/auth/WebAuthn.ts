import {setItem, getItem, deleteItem, getAllItems} from './lib/storage.js';
import {createAuthProvider, createRandomBytes} from '@evolu/common';

export const authProvider = createAuthProvider({
  setItem,
  getItem,
  deleteItem,
  getAllItems,
}, createRandomBytes());
