import { afterEach, beforeEach, describe, it } from "vitest";
import {
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertNotUndefined,
  assertRejectsInstanceOf,
  assertRejectsSame,
  assertSame,
  assertThrowsInstanceOf,
  assertThrowsSame,
  assertTrue,
} from "../../../../packages/common/src/Assert.ts";
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

import { installPolyfills } from "../../../../packages/common/src/Polyfills.ts";

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
  "Symbol" | "DisposableStack" | "AsyncDisposableStack" | "SuppressedError";

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

describe("installPolyfills Symbol statics", () => {
  let globalSnapshot: GlobalDescriptorSnapshot;

  beforeEach(() => {
    globalSnapshot = readGlobalDescriptorSnapshot();
  });

  afterEach(() => {
    restoreGlobalDescriptorSnapshot(globalSnapshot);
  });

  it("installs missing Symbol.dispose and Symbol.asyncDispose with immutable descriptors", () => {
    const wrappedSymbol = createSymbolWithoutDisposableStatics();

    Object.defineProperty(globalThis, "Symbol", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: wrappedSymbol,
    });

    installPolyfills();

    assertEqual(typeof Symbol.dispose, "symbol");
    assertEqual(typeof Symbol.asyncDispose, "symbol");

    const disposeDescriptor = Object.getOwnPropertyDescriptor(
      Symbol,
      "dispose",
    );
    const asyncDisposeDescriptor = Object.getOwnPropertyDescriptor(
      Symbol,
      "asyncDispose",
    );

    assertFalse(disposeDescriptor?.configurable);
    assertFalse(disposeDescriptor?.enumerable);
    assertFalse(disposeDescriptor?.writable);
    assertFalse(asyncDisposeDescriptor?.configurable);
    assertFalse(asyncDisposeDescriptor?.enumerable);
    assertFalse(asyncDisposeDescriptor?.writable);
  });

  it("installs missing SuppressedError with explicit and default messages", () => {
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

    assertEqual(customMessageError.message, "custom message");
    assertEqual(
      defaultMessageError.message,
      "An error was suppressed during disposal.",
    );
  });
});

const itInstallPolyfills = isNativeDisposableStackImplementation ? it.skip : it;

describe("installPolyfills", () => {
  let globalSnapshot: GlobalDescriptorSnapshot;

  beforeEach(() => {
    globalSnapshot = readGlobalDescriptorSnapshot();
  });

  afterEach(() => {
    restoreGlobalDescriptorSnapshot(globalSnapshot);
  });

  itInstallPolyfills(
    "installs DisposableStack, AsyncDisposableStack, and SuppressedError",
    () => {
      installOwnedDisposableImplementation();

      assertEqual(typeof globalThis.DisposableStack, "function");
      assertEqual(typeof globalThis.AsyncDisposableStack, "function");
      assertEqual(typeof globalThis.SuppressedError, "function");

      const disposableStack = new globalThis.DisposableStack();
      const asyncDisposableStack = new globalThis.AsyncDisposableStack();

      assertEqual(typeof disposableStack[Symbol.dispose], "function");
      assertEqual(typeof asyncDisposableStack[Symbol.asyncDispose], "function");

      disposableStack[Symbol.dispose]();
      void asyncDisposableStack[Symbol.asyncDispose]();
    },
  );

  itInstallPolyfills(
    "installs Symbol.dispose and Symbol.asyncDispose when missing",
    () => {
      const wrappedSymbol = createSymbolWithoutDisposableStatics();

      Object.defineProperty(globalThis, "Symbol", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: wrappedSymbol,
      });

      installOwnedDisposableImplementation();

      assertEqual(typeof Symbol.dispose, "symbol");
      assertEqual(typeof Symbol.asyncDispose, "symbol");

      const disposeDescriptor = Object.getOwnPropertyDescriptor(
        Symbol,
        "dispose",
      );
      const asyncDisposeDescriptor = Object.getOwnPropertyDescriptor(
        Symbol,
        "asyncDispose",
      );

      assertFalse(disposeDescriptor?.configurable);
      assertFalse(disposeDescriptor?.enumerable);
      assertFalse(disposeDescriptor?.writable);
      assertFalse(asyncDisposeDescriptor?.configurable);
      assertFalse(asyncDisposeDescriptor?.enumerable);
      assertFalse(asyncDisposeDescriptor?.writable);

      const disposableStack = new globalThis.DisposableStack();
      const asyncDisposableStack = new globalThis.AsyncDisposableStack();

      assertEqual(typeof disposableStack[Symbol.dispose], "function");
      assertEqual(typeof asyncDisposableStack[Symbol.asyncDispose], "function");

      assertSame(Symbol.keyFor(Symbol.dispose), undefined);
      assertSame(Symbol.keyFor(Symbol.asyncDispose), undefined);
    },
  );

  itInstallPolyfills("does not override existing globals", () => {
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
        // oxlint-disable-next-line eslint/no-useless-return -- Keeps this intentional no-op body explicit while ESLint remains enabled.
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
        // oxlint-disable-next-line eslint/no-useless-return -- Keeps this intentional no-op body explicit while ESLint remains enabled.
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

    assertSame(globalThis.DisposableStack, ExistingDisposableStack);
    assertSame(globalThis.AsyncDisposableStack, ExistingAsyncDisposableStack);
    assertSame(globalThis.SuppressedError, ExistingSuppressedError);
  });

  itInstallPolyfills("keeps explicit SuppressedError message", () => {
    installOwnedDisposableImplementation();

    const suppressedError = new globalThis.SuppressedError(
      new Error("error"),
      new Error("suppressed"),
      "custom message",
    );

    assertEqual(suppressedError.message, "custom message");
  });

  itInstallPolyfills(
    "uses default SuppressedError message when omitted",
    () => {
      installOwnedDisposableImplementation();

      const suppressedError = new globalThis.SuppressedError(
        new Error("error"),
        new Error("suppressed"),
      );

      assertEqual(
        suppressedError.message,
        "An error was suppressed during disposal.",
      );
    },
  );
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

  it("constructor creates DisposableStack instances and requires new", () => {
    const DisposableStackCtor = globalThis.DisposableStack;

    assertEqual(typeof DisposableStackCtor, "function");

    const instance = new DisposableStackCtor();
    assertEqual(typeof instance, "object");
    assertInstanceOf(instance, DisposableStackCtor);

    assertThrowsInstanceOf(
      () =>
        (
          DisposableStackCtor as unknown as (...args: Array<unknown>) => unknown
        )(),
      TypeError,
    );

    assertSame(DisposableStackCtor.prototype.constructor, DisposableStackCtor);
  });

  it("disposed is a prototype accessor", () => {
    const stack = new globalThis.DisposableStack();

    assertFalse(Object.hasOwn(stack, "disposed"));

    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis.DisposableStack.prototype,
      "disposed",
    );

    assertNotUndefined(descriptor);
    assertTrue(descriptor?.configurable);
    assertFalse(descriptor?.enumerable);
    assertEqual(typeof descriptor?.get, "function");
    assertFalse(stack.disposed);

    stack.dispose();

    assertTrue(stack.disposed);
  });

  it("Symbol.dispose aliases dispose", () => {
    const symbolDispose = Object.getOwnPropertyDescriptor(
      globalThis.DisposableStack.prototype,
      Symbol.dispose,
    )?.value;
    const dispose = Object.getOwnPropertyDescriptor(
      globalThis.DisposableStack.prototype,
      "dispose",
    )?.value;

    assertSame(symbolDispose, dispose);
  });

  it("use supports nullish and disposes used resources in LIFO order", () => {
    const events: Array<string> = [];

    const stack = new globalThis.DisposableStack();
    assertSame(stack.use(null), null);
    stack.use(undefined);

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

    assertEqual(events, ["resource 2", "resource 1"]);
    assertTrue(stack.disposed);
  });

  it("throws on invalid use/defer/adopt input and move on disposed stack", () => {
    const stack = new globalThis.DisposableStack();

    for (const value of nonNullPrimitives) {
      assertThrowsInstanceOf(() => stack.use(value as never), TypeError);
    }

    assertThrowsInstanceOf(
      () => stack.use({} as unknown as Disposable),
      TypeError,
    );

    for (const value of nonFunctions) {
      assertThrowsInstanceOf(() => stack.defer(value as never), TypeError);
      assertThrowsInstanceOf(() => stack.adopt("x", value as never), TypeError);
    }

    stack.dispose();

    const useError = assertThrowsInstanceOf(
      () =>
        stack.use({
          [Symbol.dispose]: () => undefined,
        }),
      Error,
    );
    assertTrue(
      /Cannot call DisposableStack\.prototype\.use on an already-disposed DisposableStack/u.test(
        useError.message,
      ),
    );
    const deferError = assertThrowsInstanceOf(
      () => stack.defer(() => undefined),
      Error,
    );
    assertTrue(
      /Cannot call DisposableStack\.prototype\.defer on an already-disposed DisposableStack/u.test(
        deferError.message,
      ),
    );
    const adoptError = assertThrowsInstanceOf(
      () => stack.adopt("x", () => undefined),
      Error,
    );
    assertTrue(
      /Cannot call DisposableStack\.prototype\.adopt on an already-disposed DisposableStack/u.test(
        adoptError.message,
      ),
    );
    const moveError = assertThrowsInstanceOf(() => stack.move(), Error);
    assertTrue(
      /Cannot call DisposableStack\.prototype\.move on an already-disposed DisposableStack/u.test(
        moveError.message,
      ),
    );
  });

  it("use reads Symbol.dispose only once", () => {
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

    assertEqual(resource.disposeReadCount, 1);
  });

  it("throws when Symbol.dispose is present but not a function", () => {
    const stack = new globalThis.DisposableStack();

    assertThrowsInstanceOf(
      () => stack.use({ [Symbol.dispose]: 1 } as unknown as Disposable),
      TypeError,
    );
  });

  it("adopt disposes values in LIFO order", () => {
    const events: Array<string> = [];

    const stack = new globalThis.DisposableStack();
    stack.adopt("a", (value) => {
      events.push(`adopt ${value}`);
    });
    stack.adopt("b", (value) => {
      events.push(`adopt ${value}`);
    });

    stack.dispose();

    assertEqual(events, ["adopt b", "adopt a"]);
  });

  it("adopt returns values and passes resource as the only callback argument", () => {
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
    assertSame(stack.adopt(null, onDispose), null);
    assertSame(stack.adopt(sentinel, onDispose), sentinel);
    assertEqual(calls, []);

    stack.dispose();

    assertEqual(calls, [
      { count: 1, args: [sentinel] },
      { count: 1, args: [null] },
      { count: 1, args: [undefined] },
    ]);
  });

  it("move transfers ownership and old stack becomes disposed", () => {
    const events: Array<string> = [];

    const disposer = new globalThis.DisposableStack();
    disposer.defer(() => {
      events.push("cleanup");
    });

    const disposables = disposer.move();

    assertTrue(disposer.disposed);
    assertFalse(disposables.disposed);

    disposables.dispose();
    assertEqual(events, ["cleanup"]);
  });

  it("use invokes disposer with resource this and no arguments", () => {
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
    assertSame(stack.use(resource1), resource1);
    assertSame(stack.use(resource2), resource2);

    assertEqual(calls, []);

    stack.dispose();

    assertEqual(calls, [
      { resource: resource2, count: 0, args: [] },
      { resource: resource1, count: 0, args: [] },
    ]);
  });

  it("defer invokes callback with undefined this and no arguments", () => {
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

    assertEqual(calls, [{ thisValue: undefined, count: 0, args: [] }]);
  });

  it("dispose is reentry-safe and does not dispose twice", () => {
    let count = 0;

    const stack = new globalThis.DisposableStack();
    stack.use({
      [Symbol.dispose]: () => {
        count += 1;
        stack.dispose();
      },
    });

    stack.dispose();

    assertEqual(count, 1);
  });

  it("use accepts function resources", () => {
    const events: Array<string> = [];

    const resource = function resource(): void {
      // oxlint-disable-next-line eslint/no-useless-return -- Keeps this intentional no-op body explicit while ESLint remains enabled.
      return;
    } as (() => void) & Disposable;
    resource[Symbol.dispose] = () => {
      events.push("disposed function");
    };

    const stack = new globalThis.DisposableStack();
    stack.use(resource);
    stack.dispose();

    assertEqual(events, ["disposed function"]);
  });

  it("suppresses multiple disposal errors and continues disposal", () => {
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

    const error = assertThrowsInstanceOf(
      () => stack.dispose(),
      globalThis.SuppressedError,
    );

    const suppressedError = error as {
      readonly error: unknown;
      readonly suppressed: unknown;
    };

    assertSame(suppressedError.error, errorB);
    assertSame(suppressedError.suppressed, errorA);

    assertEqual(events, ["cleanup 3", "cleanup 2", "cleanup 1"]);
  });

  it("builds nested SuppressedError chain for three disposal failures", () => {
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

    const error = assertThrowsInstanceOf(
      () => stack.dispose(),
      globalThis.SuppressedError,
    );

    const root = error as {
      readonly error: unknown;
      readonly suppressed: unknown;
    };

    assertSame(root.error, throwSentinel);
    assertInstanceOf(root.suppressed, globalThis.SuppressedError);

    const nested = root.suppressed as {
      readonly error: unknown;
      readonly suppressed: unknown;
    };

    assertSame(nested.error, sentinel2);
    assertSame(nested.suppressed, sentinel3);
  });

  it("preserves non-Error thrown values", () => {
    for (const nonErrorValue of [123, undefined] as const) {
      const nonError: unknown = nonErrorValue;
      const stack = new globalThis.DisposableStack();
      stack.defer(() => {
        throw nonError;
      });

      assertThrowsSame(() => stack.dispose(), nonError);
    }
  });

  it("is idempotent when disposed repeatedly", () => {
    const events: Array<string> = [];

    const stack = new globalThis.DisposableStack();
    stack.defer(() => {
      events.push("cleanup");
    });

    stack.dispose();
    stack.dispose();

    assertEqual(events, ["cleanup"]);
  });

  it("toStringTag reports DisposableStack", () => {
    const stack = new globalThis.DisposableStack();
    assertEqual(
      Object.prototype.toString.call(stack),
      "[object DisposableStack]",
    );
  });

  it("toStringTag descriptor matches native shape", () => {
    const stack = new globalThis.DisposableStack();

    assertSame(
      Object.getOwnPropertyDescriptor(stack, Symbol.toStringTag),
      undefined,
    );

    assertEqual(
      Object.getOwnPropertyDescriptor(
        globalThis.DisposableStack.prototype,
        Symbol.toStringTag,
      ),
      {
        configurable: true,
        enumerable: false,
        writable: false,
        value: "DisposableStack",
      },
    );
  });

  it("Reflect.construct propagates abrupt newTarget prototype getter", () => {
    const newTarget = function () {
      // oxlint-disable-next-line eslint/no-extra-bind -- Binding removes the function's own prototype so the test can replace it with a getter.
    }.bind(null);

    let calls = 0;

    Object.defineProperty(newTarget, "prototype", {
      configurable: true,
      get: () => {
        calls += 1;
        throw new EvalError("prototype getter failed");
      },
    });

    assertThrowsInstanceOf(() => {
      Reflect.construct(globalThis.DisposableStack, [], newTarget);
    }, EvalError);
    assertEqual(calls, 1);
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

  it("constructor creates AsyncDisposableStack instances and requires new", () => {
    const AsyncDisposableStackCtor = globalThis.AsyncDisposableStack;

    assertEqual(typeof AsyncDisposableStackCtor, "function");

    const instance = new AsyncDisposableStackCtor();
    assertEqual(typeof instance, "object");
    assertInstanceOf(instance, AsyncDisposableStackCtor);

    assertThrowsInstanceOf(
      () =>
        (
          AsyncDisposableStackCtor as unknown as (
            ...args: Array<unknown>
          ) => unknown
        )(),
      TypeError,
    );

    assertSame(
      AsyncDisposableStackCtor.prototype.constructor,
      AsyncDisposableStackCtor,
    );
  });

  it("disposed is a prototype accessor", async () => {
    const stack = new globalThis.AsyncDisposableStack();

    assertFalse(Object.hasOwn(stack, "disposed"));

    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis.AsyncDisposableStack.prototype,
      "disposed",
    );

    assertNotUndefined(descriptor);
    assertTrue(descriptor?.configurable);
    assertFalse(descriptor?.enumerable);
    assertEqual(typeof descriptor?.get, "function");
    assertFalse(stack.disposed);

    await stack.disposeAsync();

    assertTrue(stack.disposed);
  });

  it("Symbol.asyncDispose aliases disposeAsync", () => {
    const symbolAsyncDispose = Object.getOwnPropertyDescriptor(
      globalThis.AsyncDisposableStack.prototype,
      Symbol.asyncDispose,
    )?.value;
    const disposeAsync = Object.getOwnPropertyDescriptor(
      globalThis.AsyncDisposableStack.prototype,
      "disposeAsync",
    )?.value;

    assertSame(symbolAsyncDispose, disposeAsync);
  });

  it("accepts async and sync resources in use", async () => {
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
    assertEqual(events, ["async", "sync"]);
  });

  it("use supports nullish values", async () => {
    const stack = new globalThis.AsyncDisposableStack();

    assertSame(stack.use(null), null);
    stack.use(undefined);

    await stack.disposeAsync();
  });

  it("throws on invalid use/defer/adopt input and move on disposed stack", async () => {
    const stack = new globalThis.AsyncDisposableStack();

    for (const value of nonNullPrimitives) {
      assertThrowsInstanceOf(() => stack.use(value as never), TypeError);
    }

    assertThrowsInstanceOf(
      () => stack.use({} as unknown as AsyncDisposable),
      TypeError,
    );

    for (const value of nonFunctions) {
      assertThrowsInstanceOf(() => stack.defer(value as never), TypeError);
      assertThrowsInstanceOf(() => stack.adopt("x", value as never), TypeError);
    }

    await stack.disposeAsync();

    const useError = assertThrowsInstanceOf(
      () =>
        stack.use({
          [Symbol.dispose]: () => undefined,
        }),
      Error,
    );
    assertTrue(
      /Cannot call AsyncDisposableStack\.prototype\.use on an already-disposed DisposableStack/u.test(
        useError.message,
      ),
    );
    const deferError = assertThrowsInstanceOf(
      () => stack.defer(() => undefined),
      Error,
    );
    assertTrue(
      /Cannot call AsyncDisposableStack\.prototype\.defer on an already-disposed DisposableStack/u.test(
        deferError.message,
      ),
    );
    const adoptError = assertThrowsInstanceOf(
      () => stack.adopt("x", () => undefined),
      Error,
    );
    assertTrue(
      /Cannot call AsyncDisposableStack\.prototype\.adopt on an already-disposed DisposableStack/u.test(
        adoptError.message,
      ),
    );
    const moveError = assertThrowsInstanceOf(() => stack.move(), Error);
    assertTrue(
      /Cannot call AsyncDisposableStack\.prototype\.move on an already-disposed DisposableStack/u.test(
        moveError.message,
      ),
    );
  });

  it("throws when Symbol.asyncDispose is present but not a function", () => {
    const stack = new globalThis.AsyncDisposableStack();

    assertThrowsInstanceOf(
      () =>
        stack.use({ [Symbol.asyncDispose]: 1 } as unknown as AsyncDisposable),
      TypeError,
    );
  });

  it("adopt disposes values in LIFO order", async () => {
    const events: Array<string> = [];

    const stack = new globalThis.AsyncDisposableStack();
    stack.adopt("a", (value) => {
      events.push(`adopt ${value}`);
    });
    stack.adopt("b", (value) => {
      events.push(`adopt ${value}`);
    });

    await stack.disposeAsync();

    assertEqual(events, ["adopt b", "adopt a"]);
  });

  it("adopt returns values and passes resource as the only callback argument", async () => {
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
    assertSame(stack.adopt(null, onDisposeAsync), null);
    assertSame(stack.adopt(sentinel, onDisposeAsync), sentinel);
    assertEqual(calls, []);

    assertSame(await stack.disposeAsync(), undefined);

    assertEqual(calls, [
      { count: 1, args: [sentinel] },
      { count: 1, args: [null] },
      { count: 1, args: [undefined] },
    ]);
  });

  it("move transfers ownership and old stack becomes disposed", async () => {
    const events: Array<string> = [];

    const disposer = new globalThis.AsyncDisposableStack();
    disposer.defer(() =>
      Promise.resolve().then(() => {
        events.push("cleanup");
      }),
    );

    const disposables = disposer.move();

    assertTrue(disposer.disposed);
    assertFalse(disposables.disposed);

    await disposables.disposeAsync();
    assertEqual(events, ["cleanup"]);
  });

  it("use accepts function resources", async () => {
    const events: Array<string> = [];

    const resource = function resource(): void {
      // oxlint-disable-next-line eslint/no-useless-return -- Keeps this intentional no-op body explicit while ESLint remains enabled.
      return;
    } as (() => void) & AsyncDisposable;
    resource[Symbol.asyncDispose] = () =>
      Promise.resolve().then(() => {
        events.push("disposed function");
      });

    const stack = new globalThis.AsyncDisposableStack();
    stack.use(resource);
    await stack.disposeAsync();

    assertEqual(events, ["disposed function"]);
  });

  it("defer invokes callback with undefined this and no arguments", async () => {
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

    assertEqual(calls, [{ thisValue: undefined, count: 0, args: [] }]);
  });

  // https://github.com/es-shims/DisposableStack/issues/9
  it("issue #9 regression: deferred throw does not break completion object", async () => {
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

    await assertRejectsSame(stack.disposeAsync(), error);
    assertEqual(events, ["third", "second", "first"]);
  });

  it("builds nested SuppressedError chain for three disposal failures", async () => {
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

    const error = await assertRejectsInstanceOf(
      stack.disposeAsync(),
      globalThis.SuppressedError,
    );

    const root = error as {
      readonly error: unknown;
      readonly suppressed: unknown;
    };

    assertSame(root.error, throwSentinel);
    assertInstanceOf(root.suppressed, globalThis.SuppressedError);

    const nested = root.suppressed as {
      readonly error: unknown;
      readonly suppressed: unknown;
    };

    assertSame(nested.error, sentinel2);
    assertSame(nested.suppressed, sentinel3);
  });

  it("continues disposal after failure and preserves thrown error", async () => {
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

    await assertRejectsSame(stack.disposeAsync(), error);
    assertEqual(events, [
      "instance ok cleanup",
      "instance failing cleanup",
      "mutex cleanup",
    ]);
  });

  it("suppresses multiple disposal errors and continues disposal", async () => {
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

    const error = await assertRejectsInstanceOf(
      stack.disposeAsync(),
      globalThis.SuppressedError,
    );

    const suppressedError = error as {
      readonly error: unknown;
      readonly suppressed: unknown;
    };

    assertSame(suppressedError.error, errorB);
    assertSame(suppressedError.suppressed, errorA);

    assertEqual(events, ["cleanup 3", "cleanup 2", "cleanup 1"]);
  });

  it("is idempotent when disposed repeatedly", async () => {
    const events: Array<string> = [];

    const stack = new globalThis.AsyncDisposableStack();
    stack.defer(() =>
      Promise.resolve().then(() => {
        events.push("cleanup");
      }),
    );

    await stack.disposeAsync();
    await stack.disposeAsync();

    assertEqual(events, ["cleanup"]);
  });

  it("does not share an in-flight disposeAsync promise", async () => {
    const disposalCanFinish = Promise.withResolvers<void>();
    let firstDisposeFinished = false;
    let secondDisposeFinished = false;

    const stack = new globalThis.AsyncDisposableStack();
    stack.defer(async () => {
      await disposalCanFinish.promise;
    });

    const firstDispose = stack.disposeAsync().then(() => {
      firstDisposeFinished = true;
    });
    const secondDispose = stack.disposeAsync().then(() => {
      secondDisposeFinished = true;
    });

    assertFalse(globalThis.Object.is(secondDispose, firstDispose));

    await Promise.resolve();

    assertFalse(firstDisposeFinished);
    assertTrue(secondDisposeFinished);

    disposalCanFinish.resolve();

    await firstDispose;
    await secondDispose;
  });

  it("disposeAsync is reentry-safe and does not dispose twice", async () => {
    let count = 0;

    const stack = new globalThis.AsyncDisposableStack();
    stack.use({
      async [Symbol.asyncDispose]() {
        count += 1;
        await stack.disposeAsync();
      },
    });

    await stack.disposeAsync();

    assertEqual(count, 1);
  });

  it("use prefers asyncDispose over dispose when both present", async () => {
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

    assertEqual(events, ["async"]);
  });

  it("use does not read Symbol.dispose when asyncDispose is present", () => {
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

    assertEqual(disposeReadCount, 0);
  });

  it("use reads Symbol.dispose only once on sync fallback", async () => {
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

    assertEqual(resource.disposeReadCount, 1);
  });

  it("use reads Symbol.asyncDispose only once", async () => {
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

    assertEqual(resource.disposeReadCount, 1);
  });

  it("preserves non-Error thrown values", async () => {
    for (const nonErrorValue of [123, undefined] as const) {
      const nonError: unknown = nonErrorValue;
      const stack = new globalThis.AsyncDisposableStack();
      stack.defer(() => {
        throw nonError;
      });

      await assertRejectsSame(stack.disposeAsync(), nonError);
    }
  });

  it("toStringTag reports AsyncDisposableStack", () => {
    const stack = new globalThis.AsyncDisposableStack();
    assertEqual(
      Object.prototype.toString.call(stack),
      "[object AsyncDisposableStack]",
    );
  });

  it("toStringTag descriptor matches native shape", () => {
    const stack = new globalThis.AsyncDisposableStack();

    assertSame(
      Object.getOwnPropertyDescriptor(stack, Symbol.toStringTag),
      undefined,
    );

    assertEqual(
      Object.getOwnPropertyDescriptor(
        globalThis.AsyncDisposableStack.prototype,
        Symbol.toStringTag,
      ),
      {
        configurable: true,
        enumerable: false,
        writable: false,
        value: "AsyncDisposableStack",
      },
    );
  });

  it("Reflect.construct propagates abrupt newTarget prototype getter", () => {
    const newTarget = function () {
      // oxlint-disable-next-line eslint/no-extra-bind -- Binding removes the function's own prototype so the test can replace it with a getter.
    }.bind(null);

    let calls = 0;

    Object.defineProperty(newTarget, "prototype", {
      configurable: true,
      get: () => {
        calls += 1;
        throw new EvalError("prototype getter failed");
      },
    });

    assertThrowsInstanceOf(() => {
      Reflect.construct(globalThis.AsyncDisposableStack, [], newTarget);
    }, EvalError);
    assertEqual(calls, 1);
  });
});

describe("installPolyfills Map and WeakMap upsert methods", () => {
  it("installs Map and WeakMap upsert methods", () => {
    assertEqual(typeof Map.prototype.getOrInsert, "function");
    assertEqual(typeof Map.prototype.getOrInsertComputed, "function");
    assertEqual(typeof WeakMap.prototype.getOrInsert, "function");
    assertEqual(typeof WeakMap.prototype.getOrInsertComputed, "function");
  });

  it("Map upsert methods keep existing undefined values and lazily compute missing ones", () => {
    const map = new Map<string, number | undefined>([["present", undefined]]);
    const computeCalls: Array<string> = [];

    assertSame(map.getOrInsert("present", 1), undefined);
    assertEqual(map.getOrInsert("missing", 2), 2);
    assertEqual(map.get("missing"), 2);

    assertSame(
      map.getOrInsertComputed("present", (key) => {
        computeCalls.push(key);
        return 3;
      }),
      undefined,
    );

    assertEqual(
      map.getOrInsertComputed("computed", (key) => {
        computeCalls.push(key);
        return key.length;
      }),
      8,
    );
    assertEqual(map.get("computed"), 8);
    assertEqual(computeCalls, ["computed"]);
  });

  it("WeakMap upsert methods keep existing undefined values and lazily compute missing ones", () => {
    const presentKey = {};
    const missingKey = {};
    const computedKey = {};
    const weakMap = new WeakMap<object, number | undefined>([
      [presentKey, undefined],
    ]);
    const computeCalls: Array<object> = [];

    assertSame(weakMap.getOrInsert(presentKey, 1), undefined);
    assertEqual(weakMap.getOrInsert(missingKey, 2), 2);
    assertEqual(weakMap.get(missingKey), 2);

    assertSame(
      weakMap.getOrInsertComputed(presentKey, (key) => {
        computeCalls.push(key);
        return 3;
      }),
      undefined,
    );

    assertEqual(
      weakMap.getOrInsertComputed(computedKey, (key) => {
        computeCalls.push(key);
        return Number(key === computedKey);
      }),
      1,
    );
    assertEqual(weakMap.get(computedKey), 1);
    assertEqual(computeCalls, [computedKey]);
  });
});
