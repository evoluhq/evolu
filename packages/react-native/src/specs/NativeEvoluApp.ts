/**
 * The codegen spec of the TurboModule `EvoluApp`, the platform code Evolu
 * needs, in `ios/EvoluApp.mm` and in Java on Android.
 *
 * @module
 */
import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  /**
   * The directory of the database files, expo-sqlite's: `Documents/SQLite` on
   * iOS and `SQLite` in the app's files directory on Android. The iOS container
   * moves across app updates, so it's read at every start.
   */
  readonly getDatabaseDirectory: () => string;
  /** Reloads the app's JavaScript with React Native's own reload. */
  readonly reloadApp: () => void;
  /**
   * Returns the app's stored DeviceSecret, as base64url, or stores `secret` and
   * returns it when there is none, in one step, where and how
   * `loadDeviceSecret` in `DeviceSecret.ts` describes. It rejects with the code
   * `Unavailable` when that fails with DeviceSecretStorageUnavailableError,
   * `Unreadable` when it fails with DeviceSecretUnreadableError, and another
   * code otherwise.
   */
  readonly getOrAddDeviceSecret: (
    appName: string,
    secret: string,
  ) => Promise<string>;
  /**
   * Deletes the app's stored DeviceSecret, if any, so the next
   * {@link Spec.getOrAddDeviceSecret} stores a new one. On Android, it also
   * deletes the Keystore key of the app's name, and runs in the same step
   * across the app's processes as get-or-add.
   */
  readonly forgetDeviceSecret: (appName: string) => Promise<void>;
}

// Null, without throwing, in a native build that lacks the module.
export default TurboModuleRegistry.get<Spec>("EvoluApp");
