import { readdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { testBundle } from "@evolu/nodejs/TestBundle";
import { describe, expect, test } from "vitest";

const fixturesDirectory = resolve(
  import.meta.dirname,
  "__fixtures__/tree-shaking",
);
const commonEntryPath = resolve(
  import.meta.dirname,
  "../../../../packages/common/dist/src/index.js",
);
const outputDirectory = resolve(import.meta.dirname, "tmp/tree-shaking");

describe("tree-shaking", () => {
  test("bundle sizes", async () => {
    await rm(outputDirectory, { recursive: true, force: true });
    const fixturePaths = (await readdir(fixturesDirectory))
      .filter((file) => file.endsWith(".ts"))
      .sort()
      .map((file) => join(fixturesDirectory, file));
    const results = await testBundle({
      cases: Object.fromEntries(
        fixturePaths.map((entryPath) => [
          basename(entryPath, ".ts"),
          {
            entryPath,
            verify: (value) => {
              expect(value).toBe(42);
            },
          },
        ]),
      ),
      aliases: { "@evolu/common": commonEntryPath },
      outputDirectory,
    });

    expect(results).toMatchInlineSnapshot(`
      {
        "result-all": {
          "vite@8.1.5": {
            "gzipSizeInBytes": 704,
            "rawSizeInBytes": 1597,
          },
          "webpack@5.108.4": {
            "gzipSizeInBytes": 689,
            "rawSizeInBytes": 1648,
          },
        },
        "task-example": {
          "vite@8.1.5": {
            "gzipSizeInBytes": 6008,
            "rawSizeInBytes": 16336,
          },
          "webpack@5.108.4": {
            "gzipSizeInBytes": 6122,
            "rawSizeInBytes": 16613,
          },
        },
        "type-object": {
          "vite@8.1.5": {
            "gzipSizeInBytes": 1599,
            "rawSizeInBytes": 4725,
          },
          "webpack@5.108.4": {
            "gzipSizeInBytes": 1512,
            "rawSizeInBytes": 4626,
          },
        },
      }
    `);
  }, 60000);
});
