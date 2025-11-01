import KVStore from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';
import { AUTH_DEFAULT_OPTIONS } from '@evolu/common';

import type { LocalAuthOptions, SecureStorage, SensitiveInfoItem, StorageMetadata, AccessControl } from "@evolu/common";

export const createSecureStore = (): SecureStorage => {
  const store: SecureStorage = {
    setItem: async (key, value, options) => {
      const rnsiOpts = convertOptions(options);
      const service = options?.service ?? 'default';
      const metadata = createMetadata(options?.accessControl === 'none');
      await KVStore.setItem(`${service}-${key}`, '1');
      await SecureStore.setItemAsync(key, JSON.stringify({value, metadata}), rnsiOpts);
      return { metadata };
    },

    getItem: async (key, options) => {
      const rnsiOpts = convertOptions(options);
      const service = options?.service ?? 'default';
      let data: {value: string; metadata: StorageMetadata};
      try {
        const result = await SecureStore.getItemAsync(key, rnsiOpts);
        if (!result) return null;
        data = JSON.parse(result) as {value: string; metadata: StorageMetadata};
      } catch (_error) {
        return null;
      }
      return { key, service, ...data };
    },

    deleteItem: async (key, options) => {
      const rnsiOpts = convertOptions(options);
      const service = options?.service ?? 'default';
      await Promise.all([
        KVStore.removeItemAsync(`${service}-${key}`),
        SecureStore.deleteItemAsync(key, rnsiOpts),
      ]);
      return true;
    },

    getAllItems: async (options) => {
      const keys = await KVStore.getAllKeysAsync();
      const service = options?.service ?? 'default';
      const metadata = createMetadata(options?.accessControl === 'none');
      return keys
        .filter(key => key.startsWith(`${service}-`))
        .map(key => ({ key: key.slice(service.length + 1), service, metadata }));
    },

    clearService: async (options) => {
      const rnsiOpts = convertOptions(options);
      const service = options?.service ?? 'default';
      const items = await store.getAllItems(options);
      await KVStore.multiRemove(items.map(item => `${service}-${item.key}`));
      await Promise.all(items.map(async (item) => {
        await SecureStore.deleteItemAsync(item.key, rnsiOpts);
      }));
    },
  };

  return store;
};

/**
 * Create default metadata for backwards compatibility with items that don't
 * have stored metadata.
 */
const createMetadata = (isSecure = true): SensitiveInfoItem["metadata"] => {
  return {
    backend: "keychain",
    accessControl: isSecure ? "biometryCurrentSet" : "none",
    securityLevel: isSecure ? "biometry" : "software",
    timestamp: Date.now(),
  };
};

function convertOptions(options?: LocalAuthOptions): SecureStore.SecureStoreOptions {
  const accessGroup = options?.keychainGroup
    ?? AUTH_DEFAULT_OPTIONS.keychainGroup
    ?? '';
  const keychainService = options?.service
    ?? AUTH_DEFAULT_OPTIONS.service
    ?? '';
  const keychainAccessible = convertKeychainAccessible(options?.accessControl
    ?? AUTH_DEFAULT_OPTIONS.accessControl
    ?? 'biometryCurrentSet');
  const authenticationPrompt = options?.authenticationPrompt?.title
    ?? AUTH_DEFAULT_OPTIONS.authenticationPrompt?.title
    ?? '';
  return {
    accessGroup,
    keychainService,
    keychainAccessible,
    authenticationPrompt,
    requireAuthentication: options?.accessControl !== 'none',
  };
}

function convertKeychainAccessible(accessControl: AccessControl): SecureStore.KeychainAccessibilityConstant {
  switch (accessControl) {
    case "none":
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return SecureStore.ALWAYS;
    case "biometryCurrentSet":
      return SecureStore.AFTER_FIRST_UNLOCK;
    case "biometryAny":
      return SecureStore.AFTER_FIRST_UNLOCK;
    case "devicePasscode":
      return SecureStore.AFTER_FIRST_UNLOCK;
    case "secureEnclaveBiometry":
      return SecureStore.AFTER_FIRST_UNLOCK;
    // Exhaustive check
    default: accessControl satisfies never;
    // Default (for typescript, should never hit)
    return SecureStore.AFTER_FIRST_UNLOCK;
  }
}
