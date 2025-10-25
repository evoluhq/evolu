import {createAppOwner, createOwnerSecret, mnemonicToOwnerSecret, OwnerEncryptionKey, OwnerWriteKey} from './Evolu/Owner.js';
import type {AppOwner, OwnerId} from './Evolu/Owner.js';
import type {RandomBytes} from './Crypto.js';
import type {Mnemonic} from './Type.js';

export const AUTH_NAMESPACE = 'evolu';
export const AUTH_METAKEY_LAST_OWNER = '_last_owner';
export const AUTH_METAKEY_OWNER_NAMES = '_owner_names';
export const AUTH_DEFAULT_OPTIONS = {
  service: AUTH_NAMESPACE,
  keychainGroup: AUTH_NAMESPACE,
  androidBiometricsStrongOnly: true,
  iosSynchronizable: true,
  webAuthnUsername: 'Evolu User',
  authenticationPrompt: {
    title: 'Authenticate to unlock your session',
  },
} satisfies AuthProviderOptions;

/**
 * Creates an auth provider using the given secure storage implementation.
 * This factory function allows each platform to provide its own storage layer
 * while sharing the common auth logic.
 */
export const createAuthProvider = (
  secureStorage: SecureStorage,
  randomBytes: RandomBytes
): AuthProvider => {
  const auth = new EvoluAuth(secureStorage);
  return {
    login: async (ownerId, options) => {
      // Use either specified owner or the last owner used during registration/login.
      const targetOwnerId = ownerId ?? await auth.getLastOwnerId(options);
      if (!targetOwnerId) return null;

      // Retrieve and decrypt the owner (this will trigger device authentication)
      const account = await auth.getOwnerItem(targetOwnerId, options);
      if (!account?.value) return null;

      // Unserialize the values (TODO: save these as base64 instead of json serializing)
      const result = JSON.parse(account.value) as {owner: AppOwner};
      const writeKey = OwnerWriteKey.orThrow(new Uint8Array(Object.values(result.owner.writeKey)));
      const encryptionKey = OwnerEncryptionKey.orThrow(new Uint8Array(Object.values(result.owner.encryptionKey)));
      const owner: AppOwner = {...result.owner, writeKey, encryptionKey};

      // Lookup the associated username
      const names = await auth.getOwnerNames(options);
      const username = names[targetOwnerId] ?? '';

      // Update the last owner for future login attempts
      await auth.setLastOwnerId(targetOwnerId, options);

      // Return the owner and associated username
      return {owner, username};
    },

    register: async (username, options, mnemonic) => {
      // Create an owner with a new secret or use specified mnemonic
      const owner = createAppOwner(mnemonic
        ? mnemonicToOwnerSecret(mnemonic)
        : createOwnerSecret({randomBytes})
      );
      
      // Store owner, associated username, and update last owner
      await Promise.all([
        auth.setOwnerItem(owner.id, owner, username, options),
        auth.setOwnerName(owner.id, username, options),
        auth.setLastOwnerId(owner.id, options),
      ]);

      // Return the owner and associated username
      return {owner, username};
    },

    unregister: async (ownerId, options) => {
      // Delete the owner and associated username
      await Promise.all([
        auth.deleteOwnerItem(ownerId, options),
        auth.deleteOwnerName(ownerId, options),
      ]);
      
      // If the owner was the last owner then set to
      // the next owner based on metadata timestamp
      const lastOwnerId = await auth.getLastOwnerId(options);
      if (lastOwnerId === ownerId) {
        const ids = await auth.getOwnerIds(options);
        if (ids.length > 0) {
          await auth.setLastOwnerId(ids[0], options);
        }
      }
    },

    getProfiles: async (options) => {
      // Get all owner ids and associated usernames
      const [ids, names] = await Promise.all([
        auth.getOwnerIds(options),
        auth.getOwnerNames(options),
      ]);

      // Return the list of profiles (usually used for login UX)
      return ids.map(ownerId => ({
        ownerId,
        username: names[ownerId] ?? '',
      }));
    },

    clearAll: async (options) => {
      // Delete all owners and associated metadata (scoped to the service)
      await auth.clearAuthStore(options);
    },
  };
}

/**
 * Default implementation of AuthStore using SecureStorage.
 */
export class EvoluAuth {
  constructor(private readonly secureStorage: SecureStorage) {}

  async setOwnerItem(
    id: OwnerId,
    owner: AppOwner,
    username: string,
    options?: AuthProviderOptions,
  ): Promise<void> {
    await this.secureStorage.setItem(id, JSON.stringify({owner}), {
      ...AUTH_DEFAULT_OPTIONS,
      webAuthnUsername: username,
      ...options,
    });
  }

  async getOwnerItem(
    id: OwnerId,
    options?: AuthProviderOptions,
  ): Promise<SensitiveInfoItem | null> {
    return await this.secureStorage.getItem(id, {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
    });
  }

  async deleteOwnerItem(
    id: OwnerId,
    options?: AuthProviderOptions,
  ): Promise<void> {
    await this.secureStorage.deleteItem(id, {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
    });
  }

  async setLastOwnerId(
    id: OwnerId,
    options?: AuthProviderOptions,
  ): Promise<void> {
    await this.secureStorage.setItem(AUTH_METAKEY_LAST_OWNER, id, {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
      accessControl: 'none',
    });
  }

  async getLastOwnerId(
    options?: AuthProviderOptions,
  ): Promise<OwnerId | undefined> {
    const item = await this.secureStorage.getItem(AUTH_METAKEY_LAST_OWNER, {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
      accessControl: 'none',
    });
    return item?.value as OwnerId;
  }

  async getOwnerNames(
    options?: AuthProviderOptions,
  ): Promise<Record<OwnerId, string>> {
    const item = await this.secureStorage.getItem(AUTH_METAKEY_OWNER_NAMES, {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
      accessControl: 'none',
    });
    let names: Record<OwnerId, string> = {};
    if (item?.value) {
      names = JSON.parse(item.value) as Record<OwnerId, string>;
    }
    return names;
  }

  async setOwnerName(
    id: OwnerId,
    username: string,
    options?: AuthProviderOptions,
  ): Promise<void> {
    const names = await this.getOwnerNames(options);
    names[id] = username;
    await this.secureStorage.setItem(AUTH_METAKEY_OWNER_NAMES, JSON.stringify(names), {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
      accessControl: 'none',
    });
  }

  async deleteOwnerName(
    id: OwnerId,
    options?: AuthProviderOptions,
  ): Promise<void> {
    const { [id]: _, ...names } = await this.getOwnerNames(options);
    await this.secureStorage.setItem(AUTH_METAKEY_OWNER_NAMES, JSON.stringify(names), {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
      accessControl: 'none',
    });
  }

  async getOwnerIds(
    options?: AuthProviderOptions,
  ): Promise<Array<OwnerId>> {
    const items = await this.secureStorage.getAllItems({
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
      includeValues: false,
    });
    return items
      .filter(Boolean)
      .filter(i => i.key !== AUTH_METAKEY_LAST_OWNER && i.key !== AUTH_METAKEY_OWNER_NAMES)
      .map(i => i.key as OwnerId);
  }

  async clearAuthStore(options?: AuthProviderOptions): Promise<void> {
    await this.secureStorage.clearService({
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
    });
  }
}

export interface AuthProviderDep {
  readonly authProvider: AuthProvider;
}

export interface AuthProvider {
  /** Logs in with the given owner ID, or loads the target owner if not provided. */
  login: CreateAuthLogin;
  /** Registers a new owner with the given username. */
  register: CreateAuthRegister;
  /** Unregisters an owner with the given owner ID. */
  unregister: CreateAuthUnregister;
  /** Lists all registered owner ids with associated usernames. */
  getProfiles: CreateAuthGetProfiles;
  /** Clears all owners and metadata from the auth provider. */
  clearAll: CreateAuthClearAll;
}

/**
 * Secure storage interface that must be implemented by each platform.
 */
export interface SecureStorage {
  setItem: (key: string, value: string, options?: AuthProviderOptions) => Promise<MutationResult>;
  getItem: (key: string, options?: AuthProviderOptionsValues) => Promise<SensitiveInfoItem | null>;
  deleteItem: (key: string, options?: AuthProviderOptions) => Promise<boolean>;
  getAllItems: (options?: AuthProviderOptionsValues) => Promise<Array<SensitiveInfoItem>>;
  clearService: (options?: AuthProviderOptions) => Promise<void>;
}

export interface AuthResult {
  /** The owner created during registration. */
  readonly owner: AppOwner;
  /** The name provided by the user during registration. */
  readonly username: string;
}

export type CreateAuthLogin = (ownerId?: OwnerId, options?: AuthProviderOptions) => Promise<AuthResult | null>;
export type CreateAuthRegister = (username: string, options?: AuthProviderOptions, mnemonic?: Mnemonic) => Promise<AuthResult | null>;
export type CreateAuthUnregister = (ownerId: OwnerId, options?: AuthProviderOptions) => Promise<void>;
export type CreateAuthGetProfiles = (options?: AuthProviderOptionsValues) => Promise<Array<{ownerId: OwnerId, username: string}>>;
export type CreateAuthClearAll = (options?: AuthProviderOptions) => Promise<void>;

/* Types below based off of react-native-sensitive-info */

export interface AuthProviderOptions {
  /** Native: Namespaces the stored entry. Defaults to the bundle identifier (when available) or `default`. */
  readonly service?: string;
  /** iOS: Enable keychain item synchronization via iCloud. */
  readonly iosSynchronizable?: boolean;
  /** iOS: Custom keychain access group. */
  readonly keychainGroup?: string;
  /**
   * Native: Desired access-control policy. The native implementation will automatically fall back to the
   * strongest supported policy for the current device (Secure Enclave ➝ Biometry ➝ Device Credential ➝ None).
   */
  readonly accessControl?: AccessControl;
  /** Android: Fine tune whether the hardware-authenticated key should require biometrics only. */
  readonly androidBiometricsStrongOnly?: boolean;
  /** Native: Optional prompt configuration that will be shown when protected keys require user presence. */
  readonly authenticationPrompt?: AuthenticationPrompt;
  /** Web: The relying party ID for WebAuthn. Defaults to the current hostname. */
  readonly relyingPartyID?: string;
  /** Web: The relying party name for WebAuthn. Defaults to 'Evolu'. */
  readonly relyingPartyName?: string;
  /** Web: The username for WebAuthn. Defaults to 'Evolu User'. */
  readonly webAuthnUsername?: string;
}

export interface AuthProviderOptionsValues extends AuthProviderOptions {
  /** When true, the stored value is returned for each item. Defaults to false. */
  readonly includeValues?: boolean
}

/**
 * Configuration for the biometric/device credential prompt shown when a protected item is accessed.
 */
export interface AuthenticationPrompt {
  readonly title: string
  readonly subtitle?: string
  readonly description?: string
  readonly cancel?: string
}

export interface SensitiveInfoGetRequest extends AuthProviderOptions {
  readonly key: string
  /** Include the encrypted value when available. Defaults to true. */
  readonly includeValue?: boolean
}

export interface StorageMetadata {
  readonly securityLevel: SecurityLevel
  readonly backend: StorageBackend
  readonly accessControl: AccessControl
  readonly timestamp: number
}

export interface SensitiveInfoItem {
  readonly key: string
  readonly service: string
  readonly value?: string
  readonly metadata: StorageMetadata
}

export interface MutationResult {
  readonly metadata: StorageMetadata
}

/**
 * Enumerates the highest security tier that was effectively applied while storing a value.
 */
export type SecurityLevel =
  | 'secureEnclave'
  | 'strongBox'
  | 'biometry'
  | 'deviceCredential'
  | 'software'

/**
 * Enumerates the native storage backend used to persist sensitive data.
 */
export type StorageBackend =
  | 'keychain'
  | 'androidKeystore'
  | 'encryptedSharedPreferences'

/**
 * Enumerates the access-control policy enforced by the underlying secure storage.
 */
export type AccessControl =
  | 'secureEnclaveBiometry'
  | 'biometryCurrentSet'
  | 'biometryAny'
  | 'devicePasscode'
  | 'none'

