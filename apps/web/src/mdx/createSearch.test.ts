import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSearch, type SearchPage } from "./createSearch.ts";

const mapArrayUrl = "/docs/api-reference/common/Array/functions/mapArray";

const searchPages: ReadonlyArray<SearchPage> = [
  {
    url: mapArrayUrl,
    sections: [{ title: "mapArray", hash: null, content: [] }],
  },
  {
    url: "/docs/api-reference/common/Array/type-aliases/NonEmptyReadonlyArray",
    sections: [{ title: "NonEmptyReadonlyArray", hash: null, content: [] }],
  },
  {
    url: "/docs/api-reference/common/Example/interfaces/Example",
    sections: [
      { title: "Example", hash: null, content: [] },
      { title: "Properties", hash: "properties", content: [] },
    ],
  },
  {
    url: "/docs/api-reference/common/Example/variables/exampleValue",
    sections: [{ title: "exampleValue", hash: null, content: [] }],
  },
  {
    url: "/docs/api-reference/common/Example/classes/ExampleClass",
    sections: [{ title: "ExampleClass", hash: null, content: [] }],
  },
  {
    url: "/docs/api-reference/common/Array",
    sections: [
      { title: "Array - API reference", hash: null, content: [] },
      { title: "Type Aliases", hash: "type-aliases", content: [] },
    ],
  },
  {
    url: "/docs/conventions",
    sections: [
      { title: "Conventions", hash: null, content: [] },
      {
        title: "Immutability",
        hash: "immutability",
        content: ["Referential transparency", "zz"],
      },
    ],
  },
  {
    url: "/blog/example",
    sections: [{ title: "Blog post", hash: null, content: [] }],
  },
  {
    url: "/example",
    sections: [
      { title: "@TaggedName", hash: null, content: [] },
      { title: "Namespace: nested/name", hash: "name", content: [] },
    ],
  },
  {
    url: "/docs/api-reference/example",
    sections: [{ title: "Index", hash: null, content: [] }],
  },
  ...Array.from({ length: 31 }, (_, index) => ({
    url: `/type-${index}`,
    sections: [{ title: `Type ${index}`, hash: null, content: [] }],
  })),
];

const search = createSearch(searchPages);

void describe("createSearch", () => {
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
    assert.deepEqual(search("index"), []);
  });

  void it("formats page and API reference labels", () => {
    assert.deepEqual(search("properties")[0], {
      url: "/docs/api-reference/common/Example/interfaces/Example#properties",
      title: "API Reference › Example › Interface › Properties",
      pageTitle: "Example",
    });
    assert.equal(
      search("examplevalue")[0]?.title,
      "API Reference › exampleValue › Variable",
    );
    assert.equal(
      search("exampleclass")[0]?.title,
      "API Reference › ExampleClass › Class",
    );
    assert.equal(search("blog post")[0]?.title, "Blog › Blog post");
    assert.equal(search("array")[0]?.title, "API Reference › Array");
  });

  void it("normalizes names used for matching", () => {
    assert.equal(search("tagged")[0]?.title, "@TaggedName");
    assert.equal(
      search("name")[0]?.title,
      "@TaggedName › Namespace: nested/name",
    );
  });
});
