/**
 * Downloads `wasm/sqlite3.wasm` from the published `@evolu/sqlite-wasm`, so
 * contributors don't have to build it.
 *
 * It fetches the tarball of the package {@link publishedWasm} names from the npm
 * registry, reads `package/dist/wasm/sqlite3.wasm` from it, and writes the file
 * only when its sha256 is the one `scripts/check-wasm.mts` pins. When the file
 * already has that sha256, it downloads nothing. When no published package
 * holds the pinned wasm yet, it fails and says to build the wasm from source.
 *
 * Usage: `pnpm sqlite-wasm:download` in the repository root.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";
import { checkWasmFile, wasmPath, wasmSha256 } from "./check-wasm.mts";

/** A published `@evolu/sqlite-wasm` and the sha256 of the wasm it holds. */
export interface PublishedWasm {
  readonly version: string;
  readonly sha256: string;
}

/**
 * The published package that holds the pinned wasm. It may name the next
 * release ahead of time, with the sha256 its wasm will have, and the download
 * then fails with HTTP 404 until that release is published. Otherwise, set the
 * version and sha256 here after a release publishes a new wasm. Until then,
 * this sha256 differs from the pin in `scripts/check-wasm.mts`, and the
 * download says to build the wasm from source.
 */
export const publishedWasm: PublishedWasm = {
  version: "3.53.4-build1",
  sha256: "9747600a96fe45d74e37c5a492461f455695aad087f259da7720d8f8e4708fd0",
};

/** The published package, the pin, and where {@link downloadWasm} writes. */
export interface DownloadWasmOptions {
  readonly published: PublishedWasm;
  /** The sha256 `scripts/check-wasm.mts` pins. */
  readonly pinnedSha256: string;
  readonly path: string;
  readonly fetch: (url: string) => Promise<Response>;
}

/**
 * Writes the wasm of the published package to `path`, unless the file there
 * already is the pinned wasm. It throws, and writes nothing, when the published
 * package does not hold the pinned wasm, the download fails, or the tarball's
 * wasm is missing or differs from the pin.
 */
export const downloadWasm = async ({
  published,
  pinnedSha256,
  path,
  fetch,
}: DownloadWasmOptions): Promise<void> => {
  if (checkWasmFile(path, pinnedSha256).type === "Pinned") {
    log(`${path} is already the pinned wasm.`);
    return;
  }
  const buildFromSource =
    "Build it from source as packages/sqlite-wasm/README.md#the-webassembly describes.";
  if (published.sha256 !== pinnedSha256)
    throw new Error(
      `The pinned wasm is not published yet: @evolu/sqlite-wasm ${published.version} has sha256 ${published.sha256}, not ${pinnedSha256}. ${buildFromSource}`,
    );

  const url = `https://registry.npmjs.org/@evolu/sqlite-wasm/-/sqlite-wasm-${published.version}.tgz`;
  const response = await fetch(url);
  if (response.status === 404)
    throw new Error(
      `${url}: HTTP 404. @evolu/sqlite-wasm ${published.version} is not published yet. ${buildFromSource}`,
    );
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);

  const entry = "package/dist/wasm/sqlite3.wasm";
  const wasm = readTarEntry(
    gunzipSync(new Uint8Array(await response.arrayBuffer())),
    entry,
  );
  if (wasm == null) throw new Error(`${url} has no ${entry}.`);
  const sha256 = createHash("sha256").update(wasm).digest("hex");
  if (sha256 !== pinnedSha256)
    throw new Error(
      `${url}: ${entry} has sha256 ${sha256}, not the pinned ${pinnedSha256}.`,
    );

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, wasm);
  log(`Wrote ${path} from @evolu/sqlite-wasm ${published.version}.`);
};

/**
 * Returns the content of the entry `name` in a tar archive, or null when the
 * archive has none. It reads ustar headers: the name, after the prefix when
 * there is one, and the size in octal. Each header and each content takes whole
 * 512-byte blocks, and a zero block ends the archive. It throws for a header
 * whose size is not octal or whose content would end past the archive.
 */
export const readTarEntry = (
  tar: Uint8Array,
  name: string,
): Uint8Array | null => {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) return null;
    const prefix = readTarString(header, 345, 155);
    const entryName = readTarString(header, 0, 100);
    const sizeField = readTarString(header, 124, 12).trim();
    if (!/^[0-7]+$/u.test(sizeField))
      throw new Error(
        `The tar header at offset ${offset} has size "${sizeField}", which is not an octal number.`,
      );
    const size = Number.parseInt(sizeField, 8);
    const start = offset + 512;
    if (start + size > tar.length)
      throw new Error(
        `The tar header at offset ${offset} has size ${size}, but only ${tar.length - start} bytes follow it.`,
      );
    if ((prefix === "" ? entryName : `${prefix}/${entryName}`) === name)
      return tar.slice(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;
  }
  return null;
};

/** Reads a header field, which ends at its first zero byte. */
const readTarString = (
  header: Uint8Array,
  start: number,
  length: number,
): string =>
  new TextDecoder()
    .decode(header.subarray(start, start + length))
    .split("\0", 1)[0];

const log = (message: string): void => {
  // oxlint-disable-next-line eslint/no-console -- Report the download.
  console.log(message);
};

if (import.meta.main)
  await downloadWasm({
    published: publishedWasm,
    pinnedSha256: wasmSha256,
    path: wasmPath,
    fetch,
  });
