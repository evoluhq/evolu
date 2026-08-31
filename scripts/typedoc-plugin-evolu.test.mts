import { assertEqual, assertFalse, assertTrue } from "@evolu/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { stripPureAnnotations } from "./typedoc-plugin-evolu.mts";

/**
 * Tests for typedoc-plugin-evolu-type helpers and output.
 *
 * These tests verify the generated documentation. Run `pnpm build:docs` before
 * running these tests.
 */

const docsPath = join(
  import.meta.dirname,
  "../apps/web/src/app/(docs)/docs/api-reference",
);

describe("stripPureAnnotations", () => {
  it("removes nested pure annotations from displayed source", () => {
    assertEqual(
      stripPureAnnotations(`brand(
  "Age",
  /*#__PURE__*/ lessThan(200)(NonNegativeInt),
)`),
      `brand(
  "Age",
  lessThan(200)(NonNegativeInt),
)`,
    );
  });
});

describe.skip("typedoc-plugin-evolu-type", () => {
  describe("Pattern 1: interface extends InferType<typeof X>", () => {
    it("copies comment from const to interface", () => {
      const content = readFileSync(
        join(
          docsPath,
          "common/local-first/Timestamp/interfaces/Timestamp/page.mdx",
        ),
        "utf-8",
      );
      // Interface should have the const's comment (HLC documentation)
      assertTrue(content.includes("Hybrid Logical Clock timestamp"));
      // Should NOT have InferType's generic JSDoc
      assertFalse(content.includes("Extracts the Output of a Type"));
    });
  });

  describe("Pattern 2: type X = typeof X.Output", () => {
    it("copies comment from const to type alias", () => {
      const content = readFileSync(
        join(
          docsPath,
          "common/local-first/Timestamp/type-aliases/NodeId/page.mdx",
        ),
        "utf-8",
      );
      // Type alias should have the const's comment
      assertTrue(content.includes("A NodeId uniquely identifies"));
    });

    it("resolves the type instead of showing typeof X.Output", () => {
      const content = readFileSync(
        join(
          docsPath,
          "common/local-first/Timestamp/type-aliases/NodeId/page.mdx",
        ),
        "utf-8",
      );
      // Should show the resolved branded type, not "typeof NodeId.Output"
      assertFalse(content.includes("typeof NodeId.Output"));
      assertTrue(content.includes('Brand<"NodeId">'));
    });
  });

  describe("Pattern 3: const X = <EvoluType>", () => {
    it("shows source instead of expanded type for object()", () => {
      const content = readFileSync(
        join(
          docsPath,
          "common/local-first/Timestamp/variables/Timestamp/page.mdx",
        ),
        "utf-8",
      );
      // Should show the factory call, not the expanded ObjectType<...>
      assertTrue(content.includes("object({"));
      assertTrue(content.includes("millis: Millis"));
      assertTrue(content.includes("counter: Counter"));
      assertTrue(content.includes("nodeId: NodeId"));
      assertFalse(content.includes("ObjectType<"));
    });

    it("shows source instead of expanded type for regex()", () => {
      const content = readFileSync(
        join(
          docsPath,
          "common/local-first/Timestamp/variables/NodeId/page.mdx",
        ),
        "utf-8",
      );
      // Should show regex(...), not BrandType<...>
      assertTrue(content.includes('regex("NodeId"'));
      assertFalse(content.includes("BrandType<"));
    });

    it("shows source instead of expanded type for curried factories", () => {
      const content = readFileSync(
        join(docsPath, "common/Crypto/variables/Entropy64/page.mdx"),
        "utf-8",
      );
      // Should show length(64)(Entropy), not BrandType<...>
      assertTrue(content.includes("length(64)(Entropy)"));
      assertFalse(content.includes("BrandType<"));
    });
  });
});
