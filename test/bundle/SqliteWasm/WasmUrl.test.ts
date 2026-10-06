import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { testBundle } from "@evolu/nodejs/TestBundle";
import {
  assert,
  assertEqualBytes,
  assertSame,
} from "../../../packages/common/src/Assert.ts";
import { installPolyfills } from "../../../packages/common/src/Polyfills.ts";
import { readPinnedWasm } from "../../../packages/sqlite-wasm/scripts/check-wasm.mts";

installPolyfills();

// Webpack copies the binary next to the bundle, and Vite's library mode inlines
// it as a data URL.
const readUrl = async (href: string): Promise<Uint8Array> => {
  const url = new URL(href);
  if (url.protocol === "file:") return readFile(url);
  assertSame(url.protocol, "data:");
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
};

test("bundlers emit the SQLite wasm binary at the URL sqliteWasmUrl gives", async () => {
  const binary = readPinnedWasm();
  await testBundle({
    cases: {
      sqliteWasmUrl: {
        entryPath: resolve(import.meta.dirname, "__fixtures__/WasmUrl.ts"),
        verify: async (href) => {
          assert(typeof href === "string", "Expected the URL's href.");
          assertEqualBytes(await readUrl(href), binary);
        },
      },
    },
  });
});
