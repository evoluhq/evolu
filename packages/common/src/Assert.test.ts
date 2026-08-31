import nodeAssert from "node:assert/strict";
import { describe, it, test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import type { NonEmptyArray, NonEmptyReadonlyArray } from "./Array.ts";
import {
  assert,
  assertConditionAfterMicrotasks,
  assertEqual,
  assertEqualBytes,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertLength,
  assertNonEmptyArray,
  assertNonEmptyReadonlyArray,
  assertNonNullable,
  assertNotDisposed,
  assertNotEqual,
  assertNotNull,
  assertNotSame,
  assertNotUndefined,
  assertOk,
  assertRejects,
  assertRejectsInstanceOf,
  assertRejectsSame,
  assertSame,
  assertThrows,
  assertThrowsInstanceOf,
  assertThrowsSame,
  assertTrue,
} from "./Assert.ts";
import type { Brand } from "./Brand.ts";
import { err, ok, type Err, type Ok, type Result } from "./Result.ts";
import { assertType, Number } from "./Type.ts";

test("assert", () => {
  assert(true, "Should not throw");

  nodeAssert.throws(() => {
    assert(false, "Condition failed");
  }, /Condition failed/u);

  const cause = new Error("Cause");
  nodeAssert.throws(
    () => {
      assert(false, "Condition failed", { cause });
    },
    (error: unknown) => {
      nodeAssert.ok(error instanceof nodeAssert.AssertionError);
      nodeAssert.equal(error.name, "AssertionError");
      nodeAssert.equal(error.code, "ERR_ASSERTION");
      nodeAssert.equal(error.actual, false);
      nodeAssert.equal(error.expected, true);
      nodeAssert.equal(error.generatedMessage, false);
      nodeAssert.equal(error.operator, "==");
      nodeAssert.equal(error.cause, cause);
      nodeAssert.ok(error.stack);
      nodeAssert.equal(
        error.stack.includes("/packages/common/src/Assert.ts:"),
        false,
      );
      return true;
    },
  );

  const assertString: (value: unknown) => asserts value is string = (value) => {
    assert(typeof value === "string", "Expected a string.", {
      actual: value,
      expected: "string",
      operator: "typeof",
      stackStartFn: assertString,
    });
  };
  const value: unknown = "value";

  assertString(value);
  assertType<typeof value, string>();

  nodeAssert.throws(
    () => {
      assertString(42);
    },
    (error: unknown) => {
      nodeAssert.ok(error instanceof nodeAssert.AssertionError);
      nodeAssert.equal(error.actual, 42);
      nodeAssert.equal(error.expected, "string");
      nodeAssert.equal(error.operator, "typeof");
      nodeAssert.ok(error.stack);
      nodeAssert.equal(error.stack.includes("at assertString "), false);
      return true;
    },
  );
});

test("assert uses a compatible fallback without Node.js", async () => {
  let fallbackAssert: typeof assert = assert;
  let fallbackAssertEqual: typeof assertEqual = assertEqual;
  const nodeProcess = globalThis.process;

  if (nodeProcess?.getBuiltinModule !== undefined) {
    const getBuiltinModuleDescriptor = Object.getOwnPropertyDescriptor(
      nodeProcess,
      "getBuiltinModule",
    );
    Object.defineProperty(nodeProcess, "getBuiltinModule", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    try {
      const fallback = (await import(
        `./Assert.ts?fallback=${Date.now()}`
      )) as typeof import("./Assert.ts");
      fallbackAssert = fallback.assert;
      fallbackAssertEqual = fallback.assertEqual;
    } finally {
      if (getBuiltinModuleDescriptor === undefined) {
        delete (nodeProcess as { getBuiltinModule?: unknown }).getBuiltinModule;
      } else {
        Object.defineProperty(
          nodeProcess,
          "getBuiltinModule",
          getBuiltinModuleDescriptor,
        );
      }
    }
  }

  const cause = new Error("Cause");
  nodeAssert.throws(
    () => {
      fallbackAssert(false, "Condition failed", { cause });
    },
    {
      name: "AssertionError",
      code: "ERR_ASSERTION",
      message: "Condition failed",
      actual: false,
      expected: true,
      generatedMessage: false,
      operator: "==",
      cause,
    },
  );

  nodeAssert.throws(
    () => {
      fallbackAssert(false, "Condition failed");
    },
    (error: unknown) => {
      nodeAssert.ok(error instanceof Error);
      nodeAssert.equal("cause" in error, false);
      return true;
    },
  );

  nodeAssert.throws(
    () => {
      fallbackAssertEqual({ value: 1 }, { value: 2 });
    },
    {
      actual: { value: 1 },
      expected: { value: 2 },
      operator: "eqData",
    },
  );

  const assertString: (value: unknown) => asserts value is string = (value) => {
    fallbackAssert(typeof value === "string", "Expected a string.", {
      stackStartFn: assertString,
    });
  };
  nodeAssert.throws(
    () => assertString(42),
    (error: unknown) => {
      nodeAssert.ok(error instanceof Error);
      nodeAssert.ok(error.stack);
      nodeAssert.equal(error.stack.includes("at assertString "), false);
      nodeAssert.equal(
        error.stack.includes("/packages/common/src/Assert.ts"),
        false,
      );
      return true;
    },
  );
});

test("assertTrue", () => {
  const value: unknown = true;

  assertTrue(value);
  assertType<typeof value, true>();

  nodeAssert.throws(() => assertTrue(1), /Expected true\./u);
});

test("assertFalse", () => {
  const value: unknown = false;

  assertFalse(value);
  assertType<typeof value, false>();

  nodeAssert.throws(() => assertFalse(0), /Expected false\./u);
});

describe("assertConditionAfterMicrotasks", () => {
  it("resolves when the condition becomes true after the exact count", async () => {
    let callCount = 0;

    await assertConditionAfterMicrotasks(() => callCount++ === 2, 2);

    nodeAssert.equal(callCount, 3);
  });

  it("rejects when the condition becomes true too early", async () => {
    await nodeAssert.rejects(
      assertConditionAfterMicrotasks(() => true, 1),
      /Expected condition to be false after 0 microtasks\./u,
    );
  });

  it("rejects when the condition is still false after the exact count", async () => {
    await nodeAssert.rejects(
      assertConditionAfterMicrotasks(() => false, 0),
      /Expected condition to be true after exactly 0 microtasks\./u,
    );
  });
});

describe("assertThrows", () => {
  it("compares the thrown value", () => {
    assertThrows(
      () => {
        // oxlint-disable-next-line eslint/no-throw-literal, typescript/only-throw-error -- JavaScript permits throwing any value, which is part of the assertion contract.
        throw { type: "ExpectedFailure" };
      },
      { type: "ExpectedFailure" },
    );
    assertThrows(() => {
      // oxlint-disable-next-line eslint/no-throw-literal, typescript/only-throw-error -- JavaScript permits throwing any value, which is part of the assertion contract.
      throw undefined;
    }, undefined);
  });

  it("runs a custom assertion for the thrown value", () => {
    const error = new Error("Expected failure.");

    assertThrows(
      () => {
        throw error;
      },
      (thrown) => assertSame(thrown, error),
    );

    nodeAssert.throws(
      () =>
        assertThrows(
          () => {
            throw error;
          },
          // oxlint-disable-next-line typescript/strict-void-return -- Exercise the runtime rejection of predicates that return instead of asserting.
          () => true,
        ),
      /Expected the thrown value assertion to return undefined\./u,
    );
  });

  it("fails when the thrown value is not equal to the expected value", () => {
    const actual = { value: 1 };
    const expected = { value: 2 };

    nodeAssert.throws(
      () =>
        assertThrows(() => {
          // oxlint-disable-next-line typescript/only-throw-error -- JavaScript permits throwing any value, which is part of the assertion contract.
          throw actual;
        }, expected),
      (error: unknown) => {
        nodeAssert.ok(error instanceof nodeAssert.AssertionError);
        nodeAssert.deepEqual(error.actual, actual);
        nodeAssert.deepEqual(error.expected, expected);
        nodeAssert.equal(error.operator, "eqData");
        nodeAssert.match(
          error.message,
          /^Expected the thrown value to equal the expected value\./u,
        );
        nodeAssert.ok(error.stack);
        nodeAssert.equal(error.stack.includes("at assertThrows "), false);
        return true;
      },
    );
  });

  it("fails when the function returns", () => {
    nodeAssert.throws(
      () => assertThrows(() => 42, 42),
      (error: unknown) => {
        nodeAssert.ok(error instanceof nodeAssert.AssertionError);
        nodeAssert.equal(error.actual, 42);
        nodeAssert.equal(error.expected, "throw");
        nodeAssert.equal(error.operator, "throws");
        nodeAssert.equal(error.message, "Expected function to throw.");
        nodeAssert.ok(error.stack);
        nodeAssert.equal(error.stack.includes("at assertThrows "), false);
        return true;
      },
    );
  });
});

describe("assertThrowsSame", () => {
  it("compares the thrown value using SameValue", () => {
    const expected = () => undefined;

    assertThrowsSame(() => {
      // oxlint-disable-next-line typescript/only-throw-error -- JavaScript permits throwing any value, which is part of the assertion contract.
      throw expected;
    }, expected);
  });

  it("fails when the thrown value is not the same", () => {
    nodeAssert.throws(
      () =>
        assertThrowsSame(
          () => {
            // oxlint-disable-next-line eslint/no-throw-literal, typescript/only-throw-error -- JavaScript permits throwing any value, which is part of the assertion contract.
            throw { value: 1 };
          },
          { value: 1 },
        ),
      /Expected the thrown value to be the same as the expected value\./u,
    );
  });
});

describe("assertThrowsInstanceOf", () => {
  it("returns the narrowed thrown value", () => {
    class TestError extends Error {}

    const error = assertThrowsInstanceOf(() => {
      throw new TestError("Expected failure.");
    }, TestError);

    assertType<typeof error, TestError>();
    assertEqual(error.message, "Expected failure.");
  });

  it("fails when the thrown value is not an instance", () => {
    const AnonymousError = Object.defineProperty(
      class extends Error {},
      "name",
      {
        value: "",
      },
    );

    nodeAssert.throws(
      () =>
        assertThrowsInstanceOf(() => {
          throw new Error("Actual error.");
        }, AnonymousError),
      /Expected the thrown value to be an instance of the provided constructor\./u,
    );
  });
});

describe("assertRejects", () => {
  it("compares the rejection reason", async () => {
    // oxlint-disable-next-line eslint/prefer-promise-reject-errors, typescript/prefer-promise-reject-errors -- JavaScript permits rejecting with any value, which is part of the assertion contract.
    await assertRejects(Promise.reject({ type: "ExpectedFailure" }), {
      type: "ExpectedFailure",
    });
    await assertRejects(
      // oxlint-disable-next-line eslint/prefer-promise-reject-errors, typescript/prefer-promise-reject-errors -- JavaScript permits rejecting with any value, which is part of the assertion contract.
      Promise.reject(undefined),
      undefined,
    );
  });

  it("runs a custom assertion for the rejection reason", async () => {
    const error = new Error("Expected failure.");

    await assertRejects(Promise.reject(error), (reason) =>
      assertSame(reason, error),
    );

    await nodeAssert.rejects(
      // oxlint-disable-next-line typescript/strict-void-return -- Exercise the runtime rejection of predicates that return instead of asserting.
      assertRejects(Promise.reject(error), () => true),
      /Expected the rejection assertion to return undefined\./u,
    );
  });

  it("fails when the rejection reason is not equal to the expected value", async () => {
    const actual = { value: 1 };
    const expected = { value: 2 };

    await nodeAssert.rejects(
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- JavaScript permits rejecting with any value, which is part of the assertion contract.
      assertRejects(Promise.reject(actual), expected),
      (error: unknown) => {
        nodeAssert.ok(error instanceof nodeAssert.AssertionError);
        nodeAssert.deepEqual(error.actual, actual);
        nodeAssert.deepEqual(error.expected, expected);
        nodeAssert.equal(error.operator, "eqData");
        nodeAssert.match(
          error.message,
          /^Expected the rejection reason to equal the expected value\./u,
        );
        nodeAssert.ok(error.stack);
        nodeAssert.equal(error.stack.includes("at assertRejects "), false);
        return true;
      },
    );
  });

  it("fails when the promise resolves", async () => {
    await nodeAssert.rejects(
      assertRejects(Promise.resolve(42), 42),
      (error: unknown) => {
        nodeAssert.ok(error instanceof nodeAssert.AssertionError);
        nodeAssert.equal(error.actual, 42);
        nodeAssert.equal(error.expected, "rejection");
        nodeAssert.equal(error.operator, "rejects");
        nodeAssert.equal(error.message, "Expected promise to reject.");
        nodeAssert.ok(error.stack);
        nodeAssert.equal(error.stack.includes("at assertRejects "), false);
        return true;
      },
    );
  });
});

describe("assertRejectsSame", () => {
  it("compares the rejection reason using SameValue", async () => {
    const expected = () => undefined;

    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- JavaScript permits rejecting with any value, which is part of the assertion contract.
    await assertRejectsSame(Promise.reject(expected), expected);
  });

  it("fails when the rejection reason is not the same", async () => {
    await nodeAssert.rejects(
      // oxlint-disable-next-line eslint/prefer-promise-reject-errors, typescript/prefer-promise-reject-errors -- JavaScript permits rejecting with any value, which is part of the assertion contract.
      assertRejectsSame(Promise.reject({ value: 1 }), { value: 1 }),
      /Expected the rejection reason to be the same as the expected value\./u,
    );
  });
});

describe("assertRejectsInstanceOf", () => {
  it("returns the narrowed rejection reason", async () => {
    class TestError extends Error {}

    const error = await assertRejectsInstanceOf(
      Promise.reject(new TestError("Expected failure.")),
      TestError,
    );

    assertType<typeof error, TestError>();
    assertEqual(error.message, "Expected failure.");
  });

  it("fails when the rejection reason is not an instance", async () => {
    const AnonymousError = Object.defineProperty(
      class extends Error {},
      "name",
      {
        value: "",
      },
    );

    await nodeAssert.rejects(
      assertRejectsInstanceOf(
        Promise.reject(new Error("Actual error.")),
        AnonymousError,
      ),
      /Expected the rejection reason to be an instance of the provided constructor\./u,
    );
  });
});

test("assertInstanceOf", () => {
  class TestError extends Error {}

  const value: unknown = new TestError("Test error");

  assertInstanceOf(value, TestError);
  assertType<typeof value, TestError>();

  const actual = new Error("Actual error");
  nodeAssert.throws(
    () => assertInstanceOf(actual, TestError),
    (error: unknown) => {
      nodeAssert.ok(error instanceof nodeAssert.AssertionError);
      nodeAssert.equal(error.actual, actual);
      nodeAssert.equal(error.expected, TestError);
      nodeAssert.equal(error.operator, "instanceof");
      nodeAssert.equal(error.message, "Expected an instance of TestError.");
      nodeAssert.ok(error.stack);
      nodeAssert.equal(error.stack.includes("at assertInstanceOf "), false);
      return true;
    },
  );

  const AnonymousError = Object.defineProperty(class extends Error {}, "name", {
    value: "",
  });
  nodeAssert.throws(
    () => assertInstanceOf(actual, AnonymousError),
    /Expected an instance of the provided constructor\./u,
  );
});

test("assertNonNullable", () => {
  const value = "value" as string | null | undefined;
  assertNonNullable(value);
  assertType<typeof value, string>();
  nodeAssert.equal(value, "value");

  nodeAssert.throws(() => assertNonNullable(null), {
    actual: null,
    expected: null,
    operator: "!=",
  });

  nodeAssert.throws(() => {
    assertNonNullable(undefined, "Custom error");
  }, /Custom error/u);
});

test("assertNotNull", () => {
  const value = undefined as string | null | undefined;
  assertNotNull(value);
  assertType<typeof value, string | undefined>();
  nodeAssert.equal(value, undefined);

  const unknownValue: unknown = undefined;
  assertNotNull(unknownValue);
  assertType<typeof unknownValue, {} | undefined>();
  nodeAssert.equal(unknownValue, undefined);

  nodeAssert.throws(() => assertNotNull(null), {
    actual: null,
    expected: null,
    operator: "notStrictEqual",
  });

  nodeAssert.throws(() => {
    assertNotNull(null, "Custom error");
  }, /Custom error/u);
});

test("assertNotUndefined", () => {
  const value = null as string | null | undefined;
  assertNotUndefined(value);
  assertType<typeof value, string | null>();
  nodeAssert.equal(value, null);

  const unknownValue: unknown = null;
  assertNotUndefined(unknownValue);
  assertType<typeof unknownValue, {} | null>();
  nodeAssert.equal(unknownValue, null);

  nodeAssert.throws(() => assertNotUndefined(undefined), {
    actual: undefined,
    expected: undefined,
    operator: "notStrictEqual",
  });

  nodeAssert.throws(() => {
    assertNotUndefined(undefined, "Custom error");
  }, /Custom error/u);
});

test("assertLength", () => {
  const values: ReadonlyArray<string> = ["Ada", "Grace"];

  assertLength(values, 2);
  assertType<typeof values.length, 2>();

  nodeAssert.throws(
    () => assertLength(values, 1),
    (error: unknown) => {
      nodeAssert.ok(error instanceof nodeAssert.AssertionError);
      nodeAssert.equal(error.actual, 2);
      nodeAssert.equal(error.expected, 1);
      nodeAssert.equal(error.operator, "strictEqual");
      nodeAssert.match(error.message, /^Expected value to have length 1\./u);
      nodeAssert.ok(error.stack);
      nodeAssert.equal(error.stack.includes("at assertLength "), false);
      return true;
    },
  );
});

test("assertNonEmptyArray", () => {
  // Valid non-empty array
  const arr = [1, 2, 3];
  assertNonEmptyArray(arr);
  assertType<typeof arr, NonEmptyArray<number>>();
  // No type change, just validation
  nodeAssert.deepEqual(arr, [1, 2, 3]);

  // Empty array should throw
  nodeAssert.throws(() => assertNonEmptyArray([]), {
    actual: 0,
    expected: 0,
    operator: ">",
  });

  // Custom error message
  nodeAssert.throws(() => {
    assertNonEmptyArray([], "Custom error");
  }, /Custom error/u);
});

test("assertNonEmptyReadonlyArray", () => {
  // Valid non-empty readonly array
  const arr: ReadonlyArray<number> = [1, 2, 3];
  assertNonEmptyReadonlyArray(arr);
  assertType<typeof arr, NonEmptyReadonlyArray<number>>();
  // Ensures no changes
  nodeAssert.deepEqual(arr, [1, 2, 3]);

  // Empty readonly array should throw
  nodeAssert.throws(() => assertNonEmptyReadonlyArray([]), {
    actual: 0,
    expected: 0,
    operator: ">",
  });

  // Custom error message
  nodeAssert.throws(() => {
    assertNonEmptyReadonlyArray([], "Custom error");
  }, /Custom error/u);
});

test("assertNotDisposed", async () => {
  const stack = new globalThis.AsyncDisposableStack();

  assertNotDisposed(stack);

  await stack.disposeAsync();

  nodeAssert.throws(() => assertNotDisposed(stack), {
    actual: true,
    expected: false,
    operator: "==",
  });
});

test("assertion helpers omit their implementation from Node.js stack traces", () => {
  if (globalThis.process?.getBuiltinModule === undefined) return;

  const failures: ReadonlyArray<readonly [string, () => void]> = [
    ["assertNonNullable", () => assertNonNullable(null)],
    ["assertNotNull", () => assertNotNull(null)],
    ["assertNotUndefined", () => assertNotUndefined(undefined)],
    ["assertLength", () => assertLength([], 1)],
    ["assertNonEmptyArray", () => assertNonEmptyArray([])],
    ["assertNonEmptyReadonlyArray", () => assertNonEmptyReadonlyArray([])],
    ["assertNotDisposed", () => assertNotDisposed({ disposed: true })],
    ["assertInstanceOf", () => assertInstanceOf({}, Error)],
  ];

  for (const [name, run] of failures) {
    nodeAssert.throws(run, (error: unknown) => {
      nodeAssert.ok(error instanceof nodeAssert.AssertionError);
      nodeAssert.ok(error.stack);
      nodeAssert.equal(error.stack.includes(`at ${name} `), false);
      return true;
    });
  }
});

test("assertSame", () => {
  interface User {
    readonly name: string;
  }

  const user: User = { name: "Ada" };
  const value: unknown = user;

  assertSame(value, user);
  assertType<typeof value, User>();
  assertSame(NaN, NaN);

  const otherUser = { name: "Ada" };
  nodeAssert.throws(
    () => assertSame(user, otherUser),
    (error: unknown) => {
      nodeAssert.ok(error instanceof nodeAssert.AssertionError);
      nodeAssert.equal(error.actual, user);
      nodeAssert.equal(error.expected, otherUser);
      nodeAssert.equal(error.operator, "strictEqual");
      nodeAssert.match(error.message, /Expected values to be the same\./u);
      return true;
    },
  );
  nodeAssert.throws(
    () => assertSame(0, -0),
    /Expected values to be the same\./u,
  );
});

test("assertNotSame", () => {
  const first = { name: "Ada" };
  const second = { name: "Ada" };

  assertNotSame(first, second);
  assertNotSame(0, -0);

  nodeAssert.throws(
    () => assertNotSame(first, first),
    (error: unknown) => {
      nodeAssert.ok(error instanceof nodeAssert.AssertionError);
      nodeAssert.equal(error.actual, first);
      nodeAssert.equal(error.expected, first);
      nodeAssert.equal(error.operator, "notStrictEqual");
      nodeAssert.equal(error.generatedMessage, false);
      nodeAssert.equal(error.message, "Expected values not to be the same.");
      return true;
    },
  );
});

test("assertEqual", () => {
  interface User {
    readonly name: string;
    readonly roles: ReadonlySet<string>;
  }

  const actual: User = {
    name: "Ada",
    roles: new Set(["admin", "author"]),
  };
  const expected: User = {
    name: "Ada",
    roles: new Set(["author", "admin"]),
  };

  assertEqual(actual, expected);
  const unknownActual: unknown = ["fmt", "msg"];
  const unknownExpected: unknown = ["fmt", "msg"];
  assertEqual(unknownActual, unknownExpected);

  const opaque = (): void => undefined;
  assertEqual(opaque, opaque);
  assertEqual({ opaque }, { opaque });
  nodeAssert.throws(
    () =>
      assertEqual(
        () => undefined,
        () => undefined,
      ),
    /Expected values to be equal\./u,
  );
  nodeAssert.throws(() => assertEqual(0, -0), /Expected values to be equal\./u);

  const unexpected = { ...expected, name: "Grace" };
  nodeAssert.throws(
    () => assertEqual(actual, unexpected),
    (error: unknown) => {
      nodeAssert.ok(error instanceof nodeAssert.AssertionError);
      nodeAssert.equal(error.actual, actual);
      nodeAssert.equal(error.expected, unexpected);
      nodeAssert.equal(error.operator, "eqData");
      nodeAssert.match(error.message, /Expected values to be equal\./u);
      nodeAssert.match(
        stripVTControlCharacters(error.message),
        /\+ actual - expected/u,
      );
      return true;
    },
  );
});

test("assertEqualBytes", () => {
  assertEqualBytes(new Uint8Array([1, 5, 39, 254]), [1, 5, 39, 254]);

  const compileTimeAssertions = () => {
    // @ts-expect-error assertEqualBytes actual value must be a Uint8Array.
    assertEqualBytes([1, 5, 39, 254], [1, 5, 39, 254]);
  };
  assertEqual(typeof compileTimeAssertions, "function");

  const actual = new Uint8Array([0]);
  const expected = [1];

  nodeAssert.throws(
    () => assertEqualBytes(actual, expected),
    (error: unknown) => {
      nodeAssert.ok(error instanceof nodeAssert.AssertionError);
      nodeAssert.equal(error.actual, actual);
      nodeAssert.equal(error.expected, expected);
      nodeAssert.equal(error.operator, "eqArrayNumber");
      nodeAssert.match(error.message, /Expected bytes to be equal\./u);
      nodeAssert.ok(error.stack);
      nodeAssert.equal(error.stack.includes("at assertEqualBytes "), false);
      return true;
    },
  );
});

test("assertNotEqual", () => {
  const actual = { name: "Ada", roles: new Set(["admin", "author"]) };
  const expected = { name: "Ada", roles: new Set(["author", "admin"]) };

  assertNotEqual(actual, { ...expected, name: "Grace" });
  assertNotEqual(0, -0);
  assertNotEqual(
    () => undefined,
    () => undefined,
  );

  nodeAssert.throws(
    () => assertNotEqual(actual, expected),
    (error: unknown) => {
      nodeAssert.ok(error instanceof nodeAssert.AssertionError);
      nodeAssert.equal(error.actual, actual);
      nodeAssert.equal(error.expected, expected);
      nodeAssert.equal(error.operator, "notEqData");
      nodeAssert.equal(error.message, "Expected values not to be equal.");
      return true;
    },
  );

  const opaque = (): void => undefined;
  nodeAssert.throws(
    () => assertNotEqual(opaque, opaque),
    /Expected values not to be equal\./u,
  );
});

describe("assertOk and assertErr", () => {
  interface TestError {
    readonly type: "TestError";
    readonly code: number;
  }

  it("asserts and narrows an Ok without comparing its value", () => {
    interface Service {
      readonly run: () => void;
    }

    const createResult = (): Result<Service, TestError> =>
      ok({ run: () => undefined });
    const result = createResult();

    assertOk(result);

    assertType<typeof result, Ok<Service>>();
    nodeAssert.equal(typeof result.value.run, "function");
  });

  it("asserts and narrows an Ok with a deeply equal value", () => {
    const result: Result<{ readonly value: number }, TestError> = ok({
      value: 42,
    });

    assertOk(result, { value: 42 });

    assertType<typeof result, Ok<{ readonly value: number }>>();
  });

  it("compares an Ok with an independently typed Data value", () => {
    type Answer = number & Brand<"Answer">;
    const result: Result<Answer, TestError> = ok(42 as Answer);

    assertOk(result, 42);
  });

  it("asserts a void Ok", () => {
    const result: Result<void, TestError> = ok();

    assertOk(result, undefined);

    assertType<typeof result, Ok<void>>();
  });

  it("compares an explicitly provided undefined value", () => {
    const result: Result<number | undefined, TestError> = ok(42);

    nodeAssert.throws(
      () => assertOk(result, undefined),
      /Expected the value to equal the expected value\./u,
    );
  });

  it("rejects an Err when asserting an Ok", () => {
    const result: Result<number, TestError> = err({
      type: "TestError",
      code: 1,
    });

    nodeAssert.throws(() => assertOk(result, 42), /Expected an Ok result\./u);
  });

  it("rejects an unexpected Ok value", () => {
    const result: Result<{ readonly value: number }, TestError> = ok({
      value: 42,
    });

    nodeAssert.throws(
      () => assertOk(result, { value: 41 }),
      /Expected the value to equal the expected value\./u,
    );
  });

  it("accepts a custom Eq for an Ok value", () => {
    const result: Result<number, TestError> = ok(42);

    assertOk(result, 40, (x, y) => Math.abs(x - y) <= 2);
  });

  it("does not format a failed custom Ok Eq as deep equality", () => {
    const actual = { value: 42 };
    const expected = { value: 42 };
    const result: Result<typeof actual, TestError> = ok(actual);

    nodeAssert.throws(
      () => {
        assertOk(result, expected, Object.is);
      },
      (error: unknown) => {
        nodeAssert.ok(error instanceof nodeAssert.AssertionError);
        nodeAssert.equal(error.actual, actual);
        nodeAssert.equal(error.expected, expected);
        nodeAssert.equal(error.operator, "Eq");
        nodeAssert.equal(
          error.message,
          "Expected the value to equal the expected value.",
        );
        return true;
      },
    );
  });

  it("compares a non-Data Ok value by identity", () => {
    interface Service {
      readonly run: () => void;
    }

    const service: Service = { run: () => undefined };
    const result: Result<Service, TestError> = ok(service);

    assertOk(result, service);
    nodeAssert.throws(
      () => assertOk(result, { run: () => undefined }),
      /Expected the value to equal the expected value\./u,
    );
    assertOk(result, service, (x, y) => x === y);
  });

  it("compares a broad object Ok value by identity", () => {
    const value: NonNullable<unknown> = new WeakMap();
    const result: Result<NonNullable<unknown>, TestError> = ok(value);

    assertOk(result, value);
    nodeAssert.throws(
      () => assertOk(result, new WeakMap()),
      /Expected the value to equal the expected value\./u,
    );
    assertOk(result, value, (x, y) => x === y);
  });

  it("accepts an untyped expected value in a default Ok comparison", () => {
    const value = JSON.parse("null");
    const result = ok(42);

    nodeAssert.throws(
      () => assertOk(result, value),
      /Expected the value to equal the expected value\./u,
    );
  });

  it("accepts an untyped Result value in a default Ok comparison", () => {
    const result = ok(JSON.parse("null"));

    assertOk(result, null);
  });

  it("asserts and narrows an Err with a deeply equal error", () => {
    const result: Result<number, TestError> = err({
      type: "TestError",
      code: 1,
    });

    assertErr(result, { code: 1, type: "TestError" });

    assertType<typeof result, Err<TestError>>();
  });

  it("compares an Err with an independently typed Data value", () => {
    type ErrorCode = number & Brand<"ErrorCode">;
    interface BrandedTestError {
      readonly type: "TestError";
      readonly code: ErrorCode;
    }

    const result: Result<number, BrandedTestError> = err({
      type: "TestError",
      code: 1 as ErrorCode,
    });

    assertErr(result, { type: "TestError", code: 1 });
  });

  it("asserts and narrows an Err without comparing its error", () => {
    interface ServiceError {
      readonly type: "ServiceError";
      readonly retry: () => void;
    }

    const createResult = (): Result<number, ServiceError> =>
      err({ type: "ServiceError", retry: () => undefined });
    const result = createResult();

    assertErr(result);

    assertType<typeof result, Err<ServiceError>>();
    nodeAssert.equal(typeof result.error.retry, "function");
  });

  it("compares an explicitly provided undefined error", () => {
    const result: Result<number, TestError | undefined> = err({
      type: "TestError",
      code: 1,
    });

    nodeAssert.throws(
      () => assertErr(result, undefined),
      /Expected the error to equal the expected error\./u,
    );
  });

  it("rejects an Ok when asserting an Err", () => {
    const result: Result<number, TestError> = ok(42);

    nodeAssert.throws(
      () => assertErr(result, { type: "TestError", code: 1 }),
      /Expected an Err result\./u,
    );
  });

  it("rejects an unexpected Err error", () => {
    const result: Result<number, TestError> = err({
      type: "TestError",
      code: 1,
    });

    nodeAssert.throws(
      () => assertErr(result, { type: "TestError", code: 2 }),
      /Expected the error to equal the expected error\./u,
    );
  });

  it("accepts a custom Eq for an Err error", () => {
    const result: Result<number, TestError> = err({
      type: "TestError",
      code: 2,
    });

    assertErr(
      result,
      { type: "TestError", code: 1 },
      (x, y) => x.type === y.type,
    );
  });

  it("does not format a failed custom Err Eq as deep equality", () => {
    const actual: TestError = { type: "TestError", code: 1 };
    const expected: TestError = { type: "TestError", code: 1 };
    const result: Result<number, TestError> = err(actual);

    nodeAssert.throws(
      () => {
        assertErr(result, expected, Object.is);
      },
      (error: unknown) => {
        nodeAssert.ok(error instanceof nodeAssert.AssertionError);
        nodeAssert.equal(error.actual, actual);
        nodeAssert.equal(error.expected, expected);
        nodeAssert.equal(error.operator, "Eq");
        nodeAssert.equal(
          error.message,
          "Expected the error to equal the expected error.",
        );
        return true;
      },
    );
  });

  it("compares a non-Data Err error by identity", () => {
    interface ServiceError {
      readonly type: "ServiceError";
      readonly retry: () => void;
    }

    const serviceError: ServiceError = {
      type: "ServiceError",
      retry: () => undefined,
    };
    const result: Result<number, ServiceError> = err(serviceError);

    assertErr(result, serviceError);
    nodeAssert.throws(
      () =>
        assertErr(result, {
          type: "ServiceError",
          retry: () => undefined,
        }),
      /Expected the error to equal the expected error\./u,
    );
    assertErr(result, serviceError, (x, y) => x === y);
  });

  it("narrows heterogeneous Result unions", () => {
    const createOkResult = ():
      Result<number, "NumberError"> | Result<string, "StringError"> => ok(42);
    const createErrResult = ():
      Result<number, "NumberError"> | Result<string, "StringError"> =>
      err("NumberError");
    const okResult = createOkResult();
    const errResult = createErrResult();

    assertOk(okResult, 42);
    assertErr(errResult, "NumberError");

    assertType<typeof okResult, Ok<number> | Ok<string>>();
    assertType<typeof errResult, Err<"NumberError"> | Err<"StringError">>();
  });
});

describe("design decisions", () => {
  /**
   * Evolu cannot expose `SomeType.assert(value)` because assertion methods do
   * not narrow when the Type is inferred from a factory. TypeScript requires
   * every name in an assertion method's call target to have an explicit type
   * annotation. See the [TypeScript design
   * limitation](https://github.com/microsoft/TypeScript/issues/36931).
   */
  it("does not expose Type.assert because inferred assertion methods cannot narrow", () => {
    const createTypeWithAssert = () => ({
      assert: (value: unknown): asserts value is string => {
        nodeAssert.equal(typeof value, "string");
      },
    });
    const InferredType = createTypeWithAssert();
    const inferredValue: unknown = "value";

    // @ts-expect-error TS2775: Assertions require every name in the call target to be declared with an explicit type annotation.
    InferredType.assert(inferredValue);

    const value: unknown = 42;
    assertType(Number, value);
    assertType<typeof value, number>();
  });
});
