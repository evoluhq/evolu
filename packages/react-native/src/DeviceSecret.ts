import {
  createDeviceSecret,
  createUnknownError,
  DeviceSecret,
  err,
  promiseToTask,
  Uint8ArrayFromBase64Url,
  uint8ArrayToBase64Url,
  type AppName,
  type createEvoluApp,
  type Task,
  type Typed,
  type UnknownError,
} from "@evolu/common";
import { loadEvoluApp, missingNativeCodeMessage } from "./sqlite/Loader.ts";

/**
 * The platform can't read its secure storage yet, such as iOS before the
 * device's first unlock after a restart. Try again later.
 */
export interface DeviceSecretStorageUnavailableError extends Typed<"DeviceSecretStorageUnavailable"> {}

/**
 * The platform's secure storage holds the app's {@link DeviceSecret} but can't
 * read it, on Android when the stored record is too short to hold the encrypted
 * secret, the Keystore lost the key that encrypts it or, as Android 13 and
 * later report, the Keystore's own database entry of that key is corrupted, or
 * the record fails authentication. Evolu never deletes a stored secret on its
 * own, so let the user try again, and only when that fails too offer to start
 * over with {@link forgetDeviceSecret}.
 */
export interface DeviceSecretUnreadableError extends Typed<"DeviceSecretUnreadable"> {}

/** Why {@link loadDeviceSecret} failed. */
export type LoadDeviceSecretError =
  | DeviceSecretStorageUnavailableError
  | DeviceSecretUnreadableError
  | UnknownError;

/**
 * Loads the app's {@link DeviceSecret} from the platform's secure storage, and
 * on the first use creates and stores one, without a prompt. Pass it to
 * {@link createEvoluApp} as `{ type: "DeviceSecret", secret }`.
 *
 * On iOS, the Keychain keeps it, readable after the device's first unlock and
 * never moved to another device or iCloud. iOS keeps the Keychain items of a
 * removed app, so it survives a reinstall. It goes to the app's default access
 * group, the first keychain access group the app lists, if any, which other
 * apps of its team may share: they can read it, though their own lookups never
 * match it, and a later build without that group finds none and creates
 * another, which leaves the device database with nothing to open it. Android
 * encrypts it with an Android Keystore key of the app name's own in a file that
 * backups leave out, so a restored backup starts with a new one. It never
 * replaces a stored secret it can't read, which would leave the device database
 * with nothing to open it, except on iOS for a Keychain item the Keychain
 * itself can't decrypt: that item reads as missing, so a new secret replaces
 * it, and the device database it opened can't be opened again.
 *
 * A new device, also one restored from a backup, gets a new DeviceSecret, which
 * opens a new device database, so the AppOwners of the old device come back
 * only from their backups, such as their mnemonics.
 *
 * It fails with {@link DeviceSecretStorageUnavailableError} while the storage
 * can't be read yet, with {@link DeviceSecretUnreadableError} when it holds a
 * secret it can't read, which happens only on Android, and with an
 * {@link UnknownError} otherwise. A Keystore key broken in a way Android doesn't
 * report, which before Android 13 is any broken key, fails with an
 * `UnknownError`; when that lasts after a restart of the device, an app may
 * offer {@link forgetDeviceSecret} too.
 */
export const loadDeviceSecret = (
  appName: AppName,
): Task<DeviceSecret, LoadDeviceSecretError> => {
  const evoluApp = loadEvoluApp();
  // An over-the-air update can run on a native build from before the method,
  // which is a build error, as a missing module is, not a storage failure the
  // app would show the user.
  if (typeof evoluApp.getOrAddDeviceSecret !== "function")
    throw new TypeError(
      missingNativeCodeMessage("method EvoluApp.getOrAddDeviceSecret"),
    );
  return async (run) => {
    // An abort ends the wait at once and ignores the late answer, while the
    // native get-or-add, which can wait for another process of the app, still
    // completes as one step. A defect, such as a failure whose reading throws,
    // goes to the Run instead of leaving the Task pending.
    const stored = await run(
      promiseToTask(
        () =>
          evoluApp.getOrAddDeviceSecret(
            appName,
            uint8ArrayToBase64Url(createDeviceSecret(run.deps)),
          ),
        (error): LoadDeviceSecretError => {
          const code =
            typeof error === "object" && error !== null && "code" in error
              ? error.code
              : null;
          // A stored secret it can't read stays until the app forgets it; see
          // docs/adr/evolu-creates-and-stores-app-owners.md.
          return code === "Unavailable"
            ? { type: "DeviceSecretStorageUnavailable" }
            : code === "Unreadable"
              ? { type: "DeviceSecretUnreadable" }
              : createUnknownError(error);
        },
      ),
    );
    if (!stored.ok) return stored;
    const bytes = Uint8ArrayFromBase64Url.fromUnknown(stored.value);
    const secret = bytes.ok ? DeviceSecret.fromUnknown(bytes.value) : bytes;
    return secret.ok
      ? secret
      : err(createUnknownError("The stored DeviceSecret isn't valid."));
  };
};

/**
 * Deletes the app's stored {@link DeviceSecret}, so the next
 * {@link loadDeviceSecret} creates a new one, which opens a new, empty device
 * database. It's the start over after a {@link DeviceSecretUnreadableError}, or
 * the lasting `UnknownError` that {@link loadDeviceSecret} describes: offer it
 * only after such an error, only when a retry failed too, and only once the
 * user confirms what's lost. The device database the old secret opened is no
 * longer opened, so its AppOwners come back only from their backups, such as
 * their mnemonics, and an AppOwner restored from its backup reopens its own
 * database with its data on this device.
 *
 * Each app name has its own secret and, on Android, its own Keystore key, which
 * a forget deletes too, so the next load starts clean whatever made the secret
 * unreadable, and a forget touches no other name. It never replaces an
 * unreadable secret on its own, as iOS's Keychain does, because nothing tells
 * whether the secret is lost for good, and then Evolu itself would be the one
 * deleting.
 */
export const forgetDeviceSecret = (
  appName: AppName,
): Task<void, UnknownError> => {
  const evoluApp = loadEvoluApp();
  // A build error on an older native build, as in loadDeviceSecret.
  if (typeof evoluApp.forgetDeviceSecret !== "function")
    throw new TypeError(
      missingNativeCodeMessage("method EvoluApp.forgetDeviceSecret"),
    );
  // The old device database stays. Its name derives from the device owner,
  // which derives from the forgotten secret, so nothing can find it, and the
  // new secret starts clean on purpose, as on a new phone. Its files go with
  // the app's storage.
  return promiseToTask(
    () => evoluApp.forgetDeviceSecret(appName),
    createUnknownError,
  );
};
