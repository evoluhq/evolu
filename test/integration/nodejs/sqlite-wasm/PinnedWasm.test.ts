/**
 * The scripts of `@evolu/sqlite-wasm` that check and download
 * `packages/sqlite-wasm/wasm/sqlite3.wasm`, on that file, which must be the
 * pinned wasm.
 *
 * @module
 */

import { assertEqual, assertEqualBytes } from "@evolu/common";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  readPinnedWasm,
  wasmPath,
  wasmSha256,
} from "../../../../packages/sqlite-wasm/scripts/check-wasm.mts";

test("readPinnedWasm reads wasm/sqlite3.wasm with the pinned sha256 by default", () => {
  assertEqual(
    wasmPath,
    fileURLToPath(new URL("../wasm/sqlite3.wasm", scriptsDirectory)),
  );
  const wasm = readPinnedWasm();

  assertEqualBytes(wasm, readFileSync(wasmPath));
  assertEqual(createHash("sha256").update(wasm).digest("hex"), wasmSha256);
});

test("check-wasm.mts says that wasm/sqlite3.wasm is the pinned wasm", () => {
  assertEqual(runScript("check-wasm.mts"), [
    0,
    `${wasmPath} is the pinned wasm.\n`,
    "",
  ]);
});

test("download-wasm.mts downloads nothing when wasm/sqlite3.wasm is already the pinned wasm", () => {
  // Otherwise, the script would download it.
  readPinnedWasm();

  assertEqual(runScript("download-wasm.mts"), [
    0,
    `${wasmPath} is already the pinned wasm.\n`,
    "",
  ]);
});

const scriptsDirectory = new URL(
  "../../../../packages/sqlite-wasm/scripts/",
  import.meta.url,
);

/** Runs a script in Node.js and returns its exit status, stdout and stderr. */
const runScript = (
  script: string,
): readonly [number | null, string, string] => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(script, scriptsDirectory))],
    { encoding: "utf8" },
  );
  return [result.status, result.stdout, result.stderr];
};
