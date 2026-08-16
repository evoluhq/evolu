import { describe, expect, test } from "vitest";
import {
  changesetSourcePattern,
  jsdocSourcePattern,
  selectJSDocIncludes,
} from "./test-jsdoc.mts";

describe("selectJSDocIncludes", () => {
  test("selects common JSDoc and changeset Markdown by default", () => {
    expect(selectJSDocIncludes([])).toEqual([
      jsdocSourcePattern,
      changesetSourcePattern,
    ]);
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
