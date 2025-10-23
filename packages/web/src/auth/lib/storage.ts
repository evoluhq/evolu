import {set, get, del, keys} from 'idb-keyval';
import {deriveEncryptionKey, encryptAuthResult, decryptAuthResult, toBase64} from './crypto.js';

import type {OwnerId, AuthResult} from '@evolu/common';
import type {SensitiveInfoEnumerateRequest} from 'react-native-sensitive-info';

export interface EncryptedStorage {
  readonly nonce: string;
  readonly ciphertext: string;
  readonly credentialId: string;
}

/**
 * Get storage key for owner ID. (supports namespaces via prefix)
 */
function getStorageKey(ownerId: OwnerId, prefix: string = 'default'): string {
  return `${prefix}:${ownerId}`;
}

export async function getCredentialId(ownerId: OwnerId): Promise<string | null> {
  const data = await get<EncryptedStorage>(getStorageKey(ownerId));
  return data?.credentialId || null;
}

export async function setItem(
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

export async function getItem(
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

export async function deleteItem(ownerId: OwnerId): Promise<void> {
  await del(getStorageKey(ownerId));
}

export async function getAllItems(
  options?: SensitiveInfoEnumerateRequest,
): Promise<Array<{key: string}>> {
  const items = await keys();
  return items
    .filter(key => String(key).startsWith(options?.service || 'default'))
    .map(key => ({key: String(key).split(':')[1]}));
}
