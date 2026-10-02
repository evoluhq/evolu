import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import {
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertSame,
  assertTrue,
} from "./Assert.ts";

import { UnknownError, createUnknownError, defectToError } from "./Error.ts";
import { createRun } from "./Task.ts";
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

  it("describes error properties that cannot be cloned", () => {
    const error = new Error("Test error", {
      cause: { attempt: 2, retry: () => undefined },
    });
    const result = createUnknownError(error);

    assertType(Object, result.error);
    assertEqual(result.error.cause, '{"attempt":2}');
    assertEqual(structuredClone(result), result);
  });

  it("converts errors in an array that cannot be cloned", () => {
    const error = new AggregateError(
      [
        new Error("first", { cause: { retry: () => undefined } }),
        new Error("second"),
      ],
      "both",
    );
    const result = createUnknownError(error);

    assertType(Object, result.error);
    const errors = result.error.errors as ReadonlyArray<{
      readonly message: string;
    }>;
    assertEqual(
      errors.map(({ message }) => message),
      ["first", "second"],
    );
    assertEqual(structuredClone(result), result);
  });

  it("keeps reference cycles through errors and arrays", () => {
    const error = new Error("Test error") as Error & {
      originalError?: unknown;
      items?: ReadonlyArray<unknown>;
    };
    const items: Array<unknown> = [() => undefined];
    items.push(items);
    error.cause = error;
    error.originalError = error;
    error.items = items;

    const result = structuredClone(createUnknownError(error));

    assertType(Object, result.error);
    assertSame(result.error.cause, result.error);
    assertSame(result.error.originalError, result.error);
    const convertedItems = result.error.items as ReadonlyArray<unknown>;
    assertSame(convertedItems[0], "() => undefined");
    assertSame(convertedItems[1], convertedItems);
  });

  it("converts the errors of an AggregateError that can be cloned", () => {
    const inner = globalThis.Object.assign(new Error("connect failed"), {
      code: "ECONNREFUSED",
    });
    const result = structuredClone(
      createUnknownError(new AggregateError([inner], "all failed")),
    );

    assertType(Object, result.error);
    assertEqual(result.error.errors, [
      {
        stack: inner.stack,
        message: "connect failed",
        code: "ECONNREFUSED",
        name: "Error",
      },
    ]);
  });

  it("includes the inherited name and message of a DOMException", () => {
    const result = createUnknownError(
      new Error("write failed", {
        cause: new DOMException("Quota exceeded", "QuotaExceededError"),
      }),
    );

    assertType(Object, result.error);
    assertType(Object, result.error.cause);
    assertEqual(result.error.cause.name, "QuotaExceededError");
    assertEqual(result.error.cause.message, "Quota exceeded");
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

describe("defectToError", () => {
  it("converts a panic to its Error defect", async () => {
    const reported: Array<unknown> = [];
    await using run = createRun({
      reportDefect: (defect) => {
        reported.push(defect);
      },
    });
    const defect = new Error("boom");

    run.panic(defect);

    assertSame(defectToError(reported[0]), defect);
  });

  it("returns an Error from another realm as it is", () => {
    const defect: unknown = runInNewContext(
      'new TypeError("other realm failed")',
    );
    assertFalse(defect instanceof Error);

    assertSame(defectToError(defect), defect);
  });

  it("describes a DOMException with its name and message", () => {
    const defect = new DOMException("dom failed", "NotFoundError");

    const error = defectToError(defect);

    assertEqual(error.message, "NotFoundError: dom failed");
    assertSame(error.cause, defect);
  });

  it("describes a panic's defect that is not an Error", async () => {
    const reported: Array<unknown> = [];
    await using run = createRun({
      reportDefect: (defect) => {
        reported.push(defect);
      },
    });

    const abortError = run.panic({ type: "UnexpectedState", count: 1 });

    const error = defectToError(reported[0]);
    assertInstanceOf(error, Error);
    assertEqual(error.message, 'Defect: {"type":"UnexpectedState","count":1}');
    assertSame(error.cause, abortError);
  });

  it("describes an AbortError that is not a panic", () => {
    const abortError = {
      type: "AbortError",
      reason: { type: "OtherAbortReason" },
    } as const;

    const error = defectToError(abortError);

    assertEqual(
      error.message,
      'Defect: {"type":"AbortError","reason":{"type":"OtherAbortReason"}}',
    );
    assertSame(error.cause, abortError);
  });
});
