import { assertEqual } from "@evolu/common";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripHiddenLines } from "./remark.mjs";

describe("stripHiddenLines", () => {
  it("keeps code without hidden lines", () => {
    assertEqual(
      stripHiddenLines("const a = 1;\n\nconst b = 2;"),
      "const a = 1;\n\nconst b = 2;",
    );
  });

  it("removes hidden lines and the blank line they would double", () => {
    assertEqual(
      stripHiddenLines(
        [
          "// ---cut-start---",
          "const schema = {};",
          "// ---cut-end---",
          "",
          'import { a } from "a";',
          "",
          "// ---cut-start---",
          "const setup = a;",
          "// ---cut-end---",
          "",
          "use(setup);",
          "  // ---cut-start---",
          "  assert(setup);",
          "  // ---cut-end---",
          "",
          "// ---cut-start---",
          "teardown();",
          "// ---cut-end---",
        ].join("\n"),
      ),
      'import { a } from "a";\n\nuse(setup);',
    );
  });

  it("removes the common indentation of visible lines that hidden lines wrap", () => {
    assertEqual(
      stripHiddenLines(
        [
          'import { use } from "use";',
          "// ---cut-start---",
          "const Component = () => {",
          "// ---cut-end---",
          "  const value = use();",
          "",
          "  if (value) {",
          "    render(value);",
          "  }",
          "// ---cut-start---",
          "};",
          "// ---cut-end---",
        ].join("\n"),
      ),
      'import { use } from "use";\nconst value = use();\n\nif (value) {\n  render(value);\n}',
    );
    assertEqual(stripHiddenLines("  indented();"), "  indented();");
  });

  it("rejects unmatched markers", () => {
    assert.throws(
      () => stripHiddenLines("// ---cut-start---\nconst a = 1;"),
      /unmatched \/\/ ---cut-start---/u,
    );
    assert.throws(
      () => stripHiddenLines("const a = 1;\n// ---cut-end---"),
      /unmatched \/\/ ---cut-end---/u,
    );
    assert.throws(
      () =>
        stripHiddenLines(
          "// ---cut-start---\n// ---cut-start---\n// ---cut-end---",
        ),
      /unmatched \/\/ ---cut-start---/u,
    );
  });
});
