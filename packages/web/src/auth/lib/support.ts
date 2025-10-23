/**
 * Check if WebAuthn is supported on the current platform.
 */
export async function supportsWebAuthn(): Promise<boolean> {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials !== 'undefined' &&
    typeof navigator.credentials.create !== 'undefined' &&
    typeof navigator.credentials.get !== 'undefined' &&
    typeof PublicKeyCredential !== 'undefined' &&
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'undefined' &&
    (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  );
}

