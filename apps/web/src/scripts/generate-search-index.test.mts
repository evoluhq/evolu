import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { generateSearchIndex } from "./generate-search-index.mts";

void describe("generateSearchIndex", () => {
  void it("extracts searchable sections", async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "evolu-search-"));
    context.after(() => fs.rm(directory, { recursive: true }));
    const sourceDir = path.join(directory, "app");
    const targetPath = path.join(directory, "data/searchIndex.json");

    await fs.mkdir(path.join(sourceDir, "(docs)/docs/example"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(sourceDir, "(docs)/docs/example/page.mdx"),
      `export const metadata = { title: "Example" };

## Details

Visible {"text"} hidden {{ value: "text" }}.

## Details

- List item
`,
    );

    assert.deepEqual(await generateSearchIndex({ sourceDir, targetPath }), [
      {
        url: "/docs/example",
        sections: [
          { title: "Example", hash: null, content: [] },
          {
            title: "Details",
            hash: "details",
            content: ['Visible "text" hidden .'],
          },
          {
            title: "Details",
            hash: "details-2",
            content: ["List item"],
          },
        ],
      },
    ]);
    assert.deepEqual(
      JSON.parse(await fs.readFile(targetPath, "utf8")),
      await generateSearchIndex({ sourceDir, targetPath }),
    );
  });

  void it("reports the MDX path that cannot be indexed", async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "evolu-search-"));
    context.after(() => fs.rm(directory, { recursive: true }));
    const sourceDir = path.join(directory, "app");

    await fs.mkdir(sourceDir);
    await fs.writeFile(path.join(sourceDir, "page.mdx"), "{");

    await assert.rejects(
      generateSearchIndex({
        sourceDir,
        targetPath: path.join(directory, "searchIndex.json"),
      }),
      /Cannot index page\.mdx\./u,
    );
  });
});
