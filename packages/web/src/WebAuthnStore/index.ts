import {set, get, del, keys} from 'idb-keyval';
import {deriveEncryptionKey, encryptAuthResult, decryptAuthResult, toBase64, generateSeed} from './crypto.js';
import {getCredential, extractSeedFromCredential, createCredential, supportsWebAuthn} from './credentials.js';
import type {AuthResult, AuthProviderOptions, AuthProviderOptionsValues, SensitiveInfoItem, MutationResult} from '@evolu/common';

export async function setItem(
  key: string,
  value: string,
  options?: AuthProviderOptions
): Promise<MutationResult> {
  if (!(await supportsWebAuthn())) {
    throw new Error('WebAuthn not supported');
  }
  const seed = generateSeed();
  const authResult = JSON.parse(value) as AuthResult;
  const credential = await createCredential(
    authResult.username || 'Evolu User',
    seed,
    options?.relyingPartyID,
    options?.relyingPartyName
  );
  const encryptionKey = deriveEncryptionKey(seed);
  const encryptedData = encryptAuthResult(authResult, encryptionKey);
  await set(getStorageKey(key, options?.service), {
    ...encryptedData,
    credentialId: toBase64(new Uint8Array(credential.rawId)),
  });
  return {
    metadata: createMetadata(),
  };
}

export async function getItem(
  key: string,
  options?: AuthProviderOptions
): Promise<SensitiveInfoItem | null> {
  if (!(await supportsWebAuthn())) {
    throw new Error('WebAuthn not supported');
  }
  const data = await get<{
    readonly nonce: string;
    readonly ciphertext: string;
    readonly credentialId: string;
  }>(getStorageKey(key, options?.service));
  if (!data) {
    return null;
  }
  try {
    const credential = await getCredential(data.credentialId, options?.relyingPartyID);
    const credentialSeed = extractSeedFromCredential(credential);
    const encryptionKey = deriveEncryptionKey(credentialSeed);
    const authResult = decryptAuthResult(data, encryptionKey);
    if (!authResult) {
      return null;
    }
    return {
      key,
      service: options?.service || 'default',
      value: JSON.stringify(authResult),
      metadata: createMetadata(),
    };
  } catch (error) {
    console.error('Failed to retrieve item:', error);
    return null;
  }
}

export async function deleteItem(
  key: string,
  options?: AuthProviderOptions
): Promise<boolean> {
  await del(getStorageKey(key, options?.service));
  return true;
}

export async function getAllItems(
  options?: AuthProviderOptionsValues
): Promise<SensitiveInfoItem[]> {
  const items = await keys();
  const prefix = options?.service || 'default';
  const metadata = createMetadata();
  return items
    .filter(key => String(key).startsWith(prefix))
    .map(key => ({
      key: String(key).split(':')[1],
      service: prefix,
      metadata,
    }));
}

/**
 * Create metadata for web storage (WebAuthn + IndexedDB).
 */
function createMetadata(): SensitiveInfoItem['metadata'] {
  return {
    securityLevel: 'biometry',
    backend: 'encryptedSharedPreferences',
    accessControl: 'biometryCurrentSet',
    timestamp: Date.now(),
  };
}

/**
 * Get storage key for owner ID. (supports namespaces via prefix)
 */
function getStorageKey(key: string, prefix: string = 'default'): string {
  return `${prefix}:${key}`;
}
