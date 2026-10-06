/**
 * Pins the sha256 of the wasm and checks that a file is the pinned wasm.
 *
 * `scripts/build-wasm.mts` fails unless it reproduces the pinned wasm, and
 * `scripts/download-wasm.mts` writes only the pinned wasm. The tests, the
 * playgrounds and CI load or ship `wasm/sqlite3.wasm`, which is never
 * committed. A missing file, or one that differs from the pin, fails with how
 * to get the pinned one: download it with `pnpm sqlite-wasm:download`, or build
 * it from source.
 *
 * Usage: `node scripts/check-wasm.mts` checks `wasm/sqlite3.wasm`.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Pinned here, not in build-wasm.mts, because the Vitest configs import this
// module and the scripts of apps/web run it, and build-wasm.mts loads wabt
// and, through generate.mts, TypeScript and Prettier.
/**
 * The sha256 of the wasm the build reproduces, which the tests, the playgrounds
 * and CI check the wasm they load or ship against.
 */
export const wasmSha256 =
  "9747600a96fe45d74e37c5a492461f455695aad087f259da7720d8f8e4708fd0";

/** Where the build writes the wasm and the download puts it. */
export const wasmPath = /*#__PURE__*/ fileURLToPath(
  /*#__PURE__*/ new URL("../wasm/sqlite3.wasm", import.meta.url),
);

/** How a file compares with the pinned wasm. */
export type WasmFileCheck =
  | { readonly type: "Missing" }
  | { readonly type: "Pinned"; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly type: "Differs"; readonly sha256: string };

/** Reads the file at `path` and compares its sha256 with the pinned one. */
export const checkWasmFile = (
  path: string,
  pinnedSha256: string,
): WasmFileCheck => {
  if (!existsSync(path)) return { type: "Missing" };
  const bytes = readFileSync(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return sha256 === pinnedSha256
    ? { type: "Pinned", bytes }
    : { type: "Differs", sha256 };
};

/**
 * Returns the bytes of the pinned wasm at `path`. A missing file, or one that
 * differs from the pin, throws an error that says how to get the pinned one.
 */
export const readPinnedWasm = (
  path = wasmPath,
  pinnedSha256 = wasmSha256,
): Uint8Array<ArrayBuffer> => {
  const check = checkWasmFile(path, pinnedSha256);
  if (check.type === "Pinned") return check.bytes;
  const problem =
    check.type === "Missing"
      ? `${path} is missing.`
      : `${path} has sha256 ${check.sha256}, not the pinned ${pinnedSha256}.`;
  throw new Error(
    `${problem} Download the pinned wasm with pnpm sqlite-wasm:download in the repository root, or build it from source as packages/sqlite-wasm/README.md#the-webassembly describes.`,
  );
};

if (import.meta.main) {
  readPinnedWasm();
  // oxlint-disable-next-line eslint/no-console -- Report the check.
  console.log(`${wasmPath} is the pinned wasm.`);
}
