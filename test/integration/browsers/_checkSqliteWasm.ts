import type { Plugin } from "vite";
import { readPinnedWasm } from "../../../packages/sqlite-wasm/scripts/check-wasm.mts";

/**
 * Fails the Vitest run when it includes a project whose tests load
 * `packages/sqlite-wasm/wasm/sqlite3.wasm` and the file is missing or is not
 * the pinned wasm, with how to get it, instead of letting each test fail to
 * load it.
 *
 * It checks once Vitest creates the project's Vite server, which it does only
 * for the projects its `--project` filter includes. Vitest resolves the config
 * of every project before it filters them, so a check there would also run for
 * excluded projects.
 */
export const checkSqliteWasm: Plugin = {
  name: "evolu:check-sqlite-wasm",
  configureServer: () => {
    readPinnedWasm();
  },
};
