import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateSearchIndex } from "../scripts/generate-search-index.mts";

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
