/**
 * DisposableStack and AsyncDisposableStack conformance tests.
 *
 * Test strategy:
 *
 * - Port upstream `es-shims/DisposableStack` and test262-style behavior checks.
 * - Add Evolu-specific regressions, including the WebKit async completion failure
 *   tracked in `es-shims/DisposableStack#9`.
 * - Validate parity against native Node.js implementations.
 * - Validate the owned polyfill implementation in browser projects, including
 *   WebKit.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { installPolyfills } from "../src/Polyfills.js";

const isNodeRuntime =
  (
    globalThis as {
      readonly process?: {
        readonly versions?: {
          readonly node?: string;
        };
      };
    }
  ).process?.versions?.node != null;

const isNativeDisposableStackImplementation = isNodeRuntime;

const assertNativeDisposableStackImplementation = (): void => {
  if (
    typeof globalThis.DisposableStack === "function" &&
    typeof globalThis.AsyncDisposableStack === "function" &&
    typeof globalThis.SuppressedError === "function" &&
    typeof Symbol.dispose === "symbol" &&
    typeof Symbol.asyncDispose === "symbol"
  ) {
    return;
  }

  throw new Error(
    "Node runtime requires native DisposableStack, AsyncDisposableStack, SuppressedError, Symbol.dispose, and Symbol.asyncDispose.",
  );
};

if (isNativeDisposableStackImplementation) {
  assertNativeDisposableStackImplementation();
}

type TrackedGlobalKey =
  | "Symbol"
  | "DisposableStack"
  | "AsyncDisposableStack"
  | "SuppressedError";

type GlobalDescriptorSnapshot = Readonly<
  Record<TrackedGlobalKey, PropertyDescriptor | undefined>
>;

const trackedGlobalKeys: ReadonlyArray<TrackedGlobalKey> = [
  "Symbol",
  "DisposableStack",
  "AsyncDisposableStack",
  "SuppressedError",
];

const readGlobalDescriptorSnapshot = (): GlobalDescriptorSnapshot => ({
  Symbol: Object.getOwnPropertyDescriptor(globalThis, "Symbol"),
  DisposableStack: Object.getOwnPropertyDescriptor(
    globalThis,
    "DisposableStack",
  ),
  AsyncDisposableStack: Object.getOwnPropertyDescriptor(
    globalThis,
    "AsyncDisposableStack",
  ),
  SuppressedError: Object.getOwnPropertyDescriptor(
    globalThis,
    "SuppressedError",
  ),
});

const deleteTrackedGlobal = (key: TrackedGlobalKey): void => {
  switch (key) {
    case "Symbol":
      delete (globalThis as { Symbol?: SymbolConstructor }).Symbol;
      return;
    case "DisposableStack":
      delete (globalThis as { DisposableStack?: typeof DisposableStack })
        .DisposableStack;
      return;
    case "AsyncDisposableStack":
      delete (
        globalThis as {
          AsyncDisposableStack?: typeof AsyncDisposableStack;
        }
      ).AsyncDisposableStack;
      return;
    case "SuppressedError":
      delete (globalThis as { SuppressedError?: typeof SuppressedError })
        .SuppressedError;
      return;
  }
};

const restoreGlobalDescriptorSnapshot = (
  snapshot: GlobalDescriptorSnapshot,
): void => {
  for (const key of trackedGlobalKeys) {
    const descriptor = snapshot[key];
    if (descriptor == null) {
      deleteTrackedGlobal(key);
      continue;
    }

    Object.defineProperty(globalThis, key, descriptor);
  }
};

const deleteGlobalIfConfigurable = (key: TrackedGlobalKey): void => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  if (descriptor == null) return;

  if (descriptor.configurable) {
    deleteTrackedGlobal(key);
    return;
  }

  if (!descriptor.writable) return;

  Object.defineProperty(globalThis, key, {
    ...descriptor,
    value: undefined,
  });
};

const installOwnedDisposableImplementation = (): void => {
  if (isNativeDisposableStackImplementation) return;

  deleteGlobalIfConfigurable("DisposableStack");
  deleteGlobalIfConfigurable("AsyncDisposableStack");
  deleteGlobalIfConfigurable("SuppressedError");
  installPolyfills();
};

const createSymbolWithoutDisposableStatics = (): SymbolConstructor => {
  const nativeSymbol = globalThis.Symbol;

  const wrappedSymbol = ((description?: string) =>
    nativeSymbol(description)) as unknown as SymbolConstructor;

  for (const key of Reflect.ownKeys(nativeSymbol)) {
    if (key === "dispose" || key === "asyncDispose") continue;
    if (Object.prototype.hasOwnProperty.call(wrappedSymbol, key)) continue;

    const descriptor = Object.getOwnPropertyDescriptor(nativeSymbol, key);
    if (descriptor == null) continue;

    Object.defineProperty(wrappedSymbol, key, descriptor);
  }

  return wrappedSymbol;
};

const nonNullPrimitives: ReadonlyArray<unknown> = [
  true,
  false,
  0,
  1,
  1n,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  "",
  "value",
  Symbol("local-test-symbol"),
];

const nonFunctions: ReadonlyArray<unknown> = [
  ...nonNullPrimitives,
  null,
  undefined,
  {},
  [],
];

const expectThrownNonErrorValue = (error: unknown, expected: unknown): void => {
  expect(error).toBe(expected);
};

describe("installPolyfills Symbol statics", () => {
  let globalSnapshot: GlobalDescriptorSnapshot;

  beforeEach(() => {
    globalSnapshot = readGlobalDescriptorSnapshot();
  });

  afterEach(() => {
    restoreGlobalDescriptorSnapshot(globalSnapshot);
  });

  test("installs missing Symbol.dispose and Symbol.asyncDispose with immutable descriptors", () => {
    const wrappedSymbol = createSymbolWithoutDisposableStatics();

    Object.defineProperty(globalThis, "Symbol", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: wrappedSymbol,
    });

    installPolyfills();

    expect(typeof Symbol.dispose).toBe("symbol");
    expect(typeof Symbol.asyncDispose).toBe("symbol");

    const disposeDescriptor = Object.getOwnPropertyDescriptor(
      Symbol,
      "dispose",
    );
    const asyncDisposeDescriptor = Object.getOwnPropertyDescriptor(
      Symbol,
      "asyncDispose",
    );

    expect(disposeDescriptor?.configurable).toBe(false);
    expect(disposeDescriptor?.enumerable).toBe(false);
    expect(disposeDescriptor?.writable).toBe(false);
    expect(asyncDisposeDescriptor?.configurable).toBe(false);
    expect(asyncDisposeDescriptor?.enumerable).toBe(false);
    expect(asyncDisposeDescriptor?.writable).toBe(false);
  });

  test("installs missing SuppressedError with explicit and default messages", () => {
    deleteGlobalIfConfigurable("SuppressedError");

    installPolyfills();

    const customMessageError = new globalThis.SuppressedError(
      new Error("error"),
      new Error("suppressed"),
      "custom message",
    );
    const defaultMessageError = new globalThis.SuppressedError(
      new Error("error"),
      new Error("suppressed"),
    );

    expect(customMessageError.message).toBe("custom message");
    expect(defaultMessageError.message).toBe(
      "An error was suppressed during disposal.",
    );
  });
});

const describeInstallPolyfills = isNativeDisposableStackImplementation
  ? describe.skip
  : describe;

describeInstallPolyfills("installPolyfills", () => {
  let globalSnapshot: GlobalDescriptorSnapshot;

  beforeEach(() => {
    globalSnapshot = readGlobalDescriptorSnapshot();
  });

  afterEach(() => {
    restoreGlobalDescriptorSnapshot(globalSnapshot);
  });

  test("installs DisposableStack, AsyncDisposableStack, and SuppressedError", () => {
    installOwnedDisposableImplementation();

    expect(typeof globalThis.DisposableStack).toBe("function");
    expect(typeof globalThis.AsyncDisposableStack).toBe("function");
    expect(typeof globalThis.SuppressedError).toBe("function");

    const disposableStack = new globalThis.DisposableStack();
    const asyncDisposableStack = new globalThis.AsyncDisposableStack();

    expect(typeof disposableStack[Symbol.dispose]).toBe("function");
    expect(typeof asyncDisposableStack[Symbol.asyncDispose]).toBe("function");

    disposableStack[Symbol.dispose]();
    void asyncDisposableStack[Symbol.asyncDispose]();
  });

  test("installs Symbol.dispose and Symbol.asyncDispose when missing", () => {
    const wrappedSymbol = createSymbolWithoutDisposableStatics();

    Object.defineProperty(globalThis, "Symbol", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: wrappedSymbol,
    });

    installOwnedDisposableImplementation();

    expect(typeof Symbol.dispose).toBe("symbol");
    expect(typeof Symbol.asyncDispose).toBe("symbol");

    const disposeDescriptor = Object.getOwnPropertyDescriptor(
      Symbol,
      "dispose",
    );
    const asyncDisposeDescriptor = Object.getOwnPropertyDescriptor(
      Symbol,
      "asyncDispose",
    );

    expect(disposeDescriptor?.configurable).toBe(false);
    expect(disposeDescriptor?.enumerable).toBe(false);
    expect(disposeDescriptor?.writable).toBe(false);
    expect(asyncDisposeDescriptor?.configurable).toBe(false);
    expect(asyncDisposeDescriptor?.enumerable).toBe(false);
    expect(asyncDisposeDescriptor?.writable).toBe(false);

    const disposableStack = new globalThis.DisposableStack();
    const asyncDisposableStack = new globalThis.AsyncDisposableStack();

    expect(typeof disposableStack[Symbol.dispose]).toBe("function");
    expect(typeof asyncDisposableStack[Symbol.asyncDispose]).toBe("function");

    expect(Symbol.keyFor(Symbol.dispose)).toBeUndefined();
    expect(Symbol.keyFor(Symbol.asyncDispose)).toBeUndefined();
  });

  test("does not override existing globals", () => {
    class ExistingDisposableStack implements DisposableStack {
      disposed = false;
      readonly [Symbol.toStringTag] = "DisposableStack";

      use<T extends object | null | undefined>(value: T): T {
        return value;
      }
      adopt<T>(value: T, _onDispose: (value: T) => void): T {
        return value;
      }
      defer(_onDispose: () => void): void {
        return;
      }
      move(): DisposableStack {
        return this;
      }
      dispose(): void {
        this.disposed = true;
      }
      [Symbol.dispose](): void {
        this.dispose();
      }
    }

    class ExistingAsyncDisposableStack implements AsyncDisposableStack {
      disposed = false;
      readonly [Symbol.toStringTag] = "AsyncDisposableStack";

      use<T extends object | null | undefined>(value: T): T {
        return value;
      }
      adopt<T>(
        value: T,
        _onDisposeAsync: (value: T) => void | Promise<void>,
      ): T {
        return value;
      }
      defer(_onDisposeAsync: () => void | Promise<void>): void {
        return;
      }
      move(): AsyncDisposableStack {
        return this;
      }
      disposeAsync(): Promise<void> {
        this.disposed = true;
        return Promise.resolve();
      }
      [Symbol.asyncDispose](): Promise<void> {
        return this.disposeAsync();
      }
    }

    class ExistingSuppressedError extends Error {
      readonly error: unknown;
      readonly suppressed: unknown;

      constructor(error: unknown, suppressed: unknown, message = "existing") {
        super(message);
        this.error = error;
        this.suppressed = suppressed;
      }
    }

    Object.defineProperty(globalThis, "DisposableStack", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: ExistingDisposableStack,
    });
    Object.defineProperty(globalThis, "AsyncDisposableStack", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: ExistingAsyncDisposableStack,
    });
    Object.defineProperty(globalThis, "SuppressedError", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: ExistingSuppressedError,
    });

    installPolyfills();

    expect(globalThis.DisposableStack).toBe(ExistingDisposableStack);
    expect(globalThis.AsyncDisposableStack).toBe(ExistingAsyncDisposableStack);
    expect(globalThis.SuppressedError).toBe(ExistingSuppressedError);
  });

  test("keeps explicit SuppressedError message", () => {
    installOwnedDisposableImplementation();

    const suppressedError = new globalThis.SuppressedError(
      new Error("error"),
      new Error("suppressed"),
      "custom message",
    );

    expect(suppressedError.message).toBe("custom message");
  });

  test("uses default SuppressedError message when omitted", () => {
    installOwnedDisposableImplementation();

    const suppressedError = new globalThis.SuppressedError(
      new Error("error"),
      new Error("suppressed"),
    );

    expect(suppressedError.message).toBe(
      "An error was suppressed during disposal.",
    );
  });
});

describe("DisposableStack behavior", () => {
  let globalSnapshot: GlobalDescriptorSnapshot;

  beforeEach(() => {
    globalSnapshot = readGlobalDescriptorSnapshot();
    installOwnedDisposableImplementation();
  });

  afterEach(() => {
    restoreGlobalDescriptorSnapshot(globalSnapshot);
  });

  test("constructor creates DisposableStack instances and requires new", () => {
    const DisposableStackCtor = globalThis.DisposableStack;

    expect(typeof DisposableStackCtor).toBe("function");

    const instance = new DisposableStackCtor();
    expect(typeof instance).toBe("object");
    expect(instance).toBeInstanceOf(DisposableStackCtor);

    expect(() =>
      (
        DisposableStackCtor as unknown as (...args: Array<unknown>) => unknown
      )(),
    ).toThrow(TypeError);

    expect(DisposableStackCtor.prototype.constructor).toBe(DisposableStackCtor);
  });

  test("disposed is a prototype accessor", () => {
    const stack = new globalThis.DisposableStack();

    expect(Object.hasOwn(stack, "disposed")).toBe(false);

    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis.DisposableStack.prototype,
      "disposed",
    );

    expect(descriptor).toBeDefined();
    expect(descriptor?.configurable).toBe(true);
    expect(descriptor?.enumerable).toBe(false);
    expect(typeof descriptor?.get).toBe("function");
    expect(stack.disposed).toBe(false);

    stack.dispose();

    expect(stack.disposed).toBe(true);
  });

  test("Symbol.dispose aliases dispose", () => {
    const symbolDispose = Object.getOwnPropertyDescriptor(
      globalThis.DisposableStack.prototype,
      Symbol.dispose,
    )?.value;
    const dispose = Object.getOwnPropertyDescriptor(
      globalThis.DisposableStack.prototype,
      "dispose",
    )?.value;

    expect(symbolDispose).toBe(dispose);
  });

  test("use supports nullish and disposes used resources in LIFO order", () => {
    const events: Array<string> = [];

    const stack = new globalThis.DisposableStack();
    expect(stack.use(null)).toBeNull();
    expect(() => {
      stack.use(undefined);
    }).not.toThrow();

    const resource1 = {
      [Symbol.dispose]: () => {
        events.push("resource 1");
      },
    };

    const resource2 = {
      [Symbol.dispose]: () => {
        events.push("resource 2");
      },
    };

    stack.use(resource1);
    stack.use(resource2);
    stack.dispose();

    expect(events).toEqual(["resource 2", "resource 1"]);
    expect(stack.disposed).toBe(true);
  });

  test("throws on invalid use/defer/adopt input and move on disposed stack", () => {
    const stack = new globalThis.DisposableStack();

    for (const value of nonNullPrimitives) {
      expect(() => stack.use(value as never)).toThrow(TypeError);
    }

    expect(() => stack.use({} as unknown as Disposable)).toThrow(TypeError);

    for (const value of nonFunctions) {
      expect(() => stack.defer(value as never)).toThrow(TypeError);
      expect(() => stack.adopt("x", value as never)).toThrow(TypeError);
    }

    stack.dispose();

    expect(() =>
      stack.use({
        [Symbol.dispose]: () => undefined,
      }),
    ).toThrow(
      /Cannot call DisposableStack\.prototype\.use on an already-disposed DisposableStack/,
    );
    expect(() => stack.defer(() => undefined)).toThrow(
      /Cannot call DisposableStack\.prototype\.defer on an already-disposed DisposableStack/,
    );
    expect(() => stack.adopt("x", () => undefined)).toThrow(
      /Cannot call DisposableStack\.prototype\.adopt on an already-disposed DisposableStack/,
    );
    expect(() => stack.move()).toThrow(
      /Cannot call DisposableStack\.prototype\.move on an already-disposed DisposableStack/,
    );
  });

  test("use reads Symbol.dispose only once", () => {
    const stack = new globalThis.DisposableStack();
    const resource = {
      disposeReadCount: 0,
    } as {
      disposeReadCount: number;
      [Symbol.dispose]?: () => void;
    };

    Object.defineProperty(resource, Symbol.dispose, {
      configurable: true,
      enumerable: false,
      get(this: { disposeReadCount: number }) {
        this.disposeReadCount += 1;
        return () => undefined;
      },
    });

    stack.use(resource as Disposable);
    stack.dispose();

    expect(resource.disposeReadCount).toBe(1);
  });

  test("throws when Symbol.dispose is present but not a function", () => {
    const stack = new globalThis.DisposableStack();

    expect(() =>
      stack.use({ [Symbol.dispose]: 1 } as unknown as Disposable),
    ).toThrow(TypeError);
  });

  test("adopt disposes values in LIFO order", () => {
    const events: Array<string> = [];

    const stack = new globalThis.DisposableStack();
    stack.adopt("a", (value) => {
      events.push(`adopt ${value}`);
    });
    stack.adopt("b", (value) => {
      events.push(`adopt ${value}`);
    });

    stack.dispose();

    expect(events).toEqual(["adopt b", "adopt a"]);
  });

  test("adopt returns values and passes resource as the only callback argument", () => {
    const calls: Array<{
      readonly count: number;
      readonly args: Array<unknown>;
    }> = [];

    const onDispose = (...args: Array<unknown>): void => {
      calls.push({ count: args.length, args });
    };

    const stack = new globalThis.DisposableStack();
    const sentinel = { sentinel: true };

    stack.adopt(undefined, onDispose);
    expect(stack.adopt(null, onDispose)).toBeNull();
    expect(stack.adopt(sentinel, onDispose)).toBe(sentinel);
    expect(calls).toEqual([]);

    stack.dispose();

    expect(calls).toEqual([
      { count: 1, args: [sentinel] },
      { count: 1, args: [null] },
      { count: 1, args: [undefined] },
    ]);
  });

  test("move transfers ownership and old stack becomes disposed", () => {
    const events: Array<string> = [];

    const stack = new globalThis.DisposableStack();
    stack.defer(() => {
      events.push("cleanup");
    });

    const moved = stack.move();

    expect(stack.disposed).toBe(true);
    expect(moved.disposed).toBe(false);

    moved.dispose();
    expect(events).toEqual(["cleanup"]);
  });

  test("use invokes disposer with resource this and no arguments", () => {
    const calls: Array<{
      readonly resource: object;
      readonly count: number;
      readonly args: Array<unknown>;
    }> = [];

    const createResource = (): Disposable => ({
      [Symbol.dispose](...args: Array<unknown>) {
        calls.push({ resource: this, count: args.length, args });
      },
    });

    const resource1 = createResource();
    const resource2 = createResource();

    const stack = new globalThis.DisposableStack();
    expect(stack.use(resource1)).toBe(resource1);
    expect(stack.use(resource2)).toBe(resource2);

    expect(calls).toEqual([]);

    stack.dispose();

    expect(calls).toEqual([
      { resource: resource2, count: 0, args: [] },
      { resource: resource1, count: 0, args: [] },
    ]);
  });

  test("defer invokes callback with undefined this and no arguments", () => {
    const calls: Array<{
      readonly thisValue: unknown;
      readonly count: number;
      readonly args: Array<unknown>;
    }> = [];

    const onDispose = function (this: unknown, ...args: Array<unknown>): void {
      calls.push({ thisValue: this, count: args.length, args });
    };

    const stack = new globalThis.DisposableStack();
    stack.defer(onDispose);
    stack.dispose();

    expect(calls).toEqual([{ thisValue: undefined, count: 0, args: [] }]);
  });

  test("dispose is reentry-safe and does not dispose twice", () => {
    let count = 0;

    const stack = new globalThis.DisposableStack();
    stack.use({
      [Symbol.dispose]: () => {
        count += 1;
        stack.dispose();
      },
    });

    stack.dispose();

    expect(count).toBe(1);
  });

  test("use accepts function resources", () => {
    const events: Array<string> = [];

    const resource = function resource(): void {
      return;
    } as (() => void) & Disposable;
    resource[Symbol.dispose] = () => {
      events.push("disposed function");
    };

    const stack = new globalThis.DisposableStack();
    stack.use(resource);
    stack.dispose();

    expect(events).toEqual(["disposed function"]);
  });

  test("suppresses multiple disposal errors and continues disposal", () => {
    const events: Array<string> = [];

    const errorA = new Error("error A");
    const errorB = new Error("error B");

    const stack = new globalThis.DisposableStack();
    stack.defer(() => {
      events.push("cleanup 1");
    });
    stack.defer(() => {
      events.push("cleanup 2");
      throw errorB;
    });
    stack.defer(() => {
      events.push("cleanup 3");
      throw errorA;
    });

    try {
      stack.dispose();
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(globalThis.SuppressedError);

      const suppressedError = error as {
        readonly error: unknown;
        readonly suppressed: unknown;
      };

      expect(suppressedError.error).toBe(errorB);
      expect(suppressedError.suppressed).toBe(errorA);
    }

    expect(events).toEqual(["cleanup 3", "cleanup 2", "cleanup 1"]);
  });

  test("builds nested SuppressedError chain for three disposal failures", () => {
    const throwSentinel = new Error("throw sentinel");
    const sentinel2 = new Error("sentinel 2");
    const sentinel3 = new Error("sentinel 3");

    const stack = new globalThis.DisposableStack();
    stack.use({
      [Symbol.dispose]: () => {
        throw throwSentinel;
      },
    });
    stack.adopt(null, () => {
      throw sentinel2;
    });
    stack.adopt(undefined, () => {
      throw sentinel3;
    });

    try {
      stack.dispose();
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(globalThis.SuppressedError);

      const root = error as {
        readonly error: unknown;
        readonly suppressed: unknown;
      };

      expect(root.error).toBe(throwSentinel);
      expect(root.suppressed).toBeInstanceOf(globalThis.SuppressedError);

      const nested = root.suppressed as {
        readonly error: unknown;
        readonly suppressed: unknown;
      };

      expect(nested.error).toBe(sentinel2);
      expect(nested.suppressed).toBe(sentinel3);
    }
  });

  test("preserves non-Error thrown values", () => {
    for (const nonErrorValue of [123, undefined] as const) {
      const nonError: unknown = nonErrorValue;
      const stack = new globalThis.DisposableStack();
      stack.defer(() => {
        throw nonError;
      });

      try {
        stack.dispose();
        expect.fail("Should have thrown");
      } catch (error) {
        expectThrownNonErrorValue(error, nonError);
      }
    }
  });

  test("is idempotent when disposed repeatedly", () => {
    const events: Array<string> = [];

    const stack = new globalThis.DisposableStack();
    stack.defer(() => {
      events.push("cleanup");
    });

    stack.dispose();
    stack.dispose();

    expect(events).toEqual(["cleanup"]);
  });

  test("toStringTag reports DisposableStack", () => {
    const stack = new globalThis.DisposableStack();
    expect(Object.prototype.toString.call(stack)).toBe(
      "[object DisposableStack]",
    );
  });

  test("toStringTag descriptor matches native shape", () => {
    const stack = new globalThis.DisposableStack();

    expect(Object.getOwnPropertyDescriptor(stack, Symbol.toStringTag)).toBe(
      undefined,
    );

    expect(
      Object.getOwnPropertyDescriptor(
        globalThis.DisposableStack.prototype,
        Symbol.toStringTag,
      ),
    ).toEqual({
      configurable: true,
      enumerable: false,
      writable: false,
      value: "DisposableStack",
    });
  });

  test("Reflect.construct propagates abrupt newTarget prototype getter", () => {
    const newTarget = function () {
      return;
    }.bind(null);

    let calls = 0;

    Object.defineProperty(newTarget, "prototype", {
      configurable: true,
      get: () => {
        calls += 1;
        throw new EvalError("prototype getter failed");
      },
    });

    expect(() =>
      Reflect.construct(globalThis.DisposableStack, [], newTarget),
    ).toThrow(EvalError);
    expect(calls).toBe(1);
  });
});

describe("AsyncDisposableStack behavior", () => {
  let globalSnapshot: GlobalDescriptorSnapshot;

  beforeEach(() => {
    globalSnapshot = readGlobalDescriptorSnapshot();
    installOwnedDisposableImplementation();
  });

  afterEach(() => {
    restoreGlobalDescriptorSnapshot(globalSnapshot);
  });

  test("constructor creates AsyncDisposableStack instances and requires new", () => {
    const AsyncDisposableStackCtor = globalThis.AsyncDisposableStack;

    expect(typeof AsyncDisposableStackCtor).toBe("function");

    const instance = new AsyncDisposableStackCtor();
    expect(typeof instance).toBe("object");
    expect(instance).toBeInstanceOf(AsyncDisposableStackCtor);

    expect(() =>
      (
        AsyncDisposableStackCtor as unknown as (
          ...args: Array<unknown>
        ) => unknown
      )(),
    ).toThrow(TypeError);

    expect(AsyncDisposableStackCtor.prototype.constructor).toBe(
      AsyncDisposableStackCtor,
    );
  });

  test("disposed is a prototype accessor", async () => {
    const stack = new globalThis.AsyncDisposableStack();

    expect(Object.hasOwn(stack, "disposed")).toBe(false);

    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis.AsyncDisposableStack.prototype,
      "disposed",
    );

    expect(descriptor).toBeDefined();
    expect(descriptor?.configurable).toBe(true);
    expect(descriptor?.enumerable).toBe(false);
    expect(typeof descriptor?.get).toBe("function");
    expect(stack.disposed).toBe(false);

    await stack.disposeAsync();

    expect(stack.disposed).toBe(true);
  });

  test("Symbol.asyncDispose aliases disposeAsync", () => {
    const symbolAsyncDispose = Object.getOwnPropertyDescriptor(
      globalThis.AsyncDisposableStack.prototype,
      Symbol.asyncDispose,
    )?.value;
    const disposeAsync = Object.getOwnPropertyDescriptor(
      globalThis.AsyncDisposableStack.prototype,
      "disposeAsync",
    )?.value;

    expect(symbolAsyncDispose).toBe(disposeAsync);
  });

  test("accepts async and sync resources in use", async () => {
    const events: Array<string> = [];

    const stack = new globalThis.AsyncDisposableStack();

    stack.use({
      [Symbol.dispose]: () => {
        events.push("sync");
      },
    });

    stack.use({
      [Symbol.asyncDispose]: () =>
        Promise.resolve().then(() => {
          events.push("async");
        }),
    });

    await stack.disposeAsync();
    expect(events).toEqual(["async", "sync"]);
  });

  test("use supports nullish values", async () => {
    const stack = new globalThis.AsyncDisposableStack();

    expect(stack.use(null)).toBeNull();
    expect(() => {
      stack.use(undefined);
    }).not.toThrow();

    await stack.disposeAsync();
  });

  test("throws on invalid use/defer/adopt input and move on disposed stack", async () => {
    const stack = new globalThis.AsyncDisposableStack();

    for (const value of nonNullPrimitives) {
      expect(() => stack.use(value as never)).toThrow(TypeError);
    }

    expect(() => stack.use({} as unknown as AsyncDisposable)).toThrow(
      TypeError,
    );

    for (const value of nonFunctions) {
      expect(() => stack.defer(value as never)).toThrow(TypeError);
      expect(() => stack.adopt("x", value as never)).toThrow(TypeError);
    }

    await stack.disposeAsync();

    expect(() =>
      stack.use({
        [Symbol.dispose]: () => undefined,
      }),
    ).toThrow(
      /Cannot call AsyncDisposableStack\.prototype\.use on an already-disposed DisposableStack/,
    );
    expect(() => stack.defer(() => undefined)).toThrow(
      /Cannot call AsyncDisposableStack\.prototype\.defer on an already-disposed DisposableStack/,
    );
    expect(() => stack.adopt("x", () => undefined)).toThrow(
      /Cannot call AsyncDisposableStack\.prototype\.adopt on an already-disposed DisposableStack/,
    );
    expect(() => stack.move()).toThrow(
      /Cannot call AsyncDisposableStack\.prototype\.move on an already-disposed DisposableStack/,
    );
  });

  test("throws when Symbol.asyncDispose is present but not a function", () => {
    const stack = new globalThis.AsyncDisposableStack();

    expect(() =>
      stack.use({ [Symbol.asyncDispose]: 1 } as unknown as AsyncDisposable),
    ).toThrow(TypeError);
  });

  test("adopt disposes values in LIFO order", async () => {
    const events: Array<string> = [];

    const stack = new globalThis.AsyncDisposableStack();
    stack.adopt("a", (value) => {
      events.push(`adopt ${value}`);
    });
    stack.adopt("b", (value) => {
      events.push(`adopt ${value}`);
    });

    await stack.disposeAsync();

    expect(events).toEqual(["adopt b", "adopt a"]);
  });

  test("adopt returns values and passes resource as the only callback argument", async () => {
    const calls: Array<{
      readonly count: number;
      readonly args: Array<unknown>;
    }> = [];

    const onDisposeAsync = (...args: Array<unknown>): void => {
      calls.push({ count: args.length, args });
    };

    const stack = new globalThis.AsyncDisposableStack();
    const sentinel = { sentinel: true };

    stack.adopt(undefined, onDisposeAsync);
    expect(stack.adopt(null, onDisposeAsync)).toBeNull();
    expect(stack.adopt(sentinel, onDisposeAsync)).toBe(sentinel);
    expect(calls).toEqual([]);

    await expect(stack.disposeAsync()).resolves.toBeUndefined();

    expect(calls).toEqual([
      { count: 1, args: [sentinel] },
      { count: 1, args: [null] },
      { count: 1, args: [undefined] },
    ]);
  });

  test("move transfers ownership and old stack becomes disposed", async () => {
    const events: Array<string> = [];

    const stack = new globalThis.AsyncDisposableStack();
    stack.defer(() =>
      Promise.resolve().then(() => {
        events.push("cleanup");
      }),
    );

    const moved = stack.move();

    expect(stack.disposed).toBe(true);
    expect(moved.disposed).toBe(false);

    await moved.disposeAsync();
    expect(events).toEqual(["cleanup"]);
  });

  test("use accepts function resources", async () => {
    const events: Array<string> = [];

    const resource = function resource(): void {
      return;
    } as (() => void) & AsyncDisposable;
    resource[Symbol.asyncDispose] = () =>
      Promise.resolve().then(() => {
        events.push("disposed function");
      });

    const stack = new globalThis.AsyncDisposableStack();
    stack.use(resource);
    await stack.disposeAsync();

    expect(events).toEqual(["disposed function"]);
  });

  test("defer invokes callback with undefined this and no arguments", async () => {
    const calls: Array<{
      readonly thisValue: unknown;
      readonly count: number;
      readonly args: Array<unknown>;
    }> = [];

    const onDisposeAsync = function (
      this: unknown,
      ...args: Array<unknown>
    ): void {
      calls.push({ thisValue: this, count: args.length, args });
    };

    const stack = new globalThis.AsyncDisposableStack();
    stack.defer(onDisposeAsync);
    await stack.disposeAsync();

    expect(calls).toEqual([{ thisValue: undefined, count: 0, args: [] }]);
  });

  // https://github.com/es-shims/DisposableStack/issues/9
  test("issue #9 regression: deferred throw does not break completion object", async () => {
    const events: Array<string> = [];

    const error = new Error("defer failed");

    const stack = new globalThis.AsyncDisposableStack();
    stack.defer(() =>
      Promise.resolve().then(() => {
        events.push("first");
      }),
    );
    stack.defer(() => {
      events.push("second");
      throw error;
    });
    stack.defer(() => {
      events.push("third");
    });

    await expect(stack.disposeAsync()).rejects.toBe(error);
    expect(events).toEqual(["third", "second", "first"]);
  });

  test("builds nested SuppressedError chain for three disposal failures", async () => {
    const throwSentinel = new Error("throw sentinel");
    const sentinel2 = new Error("sentinel 2");
    const sentinel3 = new Error("sentinel 3");

    const stack = new globalThis.AsyncDisposableStack();
    stack.use({
      [Symbol.asyncDispose]: () => {
        throw throwSentinel;
      },
    });
    stack.adopt(null, () => {
      throw sentinel2;
    });
    stack.adopt(undefined, () => {
      throw sentinel3;
    });

    try {
      await stack.disposeAsync();
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(globalThis.SuppressedError);

      const root = error as {
        readonly error: unknown;
        readonly suppressed: unknown;
      };

      expect(root.error).toBe(throwSentinel);
      expect(root.suppressed).toBeInstanceOf(globalThis.SuppressedError);

      const nested = root.suppressed as {
        readonly error: unknown;
        readonly suppressed: unknown;
      };

      expect(nested.error).toBe(sentinel2);
      expect(nested.suppressed).toBe(sentinel3);
    }
  });

  test("continues disposal after failure and preserves thrown error", async () => {
    const events: Array<string> = [];

    const error = new Error("middle failure");

    const stack = new globalThis.AsyncDisposableStack();
    stack.defer(() => {
      events.push("mutex cleanup");
    });
    stack.defer(() => {
      events.push("instance failing cleanup");
      throw error;
    });
    stack.defer(() => {
      events.push("instance ok cleanup");
    });

    await expect(stack.disposeAsync()).rejects.toBe(error);
    expect(events).toEqual([
      "instance ok cleanup",
      "instance failing cleanup",
      "mutex cleanup",
    ]);
  });

  test("suppresses multiple disposal errors and continues disposal", async () => {
    const events: Array<string> = [];

    const errorA = new Error("error A");
    const errorB = new Error("error B");

    const stack = new globalThis.AsyncDisposableStack();
    stack.defer(() =>
      Promise.resolve().then(() => {
        events.push("cleanup 1");
      }),
    );
    stack.defer(() => {
      events.push("cleanup 2");
      throw errorB;
    });
    stack.defer(() =>
      Promise.resolve().then(() => {
        events.push("cleanup 3");
        throw errorA;
      }),
    );

    try {
      await stack.disposeAsync();
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(globalThis.SuppressedError);

      const suppressedError = error as {
        readonly error: unknown;
        readonly suppressed: unknown;
      };

      expect(suppressedError.error).toBe(errorB);
      expect(suppressedError.suppressed).toBe(errorA);
    }

    expect(events).toEqual(["cleanup 3", "cleanup 2", "cleanup 1"]);
  });

  test("is idempotent when disposed repeatedly", async () => {
    const events: Array<string> = [];

    const stack = new globalThis.AsyncDisposableStack();
    stack.defer(() =>
      Promise.resolve().then(() => {
        events.push("cleanup");
      }),
    );

    await stack.disposeAsync();
    await stack.disposeAsync();

    expect(events).toEqual(["cleanup"]);
  });

  test("disposeAsync is reentry-safe and does not dispose twice", async () => {
    let count = 0;

    const stack = new globalThis.AsyncDisposableStack();
    stack.use({
      async [Symbol.asyncDispose]() {
        count += 1;
        await stack.disposeAsync();
      },
    });

    await stack.disposeAsync();

    expect(count).toBe(1);
  });

  test("use prefers asyncDispose over dispose when both present", async () => {
    const events: Array<string> = [];

    const stack = new globalThis.AsyncDisposableStack();

    const resource = {
      [Symbol.asyncDispose]: () =>
        Promise.resolve().then(() => {
          events.push("async");
        }),
      [Symbol.dispose]: () => {
        events.push("sync");
      },
    };

    stack.use(resource);
    await stack.disposeAsync();

    expect(events).toEqual(["async"]);
  });

  test("use does not read Symbol.dispose when asyncDispose is present", () => {
    const stack = new globalThis.AsyncDisposableStack();
    let disposeReadCount = 0;

    const resource = {} as Record<symbol, unknown>;

    Object.defineProperty(resource, Symbol.asyncDispose, {
      configurable: true,
      enumerable: false,
      value: () => Promise.resolve(),
    });

    Object.defineProperty(resource, Symbol.dispose, {
      configurable: true,
      enumerable: false,
      get() {
        disposeReadCount += 1;
        return () => undefined;
      },
    });

    stack.use(resource as unknown as AsyncDisposable);

    expect(disposeReadCount).toBe(0);
  });

  test("use reads Symbol.dispose only once on sync fallback", async () => {
    const stack = new globalThis.AsyncDisposableStack();
    const resource = {
      disposeReadCount: 0,
    } as {
      disposeReadCount: number;
      [Symbol.dispose]?: () => void;
    };

    Object.defineProperty(resource, Symbol.dispose, {
      configurable: true,
      enumerable: false,
      get(this: { disposeReadCount: number }) {
        this.disposeReadCount += 1;
        return () => undefined;
      },
    });

    stack.use(resource as Disposable);
    await stack.disposeAsync();

    expect(resource.disposeReadCount).toBe(1);
  });

  test("use reads Symbol.asyncDispose only once", async () => {
    const stack = new globalThis.AsyncDisposableStack();
    const resource = {
      disposeReadCount: 0,
    } as {
      disposeReadCount: number;
      [Symbol.asyncDispose]?: () => Promise<void>;
    };

    Object.defineProperty(resource, Symbol.asyncDispose, {
      configurable: true,
      enumerable: false,
      get(this: { disposeReadCount: number }) {
        this.disposeReadCount += 1;
        return () => Promise.resolve();
      },
    });

    stack.use(resource as AsyncDisposable);
    await stack.disposeAsync();

    expect(resource.disposeReadCount).toBe(1);
  });

  test("preserves non-Error thrown values", async () => {
    for (const nonErrorValue of [123, undefined] as const) {
      const nonError: unknown = nonErrorValue;
      const stack = new globalThis.AsyncDisposableStack();
      stack.defer(() => {
        throw nonError;
      });

      try {
        await stack.disposeAsync();
        expect.fail("Should have thrown");
      } catch (error) {
        expectThrownNonErrorValue(error, nonError);
      }
    }
  });

  test("toStringTag reports AsyncDisposableStack", () => {
    const stack = new globalThis.AsyncDisposableStack();
    expect(Object.prototype.toString.call(stack)).toBe(
      "[object AsyncDisposableStack]",
    );
  });

  test("toStringTag descriptor matches native shape", () => {
    const stack = new globalThis.AsyncDisposableStack();

    expect(Object.getOwnPropertyDescriptor(stack, Symbol.toStringTag)).toBe(
      undefined,
    );

    expect(
      Object.getOwnPropertyDescriptor(
        globalThis.AsyncDisposableStack.prototype,
        Symbol.toStringTag,
      ),
    ).toEqual({
      configurable: true,
      enumerable: false,
      writable: false,
      value: "AsyncDisposableStack",
    });
  });

  test("Reflect.construct propagates abrupt newTarget prototype getter", () => {
    const newTarget = function () {
      return;
    }.bind(null);

    let calls = 0;

    Object.defineProperty(newTarget, "prototype", {
      configurable: true,
      get: () => {
        calls += 1;
        throw new EvalError("prototype getter failed");
      },
    });

    expect(() =>
      Reflect.construct(globalThis.AsyncDisposableStack, [], newTarget),
    ).toThrow(EvalError);
    expect(calls).toBe(1);
  });
});

describe("installPolyfills Map and WeakMap upsert methods", () => {
  test("installs Map and WeakMap upsert methods", () => {
    expect(typeof Map.prototype.getOrInsert).toBe("function");
    expect(typeof Map.prototype.getOrInsertComputed).toBe("function");
    expect(typeof WeakMap.prototype.getOrInsert).toBe("function");
    expect(typeof WeakMap.prototype.getOrInsertComputed).toBe("function");
  });

  test("Map upsert methods keep existing undefined values and lazily compute missing ones", () => {
    const map = new Map<string, number | undefined>([["present", undefined]]);
    const computeCalls: Array<string> = [];

    expect(map.getOrInsert("present", 1)).toBeUndefined();
    expect(map.getOrInsert("missing", 2)).toBe(2);
    expect(map.get("missing")).toBe(2);

    expect(
      map.getOrInsertComputed("present", (key) => {
        computeCalls.push(key);
        return 3;
      }),
    ).toBeUndefined();

    expect(
      map.getOrInsertComputed("computed", (key) => {
        computeCalls.push(key);
        return key.length;
      }),
    ).toBe(8);
    expect(map.get("computed")).toBe(8);
    expect(computeCalls).toEqual(["computed"]);
  });

  test("WeakMap upsert methods keep existing undefined values and lazily compute missing ones", () => {
    const presentKey = {};
    const missingKey = {};
    const computedKey = {};
    const weakMap = new WeakMap<object, number | undefined>([
      [presentKey, undefined],
    ]);
    const computeCalls: Array<object> = [];

    expect(weakMap.getOrInsert(presentKey, 1)).toBeUndefined();
    expect(weakMap.getOrInsert(missingKey, 2)).toBe(2);
    expect(weakMap.get(missingKey)).toBe(2);

    expect(
      weakMap.getOrInsertComputed(presentKey, (key) => {
        computeCalls.push(key);
        return 3;
      }),
    ).toBeUndefined();

    expect(
      weakMap.getOrInsertComputed(computedKey, (key) => {
        computeCalls.push(key);
        return Number(key === computedKey);
      }),
    ).toBe(1);
    expect(weakMap.get(computedKey)).toBe(1);
    expect(computeCalls).toEqual([computedKey]);
  });
});
