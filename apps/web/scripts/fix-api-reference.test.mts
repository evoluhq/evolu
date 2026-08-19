import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  fixApiReference,
  generateSections,
  publishApiReference,
} from "./fix-api-reference.mts";

void describe("API reference development generation", () => {
  void it("fixes staged MDX and publishes only content changes", async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "evolu-docs-"));
    context.after(() => fs.rm(directory, { recursive: true }));
    const sourceDir = path.join(directory, "source");
    const targetDir = path.join(directory, "target");
    const rawDir = path.join(sourceDir, "common/Array/functions");
    await fs.mkdir(rawDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, "page.mdx"),
      "## Modules\n\nModule",
    );
    await fs.mkdir(path.join(sourceDir, "existing"));
    await fs.writeFile(path.join(sourceDir, "existing/page.mdx"), "Existing.");
    await fs.writeFile(
      path.join(rawDir, "mapArray.mdx"),
      `[API Reference](../../../../page.mdx) / common / Array

export const metadata = { title: "Old" };
export const sections = [];

## Description

Visible.

## Parameters

### Nested

Removed.

## Example

Kept.

### Returning resources from Tasks

Also kept.
`,
    );

    fixApiReference(sourceDir);
    const mdxPath = "common/Array/functions/mapArray/page.mdx";
    const fixed = await fs.readFile(path.join(sourceDir, mdxPath), "utf8");
    assert.match(
      fixed,
      /export const metadata = \{ title: 'mapArray - API reference' \};/,
    );
    assert.match(fixed, /\[API reference\]\(\/docs\/api-reference\) › common/);
    assert.doesNotMatch(fixed, /## Parameters/);
    assert.match(fixed, /## Example/);
    assert.match(fixed, /### Returning resources from Tasks/);
    assert.match(fixed, /Also kept\./);
    assert.match(
      await fs.readFile(path.join(sourceDir, "page.mdx"), "utf8"),
      /## Packages\n\nPackage/,
    );
    assert.match(
      await fs.readFile(path.join(sourceDir, "existing/page.mdx"), "utf8"),
      /title: 'existing - API reference'/,
    );

    assert.deepEqual(publishApiReference(sourceDir, targetDir), {
      changedMdxPaths: [mdxPath, "existing/page.mdx", "page.mdx"],
      deletedMdxPaths: [],
    });
    assert.deepEqual(publishApiReference(sourceDir, targetDir), {
      changedMdxPaths: [],
      deletedMdxPaths: [],
    });

    await fs.appendFile(path.join(sourceDir, mdxPath), "\nChanged.\n");
    await fs.mkdir(path.join(targetDir, "stale"), { recursive: true });
    await fs.writeFile(path.join(targetDir, "stale/page.mdx"), "Stale.");
    assert.deepEqual(publishApiReference(sourceDir, targetDir), {
      changedMdxPaths: [mdxPath],
      deletedMdxPaths: ["stale/page.mdx"],
    });
  });

  void it("updates sections only for published pages", async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "evolu-docs-"));
    context.after(() => fs.rm(directory, { recursive: true }));
    const docsDir = path.join(directory, "app");
    const mdxPath = "docs/example/page.mdx";
    const pagePath = path.join(docsDir, mdxPath);
    const outputPath = path.join(directory, "sections.json");
    await fs.mkdir(path.dirname(pagePath), { recursive: true });
    await fs.writeFile(pagePath, "## First\n\n## Call Signature\n");
    await fs.mkdir(path.join(docsDir, "docs/empty"));
    await fs.writeFile(path.join(docsDir, "docs/empty/page.mdx"), "Empty.\n");

    assert.equal(await generateSections({ docsDir, outputPath }), true);
    assert.deepEqual(JSON.parse(await fs.readFile(outputPath, "utf8")), {
      "/docs/empty": [],
      "/docs/example": [{ title: "First", id: "first" }],
    });
    assert.equal(await generateSections({ docsDir, outputPath }), false);

    await fs.writeFile(pagePath, "## Second\n\n## Call Signature\n");
    assert.equal(
      await generateSections({
        docsDir,
        mdxPaths: [mdxPath],
        outputPath,
      }),
      true,
    );
    assert.deepEqual(JSON.parse(await fs.readFile(outputPath, "utf8")), {
      "/docs/empty": [],
      "/docs/example": [{ title: "Second", id: "second" }],
    });

    await fs.rm(pagePath);
    assert.equal(
      await generateSections({
        docsDir,
        mdxPaths: [mdxPath],
        outputPath,
      }),
      true,
    );
    assert.deepEqual(JSON.parse(await fs.readFile(outputPath, "utf8")), {
      "/docs/empty": [],
    });
  });
});
