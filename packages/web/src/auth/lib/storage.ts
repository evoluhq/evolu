import {set, get, del, keys} from 'idb-keyval';
import {deriveEncryptionKey, encryptAuthResult, decryptAuthResult, toBase64} from './crypto.js';
import type {OwnerId, AuthResult} from '@evolu/common';

export interface EncryptedStorage {
  readonly nonce: string;
  readonly ciphertext: string;
  readonly credentialId: string;
}

const STORAGE_PREFIX = 'evolu_auth_';

/**
 * Get storage key for owner ID.
 */
function getStorageKey(ownerId: OwnerId): string {
  return STORAGE_PREFIX + ownerId;
}

export async function storeAuthResult(
  ownerId: OwnerId,
  authResult: AuthResult,
  seed: Uint8Array,
  credentialRawId: ArrayBuffer
): Promise<void> {
  const encryptionKey = deriveEncryptionKey(seed);
  const encryptedData = encryptAuthResult(authResult, encryptionKey);
  await set(getStorageKey(ownerId), {
    ...encryptedData,
    credentialId: toBase64(new Uint8Array(credentialRawId)),
  });
}

export async function retrieveAuthResult(
  ownerId: OwnerId,
  seed: Uint8Array
): Promise<AuthResult | null> {
  const data = await get<EncryptedStorage>(getStorageKey(ownerId));
  if (!data) {
    return null;
  }
  const encryptionKey = deriveEncryptionKey(seed);
  return decryptAuthResult(data, encryptionKey);
}

export async function getCredentialId(ownerId: OwnerId): Promise<string | null> {
  const data = await get<EncryptedStorage>(getStorageKey(ownerId));
  return data?.credentialId || null;
}

export async function deleteAuthData(ownerId: OwnerId): Promise<void> {
  await del(getStorageKey(ownerId));
}

export async function getAllOwnerIds(): Promise<OwnerId[]> {
  const allKeys = await keys();
  return allKeys
    .filter(key => String(key).startsWith(STORAGE_PREFIX))
    .map(key => String(key).slice(STORAGE_PREFIX.length) as OwnerId)
    .filter(Boolean);
}
