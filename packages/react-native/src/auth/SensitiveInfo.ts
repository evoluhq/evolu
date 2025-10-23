import {setItem, getItem, deleteItem, getAllItems} from 'react-native-sensitive-info';
import {createAuthProvider, createRandomBytes} from '@evolu/common';

export const authProvider = createAuthProvider({
  setItem,
  getItem,
  deleteItem,
  getAllItems,
}, createRandomBytes());
