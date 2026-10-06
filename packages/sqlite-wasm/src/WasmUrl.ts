/**
 * Where the package's wasm binary is.
 *
 * @module
 */

import type { createSqliteWasm } from "./Wasm.ts";

/**
 * The URL of the wasm binary the package ships, to load with
 * {@link createSqliteWasm}.
 *
 * It is `new URL("../wasm/sqlite3.wasm", import.meta.url)`, which Vite,
 * webpack, Next.js and other bundlers recognize: they emit the binary with the
 * app and give the URL of their copy. In the published package, the binary is
 * `dist/wasm/sqlite3.wasm`, beside the compiled modules in `dist/src`.
 *
 * Vite does not process the URL in a dependency it prebundles, so add
 * `@evolu/sqlite-wasm` to `optimizeDeps.exclude`. Vite emits the binary
 * whenever the app imports `@evolu/sqlite-wasm`, even without this URL, and
 * webpack only when the app uses it.
 */
export const sqliteWasmUrl: URL = /*#__PURE__*/ new URL(
  "../wasm/sqlite3.wasm",
  import.meta.url,
);
