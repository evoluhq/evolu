import { describe, it } from "node:test";
import { assertEqual, assertFalse, assertSame, assertTrue } from "./Assert.ts";

import { UnknownError, createUnknownError } from "./Error.ts";
import { assertType, Object, String } from "./Type.ts";

describe("createUnknownError", () => {
  it("UnknownError validates unknown error values", () => {
    const result = createUnknownError("boom");

    assertTrue(UnknownError.is(result));
    assertFalse(UnknownError.is({ type: "OtherError", error: "boom" }));
  });

  it("handles plain error", () => {
    const error = new Error("Test error");
    const result = createUnknownError(error);

    assertEqual(result.type, "UnknownError");

    assertType(Object, result.error);
    const details = result.error;
    assertEqual(details.message, "Test error");
    assertType(String, details.stack);
  });

  it("handles error with cause", () => {
    const innerError = new Error("Inner error");
    const error = new Error("Outer error", { cause: innerError });
    const result = createUnknownError(error);

    assertEqual(result.type, "UnknownError");
    assertType(Object, result.error);
    const details = result.error;
    assertEqual(details.message, "Outer error");
    assertType(String, details.stack);
    assertType(Object, details.cause);
    const cause = details.cause;
    assertEqual(cause.message, "Inner error");
    assertType(String, cause.stack);
  });

  it("handles inherited stack getter", () => {
    const prototype: object = globalThis.Object.create(Error.prototype, {
      stack: { get: () => "Inherited stack" },
    });
    const error = globalThis.Object.create(prototype) as Error;
    globalThis.Object.defineProperty(error, "message", {
      value: "Test error",
    });
    const result = createUnknownError(error);

    assertType(Object, result.error);
    const details = result.error;
    assertEqual(details.message, "Test error");
    assertEqual(details.stack, "Inherited stack");
  });

  it("excludes non-clonable error properties", () => {
    const error = globalThis.Object.assign(new Error("Test error"), {
      nonClonable: () => undefined,
    });
    const result = createUnknownError(error);

    assertEqual(result.type, "UnknownError");
    assertType(Object, result.error);
    assertFalse("nonClonable" in result.error);
  });

  it("handles structured cloneable objects", () => {
    const error = { key: "value" };
    const result = createUnknownError(error);

    assertEqual(result.type, "UnknownError");
    assertEqual(result.error, { key: "value" });
  });

  it("handles non-cloneable objects", () => {
    const error = {
      toString: () => {
        throw new Error("Cannot stringify");
      },
    };
    const result = createUnknownError(error);

    assertEqual(result.type, "UnknownError");
    assertEqual(result.error, "[Unserializable Object]");
  });

  it("handles primitive values", () => {
    const error = "A simple string";
    const result = createUnknownError(error);

    assertEqual(result.type, "UnknownError");
    assertEqual(result.error, "A simple string");
  });

  it("handles null values", () => {
    const result = createUnknownError(null);

    assertEqual(result.type, "UnknownError");
    assertSame(result.error, null);
  });

  it("handles circular references", () => {
    interface Circular {
      self?: Circular;
    }
    const error: Circular = {};
    // Create a circular reference
    error.self = error;
    const result = createUnknownError(error);

    assertEqual(result.type, "UnknownError");
    const actual = result.error as Circular;
    assertSame(actual.self, actual);
  });
});
