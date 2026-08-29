import { describe, expect, test } from "vitest";
import { cleanMdxContent } from "../../../../apps/web/src/lib/llms.ts";

describe("cleanMdxContent", () => {
  test("preserves announcement content as a blockquote", () => {
    expect(
      cleanMdxContent(`
<Announcement>
  Upgrading from Evolu 7?
  Existing data is preserved.
</Announcement>
`),
    ).toBe("> Upgrading from Evolu 7?\n> Existing data is preserved.");
  });
});
