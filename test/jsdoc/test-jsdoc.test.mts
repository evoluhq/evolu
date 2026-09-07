import { assertEqual, assertThrowsInstanceOf } from "@evolu/common";
import { describe, it } from "node:test";
import {
  changesetSourcePattern,
  conventionsSourcePattern,
  jsdocSourcePattern,
  nodeFsSourcePattern,
  resourceManagementSourcePattern,
  schemaSourcePattern,
  selectJSDocIncludes,
  testingSourcePattern,
} from "./test-jsdoc.mts";

describe("selectJSDocIncludes", () => {
  it("selects all documentation examples by default", () => {
    assertEqual(selectJSDocIncludes([]), [
      jsdocSourcePattern,
      nodeFsSourcePattern,
      changesetSourcePattern,
      conventionsSourcePattern,
      resourceManagementSourcePattern,
      schemaSourcePattern,
      testingSourcePattern,
    ]);
  });

  it("preserves explicit files and globs", () => {
    assertEqual(
      selectJSDocIncludes(["packages/common/src/Result.ts", "docs/**/*.md"]),
      ["packages/common/src/Result.ts", "docs/**/*.md"],
    );
  });

  it("rejects unknown options", () => {
    assertEqual(
      assertThrowsInstanceOf(() => selectJSDocIncludes(["--unknown"]), Error)
        .message,
      "Unknown option: --unknown",
    );
  });
});
