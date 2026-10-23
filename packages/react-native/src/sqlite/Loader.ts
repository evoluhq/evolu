/**
 * The loader of Evolu's two TurboModules: `EvoluSqlite`, whose binding
 * `Binding.ts` describes, and `EvoluApp`, the platform code.
 *
 * Importing it evaluates the specs, whose `TurboModuleRegistry.get` creates the
 * C++ module, but no binding: `installPolyfills` and `createEvoluDeps` load one
 * when they run. It reads no randomness at import, so the polyfills can install
 * `crypto.getRandomValues` before anything that imports Evolu.
 *
 * @module
 */
import NativeEvoluApp, {
  type Spec as EvoluApp,
} from "../specs/NativeEvoluApp.ts";
import NativeEvoluSqlite from "../specs/NativeEvoluSqlite.ts";
import { nativeSqliteAbiVersion, type NativeSqlite } from "./Binding.ts";

/**
 * Creates the binding for this runtime, and throws when the native build lacks
 * the module or implements another version of the binding.
 */
export const loadNativeSqlite = (): NativeSqlite => {
  if (!NativeEvoluSqlite) throw new Error(missingModuleMessage("EvoluSqlite"));
  const binding = NativeEvoluSqlite.createBinding() as NativeSqlite;
  if (binding.abiVersion !== nativeSqliteAbiVersion)
    throw new Error(
      `Evolu's native module implements version ${binding.abiVersion} of its binding, but this JavaScript needs version ${nativeSqliteAbiVersion}. Rebuild the native app and bump the version that over-the-air updates target, such as Expo's runtime version, so no update runs on an older native build.`,
    );
  return binding;
};

/** Returns `EvoluApp`, and throws when the native build lacks it. */
export const loadEvoluApp = (): EvoluApp => {
  if (!NativeEvoluApp) throw new Error(missingModuleMessage("EvoluApp"));
  return NativeEvoluApp;
};

const missingModuleMessage = (name: string): string =>
  `Evolu's native module ${name} isn't in this native build. Expo Go can't load Evolu's native code, and an over-the-air update can't add it to a build made without it. Rebuild the native app, in Expo as a development build, and bump the version that over-the-air updates target, such as Expo's runtime version.`;
