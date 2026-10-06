import type { Plugin } from "vite";
import { readPinnedWasm } from "../../../packages/sqlite-wasm/scripts/check-wasm.mts";

/**
 * Fails the Vitest run when it includes a project whose tests load
 * `packages/sqlite-wasm/wasm/sqlite3.wasm` and the file is missing or is not
 * the pinned wasm, with how to get it, instead of letting each test fail to
 * load it.
 *
 * It checks once Vite resolves the project's config. Vitest gets that far only
 * for the projects it runs, because it stops resolving one that its `--project`
 * filter excludes.
 */
export const checkSqliteWasm: Plugin = {
  name: "evolu:check-sqlite-wasm",
  configResolved: () => {
    readPinnedWasm();
  },
};
