import { describe, expect, test } from "vitest";
import { jsdocSourcePattern, selectJSDocIncludes } from "./test-jsdoc.mts";

describe("selectJSDocIncludes", () => {
  test("selects every common source file by default", () => {
    expect(selectJSDocIncludes([])).toEqual([jsdocSourcePattern]);
  });

  test("preserves explicit files and globs", () => {
    expect(
      selectJSDocIncludes(["packages/common/src/Result.ts", "docs/**/*.md"]),
    ).toEqual(["packages/common/src/Result.ts", "docs/**/*.md"]);
  });

  test("rejects unknown options", () => {
    expect(() => selectJSDocIncludes(["--unknown"])).toThrow(
      "Unknown option: --unknown",
    );
  });
});
