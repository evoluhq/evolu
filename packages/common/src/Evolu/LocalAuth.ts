import { RandomBytesDep } from "../Crypto.js";
import { Mnemonic } from "../Type.js";
import {
  AppOwner,
  createAppOwner,
  createOwnerSecret,
  mnemonicToOwnerSecret,
  OwnerEncryptionKey,
  OwnerId,
  OwnerWriteKey,
} from "./Owner.js";

/** 
 * Local authentication and authorization system for Evolu.
 * This is API is subject to change and not recommended for production use.
 *
 * @experimental
 */
export interface LocalAuth {
  /** Logs in with the given owner ID, or loads the target owner if not provided. */
  login: (
    ownerId: OwnerId,
    options?: LocalAuthOptions,
  ) => Promise<AuthResult | null>;

  /** Registers a new owner with the given username. */
  register: (
    username: string,
    options?: LocalAuthOptions & { mnemonic?: Mnemonic | null },
  ) => Promise<AuthResult | null>;

  /** Unregisters an owner with the given owner ID. */
  unregister: (ownerId: OwnerId, options?: LocalAuthOptions) => Promise<void>;

  /** Gets the current owner (last logged in or last registered owner) */
  getOwner: (options?: LocalAuthOptions) => Promise<AuthResult | null>;

  /** Lists all registered owner ids with associated usernames. */
  getProfiles: (options?: LocalAuthOptionsValues) => Promise<Array<AuthList>>;

  /** Clears all owners and metadata from the local auth. */
  clearAll: (options?: LocalAuthOptions) => Promise<void>;
}

export interface LocalAuthDep {
  readonly localAuth: LocalAuth;
}

/**
 * - **⚠️
 *
 * Secure storage interface that must be implemented by each platform.
 */
export interface SecureStorage {
  setItem: (
    key: string,
    value: string,
    options?: LocalAuthOptions,
  ) => Promise<MutationResult>;
  getItem: (
    key: string,
    options?: LocalAuthOptionsValues,
  ) => Promise<SensitiveInfoItem | null>;
  deleteItem: (key: string, options?: LocalAuthOptions) => Promise<boolean>;
  getAllItems: (
    options?: LocalAuthOptionsValues,
  ) => Promise<Array<SensitiveInfoItem>>;
  clearService: (options?: LocalAuthOptions) => Promise<void>;
}

export interface SecureStorageDep {
  readonly secureStorage: SecureStorage;
}

/**
 * Creates a local auth using the given secure storage implementation. This
 * factory function allows each platform to provide its own storage layer while
 * sharing the common auth logic.
 */
export const createLocalAuth = (
  deps: SecureStorageDep & RandomBytesDep,
): LocalAuth => {
  const setLastOwnerId = async (
    id: OwnerId,
    options?: LocalAuthOptions,
  ): Promise<void> => {
    await deps.secureStorage.setItem(AUTH_METAKEY_LAST_OWNER, id, {
      ...buildAuthOptions(options),
      accessControl: "none",
    });
  };

  const getLastOwnerId = async (
    options?: LocalAuthOptions,
  ): Promise<OwnerId | undefined> => {
    const item = await deps.secureStorage.getItem(AUTH_METAKEY_LAST_OWNER, {
      ...buildAuthOptions(options),
      accessControl: "none",
    });
    return item?.value as OwnerId;
  };

  const getOwnerNames = async (
    options?: LocalAuthOptions,
  ): Promise<Record<OwnerId, string>> => {
    const item = await deps.secureStorage.getItem(AUTH_METAKEY_OWNER_NAMES, {
      ...buildAuthOptions(options),
      accessControl: "none",
    });
    let names: Record<OwnerId, string> = {};
    if (item?.value) {
      names = JSON.parse(item.value) as Record<OwnerId, string>;
    }
    return names;
  };

  const setOwnerName = async (
    id: OwnerId,
    username: string,
    options?: LocalAuthOptions,
  ): Promise<void> => {
    const names = await getOwnerNames(options);
    names[id] = username;
    await deps.secureStorage.setItem(
      AUTH_METAKEY_OWNER_NAMES,
      JSON.stringify(names),
      {
        ...buildAuthOptions(options),
        accessControl: "none",
      },
    );
  };

  const deleteOwnerName = async (
    id: OwnerId,
    options?: LocalAuthOptions,
  ): Promise<void> => {
    const { [id]: _, ...names } = await getOwnerNames(options);
    await deps.secureStorage.setItem(
      AUTH_METAKEY_OWNER_NAMES,
      JSON.stringify(names),
      {
        ...buildAuthOptions(options),
        accessControl: "none",
      },
    );
  };

  const getOwnerIds = async (
    options?: LocalAuthOptions,
  ): Promise<Array<OwnerId>> => {
    const items = await deps.secureStorage.getAllItems({
      ...buildAuthOptions(options),
      includeValues: false,
    });
    return items
      .filter(Boolean)
      .filter(
        (i) =>
          i.key !== AUTH_METAKEY_LAST_OWNER &&
          i.key !== AUTH_METAKEY_OWNER_NAMES,
      )
      .map((i) => i.key as OwnerId);
  };

  const clearAuthStore = (options?: LocalAuthOptions): Promise<void> =>
    deps.secureStorage.clearService(buildAuthOptions(options));

  const buildAuthOptions = (
    options?: LocalAuthOptions,
    username?: string,
  ): LocalAuthOptions => {
    const newOptions: LocalAuthOptions = {
      ...AUTH_DEFAULT_OPTIONS,
      ...(username && { webAuthnUsername: username }),
      ...options,
    };
    return {
      ...newOptions,
      authenticationPrompt: {
        title: replaceMessageTokens(newOptions.authenticationPrompt?.title ?? "", username),
        cancel: replaceMessageTokens(newOptions.authenticationPrompt?.cancel ?? "", username),
        subtitle: replaceMessageTokens(newOptions.authenticationPrompt?.subtitle ?? "", username),
        description: replaceMessageTokens(newOptions.authenticationPrompt?.description ?? "", username),
      },
    };
  };

  const replaceMessageTokens = (text: string, username?: string): string => {
    if (!username) return text;
    return text.replace("|USERNAME|", username);
  };

  return {
    login: async (ownerId, options) => {
      // Lookup the associated username
      const names = await getOwnerNames(options);
      const username = names[ownerId] ?? "";
      // Currently a reload is needed. This avoids authentication
      // it needs to be handled on next page load.
      // We set the last owner so we know what the target is.
      // It is the applications's responsibility to reload and trigger login.
      await setLastOwnerId(ownerId, options);
      return { owner: undefined, username };
    },

    register: async (username, options) => {
      // Create an owner with a new secret or use specified mnemonic
      const owner = createAppOwner(
        options?.mnemonic
          ? mnemonicToOwnerSecret(options.mnemonic)
          : createOwnerSecret(deps),
      );

      // Store owner, associated username, and update last owner
      await Promise.all([
        // setOwnerItem
        deps.secureStorage.setItem(
          owner.id,
          JSON.stringify({ owner }),
          buildAuthOptions(options, username),
        ),
        setOwnerName(owner.id, username, options),
        setLastOwnerId(owner.id, options),
      ]);

      // Return the owner and associated username
      return { owner, username };
    },

    unregister: async (ownerId, options) => {
      // Delete the owner and associated username
      await Promise.all([
        // deleteOwnerItem
        deps.secureStorage.deleteItem(ownerId, buildAuthOptions(options)),
        deleteOwnerName(ownerId, options),
      ]);

      // If the owner was the last owner then set to
      // the next owner based on metadata timestamp
      const lastOwnerId = await getLastOwnerId(options);
      if (lastOwnerId === ownerId) {
        const ids = await getOwnerIds(options);
        if (ids.length > 0) {
          await setLastOwnerId(ids[0], options);
        }
      }
    },

    getOwner: async (options) => {
      const ownerId = await getLastOwnerId(options);
      if (!ownerId) return null;

      const names = await getOwnerNames(options);
      const username = names[ownerId] ?? "";

      // Retrieve and decrypt the owner (this will trigger device authentication)
      const account = await deps.secureStorage.getItem(
        ownerId,
        buildAuthOptions(options, username),
      );
      if (!account?.value) return null;

      // Unserialize the values (TODO: save these as base64 instead of json serializing)
      const result = JSON.parse(account.value) as { owner: AppOwner };
      const writeKey = OwnerWriteKey.orThrow(
        new Uint8Array(Object.values(result.owner.writeKey)),
      );
      const encryptionKey = OwnerEncryptionKey.orThrow(
        new Uint8Array(Object.values(result.owner.encryptionKey)),
      );
      const owner: AppOwner = { ...result.owner, writeKey, encryptionKey };

      // Update the last owner for future login attempts
      await setLastOwnerId(ownerId, options);

      // Return the owner and associated username
      return { owner, username };
    },

    getProfiles: async (options) => {
      // Get all owner ids and associated usernames
      const [ids, names] = await Promise.all([
        getOwnerIds(options),
        getOwnerNames(options),
      ]);

      // Return the list of profiles (usually used for login UX)
      return ids.map((ownerId) => ({
        ownerId,
        username: names[ownerId] ?? "",
      }));
    },

    clearAll: async (options) => {
      // Delete all owners and associated metadata (scoped to the service)
      await clearAuthStore(options);
    },
  };
};

// TOHO: With `const`, we don't need UPPER_CASE
export const AUTH_NAMESPACE = "evolu";
export const AUTH_METAKEY_LAST_OWNER = "_last_owner";
export const AUTH_METAKEY_OWNER_NAMES = "_owner_names";
export const AUTH_DEFAULT_OPTIONS: LocalAuthOptions = {
  service: AUTH_NAMESPACE,
  keychainGroup: AUTH_NAMESPACE,
  androidBiometricsStrongOnly: true,
  iosSynchronizable: true,
  webAuthnUsername: "Evolu User",
  authenticationPrompt: {
    title: "Authenticate as |USERNAME|",
  },
};

export interface AuthResult {
  /** The app owner created during registration. */
  readonly owner: AppOwner | undefined;
  /** The name provided by the user during registration. */
  readonly username: string;
}

export interface AuthList {
  /** The app owner ID. */
  readonly ownerId: OwnerId;
  /** The name provided by the user during registration. */
  readonly username: string;
}

/* Types below based off of react-native-sensitive-info */

export interface LocalAuthOptions {
  /**
   * Native: Namespaces the stored entry. Defaults to the bundle identifier
   * (when available) or `default`.
   */
  readonly service?: string;

  /** IOS: Enable keychain item synchronization via iCloud. */
  readonly iosSynchronizable?: boolean;

  /** IOS: Custom keychain access group. */
  readonly keychainGroup?: string;

  /**
   * Native: Desired access-control policy. The native implementation will
   * automatically fall back to the strongest supported policy for the current
   * device (Secure Enclave ➝ Biometry ➝ Device Credential ➝ None).
   */
  readonly accessControl?: AccessControl;

  /**
   * Android: Fine tune whether the hardware-authenticated key should require
   * biometrics only.
   */
  readonly androidBiometricsStrongOnly?: boolean;

  /**
   * Native: Optional prompt configuration that will be shown when protected
   * keys require user presence.
   */
  readonly authenticationPrompt?: AuthenticationPrompt;

  /** Web: The relying party ID for WebAuthn. Defaults to the current hostname. */
  readonly relyingPartyID?: string;

  /** Web: The relying party name for WebAuthn. Defaults to 'Evolu'. */
  readonly relyingPartyName?: string;

  /** Web: The username for WebAuthn. Defaults to 'Evolu User'. */
  readonly webAuthnUsername?: string;

  /**
   * Web: The user verification requirement for WebAuthn. Defaults to
   * 'required'.
   */
  readonly webAuthnUserVerification?: UserVerificationRequirement;

  /** Web: The authenticator attachment for WebAuthn. Defaults to 'platform'. */
  readonly webAuthnAuthenticatorAttachment?: AuthenticatorAttachment;
}

export interface LocalAuthOptionsValues extends LocalAuthOptions {
  /** When true, the stored value is returned for each item. Defaults to false. */
  readonly includeValues?: boolean;
}

/**
 * Configuration for the biometric/device credential prompt shown when a
 * protected item is accessed.
 */
export interface AuthenticationPrompt {
  readonly title: string;
  readonly subtitle?: string;
  readonly description?: string;
  readonly cancel?: string;
}

export interface SensitiveInfoGetRequest extends LocalAuthOptions {
  readonly key: string;
  /** Include the encrypted value when available. Defaults to true. */
  readonly includeValue?: boolean;
}

export interface StorageMetadata {
  readonly securityLevel: SecurityLevel;
  readonly backend: StorageBackend;
  readonly accessControl: AccessControl;
  readonly timestamp: number;
}

export interface SensitiveInfoItem {
  readonly key: string;
  readonly service: string;
  readonly value?: string;
  readonly metadata: StorageMetadata;
}

export interface MutationResult {
  readonly metadata: StorageMetadata;
}

/**
 * Enumerates the highest security tier that was effectively applied while
 * storing a value.
 */
export type SecurityLevel =
  | "secureEnclave"
  | "strongBox"
  | "biometry"
  | "deviceCredential"
  | "software";

/** Enumerates the native storage backend used to persist sensitive data. */
export type StorageBackend =
  | "keychain"
  | "androidKeystore"
  | "encryptedSharedPreferences";

/**
 * Enumerates the access-control policy enforced by the underlying secure
 * storage.
 */
export type AccessControl =
  | "secureEnclaveBiometry"
  | "biometryCurrentSet"
  | "biometryAny"
  | "devicePasscode"
  | "none";
