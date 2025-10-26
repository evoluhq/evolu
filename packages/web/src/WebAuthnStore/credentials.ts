import { generateSeed, fromBase64 } from "./crypto.js";

export const supportsWebAuthn = async (): Promise<boolean> => {
  return (
    typeof navigator !== "undefined" &&
    "credentials" in navigator &&
    typeof navigator.credentials.create !== "undefined" &&
    typeof navigator.credentials.get !== "undefined" &&
    typeof PublicKeyCredential !== "undefined" &&
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !==
      "undefined" &&
    (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  );
};

export const createCredential = async (
  username: string,
  seed: Uint8Array,
  relyingPartyID?: string,
  relyingPartyName?: string,
  userVerification?: UserVerificationRequirement,
  authenticatorAttachment?: AuthenticatorAttachment,
): Promise<PublicKeyCredential> => {
  const options = createCredentialCreationOptions(
    username,
    seed,
    relyingPartyID,
    relyingPartyName,
    userVerification,
    authenticatorAttachment,
  );
  const credential = (await navigator.credentials.create(
    options,
  )) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error("Failed to create WebAuthn credential");
  }
  return credential;
};

export const getCredential = async (
  credentialId: string,
  relyingPartyID?: string,
  userVerification?: UserVerificationRequirement,
): Promise<PublicKeyCredential> => {
  const options = createCredentialRequestOptions(
    credentialId,
    relyingPartyID,
    userVerification,
  );
  const credential = (await navigator.credentials.get(
    options,
  )) as PublicKeyCredential | null;
  if (!credential?.response) {
    throw new Error("Failed to get WebAuthn credential");
  }
  return credential;
};

export const extractSeedFromCredential = (
  credential: PublicKeyCredential,
): Uint8Array => {
  const response = credential.response as AuthenticatorAssertionResponse;
  if (!response.userHandle) {
    throw new Error("No userHandle in credential response");
  }
  return new Uint8Array(response.userHandle);
};

const createCredentialCreationOptions = (
  username: string,
  seed: Uint8Array,
  relyingPartyID?: string,
  relyingPartyName?: string,
  userVerification?: UserVerificationRequirement,
  authenticatorAttachment?: AuthenticatorAttachment,
): CredentialCreationOptions => {
  return {
    publicKey: {
      challenge: generateSeed() as BufferSource,
      rp: {
        id: relyingPartyID ?? document.location.hostname,
        name: relyingPartyName ?? "Evolu",
      },
      user: {
        id: seed as BufferSource,
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -8 }, // Ed25519
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      attestation: "none",
      authenticatorSelection: {
        // - "platform": Uses the platform's built-in authenticator.
        // - "cross-platform": Uses a device specific authenticator (yubikey, fido2, etc.)
        authenticatorAttachment: authenticatorAttachment ?? "platform",
        // - "discouraged": Only User Presence is needed.
        // - "preferred": User Verification is preferred but not required. Falls back to User Presence.
        // - "required": User Verification MUST occur (biometrics/PIN). Clients may silently downgrade to User Presence only.
        userVerification: userVerification ?? "required",
        // - "discouraged": Server-side credential is preferable, but will accept client-side discoverable credential.
        // - "preferred": Relying Party strongly prefers client-side discoverable credential but will accept server-side credential.
        // - "required": Client-side discoverable credential MUST be created, error if it can't be created.
        residentKey: "required",
        // Included for backwards compatibility. Deprecated in favor of residentKey (true = "required")
        requireResidentKey: true,
      },
    },
  };
};

const createCredentialRequestOptions = (
  credentialId: string,
  relyingPartyID?: string,
  userVerification?: UserVerificationRequirement,
): CredentialRequestOptions => {
  return {
    publicKey: {
      challenge: generateSeed() as BufferSource,
      rpId: relyingPartyID ?? document.location.hostname,
      userVerification: userVerification ?? "preferred",
      allowCredentials: [
        {
          type: "public-key",
          id: fromBase64(credentialId) as BufferSource,
        },
      ],
    },
  };
};
