import {set, get, del, keys} from 'idb-keyval';
import type {OwnerId} from '@evolu/common';
import type {EncryptedStorage} from './types.js';

const STORAGE_PREFIX = 'evolu_auth_';

/**
 * Get storage key for owner ID.
 */
function getStorageKey(ownerId: OwnerId): string {
  return STORAGE_PREFIX + ownerId;
}

/**
 * Store encrypted auth data.
 */
export async function storeEncryptedData(
  ownerId: OwnerId,
  data: EncryptedStorage
): Promise<void> {
  await set(getStorageKey(ownerId), data);
}

/**
 * Retrieve encrypted auth data.
 */
export async function retrieveEncryptedData(
  ownerId: OwnerId
): Promise<EncryptedStorage | null> {
  const data = await get<EncryptedStorage>(getStorageKey(ownerId));
  return data || null;
}

/**
 * Delete encrypted auth data.
 */
export async function deleteEncryptedData(ownerId: OwnerId): Promise<void> {
  await del(getStorageKey(ownerId));
}

/**
 * Get all stored owner IDs.
 */
export async function getAllOwnerIds(): Promise<OwnerId[]> {
  const allKeys = await keys();
  return allKeys
    .filter(key => String(key).startsWith(STORAGE_PREFIX))
    .map(key => String(key).slice(STORAGE_PREFIX.length) as OwnerId)
    .filter(Boolean);
}

