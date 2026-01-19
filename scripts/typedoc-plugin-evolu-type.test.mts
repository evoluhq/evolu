import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tests for typedoc-plugin-evolu-type output.
 *
 * These tests verify the generated documentation. Run `pnpm build:docs` before
 * running these tests.
 */

const docsPath = join(
  import.meta.dirname,
  "../apps/web/src/app/(docs)/docs/api-reference",
);

describe("typedoc-plugin-evolu-type", () => {
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
      expect(content).toContain("Hybrid Logical Clock timestamp");
      // Should NOT have InferType's generic JSDoc
      expect(content).not.toContain("Extracts the output type");
    });
  });

  describe("Pattern 2: type X = typeof X.Type", () => {
    it("copies comment from const to type alias", () => {
      const content = readFileSync(
        join(
          docsPath,
          "common/local-first/Timestamp/type-aliases/NodeId/page.mdx",
        ),
        "utf-8",
      );
      // Type alias should have the const's comment
      expect(content).toContain("A NodeId uniquely identifies");
      // Should NOT have InferType's generic JSDoc
      expect(content).not.toContain("Extracts the output type");
    });

    it("resolves the type instead of showing typeof X.Type", () => {
      const content = readFileSync(
        join(
          docsPath,
          "common/local-first/Timestamp/type-aliases/NodeId/page.mdx",
        ),
        "utf-8",
      );
      // Should show the resolved branded type, not "typeof NodeId.Type"
      expect(content).not.toContain("typeof NodeId.Type");
      expect(content).toContain('Brand<"NodeId">');
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
      expect(content).toContain("object({");
      expect(content).toContain("millis: Millis");
      expect(content).toContain("counter: Counter");
      expect(content).toContain("nodeId: NodeId");
      expect(content).not.toContain("ObjectType<");
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
      expect(content).toContain('regex("NodeId"');
      expect(content).not.toContain("BrandType<");
    });

    it("shows source instead of expanded type for curried factories", () => {
      const content = readFileSync(
        join(docsPath, "common/Crypto/variables/Entropy64/page.mdx"),
        "utf-8",
      );
      // Should show length(64)(Entropy), not BrandType<...>
      expect(content).toContain("length(64)(Entropy)");
      expect(content).not.toContain("BrandType<");
    });
  });
});
