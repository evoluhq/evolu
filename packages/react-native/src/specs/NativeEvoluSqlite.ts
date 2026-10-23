/**
 * The codegen spec of the TurboModule `EvoluSqlite`, the C++ module in `cpp/`
 * that runs Evolu's SQLite core.
 *
 * @module
 */
import type { CodegenTypes, TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  /**
   * Returns the binding for the calling runtime, the object that
   * `src/sqlite/Binding.ts` types, which codegen can't.
   */
  readonly createBinding: () => CodegenTypes.UnsafeObject;
}

// Null, without throwing, in a native build that lacks the module.
export default TurboModuleRegistry.get<Spec>("EvoluSqlite");
