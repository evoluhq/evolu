import {set, get, del, keys, clear, createStore} from 'idb-keyval';
import {deriveEncryptionKey, encryptAuthResult, decryptAuthResult, toBase64, generateSeed} from './crypto.js';
import {getCredential, extractSeedFromCredential, createCredential, supportsWebAuthn} from './credentials.js';

import type {AuthResult, AuthProviderOptions, AuthProviderOptionsValues, SensitiveInfoItem, MutationResult} from '@evolu/common';
import type {UseStore} from 'idb-keyval';

export async function setItem(
  key: string,
  value: string,
  options?: AuthProviderOptions
): Promise<MutationResult> {
  await checkSupport();
  const seed = generateSeed();
  const authResult = JSON.parse(value) as AuthResult;
  const credential = await createCredential(
    authResult.username,
    seed,
    options?.relyingPartyID,
    options?.relyingPartyName
  );
  const encryptionKey = deriveEncryptionKey(seed);
  const encryptedData = encryptAuthResult(authResult, encryptionKey);
  const credentialId = toBase64(new Uint8Array(credential.rawId));
  await set(
    key,
    {credentialId, ...encryptedData},
    getStore(options?.service)
  );
  return {
    // TODO: metadata is fake, implement like react-native-sensitive-info
    metadata: createMetadata(),
  };
}

export async function getItem(
  key: string,
  options?: AuthProviderOptions
): Promise<SensitiveInfoItem | null> {
  await checkSupport();
  const data = await get<{
    readonly nonce: string;
    readonly ciphertext: string;
    readonly credentialId: string;
  }>(key, getStore(options?.service));
  if (!data) {
    return null;
  }
  try {
    const credential = await getCredential(data.credentialId, options?.relyingPartyID);
    const credentialSeed = extractSeedFromCredential(credential);
    const encryptionKey = deriveEncryptionKey(credentialSeed);
    const authResultVal = decryptAuthResult(data, encryptionKey);
    if (!authResultVal) {
      return null;
    }
    return {
      key,
      service: options?.service ?? 'default',
      value: authResultVal,
      // TODO: metadata is fake, implement like react-native-sensitive-info
      metadata: createMetadata(),
    };
  } catch (_error) {
    return null;
  }
}

export async function deleteItem(
  key: string,
  options?: AuthProviderOptions
): Promise<boolean> {
  await del(key, getStore(options?.service));
  return true;
}

export async function getAllItems(
  options?: AuthProviderOptionsValues
): Promise<Array<SensitiveInfoItem>> {
  // TODO: metadata is fake, implement like react-native-sensitive-info
  const metadata = createMetadata();
  const service = options?.service ?? 'default';
  const items = await keys<string>(getStore(service));
  return items.map(key => ({key, service, metadata}));
}

export async function clearService(
  options?: AuthProviderOptions
): Promise<void> {
  await clear(getStore(options?.service));
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
function getStore(prefix = 'default'): UseStore {
  return createStore(prefix, 'evolu-auth');
}

/**
 * Throws an error if WebAuthn is not supported.
 */
async function checkSupport(): Promise<void> {
  if (!(await supportsWebAuthn())) {
    throw new Error('WebAuthn not supported');
  }
}
