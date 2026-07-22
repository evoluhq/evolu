import { err, type Err, ok, type Ok, type Result } from "@evolu/common";
import { describe, expect, expectTypeOf, test } from "vitest";
import { expectErr, expectOk } from "../../../../packages/vitest/src/index.ts";

const createOkResult = (): Result<number, string> => ok(42);
const createErrResult = (): Result<number, string> => err("error");

describe("expectOk", () => {
  test("accepts an Ok and narrows the Result", () => {
    const result = createOkResult();

    expectOk(result, 42);

    expectTypeOf(result).toEqualTypeOf<Ok<number>>();
  });

  test("rejects an Err", () => {
    expect(() => expectOk(createErrResult(), 42)).toThrow();
  });

  test("rejects an unexpected value", () => {
    expect(() => expectOk(createOkResult(), 41)).toThrow();
  });

  test("narrows a heterogeneous Result union", () => {
    const createResult = (): Result<number, "NumberError"> | Result<
      string,
      "StringError"
    > => ok(42);
    const result = createResult();

    expectOk(result, 42);

    expectTypeOf(result).toEqualTypeOf<Ok<number> | Ok<string>>();
  });
});

describe("expectErr", () => {
  test("accepts an Err and narrows the Result", () => {
    const result = createErrResult();

    expectErr(result, "error");

    expectTypeOf(result).toEqualTypeOf<Err<string>>();
  });

  test("rejects an Ok", () => {
    expect(() => expectErr(createOkResult(), "error")).toThrow();
  });

  test("rejects an unexpected error", () => {
    expect(() => expectErr(createErrResult(), "another error")).toThrow();
  });

  test("narrows a heterogeneous Result union", () => {
    const createResult = (): Result<number, "NumberError"> | Result<
      string,
      "StringError"
    > => err("NumberError");
    const result = createResult();

    expectErr(result, "NumberError");

    expectTypeOf(result).toEqualTypeOf<
      Err<"NumberError"> | Err<"StringError">
    >();
  });
});
