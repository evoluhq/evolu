import { describe, expect, expectTypeOf, test } from "vitest";
import type { Brand } from "../../../../packages/common/src/Brand.ts";
import { testCreateId } from "../../../../packages/common/src/Test.ts";
import type { Id } from "../../../../packages/common/src/Type.ts";

describe("testCreateId", () => {
  test("creates file-local stable pseudo-random ids", () => {
    const createTestId = testCreateId();
    const first = createTestId();
    const second = createTestId();

    expect([first, second]).toMatchInlineSnapshot(`
      [
        "IGNl5t4ulaaQpdnwDhgoCA",
        "0l2pVhO0LWfZ0SWcHuPJiQ",
      ]
    `);
    expect(second).not.toBe(first);
    expectTypeOf(first).toEqualTypeOf<Id>();
  });

  test("preserves branded id typing", () => {
    const createTestId = testCreateId();
    const _todoId = createTestId<"Todo">();

    expectTypeOf(_todoId).toEqualTypeOf<Id & Brand<"Todo">>();
  });
});
