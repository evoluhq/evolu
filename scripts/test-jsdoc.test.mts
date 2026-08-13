import { describe, expect, test } from "vitest";
import { jsdocSourceFiles, selectJSDocIncludes } from "./test-jsdoc.mts";

describe("selectJSDocIncludes", () => {
  test("selects every configured source by default", () => {
    expect(selectJSDocIncludes([])).toEqual(jsdocSourceFiles);
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
