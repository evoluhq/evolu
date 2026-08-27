import { describe, expect, test } from "vitest";
import {
  changesetSourcePattern,
  jsdocSourcePattern,
  schemaSourcePattern,
  selectJSDocIncludes,
} from "./test-jsdoc.mts";

describe("selectJSDocIncludes", () => {
  test("selects all documentation examples by default", () => {
    expect(selectJSDocIncludes([])).toEqual([
      jsdocSourcePattern,
      changesetSourcePattern,
      schemaSourcePattern,
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
