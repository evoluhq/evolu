import { describe, expect, expectTypeOf, it, test } from "vitest";
import type {
  NonEmptyArray,
  NonEmptyReadonlyArray,
} from "../../../../packages/common/src/Array.ts";
import {
  assert,
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
      // @ts-expect-error ⛔ assertOk error: Result value must consist only of Data when no custom Eq is provided.
      assertOk(result, service);
    };

    assertOk(result, service, (x, y) => x === y);
    expect(compileTimeAssertions).toBeTypeOf("function");
  });

  it("requires a custom Eq for a broad object Ok value", () => {
    const value: NonNullable<unknown> = new WeakMap();
    const result: Result<NonNullable<unknown>, TestError> = ok(value);
    const compileTimeAssertions = () => {
      // @ts-expect-error ⛔ assertOk error: Result value must consist only of Data when no custom Eq is provided.
      assertOk(result, value);
    };

    assertOk(result, value, (x, y) => x === y);
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
      // @ts-expect-error ⛔ assertErr error: Result error must consist only of Data when no custom Eq is provided.
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
