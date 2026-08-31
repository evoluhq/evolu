import {
  assertThrowsInstanceOf,
  assertType,
  err,
  type Err,
  ok,
  type Ok,
  type Result,
} from "@evolu/common";
import { describe, it } from "node:test";
import { expectErr, expectOk } from "./index.ts";

const createOkResult = (): Result<number, string> => ok(42);
const createErrResult = (): Result<number, string> => err("error");

describe("expectOk", () => {
  it("accepts an Ok and narrows the Result", () => {
    const result = createOkResult();

    expectOk(result, 42);

    assertType<typeof result, Ok<number>>();
  });

  it("rejects an Err", () => {
    assertThrowsInstanceOf(() => expectOk(createErrResult(), 42), Error);
  });

  it("rejects an unexpected value", () => {
    assertThrowsInstanceOf(() => expectOk(createOkResult(), 41), Error);
  });

  it("narrows a heterogeneous Result union", () => {
    const createResult = ():
      Result<number, "NumberError"> | Result<string, "StringError"> => ok(42);
    const result = createResult();

    expectOk(result, 42);

    assertType<typeof result, Ok<number> | Ok<string>>();
  });
});

describe("expectErr", () => {
  it("accepts an Err and narrows the Result", () => {
    const result = createErrResult();

    expectErr(result, "error");

    assertType<typeof result, Err<string>>();
  });

  it("rejects an Ok", () => {
    assertThrowsInstanceOf(() => expectErr(createOkResult(), "error"), Error);
  });

  it("rejects an unexpected error", () => {
    assertThrowsInstanceOf(
      () => expectErr(createErrResult(), "another error"),
      Error,
    );
  });

  it("narrows a heterogeneous Result union", () => {
    const createResult = ():
      Result<number, "NumberError"> | Result<string, "StringError"> =>
      err("NumberError");
    const result = createResult();

    expectErr(result, "NumberError");

    assertType<typeof result, Err<"NumberError"> | Err<"StringError">>();
  });
});
