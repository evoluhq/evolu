import { describe, expect, test } from "vitest";
import { createTransferableError } from "../src/Error.js";

describe("createTransferableError", () => {
  test("handles plain error", () => {
    const error = new Error("Test error");
    const result = createTransferableError(error);

    expect(result.type).toBe("TransferableError");
    expect(result.error).toMatchObject({
      message: "Test error",
      stack: expect.any(String),
    });
  });

  test("handles error with cause", () => {
    const innerError = new Error("Inner error");
    const error = new Error("Outer error", { cause: innerError });
    const result = createTransferableError(error);

    expect(result.type).toBe("TransferableError");
    expect(result.error).toMatchObject({
      message: "Outer error",
      stack: expect.any(String),
      cause: {
        message: "Inner error",
        stack: expect.any(String),
      },
    });
  });

  test("excludes non-transferable error properties", () => {
    const error = new Error("Test error");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-empty-function
    (error as any).nonTransferable = () => {};
    const result = createTransferableError(error);

    expect(result.type).toBe("TransferableError");
    expect(result.error).not.toHaveProperty("nonTransferable");
  });

  test("handles structured cloneable objects", () => {
    const error = { key: "value" };
    const result = createTransferableError(error);

    expect(result.type).toBe("TransferableError");
    expect(result.error).toEqual({ key: "value" });
  });

  test("handles non-cloneable objects", () => {
    const error = {
      toString: () => {
        throw new Error("Cannot stringify");
      },
    };
    const result = createTransferableError(error);

    expect(result.type).toBe("TransferableError");
    expect(result.error).toBe("[Unserializable Object]");
  });

  test("handles primitive values", () => {
    const error = "A simple string";
    const result = createTransferableError(error);

    expect(result.type).toBe("TransferableError");
    expect(result.error).toBe("A simple string");
  });

  test("handles null values", () => {
    const result = createTransferableError(null);

    expect(result.type).toBe("TransferableError");
    expect(result.error).toBe(null);
  });

  test("handles circular references", () => {
    const error: any = {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    error.self = error; // Create a circular reference
    const result = createTransferableError(error);

    expect(result.type).toBe("TransferableError");
    expect(result.error).toMatchInlineSnapshot(`
      {
        "self": [Circular],
      }
    `);
  });
});
