import type {Owner, OwnerId} from './Evolu/Owner.js';

export const AUTH_NAMESPACE = 'evoluAuth';
export const AUTH_DEFAULT_OPTIONS = {
  service: AUTH_NAMESPACE,
  keychainGroup: AUTH_NAMESPACE,
  androidBiometricsStrongOnly: true,
  iosSynchronizable: true,
  authenticationPrompt: {
    title: 'Authenticate to unlock your session',
    subtitle: 'Lorem ipsum, where does this show??',
    description: 'Lorem ipsum, where does this show??',
    cancel: 'Cancel',
  },
} satisfies AuthProviderOptions;

export interface AuthResult {
  /** The owner created during registration. */
  readonly owner: Owner;
  /** The name provided by the user during registration. */
  readonly username: string;
}

export interface AuthProviderOptions {
  /** Native: Namespaces the stored entry. Defaults to the bundle identifier (when available) or `default`. */
  readonly service?: string
  /** iOS: Enable keychain item synchronization via iCloud. */
  readonly iosSynchronizable?: boolean
  /** iOS: Custom keychain access group. */
  readonly keychainGroup?: string
  /**
   * Native: Desired access-control policy. The native implementation will automatically fall back to the
   * strongest supported policy for the current device (Secure Enclave ➝ Biometry ➝ Device Credential ➝ None).
   */
  readonly accessControl?: AccessControl
  /** Android: Fine tune whether the hardware-authenticated key should require biometrics only. */
  readonly androidBiometricsStrongOnly?: boolean
  /** Native: Optional prompt configuration that will be shown when protected keys require user presence. */
  readonly authenticationPrompt?: AuthenticationPrompt
}

/**
 * Enumerates the access-control policy enforced by the underlying secure storage.
 */
export type AccessControl =
  | 'secureEnclaveBiometry'
  | 'biometryCurrentSet'
  | 'biometryAny'
  | 'devicePasscode'
  | 'none'

/**
 * Configuration for the biometric/device credential prompt shown when a protected item is accessed.
 */
export interface AuthenticationPrompt {
  readonly title: string
  readonly subtitle?: string
  readonly description?: string
  readonly cancel?: string
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
  options?: AuthProviderOptions;
}) => Promise<OwnerId[]>;
