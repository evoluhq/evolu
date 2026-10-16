import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fixApiReference, publishApiReference } from "./fix-api-reference.mts";

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

## Returns

### Nested

Removed.

## Example

Kept.

### Returning resources from Tasks

Also kept.

#### Returns

##### Function

###### Returns

Removed.

---

##### Type Literal

Removed.

#### Call Signature

Overload kept.

##### Returns

Removed.

---

<a id="name"></a>

### name

Member kept.
`,
    );

    fixApiReference(sourceDir);
    const mdxPath = "common/Array/functions/mapArray/page.mdx";
    const fixed = await fs.readFile(path.join(sourceDir, mdxPath), "utf8");
    assert.match(
      fixed,
      /export const metadata = \{ title: 'mapArray - API reference' \};/u,
    );
    assert.match(fixed, /\[API reference\]\(\/docs\/api-reference\) › common/u);
    assert.doesNotMatch(fixed, /## Returns/u);
    assert.match(fixed, /## Example/u);
    assert.match(fixed, /### Returning resources from Tasks/u);
    assert.match(fixed, /Also kept\./u);
    assert.match(
      fixed,
      /Also kept\.\n\n#### Call Signature\n\nOverload kept\.\n\n---\n\n<a id="name">/u,
    );
    assert.doesNotMatch(fixed, /Removed\./u);
    assert.match(fixed, /<a id="name"><\/a>\n\n### name\n\nMember kept\./u);
    assert.match(
      await fs.readFile(path.join(sourceDir, "page.mdx"), "utf8"),
      /## Packages\n\nPackage/u,
    );
    assert.match(
      await fs.readFile(path.join(sourceDir, "existing/page.mdx"), "utf8"),
      /title: 'existing - API reference'/u,
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
});
