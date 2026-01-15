import type {
  AuthResult,
  Entropy32,
  RandomBytesDep,
  SecureStorage,
  SensitiveInfoItem,
} from "@evolu/common";
import {
  Base64Url,
  base64UrlToUint8Array,
  bytesToUtf8,
  createSlip21,
  decryptWithXChaCha20Poly1305,
  EncryptionKey,
  encryptWithXChaCha20Poly1305,
  Entropy24,
  uint8ArrayToBase64Url,
  utf8ToBytes,
  XChaCha20Poly1305Ciphertext,
} from "@evolu/common";
import type { UseStore } from "idb-keyval";
import { clear, createStore, del, get, keys, set } from "idb-keyval";

/** @experimental */
export const createWebAuthnStore = (deps: RandomBytesDep): SecureStorage => ({
  setItem: async (key, value, options) => {
    if (options?.accessControl === "none") {
      const metadata = createMetadata(false);
      await set(key, { value, metadata }, getStore(options.service));
      return { metadata };
    }
    const seed = generateSeed(deps)();
    const authResult = JSON.parse(value) as AuthResult;
    const credential = await createCredential(deps)(
      options?.webAuthnUsername ?? "Evolu User",
      seed,
      options?.relyingPartyID,
      options?.relyingPartyName,
      options?.webAuthnUserVerification,
      options?.webAuthnAuthenticatorAttachment,
    );
    const encryptionKey = deriveEncryptionKey(seed);
    const encryptedData = encryptAuthResult(deps)(authResult, encryptionKey);
    const credentialId = uint8ArrayToBase64Url(
      new Uint8Array(credential.rawId),
    );
    const metadata = createMetadata();
    await set(
      key,
      { credentialId, ...encryptedData, metadata },
      getStore(options?.service),
    );
    return { metadata };
  },

  getItem: async (key, options) => {
    if (options?.accessControl === "none") {
      const data = await get<{
        readonly value: string;
        readonly metadata: SensitiveInfoItem["metadata"];
      }>(key, getStore(options.service));
      return data
        ? {
            key,
            value: data.value,
            service: options.service ?? "default",
            metadata: data.metadata,
          }
        : null;
    }
    const data = await get<{
      readonly nonce: Base64Url;
      readonly ciphertext: Base64Url;
      readonly credentialId: string;
      readonly metadata: SensitiveInfoItem["metadata"];
    }>(key, getStore(options?.service));
    if (!data) {
      return null;
    }
    try {
      const credential = await getCredential(deps)(
        data.credentialId,
        options?.relyingPartyID,
        options?.webAuthnUserVerification,
      );
      const credentialSeed = extractSeedFromCredential(credential);
      const encryptionKey = deriveEncryptionKey(credentialSeed);
      const authResultVal = decryptAuthResult(data, encryptionKey);
      if (!authResultVal) {
        return null;
      }
      return {
        key,
        service: options?.service ?? "default",
        value: authResultVal,
        metadata: data.metadata,
      };
    } catch (_error) {
      return null;
    }
  },

  deleteItem: async (key, options) => {
    await del(key, getStore(options?.service));
    return true;
  },

  getAllItems: async (options) => {
    const service = options?.service ?? "default";
    const itemKeys = await keys<string>(getStore(service));
    const items = await Promise.all(
      itemKeys.map(async (key) => {
        const data = await get<{
          readonly metadata?: SensitiveInfoItem["metadata"];
          readonly value?: string;
        }>(key, getStore(service));
        return {
          key,
          service,
          metadata: data?.metadata ?? createMetadata(),
          ...(options?.includeValues && data?.value
            ? { value: data.value }
            : {}),
        };
      }),
    );
    return items;
  },

  clearService: async (options) => {
    await clear(getStore(options?.service));
  },
});

/**
 * Create default metadata for backwards compatibility with items that don't
 * have stored metadata.
 */
const createMetadata = (isSecure = true): SensitiveInfoItem["metadata"] => ({
  backend: "keychain",
  accessControl: isSecure ? "biometryCurrentSet" : "none",
  securityLevel: isSecure ? "biometry" : "software",
  timestamp: Date.now(),
});

/** Get storage key for owner ID. (supports namespaces via prefix) */
const getStore = (prefix = "default"): UseStore =>
  createStore(prefix, "evolu-auth");

const createCredential =
  (deps: RandomBytesDep) =>
  async (
    username: string,
    seed: Uint8Array,
    relyingPartyID?: string,
    relyingPartyName?: string,
    userVerification?: UserVerificationRequirement,
    authenticatorAttachment?: AuthenticatorAttachment,
  ): Promise<PublicKeyCredential> => {
    const options = createCredentialCreationOptions(deps)(
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

const getCredential =
  (deps: RandomBytesDep) =>
  async (
    credentialId: string,
    relyingPartyID?: string,
    userVerification?: UserVerificationRequirement,
  ): Promise<PublicKeyCredential> => {
    const options = createCredentialRequestOptions(deps)(
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

const extractSeedFromCredential = (
  credential: PublicKeyCredential,
): Uint8Array => {
  const response = credential.response as AuthenticatorAssertionResponse;
  if (!response.userHandle) {
    throw new Error("No userHandle in credential response");
  }
  return new Uint8Array(response.userHandle);
};

const createCredentialCreationOptions =
  (deps: RandomBytesDep) =>
  (
    username: string,
    seed: Uint8Array,
    relyingPartyID?: string,
    relyingPartyName?: string,
    userVerification?: UserVerificationRequirement,
    authenticatorAttachment?: AuthenticatorAttachment,
  ): CredentialCreationOptions => ({
    publicKey: {
      challenge: generateSeed(deps)() as BufferSource,
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
  });

const createCredentialRequestOptions =
  (deps: RandomBytesDep) =>
  (
    credentialId: string,
    relyingPartyID?: string,
    userVerification?: UserVerificationRequirement,
  ): CredentialRequestOptions => ({
    publicKey: {
      challenge: generateSeed(deps)() as BufferSource,
      rpId: relyingPartyID ?? document.location.hostname,
      userVerification: userVerification ?? "preferred",
      allowCredentials: [
        {
          type: "public-key",
          id: base64UrlToUint8Array(
            Base64Url.orThrow(credentialId),
          ) as BufferSource,
        },
      ],
    },
  });

const deriveEncryptionKey = (seed: Uint8Array): EncryptionKey => {
  const seed32 = seed.length === 32 ? seed : seed.slice(0, 32);
  return EncryptionKey.orThrow(
    createSlip21(seed32 as Entropy32, ["evolu", "auth"]),
  );
};

const encryptAuthResult =
  (deps: RandomBytesDep) =>
  (
    authResult: AuthResult,
    encryptionKey: EncryptionKey,
  ): {
    nonce: Base64Url;
    ciphertext: Base64Url;
  } => {
    const plaintext = utf8ToBytes(JSON.stringify(authResult));
    const [ciphertext, nonce] = encryptWithXChaCha20Poly1305(deps)(
      plaintext,
      encryptionKey,
    );
    return {
      nonce: uint8ArrayToBase64Url(nonce),
      ciphertext: uint8ArrayToBase64Url(ciphertext),
    };
  };

const decryptAuthResult = (
  encryptedData: { nonce: Base64Url; ciphertext: Base64Url },
  encryptionKey: EncryptionKey,
): string | null => {
  const nonce = base64UrlToUint8Array(encryptedData.nonce);
  const ciphertext = base64UrlToUint8Array(encryptedData.ciphertext);
  const result = decryptWithXChaCha20Poly1305(
    XChaCha20Poly1305Ciphertext.orThrow(ciphertext),
    Entropy24.orThrow(nonce),
    encryptionKey,
  );
  if (!result.ok) return null;
  return bytesToUtf8(result.value);
};

const generateSeed = (deps: RandomBytesDep) => () =>
  deps.randomBytes.create(32);
