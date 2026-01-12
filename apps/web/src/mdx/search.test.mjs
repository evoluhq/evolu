/**
 * Tests for the search indexing logic using real generated MDX files.
 *
 * Run with: pnpm test (from apps/web)
 *
 * These tests read actual TypeDoc-generated MDX files to ensure the search
 * indexer works with real output. If TypeDoc changes its format, these tests
 * will catch it.
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import url from "node:url";
import {
  addSyntheticH1,
  createSearch,
  extractMetadataTitle,
  getOriginalName,
  splitIntoWords,
} from "./searchUtils.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const apiRefDir = path.join(__dirname, "../app/(docs)/docs/api-reference");

// ============================================================================
// Test helpers
// ============================================================================

/** Get lowercased name for matching. */
const getName = (title) => getOriginalName(title).toLowerCase();

/**
 * Extract headings from MDX (simplified regex-based extraction for tests).
 *
 * Production uses remark AST parsing; this is test infrastructure only.
 */
const extractHeadings = (mdx) => {
  const sections = [];
  for (const line of mdx.split("\n")) {
    const h1Match = /^# (.+)$/.exec(line);
    const h2Match = /^## (.+)$/.exec(line);
    if (h1Match) {
      sections.push([h1Match[1], null, []]);
    } else if (h2Match) {
      sections.push([
        h2Match[1],
        h2Match[1].toLowerCase().replace(/\s+/g, "-"),
        [],
      ]);
    }
  }
  return sections;
};

/** Read an MDX file and return processed sections. */
const readMdxFile = (relativePath) => {
  const fullPath = path.join(apiRefDir, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  const mdx = fs.readFileSync(fullPath, "utf-8");
  const sections = extractHeadings(mdx);
  addSyntheticH1(sections, mdx);
  return { mdx, sections };
};

/** Build search items from pages (same as searchIndex.js). */
const buildItems = (pages) => {
  const items = [];
  for (const { url, sections } of pages) {
    for (const [title, hash] of sections) {
      const originalName = getOriginalName(title);
      const name = originalName.toLowerCase();
      if (name === "index") continue;
      items.push({
        url: url + (hash ? "#" + hash : ""),
        title,
        name,
        words: splitIntoWords(originalName),
      });
    }
  }
  return items;
};

// ============================================================================
// Tests with real MDX files
// ============================================================================

describe("real MDX: API reference structure", () => {
  it("mapArray page exists and has expected metadata", () => {
    const result = readMdxFile("common/Array/functions/mapArray/page.mdx");
    assert.ok(result, "mapArray page should exist");

    const title = extractMetadataTitle(result.mdx);
    assert.ok(title, "Should have metadata title");
    assert.ok(
      title.toLowerCase().includes("maparray"),
      `Title should contain 'maparray', got: ${title}`,
    );
  });

  it("useQuery page exists and has expected metadata", () => {
    const result = readMdxFile("react/index/functions/useQuery/page.mdx");
    assert.ok(result, "useQuery page should exist");

    const title = extractMetadataTitle(result.mdx);
    assert.ok(title, "Should have metadata title");
    assert.ok(
      title.toLowerCase().includes("usequery"),
      `Title should contain 'usequery', got: ${title}`,
    );
  });

  it("Result module page exists", () => {
    const result = readMdxFile("common/Result/page.mdx");
    assert.ok(result, "Result page should exist");
  });

  it("Array module page exists", () => {
    const result = readMdxFile("common/Array/page.mdx");
    assert.ok(result, "Array page should exist");
  });
});

describe("real MDX: synthetic h1 insertion", () => {
  it("adds synthetic h1 for API reference pages without h1", () => {
    const result = readMdxFile("common/Array/functions/mapArray/page.mdx");
    assert.ok(result, "mapArray page should exist");

    // API reference pages typically don't have h1 (hidePageTitle: true)
    const hasRealH1 = /^# /m.test(result.mdx);

    if (!hasRealH1) {
      // Should have synthetic h1 from metadata
      assert.ok(result.sections.length > 0, "Should have sections");
      assert.strictEqual(
        result.sections[0][1],
        null,
        "First section should be h1 (null hash)",
      );
      assert.ok(
        result.sections[0][0].toLowerCase().includes("maparray"),
        "Synthetic h1 should contain function name",
      );
    }
  });
});

describe("real MDX: getName extracts correct names", () => {
  it("extracts 'maparray' from mapArray page", () => {
    const result = readMdxFile("common/Array/functions/mapArray/page.mdx");
    assert.ok(result, "mapArray page should exist");

    const title = result.sections[0][0];
    const name = getName(title);
    assert.strictEqual(name, "maparray", `Expected 'maparray', got '${name}'`);
  });

  it("extracts 'usequery' from useQuery page", () => {
    const result = readMdxFile("react/index/functions/useQuery/page.mdx");
    assert.ok(result, "useQuery page should exist");

    const title = result.sections[0][0];
    const name = getName(title);
    assert.strictEqual(name, "usequery", `Expected 'usequery', got '${name}'`);
  });

  it("extracts 'result' from Result module page", () => {
    const result = readMdxFile("common/Result/page.mdx");
    assert.ok(result, "Result page should exist");

    const title = result.sections[0][0];
    const name = getName(title);
    assert.strictEqual(name, "result", `Expected 'result', got '${name}'`);
  });
});

describe("real MDX: splitIntoWords handles camelCase", () => {
  it("splits 'mapArray' correctly", () => {
    assert.deepStrictEqual(splitIntoWords("mapArray"), ["map", "array"]);
  });

  it("splits 'useQuery' correctly", () => {
    assert.deepStrictEqual(splitIntoWords("useQuery"), ["use", "query"]);
  });

  it("splits 'NonEmptyReadonlyArray' correctly", () => {
    assert.deepStrictEqual(splitIntoWords("NonEmptyReadonlyArray"), [
      "non",
      "empty",
      "readonly",
      "array",
    ]);
  });
});

describe("real MDX: search finds API reference items", () => {
  // Build search index from real files
  const realPages = [];

  const mdxFiles = [
    [
      "common/Array/functions/mapArray/page.mdx",
      "/docs/api-reference/common/Array/functions/mapArray",
    ],
    [
      "common/Array/functions/filterArray/page.mdx",
      "/docs/api-reference/common/Array/functions/filterArray",
    ],
    ["common/Array/page.mdx", "/docs/api-reference/common/Array"],
    [
      "common/Array/type-aliases/NonEmptyReadonlyArray/page.mdx",
      "/docs/api-reference/common/Array/type-aliases/NonEmptyReadonlyArray",
    ],
    [
      "react/index/functions/useQuery/page.mdx",
      "/docs/api-reference/react/index/functions/useQuery",
    ],
    [
      "react/index/functions/useQueries/page.mdx",
      "/docs/api-reference/react/index/functions/useQueries",
    ],
    ["common/Result/page.mdx", "/docs/api-reference/common/Result"],
    [
      "common/Result/functions/ok/page.mdx",
      "/docs/api-reference/common/Result/functions/ok",
    ],
    [
      "common/Result/functions/err/page.mdx",
      "/docs/api-reference/common/Result/functions/err",
    ],
  ];

  for (const [file, pageUrl] of mdxFiles) {
    const result = readMdxFile(file);
    if (result) {
      realPages.push({ url: pageUrl, sections: result.sections });
    }
  }

  const search = createSearch(buildItems(realPages));
  const names = (q) => search(q).map((r) => r.name);

  it("finds mapArray by exact name", () => {
    const n = names("maparray");
    assert.ok(n.includes("maparray"), "Should find mapArray");
  });

  it("finds mapArray by prefix 'map'", () => {
    const n = names("map");
    assert.ok(n.includes("maparray"), "Should find mapArray");
  });

  it("finds useQuery by exact name", () => {
    const n = names("usequery");
    assert.ok(n.includes("usequery"), "Should find useQuery");
  });

  it("finds useQuery by camelCase word 'query'", () => {
    const n = names("query");
    assert.ok(n.includes("usequery"), "Should find useQuery via 'query' word");
  });

  it("finds useQueries by camelCase word 'queries'", () => {
    const n = names("queries");
    assert.ok(
      n.includes("usequeries"),
      "Should find useQueries via 'queries' word",
    );
  });

  it("finds NonEmptyReadonlyArray by camelCase word 'empty'", () => {
    const n = names("empty");
    assert.ok(
      n.includes("nonemptyreadonlyarray"),
      "Should find NonEmptyReadonlyArray via 'empty' word",
    );
  });

  it("finds Result by exact name", () => {
    const n = names("result");
    assert.ok(n.includes("result"), "Should find Result");
  });

  it("finds ok function", () => {
    const n = names("ok");
    assert.ok(n.includes("ok"), "Should find ok");
  });

  it("finds err function", () => {
    const n = names("err");
    assert.ok(n.includes("err"), "Should find err");
  });

  it("finds by prefix 'use'", () => {
    const n = names("use");
    assert.ok(n.includes("usequery"), "Should find useQuery");
    assert.ok(n.includes("usequeries"), "Should find useQueries");
  });
});

describe("search: edge cases", () => {
  const search = createSearch([]);

  it("empty query returns nothing", () => {
    assert.strictEqual(search("").length, 0);
  });

  it("whitespace query returns nothing", () => {
    assert.strictEqual(search("   ").length, 0);
  });
});
