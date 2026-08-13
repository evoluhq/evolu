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
          "vite@8.2.0": {
            "brotliSizeInBytes": 621,
            "rawSizeInBytes": 1474,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 614,
            "rawSizeInBytes": 1499,
          },
        },
        "task-example": {
          "vite@8.2.0": {
            "brotliSizeInBytes": 8093,
            "rawSizeInBytes": 24806,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 7750,
            "rawSizeInBytes": 23081,
          },
        },
        "type-direct-object": {
          "vite@8.2.0": {
            "brotliSizeInBytes": 2566,
            "rawSizeInBytes": 7754,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 2592,
            "rawSizeInBytes": 7830,
          },
        },
        "type-object": {
          "vite@8.2.0": {
            "brotliSizeInBytes": 2894,
            "rawSizeInBytes": 8778,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 2945,
            "rawSizeInBytes": 8879,
          },
        },
      }
    `);
  }, 60000);
});
