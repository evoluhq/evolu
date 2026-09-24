import { readdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { assert, assertEqual } from "../../../packages/common/src/Assert.ts";
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
  it("bundle sizes", { timeout: 60_000 }, async (t) => {
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

    t.assert.snapshot(results);

    // Unused test helpers, including their module-level values, are dropped.
    for (const file of await readdir(outputDirectory)) {
      const code = await readFile(join(outputDirectory, file), "utf8");
      assert(
        !code.includes("TestGlobalErrors.settle sentinel"),
        `${file} keeps the test error sentinel.`,
      );
    }
  });
});
