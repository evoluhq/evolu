import { expect, expectTypeOf, test } from "vitest";
import {
  err,
  getOrThrow,
  ok,
  Result,
  tryAsync,
  trySync,
} from "../src/Result.js";

test("ok", () => {
  expect(ok(42)).toStrictEqual({ ok: true, value: 42 });
  expect(ok()).toStrictEqual({ ok: true, value: undefined });
  // @ts-expect-error Type 'Ok<void>' is not assignable to type 'Result<string, Error>'
  const _result: Result<string, Error> = ok();
});

test("err", () => {
  expect(err("error")).toStrictEqual({ ok: false, error: "error" });
});

test("getOrThrow", () => {
  expect(getOrThrow(ok(42))).toBe(42);
  expect(() => getOrThrow(err("error"))).toThrowErrorMatchingInlineSnapshot(
    `[Error: getOrThrow failed]`,
  );

  // Inspect cause for a primitive error value
  let thrown: unknown;
  try {
    getOrThrow(err("error"));
  } catch (e) {
    thrown = e;
  }
  const error1 = thrown as Error & { cause?: unknown };
  expect(error1.cause).toBe("error");

  // Inspect cause for an Error instance
  const original = new TypeError("boom");
  try {
    getOrThrow(err(original));
  } catch (e) {
    thrown = e;
  }
  const error2 = thrown as Error & { cause?: unknown };
  expect(error2.cause).toBe(original);
});

test("trySync", () => {
  interface ParseError {
    readonly type: "ParseError";
    readonly message: string;
  }

  const success = trySync(
    () => JSON.parse('{"key": "value"}') as unknown,
    (error): ParseError => ({ type: "ParseError", message: String(error) }),
  );

  expect(success).toStrictEqual({
    ok: true,
    value: { key: "value" },
  });

  const failure = trySync(
    () => JSON.parse("{key: value}") as unknown,
    (error): ParseError => ({ type: "ParseError", message: String(error) }),
  );

  expect(failure).toStrictEqual({
    ok: false,
    error: {
      type: "ParseError",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      message: expect.stringContaining("SyntaxError"),
    },
  });
});

test("tryAsync", async () => {
  // eslint-disable-next-line @typescript-eslint/require-await
  const successfulPromise = async () => "success";

  const successResult = await tryAsync(successfulPromise, (error) => ({
    type: "TestError",
    message: String(error),
  }));

  expect(successResult).toStrictEqual(ok("success"));

  // eslint-disable-next-line @typescript-eslint/require-await
  const failingPromise = async () => {
    throw new Error("Something went wrong");
  };

  const failureResult = await tryAsync(failingPromise, (error) => ({
    type: "TestError",
    message: String(error),
  }));

  expect(failureResult).toStrictEqual(
    err({
      type: "TestError",
      message: "Error: Something went wrong",
    }),
  );

  // Failing promise with a custom error mapping
  // eslint-disable-next-line @typescript-eslint/require-await
  const customErrorPromise = async () => {
    throw new TypeError("Invalid type");
  };

  const customErrorResult = await tryAsync(customErrorPromise, (error) => ({
    type: "CustomError",
    name: error instanceof Error ? error.name : "UnknownError",
    message: String(error),
  }));

  expect(customErrorResult).toStrictEqual(
    err({
      type: "CustomError",
      name: "TypeError",
      message: "TypeError: Invalid type",
    }),
  );
});

test("example", () => {
  interface ParseJsonError {
    readonly type: "ParseJsonError";
    readonly message: string;
  }

  const parseJson = (value: string): Result<unknown, ParseJsonError> => {
    try {
      return ok(JSON.parse(value));
    } catch (error) {
      return err({ type: "ParseJsonError", message: String(error) });
    }
  };

  // Result<unknown, ParseJsonError>
  const json = parseJson('{"key": "value"}');

  // Return errors early.
  if (!json.ok) return json; // Err<ParseJsonError>

  // Now, we have access to the json.value.
  expectTypeOf(json.value).toBeUnknown();
});

test.skip("Result wrapping vs unwrapped performance", () => {
  const MESSAGE_SIZE = 50_000; // 50 KB
  const AVG_ITEM_SIZE = 8; // Average item size
  const NUM_ITEMS = Math.floor(MESSAGE_SIZE / AVG_ITEM_SIZE); // ~6250 items

  const data = new Uint8Array(MESSAGE_SIZE); // 50 KB message
  data.fill(1); // Dummy data

  // Wrapped: Read with Result
  const readWrapped = (
    bytes: Uint8Array,
    offset: number,
    size: number,
  ): Result<Uint8Array, string> => {
    return ok(bytes.subarray(offset, offset + size));
  };

  // Unwrapped: Read without Result
  const readUnwrapped = (
    bytes: Uint8Array,
    offset: number,
    size: number,
  ): Uint8Array => {
    return bytes.subarray(offset, offset + size);
  };

  // Measure Wrapped
  const wrappedStart = performance.now();
  for (let offset = 0, i = 0; i < NUM_ITEMS; i++, offset += AVG_ITEM_SIZE) {
    const result = readWrapped(data, offset, AVG_ITEM_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    if (result.ok) result.value; // Access to prevent optimization elimination
  }
  const wrappedTime = performance.now() - wrappedStart;

  // Measure Unwrapped
  const unwrappedStart = performance.now();
  for (let offset = 0, i = 0; i < NUM_ITEMS; i++, offset += AVG_ITEM_SIZE) {
    const chunk = readUnwrapped(data, offset, AVG_ITEM_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    chunk; // Access to prevent optimization elimination
  }
  const unwrappedTime = performance.now() - unwrappedStart;

  // eslint-disable-next-line no-console
  console.log(`Wrapped: ${wrappedTime.toFixed(2)} ms for ${NUM_ITEMS} items`);
  // eslint-disable-next-line no-console
  console.log(
    `Unwrapped: ${unwrappedTime.toFixed(2)} ms for ${NUM_ITEMS} items`,
  );
  // eslint-disable-next-line no-console
  console.log(`Difference: ${(wrappedTime - unwrappedTime).toFixed(2)} ms`);
});
