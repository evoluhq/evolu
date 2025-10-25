import { generateSeed, fromBase64 } from "./crypto.js";

export async function supportsWebAuthn(): Promise<boolean> {
  return (
    typeof navigator !== "undefined" &&
    "credentials" in navigator &&
    typeof navigator.credentials.create !== "undefined" &&
    typeof navigator.credentials.get !== "undefined" &&
    typeof PublicKeyCredential !== "undefined" &&
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "undefined" &&
    (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  );
}

export async function createCredential(
  username: string,
  seed: Uint8Array,
  relyingPartyID?: string,
  relyingPartyName?: string,
): Promise<PublicKeyCredential> {
  const options = createCredentialCreationOptions(
    username,
    seed,
    relyingPartyID,
    relyingPartyName,
  );
  const credential = await navigator.credentials.create(options) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error("Failed to create WebAuthn credential");
  }
  return credential;
}

export async function getCredential(
  credentialId: string,
  relyingPartyID?: string,
): Promise<PublicKeyCredential> {
  const options = createCredentialRequestOptions(credentialId, relyingPartyID);
  const credential = await navigator.credentials.get(options) as PublicKeyCredential | null;
  if (!credential?.response) {
    throw new Error("Failed to get WebAuthn credential");
  }
  return credential;
}

export function extractSeedFromCredential(
  credential: PublicKeyCredential,
): Uint8Array {
  const response = credential.response as AuthenticatorAssertionResponse;
  if (!response.userHandle) {
    throw new Error("No userHandle in credential response");
  }
  return new Uint8Array(response.userHandle);
}

function createCredentialCreationOptions(
  username: string,
  seed: Uint8Array,
  relyingPartyID?: string,
  relyingPartyName?: string,
  authenticatorAttachment?: AuthenticatorAttachment,
): CredentialCreationOptions {
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
        {type: "public-key", alg: -8},   // Ed25519
        {type: "public-key", alg: -7},   // ES256
        {type: "public-key", alg: -257}, // RS256
      ],
      attestation: "none",
      authenticatorSelection: {
        // - "discouraged": Only User Presence is needed.
        // - "preferred": User Verification is preferred but not required. Falls back to User Presence.
        // - "required": User Verification MUST occur (biometrics/PIN). Clients may silently downgrade to User Presence only.
        userVerification: "required",
        //authenticatorAttachment: undefined,
        // - "discouraged": Server-side credential is preferable, but will accept client-side discoverable credential.
        // - "preferred": Relying Party strongly prefers client-side discoverable credential but will accept server-side credential.
        // - "required": Client-side discoverable credential MUST be created, error if it can't be created.
        residentKey: "required",
        // - "platform": Uses the platform's built-in authenticator.
        // - "cross-platform": Uses a device specific authenticator (yubikey, fido2, etc.)
        authenticatorAttachment: authenticatorAttachment ?? "platform",
        // This property is deprecated in favor of residentKey (true = "required")
        // Included for backwards compatibility.
        requireResidentKey: true,
      },
    },
  };
}

function createCredentialRequestOptions(
  credentialId: string,
  relyingPartyID?: string,
  userVerification?: "preferred" | "discouraged" | "required",
): CredentialRequestOptions {
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
}
