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
    const metadata = createMetadata(false);
    await set(
      key,
      { value, metadata },
      getStore(options.service),
    );
    return { metadata };
  }

  await checkWebAuthnSupport();

  const seed = generateSeed();
  const authResult = JSON.parse(value) as AuthResult;
  const credential = await createCredential(
    options?.webAuthnUsername ?? "Evolu User",
    seed,
    options?.relyingPartyID,
    options?.relyingPartyName,
    options?.webAuthnUserVerification,
    options?.webAuthnAuthenticatorAttachment,
  );
  const encryptionKey = deriveEncryptionKey(seed);
  const encryptedData = encryptAuthResult(authResult, encryptionKey);
  const credentialId = toBase64(new Uint8Array(credential.rawId));
  const metadata = createMetadata();
  await set(
    key,
    { credentialId, ...encryptedData, metadata },
    getStore(options?.service),
  );
  return { metadata };
};

export const getItem = async (
  key: string,
  options?: AuthProviderOptions,
): Promise<SensitiveInfoItem | null> => {
  if (options?.accessControl === "none") {
    const data = await get<{
      readonly value: string;
      readonly metadata: SensitiveInfoItem["metadata"];
    }>(key, getStore(options.service));
    return data
      ? {
          key,
          value: data.value,
          service: options.service ?? "default",
          metadata: data.metadata,
        }
      : null;
  }

  await checkWebAuthnSupport();

  const data = await get<{
    readonly nonce: string;
    readonly ciphertext: string;
    readonly credentialId: string;
    readonly metadata: SensitiveInfoItem["metadata"];
  }>(key, getStore(options?.service));
  if (!data) {
    return null;
  }
  try {
    const credential = await getCredential(
      data.credentialId,
      options?.relyingPartyID,
      options?.webAuthnUserVerification,
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
      metadata: data.metadata,
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
  const service = options?.service ?? "default";
  const itemKeys = await keys<string>(getStore(service));
  const items = await Promise.all(
    itemKeys.map(async (key) => {
      const data = await get<{
        readonly metadata?: SensitiveInfoItem["metadata"];
        readonly value?: string;
      }>(key, getStore(service));
      return {
        key,
        service,
        metadata: data?.metadata ?? createMetadata(),
        ...(options?.includeValues && data?.value ? { value: data.value } : {}),
      };
    }),
  );
  return items;
};

export const clearService = async (
  options?: AuthProviderOptions,
): Promise<void> => {
  await clear(getStore(options?.service));
};

/**
 * Create default metadata for backwards compatibility with items that don't have
 * stored metadata.
 */
const createMetadata = (isSecure = true): SensitiveInfoItem["metadata"] => {
  return {
    backend: "keychain",
    accessControl: isSecure ? "biometryCurrentSet" : "none",
    securityLevel: isSecure ? "biometry" : "software",
    timestamp: Date.now(),
  };
};

/** Get storage key for owner ID. (supports namespaces via prefix) */
const getStore = (prefix = "default"): UseStore => {
  return createStore(prefix, "evolu-auth");
};

/** Throws an error if WebAuthn is not supported. */
const checkWebAuthnSupport = async (): Promise<void> => {
  if (!(await supportsWebAuthn())) {
    throw new Error("WebAuthn not supported");
  }
};
