/**
 * SQLite compiled to WebAssembly, with Evolu's own TypeScript layer, which also
 * encrypts databases.
 *
 * @module
 * @mergeModuleWith <project>
 */

export type { SqlitePrimaryResultCode, SqliteResultCode } from "./Constants.ts";
export * from "./Database.ts";
export * from "./Memory.ts";
export * from "./Pointer.ts";
export * from "./SahPool.ts";
export * from "./Wasm.ts";
export * from "./WasmUrl.ts";
