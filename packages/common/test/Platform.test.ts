import { describe, expect, test, vi } from "vitest";
import { isHermes, isServer } from "../src/Platform.ts";
import {
  testGlobalUncaughtErrors,
  testGlobalUnhandledRejections,
} from "./_vitest.ts";

test("isServer matches environment", () => {
  expect(isServer).toBe(typeof document === "undefined");
});

test("isHermes is false in test environment", () => {
  expect(isHermes).toBe(false);
});

describe("testGlobalUncaughtErrors", () => {
  test("records platform uncaught errors", async () => {
    using uncaughtErrors = testGlobalUncaughtErrors();
    const error = new Error("boom");

    queueMicrotask(() => {
      throw error;
    });

    await expect(uncaughtErrors.next()).resolves.toBe(error);
    expect(uncaughtErrors.errors).toEqual([error]);
  });

  test("settle waits for pending uncaught error delivery", async () => {
    using uncaughtErrors = testGlobalUncaughtErrors();
    const error = new Error("boom");

    queueMicrotask(() => {
      throw error;
    });

    expect(await uncaughtErrors.settle()).toEqual([error]);
  });

  test("next returns an already recorded uncaught error", async () => {
    using uncaughtErrors = testGlobalUncaughtErrors();
    const error = new Error("boom");

    queueMicrotask(() => {
      throw error;
    });

    await uncaughtErrors.settle();
    await expect(uncaughtErrors.next()).resolves.toBe(error);
  });
});

describe("testGlobalUnhandledRejections", () => {
  test("records platform unhandled rejection reasons", async () => {
    using unhandledRejections = testGlobalUnhandledRejections();
    const error = new Error("boom");

    void Promise.reject(error);

    await expect(unhandledRejections.next()).resolves.toBe(error);
    expect(unhandledRejections.errors).toEqual([error]);
  });

  test("settle waits for pending platform delivery and returns errors", async () => {
    using unhandledRejections = testGlobalUnhandledRejections();
    const error = new Error("boom");

    void Promise.reject(error);

    expect(await unhandledRejections.settle()).toEqual([error]);
  });
});

test("global error recording rejects an unsupported platform", () => {
  vi.stubGlobal("process", undefined);
  vi.stubGlobal("addEventListener", undefined);

  try {
    expect(() => testGlobalUncaughtErrors()).toThrow(
      "Unsupported platform global uncaught-error reporting.",
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
