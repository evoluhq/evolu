import type {AuthProviderOptions} from '@evolu/common';

/**
 * WebAuthn-specific options that extend the base AuthProviderOptions.
 */
export interface WebAuthnOptions extends AuthProviderOptions {
  /** The relying party ID for WebAuthn. Defaults to the current hostname. */
  readonly relyingPartyID?: string;
  /** The relying party name for WebAuthn. Defaults to 'Evolu'. */
  readonly relyingPartyName?: string;
}

/**
 * Encrypted data stored in IndexedDB.
 */
export interface EncryptedStorage {
  readonly nonce: string;
  readonly ciphertext: string;
  readonly credentialId: string;
}

