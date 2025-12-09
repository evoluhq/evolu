import { describe, expect, test } from "vitest";
import { createUnknownError } from "../src/Error.js";

describe("createUnknownError", () => {
  test("handles plain error", () => {
    const error = new Error("Test error");
    const result = createUnknownError(error);

    expect(result.type).toBe("UnknownError");
    expect(result.error).toMatchObject({
      message: "Test error",
      stack: expect.any(String),
    });
  });

  test("handles error with cause", () => {
    const innerError = new Error("Inner error");
    const error = new Error("Outer error", { cause: innerError });
    const result = createUnknownError(error);

    expect(result.type).toBe("UnknownError");
    expect(result.error).toMatchObject({
      message: "Outer error",
      stack: expect.any(String),
      cause: {
        message: "Inner error",
        stack: expect.any(String),
      },
    });
  });

  test("excludes non-clonable error properties", () => {
    const error = new Error("Test error");
    (error as any).nonClonable = () => {
      //
    };
    const result = createUnknownError(error);

    expect(result.type).toBe("UnknownError");
    expect(result.error).not.toHaveProperty("nonClonable");
  });

  test("handles structured cloneable objects", () => {
    const error = { key: "value" };
    const result = createUnknownError(error);

    expect(result.type).toBe("UnknownError");
    expect(result.error).toEqual({ key: "value" });
  });

  test("handles non-cloneable objects", () => {
    const error = {
      toString: () => {
        throw new Error("Cannot stringify");
      },
    };
    const result = createUnknownError(error);

    expect(result.type).toBe("UnknownError");
    expect(result.error).toBe("[Unserializable Object]");
  });

  test("handles primitive values", () => {
    const error = "A simple string";
    const result = createUnknownError(error);

    expect(result.type).toBe("UnknownError");
    expect(result.error).toBe("A simple string");
  });

  test("handles null values", () => {
    const result = createUnknownError(null);

    expect(result.type).toBe("UnknownError");
    expect(result.error).toBe(null);
  });

  test("handles circular references", () => {
    const error: any = {};
    error.self = error; // Create a circular reference
    const result = createUnknownError(error);

    expect(result.type).toBe("UnknownError");
    expect(result.error).toMatchInlineSnapshot(`
      {
        "self": [Circular],
      }
    `);
  });
});
