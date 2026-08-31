import { describe, it } from "node:test";
import { assertEqual, assertFalse } from "./Assert.ts";

import type { Brand } from "./Brand.ts";
import { testCreateId, testStubGlobal } from "./Test.ts";
import { assertType, type Id } from "./Type.ts";

describe("testStubGlobal", () => {
  it("deletes a previously absent property on disposal", () => {
    const key = Symbol("absent global");
    const stub = testStubGlobal(key, 42);

    assertEqual(Reflect.get(globalThis, key), 42);

    stub[Symbol.dispose]();
    stub[Symbol.dispose]();

    assertFalse(Reflect.has(globalThis, key));
  });

  it("restores the original property descriptor", () => {
    const key = Symbol("existing global");
    const original = {
      configurable: true,
      enumerable: true,
      get: () => 1,
    } satisfies PropertyDescriptor;
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      Reflect.deleteProperty(globalThis, key);
    });
    Object.defineProperty(globalThis, key, original);

    {
      using _stub = testStubGlobal(key, 2);

      assertEqual(Reflect.get(globalThis, key), 2);
    }

    const restored = Object.getOwnPropertyDescriptor(globalThis, key);
    assertEqual(restored, {
      configurable: true,
      enumerable: true,
      get: original.get,
      set: undefined,
    });
  });

  it("restores nested stubs in disposal order", () => {
    const key = Symbol("nested global");

    {
      using _outer = testStubGlobal(key, "outer");
      assertEqual(Reflect.get(globalThis, key), "outer");

      {
        using _inner = testStubGlobal(key, "inner");
        assertEqual(Reflect.get(globalThis, key), "inner");
      }

      assertEqual(Reflect.get(globalThis, key), "outer");
    }

    assertFalse(Reflect.has(globalThis, key));
  });
});

describe("testCreateId", () => {
  it("creates file-local stable pseudo-random ids", () => {
    const createTestId = testCreateId();
    const first = createTestId();
    const second = createTestId();

    assertEqual(
      [first, second],
      ["ncqMQ1uwd5-zf5YKUbT3VA", "ofZXw_hAfJ8fIcpFxi6nag"],
    );
    assertFalse(Object.is(second, first));
    assertType<typeof first, Id>();
  });

  it("preserves branded id typing", () => {
    const createTestId = testCreateId();
    const _todoId = createTestId<"Todo">();

    assertType<typeof _todoId, Id & Brand<"Todo">>();
  });
});
