import { assertEqual, assertThrowsInstanceOf } from "@evolu/common";
import { describe, it } from "node:test";

import {
  extractCodeBlocks,
  extractLines,
  toHighlightedLanguage,
} from "./code-image.mts";

describe("extractCodeBlocks", () => {
  it("numbers every fenced block of a Markdown file with its language and first code line", () => {
    const source = [
      "# Title",
      "",
      "```ts",
      'const a = "a";',
      "```",
      "",
      "Text.",
      "",
      "```bash",
      "pnpm install",
      "```",
      "",
      "```",
      "plain",
      "```",
    ].join("\n");

    assertEqual(extractCodeBlocks(source, "change.md"), [
      {
        index: 1,
        line: 4,
        lang: "ts",
        code: 'const a = "a";',
        documents: null,
      },
      {
        index: 2,
        line: 10,
        lang: "bash",
        code: "pnpm install",
        documents: null,
      },
      { index: 3, line: 14, lang: "text", code: "plain", documents: null },
    ]);
  });

  it("extracts JSDoc examples without comment prefixes and names what they document", () => {
    const source = [
      "/**",
      " * Doubles a number.",
      " *",
      " * ### Example",
      " *",
      " * ```ts",
      ' * import { double } from "./double.ts";',
      " *",
      " * double(2);",
      " * ```",
      " */",
      "export const double = (n: number): number => n * 2;",
      "",
      "/** No example. */",
      "export const one = 1;",
      "",
      "// ```ts",
      "// not in JSDoc",
      "// ```",
    ].join("\n");

    assertEqual(extractCodeBlocks(source, "double.ts"), [
      {
        index: 1,
        line: 7,
        lang: "ts",
        code: 'import { double } from "./double.ts";\n\ndouble(2);',
        documents: "export const double = (n: number): number => n * 2;",
      },
    ]);
  });

  it("matches each fence to a closing fence of its character and length", () => {
    const source = [
      "````ts",
      'const fence = "```";',
      "````",
      "",
      "~~~ts",
      "const b = 2;",
      "~~~~",
    ].join("\n");

    assertEqual(extractCodeBlocks(source, "fences.md"), [
      {
        index: 1,
        line: 2,
        lang: "ts",
        code: 'const fence = "```";',
        documents: null,
      },
      { index: 2, line: 6, lang: "ts", code: "const b = 2;", documents: null },
    ]);
  });

  it("keeps a JSDoc example inside a Markdown block whole", () => {
    const source = [
      "```ts",
      "/**",
      " * ```ts",
      " * double(2);",
      " * ```",
      " */",
      "export const double = (n: number): number => n * 2;",
      "```",
    ].join("\n");

    assertEqual(extractCodeBlocks(source, "jsdoc.md"), [
      {
        index: 1,
        line: 2,
        lang: "ts",
        code: source.split("\n").slice(1, -1).join("\n"),
        documents: null,
      },
    ]);
  });

  it("does not open a block at inline code that starts a line", () => {
    const source = [
      "```inline``` code",
      "",
      "```ts",
      "const a = 1;",
      "```",
    ].join("\n");

    assertEqual(extractCodeBlocks(source, "inline.md"), [
      { index: 1, line: 4, lang: "ts", code: "const a = 1;", documents: null },
    ]);
  });

  it("skips empty blocks", () => {
    assertEqual(extractCodeBlocks("```ts\n\n```", "empty.mdx"), []);
  });
});

describe("extractLines", () => {
  const source = [
    "const a = () => {",
    "  if (x) {",
    "    return 1;",
    "  }",
    "};",
  ].join("\n");

  it("extracts an inclusive range without common indentation", () => {
    assertEqual(extractLines(source, 2, 4), "if (x) {\n  return 1;\n}");
  });

  it("rejects a range outside the file", () => {
    assertEqual(
      assertThrowsInstanceOf(() => extractLines(source, 4, 9), Error).message,
      "Lines 4-9 are outside 1-5.",
    );
    assertEqual(
      assertThrowsInstanceOf(() => extractLines(source, 3, 2), Error).message,
      "Lines 3-2 are outside 1-5.",
    );
  });
});

describe("toHighlightedLanguage", () => {
  it("keeps a language Shiki knows and renders others as plain text", async () => {
    assertEqual(
      await Promise.all(
        ["tsx", "bash", "text", "tree", "constructor"].map(
          toHighlightedLanguage,
        ),
      ),
      ["tsx", "bash", "text", "text", "text"],
    );
  });
});
