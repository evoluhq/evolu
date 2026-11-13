/**
 * Local-first auth: how {@link createEvoluApp} unlocks an app's device database,
 * which keeps the AppOwners the app can open on this device, and Evolu's
 * AppOwner table there.
 *
 * Only Evolu writes the AppOwner table; apps read and change it through
 * `EvoluApp`. The table is local-only: its rows never sync, keep no history,
 * and a delete removes the row. A row's `id` is the OwnerId its `secret`
 * derives, so storing the same secret again updates the same row. Its `ownerId`
 * system column is the device owner.
 *
 * See docs/adr/evolu-creates-and-stores-app-owners.md.
 *
 * @module
 */

import { concatBytes } from "../Bytes.ts";
import {
  createSlip21,
  decryptWithXChaCha20Poly1305,
  encryptWithXChaCha20Poly1305,
  Entropy32,
  xChaCha20Poly1305NonceLength,
  type EncryptionKey,
  type Entropy24,
  type RandomBytesDep,
  type XChaCha20Poly1305Ciphertext,
} from "../Crypto.ts";
import type { UnknownError } from "../Error.ts";
import { err, ok, type Result } from "../Result.ts";
import type { Task } from "../Task.ts";
import {
  brand,
  DateIso,
  Id,
  length,
  maxLength,
  minLength,
  NonEmptyTrimmedString100,
  nullOr,
  Uint8Array as Uint8ArrayType,
  type Typed,
  type TypeError,
} from "../Type.ts";
import type {
  createEvoluApp,
  DevicePersistence,
  EvoluConfig,
  forgetWrappedDeviceSecret,
  unlockWrappedDeviceSecret,
} from "./Evolu.ts";
import { OwnerId, OwnerSecret } from "./Owner.ts";
import type { EvoluSchema } from "./Schema.ts";

/**
 * How {@link createEvoluApp} unlocks the app's device database, which keeps the
 * AppOwners the app can open on this device. Fixed per app, like
 * {@link EvoluConfig.appName}: another one opens another device database.
 *
 * @group Auth
 */
export type EvoluAppAuth = InstantStartAuth | DeviceSecretAuth;

/**
 * {@link EvoluAppAuth} without a prompt: the device database's key is public, so
 * anything that can read the app's storage can read the AppOwner secrets kept
 * there. The app database stays encrypted with its AppOwner.
 *
 * @group Auth
 */
export interface InstantStartAuth extends Typed<"InstantStart"> {}

/**
 * {@link EvoluAppAuth} with a {@link DeviceSecret} the app keeps where only the
 * user or the platform can unlock it, such as Electron's `safeStorage`.
 *
 * @group Auth
 */
export interface DeviceSecretAuth extends Typed<"DeviceSecret"> {
  readonly secret: DeviceSecret;
}

/**
 * Error for 32 zero bytes, instant start's public secret, which isn't a
 * {@link DeviceSecret}. It leaves the value out, as a secret's error should.
 *
 * @group Device
 */
export interface DeviceSecretError extends TypeError<"DeviceSecret"> {}

/**
 * The secret of an app's device database, which keeps the AppOwners the app can
 * open on this device. Keep it where only the user or the platform can unlock
 * it, as `loadDeviceSecret` of `@evolu/react-native` does, or in Electron's
 * `safeStorage`. It isn't an {@link OwnerSecret}: {@link createEvoluApp} derives
 * the device database's owner from it on paths no OwnerSecret reaches, so no
 * AppOwner's ID or keys name or open the device database. Create it with
 * {@link createDeviceSecret} and never use its bytes as an OwnerSecret: an
 * AppOwner's mnemonic is its secret, so whoever holds it would derive the
 * device database's key. 32 zero bytes are instant start's public secret, so
 * the Type rejects them, also in {@link createEvoluApp}, which checks the secret
 * it gets with the Type.
 *
 * @group Device
 */
export const DeviceSecret = /*#__PURE__*/ brand(
  "DeviceSecret",
  Entropy32,
  (value) =>
    value.some((byte) => byte !== 0)
      ? ok()
      : err<DeviceSecretError>({ type: "DeviceSecret" }),
  () =>
    "32 zero bytes are instant start's public secret, not a DeviceSecret. Create one with createDeviceSecret.",
);
export type DeviceSecret = typeof DeviceSecret.Output;

/**
 * Creates a cryptographically random {@link DeviceSecret}.
 *
 * @group Device
 */
export const createDeviceSecret = (deps: RandomBytesDep): DeviceSecret =>
  deps.randomBytes.create(32) as DeviceSecret;

/**
 * The id of a key that wraps a {@link DeviceSecret}, such as a passkey's
 * credential ID, from 1 to 1023 bytes as WebAuthn allows.
 *
 * @group Auth
 */
export const DeviceSecretKeyId = /*#__PURE__*/ brand(
  "DeviceSecretKeyId",
  /*#__PURE__*/ minLength(1)(/*#__PURE__*/ maxLength(1023)(Uint8ArrayType)),
);
export type DeviceSecretKeyId = typeof DeviceSecretKeyId.Output;

/**
 * A {@link DeviceSecretKeyProvider} refused to create or get a key, such as when
 * the user dismissed its prompt or the key is gone. It can be temporary, such
 * as a locked password manager that took the prompt over, so let the user try
 * again.
 *
 * @group Auth
 */
export interface DeviceSecretKeyRefusedError extends Typed<"DeviceSecretKeyRefused"> {}

/**
 * A {@link DeviceSecretKeyProvider} can't provide a key, such as for a passkey
 * whose provider lacks the WebAuthn PRF extension.
 *
 * @group Auth
 */
export interface DeviceSecretKeyUnavailableError extends Typed<"DeviceSecretKeyUnavailable"> {}

/**
 * An error of a {@link DeviceSecretKeyProvider}.
 *
 * @group Auth
 */
export type DeviceSecretKeyError =
  DeviceSecretKeyRefusedError | DeviceSecretKeyUnavailableError | UnknownError;

/**
 * A source of the key that wraps an app's {@link DeviceSecret}, such as a
 * passkey's PRF output, which `@evolu/web` provides. Creating or getting a key
 * may prompt the user, which some browsers allow only in a user gesture. Its
 * Tasks must end when their Run aborts them, such as by passing its signal to
 * the prompt, because a setup holds the app's lock while it creates or gets a
 * key, so a Task that keeps waiting holds up every tab's unlock. See
 * {@link unlockWrappedDeviceSecret}.
 *
 * @group Auth
 */
export interface DeviceSecretKeyProvider {
  /** Creates a key and returns its id, which Evolu stores. */
  readonly createKey: Task<DeviceSecretKeyId, DeviceSecretKeyError>;

  /** Gets the key with the id. The same id always gives the same key. */
  readonly getKey: (
    id: DeviceSecretKeyId,
  ) => Task<Entropy32, DeviceSecretKeyError>;
}

/**
 * A {@link DeviceSecret} wrapped by a key from a {@link DeviceSecretKeyProvider}:
 * a 24-byte nonce, the 32-byte ciphertext, and its 16-byte authentication tag.
 * The format is permanent once shipped.
 *
 * @group Auth
 */
export const WrappedDeviceSecret = /*#__PURE__*/ brand(
  "WrappedDeviceSecret",
  /*#__PURE__*/ length(72)(Uint8ArrayType),
);
export type WrappedDeviceSecret = typeof WrappedDeviceSecret.Output;

/**
 * Wraps a {@link DeviceSecret} with a key from a {@link DeviceSecretKeyProvider}.
 * A fresh random nonce makes every wrap of the same secret different.
 *
 * @group Auth
 */
export const wrapDeviceSecret =
  (deps: RandomBytesDep) =>
  (secret: DeviceSecret, key: Entropy32): WrappedDeviceSecret => {
    // Copied, so the caller can't change them during encryption.
    const [ciphertext, nonce] = encryptWithXChaCha20Poly1305(deps)(
      new Uint8Array(secret),
      deviceSecretWrappingKey(new Uint8Array(key) as Entropy32),
    );
    return concatBytes(nonce, ciphertext) as WrappedDeviceSecret;
  };

/**
 * A {@link WrappedDeviceSecret} failed authentication in
 * {@link unwrapDeviceSecret}: the key is another one, or the bytes changed. Or
 * it holds 32 zero bytes, instant start's public secret, which isn't a
 * {@link DeviceSecret}.
 *
 * @group Auth
 */
export interface DeviceSecretUnwrapError extends Typed<"DeviceSecretUnwrapError"> {}

/**
 * Authenticates and unwraps a {@link WrappedDeviceSecret}.
 *
 * @group Auth
 */
export const unwrapDeviceSecret = (
  wrapped: WrappedDeviceSecret,
  key: Entropy32,
): Result<DeviceSecret, DeviceSecretUnwrapError> => {
  // Copied, so a shared buffer can't change during decryption.
  const bytes = new Uint8Array(wrapped);
  const secret = decryptWithXChaCha20Poly1305(
    bytes.subarray(xChaCha20Poly1305NonceLength) as XChaCha20Poly1305Ciphertext,
    bytes.subarray(0, xChaCha20Poly1305NonceLength) as Entropy24,
    deviceSecretWrappingKey(key),
  );
  if (!secret.ok) return err({ type: "DeviceSecretUnwrapError" });
  // An authenticated 72-byte envelope holds 32 bytes, which can still be zero.
  const deviceSecret = DeviceSecret.fromUnknown(secret.value);
  return deviceSecret.ok
    ? deviceSecret
    : err({ type: "DeviceSecretUnwrapError" });
};

// Permanent once shipped: another label can't unwrap stored secrets.
const deviceSecretWrappingKey = (key: Entropy32): EncryptionKey =>
  createSlip21(key, ["Evolu", "DeviceSecret wrapping key v1"]) as EncryptionKey;

/**
 * The platform keeps nothing, such as Safari's Private Browsing, so
 * {@link unlockWrappedDeviceSecret} creates no key: every start would create
 * another one, such as another passkey in the user's password manager. See
 * {@link DevicePersistence}.
 *
 * @group Auth
 */
export interface WrappedDeviceSecretNotPersistedError extends Typed<"WrappedDeviceSecretNotPersisted"> {}

/**
 * {@link forgetWrappedDeviceSecret} with `onlyPending` found a stored
 * {@link WrappedDeviceSecret} rather than a setup's pending key, so it forgot
 * nothing. Forgetting a stored secret loses its device database, so the app
 * asks the user to confirm and then forgets it without `onlyPending`.
 *
 * @group Auth
 */
export interface WrappedDeviceSecretStoredError extends Typed<"WrappedDeviceSecretStoredError"> {}

/**
 * The name of Evolu's table of an app's {@link WrappedDeviceSecret}. Permanent
 * once shipped.
 *
 * @group Auth
 */
export const wrappedDeviceSecretTable = "_evolu_wrappedDeviceSecret";

/**
 * Evolu's tables of the database that holds an app's
 * {@link WrappedDeviceSecret}, whose key is public, because it must open before
 * the {@link DeviceSecret} exists. Its table and column names are permanent once
 * shipped.
 *
 * @group Auth
 */
export const wrappedDeviceSecretEvoluSchema = {
  [wrappedDeviceSecretTable]: {
    id: Id,
    keyId: DeviceSecretKeyId,
    /**
     * Null while the setup that created the key hasn't stored the wrapped
     * secret yet, so the next setup gets the same key instead of creating
     * another one.
     */
    wrappedSecret: /*#__PURE__*/ nullOr(WrappedDeviceSecret),
  },
} as const satisfies EvoluSchema;

/**
 * The name of Evolu's AppOwner table. Permanent once shipped.
 *
 * @group Device
 */
export const appOwnerTable = "_evolu_appOwner";

/**
 * Evolu's tables of the device database. Its table and column names are
 * permanent once shipped.
 *
 * @group Device
 */
export const deviceEvoluSchema = {
  [appOwnerTable]: {
    id: OwnerId,
    secret: OwnerSecret,
    name: /*#__PURE__*/ nullOr(NonEmptyTrimmedString100),
    lastOpenedAt: /*#__PURE__*/ nullOr(DateIso),
  },
} as const satisfies EvoluSchema;
