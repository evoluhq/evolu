import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { generateSearchIndex } from "../../scripts/generate-search-index.mts";

await generateSearchIndex();
const { createSearch, search } = await import("./searchClient.ts");

const mapArrayUrl = "/docs/api-reference/common/Array/functions/mapArray";

void describe("search", () => {
  void it("ranks an exact API name first", () => {
    assert.deepEqual(search("  MAPARRAY  ")[0], {
      url: mapArrayUrl,
      title: "API Reference › mapArray › Function",
      pageTitle: null,
    });
  });

  void it("finds API names by prefix", () => {
    assert.ok(search("map").some(({ url }) => url === mapArrayUrl));
  });

  void it("finds camel-case name parts", () => {
    assert.ok(
      search("readonly").some(
        ({ url }) =>
          url ===
          "/docs/api-reference/common/Array/type-aliases/NonEmptyReadonlyArray",
      ),
    );
  });

  void it("finds title phrases", () => {
    assert.ok(
      search("type alias").some(({ title }) => title.includes("Type Aliases")),
    );
  });

  void it("finds phrases in section content", () => {
    assert.deepEqual(search("referential transparency"), [
      {
        url: "/docs/conventions#immutability",
        title: "Docs › Conventions › Immutability",
        pageTitle: "Conventions",
      },
    ]);
  });

  void it("does not search content for queries shorter than three characters", () => {
    assert.deepEqual(search("zz"), []);
  });

  void it("returns at most 30 results", () => {
    assert.equal(search("type").length, 30);
  });

  void it("returns nothing for an empty query", () => {
    assert.deepEqual(search("   "), []);
  });

  void it("omits index sections", () => {
    const search = createSearch([
      {
        url: "/docs/api-reference/example",
        sections: [{ title: "Index", hash: null, content: [] }],
      },
    ]);

    assert.deepEqual(search("index"), []);
  });
});

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
