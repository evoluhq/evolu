import {generateChallenge} from './crypto.js';
import {fromBase64} from './encoding.js';

/**
 * Create WebAuthn credential creation options.
 */
export function createCredentialCreationOptions(
  username: string,
  seed: Uint8Array,
  relyingPartyID?: string,
  relyingPartyName?: string
): CredentialCreationOptions {
  return {
    publicKey: {
      challenge: generateChallenge() as BufferSource,
      rp: {
        id: relyingPartyID || document.location.hostname,
        name: relyingPartyName || 'Evolu',
      },
      user: {
        id: seed as BufferSource,
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        {type: 'public-key', alg: -8},  // Ed25519
        {type: 'public-key', alg: -7},  // ES256
        {type: 'public-key', alg: -257}, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required',
        requireResidentKey: true,
      },
      attestation: 'none',
    },
  };
}

/**
 * Create WebAuthn credential request options.
 */
export function createCredentialRequestOptions(
  credentialId: string,
  relyingPartyID?: string
): CredentialRequestOptions {
  return {
    publicKey: {
      challenge: generateChallenge() as BufferSource,
      rpId: relyingPartyID || document.location.hostname,
      allowCredentials: [
        {
          type: 'public-key',
          id: fromBase64(credentialId) as BufferSource,
        },
      ],
      userVerification: 'required',
    },
  };
}

/**
 * Create a WebAuthn credential.
 */
export async function createCredential(
  username: string,
  seed: Uint8Array,
  relyingPartyID?: string,
  relyingPartyName?: string
): Promise<PublicKeyCredential> {
  const options = createCredentialCreationOptions(
    username,
    seed,
    relyingPartyID,
    relyingPartyName
  );
  
  const credential = await navigator.credentials.create(options) as PublicKeyCredential | null;
  
  if (!credential) {
    throw new Error('Failed to create WebAuthn credential');
  }
  
  return credential;
}

/**
 * Get a WebAuthn credential.
 */
export async function getCredential(
  credentialId: string,
  relyingPartyID?: string
): Promise<PublicKeyCredential> {
  const options = createCredentialRequestOptions(credentialId, relyingPartyID);
  
  const credential = await navigator.credentials.get(options) as PublicKeyCredential | null;
  
  if (!credential?.response) {
    throw new Error('Failed to get WebAuthn credential');
  }
  
  return credential;
}

/**
 * Extract seed from WebAuthn credential response.
 */
export function extractSeedFromCredential(credential: PublicKeyCredential): Uint8Array {
  const response = credential.response as AuthenticatorAssertionResponse;
  
  if (!response.userHandle) {
    throw new Error('No userHandle in credential response');
  }
  
  return new Uint8Array(response.userHandle);
}

