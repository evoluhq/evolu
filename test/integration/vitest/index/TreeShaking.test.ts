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
            "gzipSizeInBytes": 727,
            "rawSizeInBytes": 1669,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 711,
            "rawSizeInBytes": 1724,
          },
        },
        "task-example": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 9029,
            "rawSizeInBytes": 25253,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 8650,
            "rawSizeInBytes": 23553,
          },
        },
        "type-object": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 3192,
            "rawSizeInBytes": 8778,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 3220,
            "rawSizeInBytes": 8879,
          },
        },
        "type2-object": {
          "vite@8.2.0": {
            "gzipSizeInBytes": 2830,
            "rawSizeInBytes": 7754,
          },
          "webpack@5.109.2": {
            "gzipSizeInBytes": 2847,
            "rawSizeInBytes": 7830,
          },
        },
      }
    `);
  }, 60000);
});
