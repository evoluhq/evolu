import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { generateSections } from "./generate-sections.mts";

void describe("generateSections", () => {
  void it("generates all sections, then updates only the given pages and removes deleted ones", async (context) => {
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
