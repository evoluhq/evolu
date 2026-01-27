import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import webpack, { type Stats } from "webpack";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(
  __dirname,
  "../dist/test/__fixtures__/tree-shaking",
);
const distDir = resolve(__dirname, "../dist/src/index.js");
const tmpDir = resolve(__dirname, "../tmp/tree-shaking");

interface BundleSize {
  readonly raw: number;
  readonly gzip: number;
}

const runBundle = (bundlePath: string): void => {
  const result = spawnSync(process.execPath, [bundlePath], {
    stdio: "inherit",
    timeout: 5000,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const signal = result.signal ?? "unknown";
    throw new Error(
      `Bundle execution failed: status ${result.status} (signal: ${signal})`,
    );
  }
};

/**
 * Bundles a fixture file using webpack in production mode and returns the
 * minified bundle size in bytes (raw and gzipped). Uses compiled dist output
 * for realistic tree-shaking measurement. Output is kept in tmp/tree-shaking
 * for inspection.
 *
 * The webpack configuration mirrors Next.js production builds. Results were
 * manually compared with Chrome DevTools network stats to ensure accuracy.
 */
const bundleSize = async (fixturePath: string): Promise<BundleSize> => {
  const fixtureName = basename(fixturePath, ".js");
  const outputDir = join(tmpDir, fixtureName);

  // Clean and recreate output directory
  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const compiler = webpack({
    mode: "production",
    entry: fixturePath,
    output: {
      path: outputDir,
      filename: "bundle.js",
    },
    resolve: {
      extensions: [".js"],
      alias: {
        "@evolu/common": distDir,
      },
    },
    optimization: {
      usedExports: true,
      sideEffects: true,
      minimize: true,
    },
    stats: "errors-only",
  });

  return await new Promise((resolve, reject) => {
    compiler.run((err, stats: Stats | undefined) => {
      compiler.close(() => {
        if (err) {
          reject(err);
          return;
        }
        if (stats?.hasErrors()) {
          reject(new Error(stats.toString()));
          return;
        }
        const bundlePath = join(outputDir, "bundle.js");
        runBundle(bundlePath);
        const bundle = readFileSync(bundlePath);
        resolve({
          raw: bundle.byteLength,
          gzip: gzipSync(bundle).byteLength,
        });
      });
    });
  });
};

/**
 * Gets all fixture files from the tree-shaking fixtures directory (compiled
 * JS).
 */
const getFixtures = (): ReadonlyArray<string> => {
  const files = readdirSync(fixturesDir);
  return files
    .filter((f) => f.endsWith(".js"))
    .map((f) => join(fixturesDir, f))
    .sort();
};

describe("tree-shaking", () => {
  test("bundle sizes", async () => {
    const fixtures = getFixtures();
    const results: Record<string, BundleSize> = {};

    for (const fixture of fixtures) {
      const name = basename(fixture, ".js");
      results[name] = await bundleSize(fixture);
    }

    // Results without Standard Schema issues formatting in Type.ts:
    // - task-example: gzip 5331, raw 14250
    // - type-object: gzip 1321, raw 3551
    expect(results).toMatchInlineSnapshot(`
      {
        "result-all": {
          "gzip": 689,
          "raw": 1602,
        },
        "task-example": {
          "gzip": 7070,
          "raw": 20885,
        },
        "type-object": {
          "gzip": 3052,
          "raw": 10080,
        },
      }
    `);
  }, 60000);
});
