import { set, get, del, keys, clear, createStore } from "idb-keyval";
import {
  deriveEncryptionKey,
  encryptAuthResult,
  decryptAuthResult,
  toBase64,
  generateSeed,
} from "./crypto.js";
import {
  getCredential,
  extractSeedFromCredential,
  createCredential,
  supportsWebAuthn,
} from "./credentials.js";

import type {
  AuthResult,
  AuthProviderOptions,
  AuthProviderOptionsValues,
  SensitiveInfoItem,
  MutationResult,
} from "@evolu/common";
import type { UseStore } from "idb-keyval";

export const setItem = async (
  key: string,
  value: string,
  options?: AuthProviderOptions,
): Promise<MutationResult> => {
  if (options?.accessControl === "none") {
    await set(key, value, getStore(options.service));
    return {
      metadata: createFakeMetadata(),
    };
  }

  await checkSupport();
  const seed = generateSeed();
  const authResult = JSON.parse(value) as AuthResult;
  const credential = await createCredential(
    options?.webAuthnUsername ?? "Evolu User",
    seed,
    options?.relyingPartyID,
    options?.relyingPartyName,
  );
  const encryptionKey = deriveEncryptionKey(seed);
  const encryptedData = encryptAuthResult(authResult, encryptionKey);
  const credentialId = toBase64(new Uint8Array(credential.rawId));
  await set(
    key,
    { credentialId, ...encryptedData },
    getStore(options?.service),
  );
  return {
    metadata: createFakeMetadata(),
  };
};

export const getItem = async (
  key: string,
  options?: AuthProviderOptions,
): Promise<SensitiveInfoItem | null> => {
  if (options?.accessControl === "none") {
    const value = await get<string>(key, getStore(options.service));
    return value
      ? {
          key,
          value,
          service: options.service ?? "default",
          metadata: createFakeMetadata(),
        }
      : null;
  }

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
    const credential = await getCredential(
      data.credentialId,
      options?.relyingPartyID,
    );
    const credentialSeed = extractSeedFromCredential(credential);
    const encryptionKey = deriveEncryptionKey(credentialSeed);
    const authResultVal = decryptAuthResult(data, encryptionKey);
    if (!authResultVal) {
      return null;
    }
    return {
      key,
      service: options?.service ?? "default",
      value: authResultVal,
      metadata: createFakeMetadata(),
    };
  } catch (_error) {
    return null;
  }
};

export const deleteItem = async (
  key: string,
  options?: AuthProviderOptions,
): Promise<boolean> => {
  await del(key, getStore(options?.service));
  return true;
};

export const getAllItems = async (
  options?: AuthProviderOptionsValues,
): Promise<Array<SensitiveInfoItem>> => {
  const metadata = createFakeMetadata();
  const service = options?.service ?? "default";
  const items = await keys<string>(getStore(service));
  return items.map((key) => ({ key, service, metadata }));
};

export const clearService = async (
  options?: AuthProviderOptions,
): Promise<void> => {
  await clear(getStore(options?.service));
};

/**
 * Create metadata for web storage (WebAuthn + IndexedDB). TODO: implement like
 * react-native-sensitive-info
 */
const createFakeMetadata = (): SensitiveInfoItem["metadata"] => {
  return {
    securityLevel: "biometry",
    backend: "encryptedSharedPreferences",
    accessControl: "biometryCurrentSet",
    timestamp: Date.now(),
  };
};

/** Get storage key for owner ID. (supports namespaces via prefix) */
const getStore = (prefix = "default"): UseStore => {
  return createStore(prefix, "evolu-auth");
};

/** Throws an error if WebAuthn is not supported. */
const checkSupport = async (): Promise<void> => {
  if (!(await supportsWebAuthn())) {
    throw new Error("WebAuthn not supported");
  }
};
