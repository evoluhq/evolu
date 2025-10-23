import {createOwner, createOwnerSecret} from './Evolu/Owner.js';
import type {Owner, OwnerId} from './Evolu/Owner.js';
import type {RandomBytes} from './Crypto.js';

export const AUTH_NAMESPACE = 'evolu';
export const AUTH_DEFAULT_OPTIONS = {
  service: AUTH_NAMESPACE,
  keychainGroup: AUTH_NAMESPACE,
  androidBiometricsStrongOnly: true,
  iosSynchronizable: true,
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
): AuthProvider => ({
  login: async ({ownerId, options}) => {
    const account = await secureStorage.getItem(ownerId, {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
    });
    if (!account?.value) {
      return null;
    }
    try {
      return JSON.parse(account.value) as AuthResult;
    } catch (_error) {
      return null;
    }
  },
  register: async ({username, options}) => {
    const secret = createOwnerSecret({randomBytes});
    const owner = createOwner(secret);
    await secureStorage.setItem(owner.id, JSON.stringify({username, owner}), {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
    });
    return {owner, username};
  },
  unregister: async ({ownerId, options}) => {
    await secureStorage.deleteItem(ownerId, {
      ...AUTH_DEFAULT_OPTIONS,
      ...options,
    });
  },
  getOwnerIds: async ({options}) => {
    const accounts = await secureStorage.getAllItems({
      ...AUTH_DEFAULT_OPTIONS,
      includeValues: false,
      ...options,
    });
    return accounts
      .map(account => account.key as OwnerId)
      .filter(Boolean);
  },
});

export interface AuthProviderDep {
  readonly authProvider: AuthProvider;
}

export interface AuthProvider {
  /** Logs in with the given owner ID. */
  login: CreateAuthLogin;
  /** Registers a new owner with the given username. */
  register: CreateAuthRegister;
  /** Unregisters an owner with the given owner ID. */
  unregister: CreateAuthUnregister;
  /** Gets the IDs of all registered owners. */
  getOwnerIds: CreateAuthGetOwnerIds;
}

/**
 * Secure storage interface that must be implemented by each platform.
 */
export interface SecureStorage {
  setItem: (key: string, value: string, options?: AuthProviderOptions) => Promise<MutationResult>;
  getItem: (key: string, options?: AuthProviderOptionsValues) => Promise<SensitiveInfoItem | null>;
  deleteItem: (key: string, options?: AuthProviderOptions) => Promise<boolean>;
  getAllItems: (options?: AuthProviderOptionsValues) => Promise<Array<SensitiveInfoItem>>;
}

export interface AuthResult {
  /** The owner created during registration. */
  readonly owner: Owner;
  /** The name provided by the user during registration. */
  readonly username: string;
}

export type CreateAuthLogin = ({ownerId, options}: {
  ownerId: OwnerId;
  options?: AuthProviderOptions;
}) => Promise<AuthResult | null>;

export type CreateAuthRegister = ({username, options}: {
  username: string;
  options?: AuthProviderOptions;
}) => Promise<AuthResult | null>;

export type CreateAuthUnregister = ({ownerId, options}: {
  ownerId: OwnerId;
  options?: AuthProviderOptions;
}) => Promise<void>;

export type CreateAuthGetOwnerIds = ({options}: {
  options?: AuthProviderOptionsValues;
}) => Promise<Array<OwnerId>>;

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
