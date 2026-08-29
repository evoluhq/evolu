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
        "ncqMQ1uwd5-zf5YKUbT3VA",
        "ofZXw_hAfJ8fIcpFxi6nag",
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
