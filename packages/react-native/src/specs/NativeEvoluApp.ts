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
}

// Null, without throwing, in a native build that lacks the module.
export default TurboModuleRegistry.get<Spec>("EvoluApp");
