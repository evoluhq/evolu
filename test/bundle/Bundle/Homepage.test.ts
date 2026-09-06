import { readdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { assertEqual } from "../../../packages/common/src/Assert.ts";
import { installPolyfills } from "../../../packages/common/src/Polyfills.ts";
import { testBundle } from "@evolu/nodejs/TestBundle";

installPolyfills();

const fixturesDirectory = resolve(import.meta.dirname, "__fixtures__/Homepage");
const commonEntryPath = resolve(
  import.meta.dirname,
  "../../../packages/common/dist/src/index.js",
);
const outputDirectory = resolve(import.meta.dirname, "tmp/Homepage");

describe("Homepage bundle sizes", () => {
  it("bundle sizes", { timeout: 60_000 }, async () => {
    await rm(outputDirectory, { recursive: true, force: true });
    const fixturePaths = (await readdir(fixturesDirectory))
      .filter((file) => file.endsWith(".ts"))
      .toSorted()
      .map((file) => join(fixturesDirectory, file));
    const results = await testBundle({
      cases: Object.fromEntries(
        fixturePaths.map((entryPath) => [
          basename(entryPath, ".ts"),
          {
            entryPath,
            verify: (value) => {
              assertEqual(value, 42);
            },
          },
        ]),
      ),
      aliases: { "@evolu/common": commonEntryPath },
      outputDirectory,
    });

    assertEqual(results, {
      Task: {
        "vite@8.2.2": {
          brotliSizeInBytes: 8850,
          rawSizeInBytes: 27320,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 9573,
          rawSizeInBytes: 29340,
        },
      },
      Type: {
        "vite@8.2.2": {
          brotliSizeInBytes: 3088,
          rawSizeInBytes: 9212,
        },
        "webpack@5.109.2": {
          brotliSizeInBytes: 3150,
          rawSizeInBytes: 9335,
        },
      },
    });
  });
});
