import { describe, expect, expectTypeOf, it, test } from "vitest";
import type {
  NonEmptyArray,
  NonEmptyReadonlyArray,
} from "../../../../packages/common/src/Array.ts";
import type { Brand } from "../../../../packages/common/src/Brand.ts";
import {
  assert,
  assertSame,
  assertTrue,
  assertFalse,
  assertEqual,
  assertOk,
  assertErr,
  assertNonNullable,
  assertNotNull,
  assertNotUndefined,
  assertNonEmptyArray,
  assertNonEmptyReadonlyArray,
  assertNotDisposed,
} from "../../../../packages/common/src/Assert.ts";
import {
  err,
  ok,
  type Err,
  type Ok,
  type Result,
} from "../../../../packages/common/src/Result.ts";

test("assert", () => {
  // Should not throw when the condition is true
  assert(true, "Should not throw");

  // Should throw when the condition is false
  expect(() => {
    assert(false, "Condition failed");
  }).toThrow("Condition failed");
});

test("assertSame", () => {
  interface User {
    readonly name: string;
  }

  const user: User = { name: "Ada" };
  const value: unknown = user;

  assertSame(value, user);
  expectTypeOf(value).toEqualTypeOf<User>();
  assertSame(NaN, NaN);

  expect(() => assertSame(user, { name: "Ada" })).toThrow(
    "Expected values to be the same.",
  );
  expect(() => assertSame(0, -0)).toThrow("Expected values to be the same.");
});

test("assertTrue", () => {
  const value: unknown = true;

  assertTrue(value);
  expectTypeOf(value).toEqualTypeOf<true>();

  expect(() => assertTrue(1)).toThrow("Expected true.");
});

test("assertFalse", () => {
  const value: unknown = false;

  assertFalse(value);
  expectTypeOf(value).toEqualTypeOf<false>();

  expect(() => assertFalse(0)).toThrow("Expected false.");
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

  expect(() => assertEqual(actual, { ...expected, name: "Grace" })).toThrow(
    "Expected values to be equal.",
  );

  const compileTimeAssertions = () => {
    const actual = (): void => undefined;
    const expected = (): void => undefined;

    // @ts-expect-error ⛔ assertEqual error: Actual and expected values must consist only of Data.
    assertEqual(actual, expected);
  };
  expect(compileTimeAssertions).toBeTypeOf("function");
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

    expectTypeOf(result).toEqualTypeOf<Ok<Service>>();
    expect(result.value.run).toBeTypeOf("function");
  });

  it("asserts and narrows an Ok with a deeply equal value", () => {
    const result: Result<{ readonly value: number }, TestError> = ok({
      value: 42,
    });

    assertOk(result, { value: 42 });

    expectTypeOf(result).toEqualTypeOf<Ok<{ readonly value: number }>>();
  });

  it("compares an Ok with an independently typed Data value", () => {
    type Answer = number & Brand<"Answer">;
    const result: Result<Answer, TestError> = ok(42 as Answer);

    assertOk(result, 42);
  });

  it("asserts a void Ok", () => {
    const result: Result<void, TestError> = ok();

    assertOk(result, undefined);

    expectTypeOf(result).toEqualTypeOf<Ok<void>>();
  });

  it("compares an explicitly provided undefined value", () => {
    const result: Result<number | undefined, TestError> = ok(42);

    expect(() => assertOk(result, undefined)).toThrow(
      "Expected the value to equal the expected value.",
    );
  });

  it("rejects an Err when asserting an Ok", () => {
    const result: Result<number, TestError> = err({
      type: "TestError",
      code: 1,
    });

    expect(() => assertOk(result, 42)).toThrow("Expected an Ok result.");
  });

  it("rejects an unexpected Ok value", () => {
    const result: Result<{ readonly value: number }, TestError> = ok({
      value: 42,
    });

    expect(() => assertOk(result, { value: 41 })).toThrow(
      "Expected the value to equal the expected value.",
    );
  });

  it("accepts a custom Eq for an Ok value", () => {
    const result: Result<number, TestError> = ok(42);

    assertOk(result, 40, (x, y) => Math.abs(x - y) <= 2);
  });

  it("requires a custom Eq for a non-Data Ok value", () => {
    interface Service {
      readonly run: () => void;
    }

    const service: Service = { run: () => undefined };
    const result: Result<Service, TestError> = ok(service);
    const compileTimeAssertions = () => {
      // @ts-expect-error ⛔ assertOk error: Result value and expected value must consist only of Data when no custom Eq is provided.
      assertOk(result, service);
    };

    assertOk(result, service, (x, y) => x === y);
    expect(compileTimeAssertions).toBeTypeOf("function");
  });

  it("requires a custom Eq for a broad object Ok value", () => {
    const value: NonNullable<unknown> = new WeakMap();
    const result: Result<NonNullable<unknown>, TestError> = ok(value);
    const compileTimeAssertions = () => {
      // @ts-expect-error ⛔ assertOk error: Result value and expected value must consist only of Data when no custom Eq is provided.
      assertOk(result, value);
    };

    assertOk(result, value, (x, y) => x === y);
    expect(compileTimeAssertions).toBeTypeOf("function");
  });

  it("rejects an untyped expected value from a default Ok comparison", () => {
    const value = JSON.parse("null");
    const result = ok(42);
    const compileTimeAssertions = () => {
      /* oxlint-disable typescript/no-unsafe-argument -- This assertion verifies that assertOk rejects any. */
      // @ts-expect-error ⛔ assertOk error: Result value and expected value must consist only of Data when no custom Eq is provided.
      assertOk(result, value);
      /* oxlint-enable typescript/no-unsafe-argument */
    };

    expect(compileTimeAssertions).toBeTypeOf("function");
  });

  it("rejects an untyped Result value from a default Ok comparison", () => {
    const result = ok(JSON.parse("null"));
    const compileTimeAssertions = () => {
      // @ts-expect-error ⛔ assertOk error: Result value and expected value must consist only of Data when no custom Eq is provided.
      assertOk(result, null);
    };

    expect(compileTimeAssertions).toBeTypeOf("function");
  });

  it("asserts and narrows an Err with a deeply equal error", () => {
    const result: Result<number, TestError> = err({
      type: "TestError",
      code: 1,
    });

    assertErr(result, { code: 1, type: "TestError" });

    expectTypeOf(result).toEqualTypeOf<Err<TestError>>();
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

    expectTypeOf(result).toEqualTypeOf<Err<ServiceError>>();
    expect(result.error.retry).toBeTypeOf("function");
  });

  it("compares an explicitly provided undefined error", () => {
    const result: Result<number, TestError | undefined> = err({
      type: "TestError",
      code: 1,
    });

    expect(() => assertErr(result, undefined)).toThrow(
      "Expected the error to equal the expected error.",
    );
  });

  it("rejects an Ok when asserting an Err", () => {
    const result: Result<number, TestError> = ok(42);

    expect(() => assertErr(result, { type: "TestError", code: 1 })).toThrow(
      "Expected an Err result.",
    );
  });

  it("rejects an unexpected Err error", () => {
    const result: Result<number, TestError> = err({
      type: "TestError",
      code: 1,
    });

    expect(() => assertErr(result, { type: "TestError", code: 2 })).toThrow(
      "Expected the error to equal the expected error.",
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

  it("requires a custom Eq for a non-Data Err error", () => {
    interface ServiceError {
      readonly type: "ServiceError";
      readonly retry: () => void;
    }

    const serviceError: ServiceError = {
      type: "ServiceError",
      retry: () => undefined,
    };
    const result: Result<number, ServiceError> = err(serviceError);
    const compileTimeAssertions = () => {
      // @ts-expect-error ⛔ assertErr error: Result error and expected error must consist only of Data when no custom Eq is provided.
      assertErr(result, serviceError);
    };

    assertErr(result, serviceError, (x, y) => x === y);
    expect(compileTimeAssertions).toBeTypeOf("function");
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

    expectTypeOf(okResult).toEqualTypeOf<Ok<number> | Ok<string>>();
    expectTypeOf(errResult).toEqualTypeOf<
      Err<"NumberError"> | Err<"StringError">
    >();
  });
});

test("assertNonNullable", () => {
  const value = "value" as string | null | undefined;
  assertNonNullable(value);
  expectTypeOf(value).toEqualTypeOf<string>();
  expect(value).toBe("value");

  expect(() => {
    assertNonNullable(null);
  }).toThrow("Expected value to be non-nullable.");

  expect(() => {
    assertNonNullable(undefined, "Custom error");
  }).toThrow("Custom error");
});

test("assertNotNull", () => {
  const value = undefined as string | null | undefined;
  assertNotNull(value);
  expectTypeOf(value).toEqualTypeOf<string | undefined>();
  expect(value).toBeUndefined();

  const unknownValue: unknown = undefined;
  assertNotNull(unknownValue);
  expectTypeOf(unknownValue).toEqualTypeOf<{} | undefined>();
  expect(unknownValue).toBeUndefined();

  expect(() => {
    assertNotNull(null);
  }).toThrow("Expected value not to be null.");

  expect(() => {
    assertNotNull(null, "Custom error");
  }).toThrow("Custom error");
});

test("assertNotUndefined", () => {
  const value = null as string | null | undefined;
  assertNotUndefined(value);
  expectTypeOf(value).toEqualTypeOf<string | null>();
  expect(value).toBeNull();

  const unknownValue: unknown = null;
  assertNotUndefined(unknownValue);
  expectTypeOf(unknownValue).toEqualTypeOf<{} | null>();
  expect(unknownValue).toBeNull();

  expect(() => {
    assertNotUndefined(undefined);
  }).toThrow("Expected value not to be undefined.");

  expect(() => {
    assertNotUndefined(undefined, "Custom error");
  }).toThrow("Custom error");
});

test("assertNonEmptyArray", () => {
  // Valid non-empty array
  const arr = [1, 2, 3];
  assertNonEmptyArray(arr);
  expectTypeOf(arr).toEqualTypeOf<NonEmptyArray<number>>();
  // No type change, just validation
  expect(arr).toEqual([1, 2, 3]);

  // Empty array should throw
  expect(() => {
    assertNonEmptyArray([]);
  }).toThrow("Expected a non-empty array.");

  // Custom error message
  expect(() => {
    assertNonEmptyArray([], "Custom error");
  }).toThrow("Custom error");
});

test("assertNonEmptyReadonlyArray", () => {
  // Valid non-empty readonly array
  const arr: ReadonlyArray<number> = [1, 2, 3];
  assertNonEmptyReadonlyArray(arr);
  expectTypeOf(arr).toEqualTypeOf<NonEmptyReadonlyArray<number>>();
  // Ensures no changes
  expect(arr).toEqual([1, 2, 3]);

  // Empty readonly array should throw
  expect(() => {
    assertNonEmptyReadonlyArray([]);
  }).toThrow("Expected a non-empty readonly array.");

  // Custom error message
  expect(() => {
    assertNonEmptyReadonlyArray([], "Custom error");
  }).toThrow("Custom error");
});

test("assertNotDisposed", async () => {
  const stack = new globalThis.AsyncDisposableStack();

  expect(() => {
    assertNotDisposed(stack);
  }).not.toThrow();

  await stack.disposeAsync();

  expect(() => {
    assertNotDisposed(stack);
  }).toThrow("Cannot use a disposed object.");
});
