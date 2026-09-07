import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSearch } from "../../../../apps/web/src/mdx/createSearch.ts";
import { generateSearchIndex } from "../../../../apps/web/src/scripts/generate-search-index.mts";

const search = createSearch(await generateSearchIndex());

const mapArrayUrl = "/docs/api-reference/common/Array/functions/mapArray";

void describe("generated docs search", () => {
  void it("indexes API reference names and kinds", () => {
    assert.deepEqual(search("  MAPARRAY  ")[0], {
      url: mapArrayUrl,
      title: "API Reference › mapArray › Function",
      pageTitle: null,
    });
    assert.ok(search("map").some(({ url }) => url === mapArrayUrl));
    assert.ok(
      search("readonly").some(
        ({ url }) =>
          url ===
          "/docs/api-reference/common/Array/type-aliases/NonEmptyReadonlyArray",
      ),
    );
    assert.ok(
      search("type alias").some(({ title }) => title.includes("Type Aliases")),
    );
  });

  void it("indexes documentation section content", () => {
    assert.deepEqual(search("unnecessary rendering"), [
      {
        url: "/docs/conventions#immutability",
        title: "Docs › Conventions › Immutability",
        pageTitle: "Conventions",
      },
    ]);
  });
});
