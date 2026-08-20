import { readdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { testBundle } from "@evolu/nodejs/TestBundle";
import { describe, expect, test } from "vitest";

const fixturesDirectory = resolve(import.meta.dirname, "__fixtures__/Homepage");
const commonEntryPath = resolve(
  import.meta.dirname,
  "../../../../packages/common/dist/src/index.js",
);
const outputDirectory = resolve(import.meta.dirname, "tmp/Homepage");

describe("Homepage bundle sizes", () => {
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
        "Task": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 8417,
            "rawSizeInBytes": 26046,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 9085,
            "rawSizeInBytes": 27948,
          },
        },
        "Type": {
          "vite@8.2.2": {
            "brotliSizeInBytes": 2628,
            "rawSizeInBytes": 8003,
          },
          "webpack@5.109.2": {
            "brotliSizeInBytes": 2646,
            "rawSizeInBytes": 8079,
          },
        },
      }
    `);
  }, 60000);
});
