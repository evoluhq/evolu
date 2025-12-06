/**
 * Tests for DisposableStack and AsyncDisposableStack polyfills.
 *
 * These tests verify both native and polyfill implementations behave
 * identically. Tests were ported from es-shims/DisposableStack and TC39 test262
 * suite with LLM assistance, then manually reviewed for correctness.
 *
 * @see https://github.com/es-shims/DisposableStack
 * @see https://github.com/AggregateError/test262/tree/explicit-resource-management
 */

/* eslint-disable @typescript-eslint/only-throw-error */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import { describe, expect, it } from "vitest";
import {
  AsyncDisposableStack as PolyfillAsyncDisposableStack,
  DisposableStack as PolyfillDisposableStack,
} from "../src/Polyfills.js";

const throwSentinel = { throws: true };
const throwsSentinel = () => {
  throw throwSentinel;
};

const nonNullPrimitives = [true, false, 0, 1, -1, "", "foo", Symbol("test")];
const nonFunctions = [
  undefined,
  null,
  true,
  false,
  0,
  1,
  -1,
  "",
  "foo",
  {},
  [],
  Symbol("test"),
];

interface DisposableStackImpl {
  readonly Stack: new () => DisposableStack;
  readonly disposeSymbol: typeof Symbol.dispose;
  readonly name: string;
}

interface AsyncDisposableStackImpl {
  readonly Stack: new () => AsyncDisposableStack;
  readonly disposeSymbol: typeof Symbol.asyncDispose;
  readonly syncDisposeSymbol: typeof Symbol.dispose;
  readonly name: string;
}

const nativeDisposableStack: DisposableStackImpl = {
  Stack: DisposableStack,
  disposeSymbol: Symbol.dispose,
  name: "native",
};

const polyfillDisposableStack: DisposableStackImpl = {
  Stack: PolyfillDisposableStack,
  disposeSymbol: Symbol.dispose,
  name: "polyfill",
};

const nativeAsyncDisposableStack: AsyncDisposableStackImpl = {
  Stack: AsyncDisposableStack,
  disposeSymbol: Symbol.asyncDispose,
  syncDisposeSymbol: Symbol.dispose,
  name: "native",
};

const polyfillAsyncDisposableStack: AsyncDisposableStackImpl = {
  Stack: PolyfillAsyncDisposableStack,
  disposeSymbol: Symbol.asyncDispose,
  syncDisposeSymbol: Symbol.dispose,
  name: "polyfill",
};

const disposableStackImpls = [nativeDisposableStack, polyfillDisposableStack];
const asyncDisposableStackImpls = [
  nativeAsyncDisposableStack,
  polyfillAsyncDisposableStack,
];

describe.each(disposableStackImpls)(
  "DisposableStack ($name)",
  ({ Stack, disposeSymbol }) => {
    it("is a function and constructs instances", () => {
      expect(typeof Stack).toBe("function");
      const instance = new Stack();
      expect(typeof instance).toBe("object");
      expect(instance).toBeInstanceOf(Stack);
    });

    it("throws TypeError if not called with new", () => {
      expect(() => {
        // @ts-expect-error testing invalid call
        Stack();
      }).toThrow(TypeError);
    });

    describe("disposed", () => {
      it("is not disposed initially", () => {
        const instance = new Stack();
        expect(instance.disposed).toBe(false);
      });

      it("is disposed after dispose()", () => {
        const instance = new Stack();
        instance.dispose();
        expect(instance.disposed).toBe(true);
      });

      it("has a prototype accessor", () => {
        const instance = new Stack();
        expect(Object.prototype.hasOwnProperty.call(instance, "disposed")).toBe(
          false,
        );

        const desc = Object.getOwnPropertyDescriptor(
          Stack.prototype,
          "disposed",
        );
        expect(desc).toMatchObject({
          configurable: true,
          enumerable: false,
          set: undefined,
        });
        expect(typeof desc?.get).toBe("function");
        expect(instance.disposed).toBe(desc?.get?.call(instance));

        instance.dispose();
        expect(instance.disposed).toBe(desc?.get?.call(instance));
        expect(instance.disposed).toBe(true);
      });
    });

    describe("use", () => {
      it("tracks disposables and calls them on dispose", () => {
        const count = { value: 0 };
        const disposable: Disposable = {
          [disposeSymbol]: () => {
            count.value += 1;
          },
        };

        const stack = new Stack();
        stack.use(disposable);
        stack.use(null);
        stack.use(undefined);
        stack.use(disposable);

        expect(count.value).toBe(0);
        stack.dispose();
        expect(count.value).toBe(2);
      });

      it("throws on non-object primitives", () => {
        const stack = new Stack();

        for (const primitive of nonNullPrimitives) {
          expect(() => {
            // @ts-expect-error testing invalid input
            stack.use(primitive);
          }).toThrow(TypeError);
        }
      });

      it("throws ReferenceError when already disposed", () => {
        const stack = new Stack();
        const disposable: Disposable = { [disposeSymbol]: () => {} };

        stack.dispose();

        expect(() => {
          stack.use(disposable);
        }).toThrow(ReferenceError);
      });

      it("throws when disposable throws", () => {
        const badDisposable: Disposable = {
          [disposeSymbol]: throwsSentinel,
        };

        const stack = new Stack();
        stack.use(badDisposable);

        try {
          stack.dispose();
          expect.fail("dispose with a throwing disposable failed to throw");
        } catch (e) {
          expect(e).toBe(throwSentinel);
        }
      });

      it("does not call disposable twice on re-entry", () => {
        const stack = new Stack();
        let count = 0;
        const reentry: Disposable = {
          [disposeSymbol]: () => {
            count += 1;
            stack.dispose();
          },
        };
        stack.use(reentry);
        stack.dispose();
        expect(count).toBe(1);
      });

      it("returns the resource", () => {
        const stack = new Stack();
        const resource1: Disposable = { [disposeSymbol]: () => {} };
        const resource2: Disposable = { [disposeSymbol]: () => {} };

        expect(stack.use(resource1)).toBe(resource1);
        expect(stack.use(resource2)).toBe(resource2);
      });

      it("disposes in reverse order", () => {
        const args: Array<{ res: Disposable }> = [];
        const resource1: Disposable = {
          [disposeSymbol]() {
            args.push({ res: this });
          },
        };
        const resource2: Disposable = {
          [disposeSymbol]() {
            args.push({ res: this });
          },
        };

        const stack = new Stack();
        stack.use(resource1);
        stack.use(resource2);

        expect(args).toEqual([]);
        stack.dispose();
        expect(args).toEqual([{ res: resource2 }, { res: resource1 }]);
      });

      it("gets Symbol.dispose property only once (test262)", () => {
        const stack = new Stack();
        let disposeReadCount = 0;
        const resource = {};

        Object.defineProperty(resource, disposeSymbol, {
          configurable: true,
          enumerable: false,
          get() {
            disposeReadCount += 1;
            return () => {};
          },
        });

        stack.use(resource as Disposable);
        stack.dispose();
        expect(disposeReadCount).toBe(1);
      });
    });

    describe("defer", () => {
      it("registers callbacks and calls them in reverse order", () => {
        const stack = new Stack();
        const calls: Array<number> = [];

        stack.defer(() => calls.push(1));
        stack.defer(() => calls.push(2));

        expect(calls).toEqual([]);
        stack.dispose();
        expect(calls).toEqual([2, 1]);
      });

      it("throws on non-functions", () => {
        const stack = new Stack();

        for (const nonFunction of nonFunctions) {
          expect(() => {
            // @ts-expect-error testing invalid input
            stack.defer(nonFunction);
          }).toThrow(TypeError);
        }
      });

      it("throws ReferenceError when already disposed", () => {
        const stack = new Stack();
        stack.dispose();

        expect(() => {
          stack.defer(() => {});
        }).toThrow(ReferenceError);
      });

      it("throws when callback throws", () => {
        const stack = new Stack();
        stack.defer(throwsSentinel);

        try {
          stack.dispose();
          expect.fail("dispose with a throwing callback failed to throw");
        } catch (e) {
          expect(e).toBe(throwSentinel);
        }
      });

      it("returns undefined", () => {
        const stack = new Stack();
        expect(stack.defer(() => {})).toBe(undefined);
      });

      it("calls callbacks with no arguments", () => {
        const args: Array<{ fn: () => void; count: number }> = [];
        const onDispose1 = function (this: unknown) {
          args.push({ fn: onDispose1, count: arguments.length });
        };
        const onDispose2 = function (this: unknown) {
          args.push({ fn: onDispose2, count: arguments.length });
        };

        const stack = new Stack();
        stack.defer(onDispose1);
        stack.defer(onDispose2);

        expect(args).toEqual([]);
        stack.dispose();
        expect(args).toEqual([
          { fn: onDispose2, count: 0 },
          { fn: onDispose1, count: 0 },
        ]);
      });
    });

    describe("adopt", () => {
      it("throws on non-function onDispose", () => {
        const stack = new Stack();

        for (const nonFunction of nonFunctions) {
          expect(() => {
            // @ts-expect-error testing invalid input
            stack.adopt(undefined, nonFunction);
          }).toThrow(TypeError);
        }
      });

      it("returns the resource", () => {
        const stack = new Stack();
        const onDispose = () => {};
        const sentinel = { sentinel: true };

        expect(stack.adopt(undefined, onDispose)).toBe(undefined);
        expect(stack.adopt(null, onDispose)).toBe(null);
        expect(stack.adopt(sentinel, onDispose)).toBe(sentinel);
      });

      it("disposes adopted resources in reverse order with correct args", () => {
        const stack = new Stack();
        const args: Array<{ count: number; args: ReadonlyArray<unknown> }> = [];
        const onDispose = function (this: unknown, ...a: Array<unknown>) {
          args.push({ count: a.length, args: a });
        };

        const sentinel = { sentinel: true };
        stack.adopt(undefined, onDispose);
        stack.adopt(null, onDispose);
        stack.adopt(sentinel, onDispose);

        expect(args).toEqual([]);
        stack.dispose();
        expect(args).toEqual([
          { count: 1, args: [sentinel] },
          { count: 1, args: [null] },
          { count: 1, args: [undefined] },
        ]);
      });

      it("throws ReferenceError when already disposed", () => {
        const stack = new Stack();
        stack.dispose();

        expect(() => {
          stack.adopt(null, () => {});
        }).toThrow(ReferenceError);
      });

      it("throws when onDispose throws", () => {
        const stack = new Stack();
        stack.adopt(null, throwsSentinel);

        try {
          stack.dispose();
          expect.fail("dispose with a throwing onDispose failed to throw");
        } catch (e) {
          expect(e).toBe(throwSentinel);
        }
      });
    });

    describe("move", () => {
      it("throws ReferenceError on disposed stack", () => {
        const disposed = new Stack();
        disposed.dispose();

        expect(() => {
          disposed.move();
        }).toThrow(ReferenceError);
      });

      it("moves resources to new stack", () => {
        const stack = new Stack();
        let count = 0;
        const increment = () => {
          count += 1;
        };

        stack.defer(increment);
        stack.defer(increment);

        expect(count).toBe(0);
        expect(stack.disposed).toBe(false);

        const newStack = stack.move();
        expect(newStack).toBeInstanceOf(Stack);

        expect(count).toBe(0);
        expect(stack.disposed).toBe(true);
        expect(newStack.disposed).toBe(false);

        newStack.dispose();

        expect(count).toBe(2);
        expect(newStack.disposed).toBe(true);
      });
    });

    describe("dispose", () => {
      it("returns undefined when disposing an already disposed stack", () => {
        const disposed = new Stack();
        disposed.dispose();
        expect(disposed.disposed).toBe(true);
        expect(disposed.dispose()).toBe(undefined);
      });

      it("disposes adopt and defer in reverse order, only once", () => {
        const args: Array<{
          fn: (...a: Array<unknown>) => void;
          count: number;
          args: ReadonlyArray<unknown>;
        }> = [];
        const onDispose1 = function (this: unknown, ...a: Array<unknown>) {
          args.push({ fn: onDispose1, count: a.length, args: a });
        };
        const onDispose2 = function (this: unknown, ...a: Array<unknown>) {
          args.push({ fn: onDispose2, count: a.length, args: a });
        };

        const stack = new Stack();
        stack.adopt(null, onDispose1);
        stack.defer(onDispose2);

        expect(args).toEqual([]);

        stack.dispose();
        stack.dispose(); // second dispose should be no-op

        expect(args).toEqual([
          { fn: onDispose2, count: 0, args: [] },
          { fn: onDispose1, count: 1, args: [null] },
        ]);
      });

      it("aggregates multiple errors with SuppressedError", () => {
        const sentinel2 = { sentinel2: true };
        const sentinel3 = { sentinel3: true };
        const badDisposable: Disposable = {
          [disposeSymbol]: throwsSentinel,
        };

        const stack = new Stack();
        stack.use(badDisposable);
        stack.adopt(null, () => {
          throw sentinel2;
        });
        stack.adopt(undefined, () => {
          throw sentinel3;
        });

        try {
          stack.dispose();
          expect.fail("dispose with throwing disposables failed to throw");
        } catch (e) {
          expect(e).toBeInstanceOf(SuppressedError);
          const se = e as SuppressedError;
          expect(se.error).toBe(throwSentinel);
          expect(se.suppressed).toBeInstanceOf(SuppressedError);
          const suppressed = se.suppressed as SuppressedError;
          expect(suppressed.error).toBe(sentinel2);
          expect(suppressed.suppressed).toBe(sentinel3);
        }
      });
    });

    describe("Symbol.dispose", () => {
      it("is the same function as dispose", () => {
        expect(Stack.prototype[disposeSymbol]).toBe(Stack.prototype.dispose);
      });
    });

    describe("toStringTag", () => {
      it("has the correct [[Class]]", () => {
        const instance = new Stack();
        expect(Object.prototype.toString.call(instance)).toBe(
          "[object DisposableStack]",
        );
      });
    });
  },
);

describe.each(asyncDisposableStackImpls)(
  "AsyncDisposableStack ($name)",
  ({ Stack, disposeSymbol, syncDisposeSymbol }) => {
    it("is a function and constructs instances", () => {
      expect(typeof Stack).toBe("function");
      const instance = new Stack();
      expect(typeof instance).toBe("object");
      expect(instance).toBeInstanceOf(Stack);
    });

    it("throws TypeError if not called with new", () => {
      expect(() => {
        // @ts-expect-error testing invalid call
        Stack();
      }).toThrow(TypeError);
    });

    describe("disposed", () => {
      it("is not disposed initially", () => {
        const instance = new Stack();
        expect(instance.disposed).toBe(false);
      });

      it("is disposed after disposeAsync()", async () => {
        const instance = new Stack();
        await instance.disposeAsync();
        expect(instance.disposed).toBe(true);
      });

      it("has a prototype accessor", async () => {
        const instance = new Stack();
        expect(Object.prototype.hasOwnProperty.call(instance, "disposed")).toBe(
          false,
        );

        const desc = Object.getOwnPropertyDescriptor(
          Stack.prototype,
          "disposed",
        );
        expect(desc).toMatchObject({
          configurable: true,
          enumerable: false,
          set: undefined,
        });
        expect(typeof desc?.get).toBe("function");
        expect(instance.disposed).toBe(desc?.get?.call(instance));

        await instance.disposeAsync();
        expect(instance.disposed).toBe(desc?.get?.call(instance));
        expect(instance.disposed).toBe(true);
      });
    });

    describe("use", () => {
      it("tracks async disposables and calls them on dispose", async () => {
        const count = { value: 0 };
        const disposable: AsyncDisposable = {
          [disposeSymbol]: () => {
            count.value += 1;
            return Promise.resolve();
          },
        };

        const stack = new Stack();
        stack.use(disposable);
        stack.use(null);
        stack.use(undefined);
        stack.use(disposable);

        expect(count.value).toBe(0);
        await stack.disposeAsync();
        expect(count.value).toBe(2);
      });

      it("also accepts sync disposables with Symbol.dispose", async () => {
        const count = { value: 0 };
        const disposable: Disposable = {
          [syncDisposeSymbol]: () => {
            count.value += 1;
          },
        };

        const stack = new Stack();
        stack.use(disposable as unknown as AsyncDisposable);

        expect(count.value).toBe(0);
        await stack.disposeAsync();
        expect(count.value).toBe(1);
      });

      it("throws on non-object primitives", () => {
        const stack = new Stack();

        for (const primitive of nonNullPrimitives) {
          expect(() => {
            // @ts-expect-error testing invalid input
            stack.use(primitive);
          }).toThrow(TypeError);
        }
      });

      it("throws ReferenceError when already disposed", async () => {
        const stack = new Stack();
        const disposable: AsyncDisposable = {
          [disposeSymbol]: () => Promise.resolve(),
        };

        await stack.disposeAsync();

        expect(() => {
          stack.use(disposable);
        }).toThrow(ReferenceError);
      });

      it("rejects when disposable throws", async () => {
        const badDisposable: AsyncDisposable = {
          [disposeSymbol]: throwsSentinel,
        };

        const stack = new Stack();
        stack.use(badDisposable);

        await expect(stack.disposeAsync()).rejects.toBe(throwSentinel);
      });

      it("returns the resource", () => {
        const stack = new Stack();
        const resource1: AsyncDisposable = {
          [disposeSymbol]: () => Promise.resolve(),
        };
        const resource2: AsyncDisposable = {
          [disposeSymbol]: () => Promise.resolve(),
        };

        expect(stack.use(resource1)).toBe(resource1);
        expect(stack.use(resource2)).toBe(resource2);
      });
    });

    describe("defer", () => {
      it("registers callbacks and calls them in reverse order", async () => {
        const stack = new Stack();
        const calls: Array<number> = [];

        stack.defer(() => {
          calls.push(1);
        });
        stack.defer(() => {
          calls.push(2);
        });

        expect(calls).toEqual([]);
        await stack.disposeAsync();
        expect(calls).toEqual([2, 1]);
      });

      it("throws on non-functions", () => {
        const stack = new Stack();

        for (const nonFunction of nonFunctions) {
          expect(() => {
            // @ts-expect-error testing invalid input
            stack.defer(nonFunction);
          }).toThrow(TypeError);
        }
      });

      it("throws ReferenceError when already disposed", async () => {
        const stack = new Stack();
        await stack.disposeAsync();

        expect(() => {
          stack.defer(() => {});
        }).toThrow(ReferenceError);
      });

      it("rejects when callback throws", async () => {
        const stack = new Stack();
        stack.defer(throwsSentinel);

        await expect(stack.disposeAsync()).rejects.toBe(throwSentinel);
      });

      it("calls all deferred functions even when one throws (issue #9)", async () => {
        const stack = new Stack();
        const calls: Array<number> = [];

        stack.defer(() => {
          calls.push(1);
        });

        stack.defer(() => {
          throw new Error("2");
        });

        stack.defer(() => {
          calls.push(3);
        });

        await expect(stack.disposeAsync()).rejects.toThrow("2");
        // All callbacks should have been called in reverse order
        expect(calls).toEqual([3, 1]);
      });

      it("returns undefined", () => {
        const stack = new Stack();
        expect(stack.defer(() => {})).toBe(undefined);
      });
    });

    describe("adopt", () => {
      it("throws on non-function onDispose", () => {
        const stack = new Stack();

        for (const nonFunction of nonFunctions) {
          expect(() => {
            // @ts-expect-error testing invalid input
            stack.adopt(undefined, nonFunction);
          }).toThrow(TypeError);
        }
      });

      it("returns the resource", () => {
        const stack = new Stack();
        const onDispose = () => {};
        const sentinel = { sentinel: true };

        expect(stack.adopt(undefined, onDispose)).toBe(undefined);
        expect(stack.adopt(null, onDispose)).toBe(null);
        expect(stack.adopt(sentinel, onDispose)).toBe(sentinel);
      });

      it("disposes adopted resources in reverse order with correct args", async () => {
        const stack = new Stack();
        const args: Array<{ count: number; args: ReadonlyArray<unknown> }> = [];
        const onDispose = (...a: Array<unknown>) => {
          args.push({ count: a.length, args: a });
        };

        const sentinel = { sentinel: true };
        stack.adopt(undefined, onDispose);
        stack.adopt(null, onDispose);
        stack.adopt(sentinel, onDispose);

        expect(args).toEqual([]);
        const result = await stack.disposeAsync();
        expect(result).toBe(undefined);
        expect(args).toEqual([
          { count: 1, args: [sentinel] },
          { count: 1, args: [null] },
          { count: 1, args: [undefined] },
        ]);
      });

      it("throws ReferenceError when already disposed", async () => {
        const stack = new Stack();
        await stack.disposeAsync();

        expect(() => {
          stack.adopt(null, () => {});
        }).toThrow(ReferenceError);
      });

      it("rejects when onDispose throws", async () => {
        const stack = new Stack();
        stack.adopt(null, throwsSentinel);

        await expect(stack.disposeAsync()).rejects.toBe(throwSentinel);
      });
    });

    describe("move", () => {
      it("throws ReferenceError on disposed stack", async () => {
        const disposed = new Stack();
        await disposed.disposeAsync();

        expect(() => {
          disposed.move();
        }).toThrow(ReferenceError);
      });

      it("moves resources to new stack", async () => {
        const stack = new Stack();
        let count = 0;
        const increment = () => {
          count += 1;
        };

        stack.defer(increment);
        stack.defer(increment);

        expect(count).toBe(0);
        expect(stack.disposed).toBe(false);

        const newStack = stack.move();
        expect(newStack).toBeInstanceOf(Stack);

        expect(count).toBe(0);
        expect(stack.disposed).toBe(true);
        expect(newStack.disposed).toBe(false);

        await newStack.disposeAsync();

        expect(count).toBe(2);
        expect(newStack.disposed).toBe(true);
      });
    });

    describe("disposeAsync", () => {
      it("returns undefined when disposing an already disposed stack", async () => {
        const disposed = new Stack();
        await disposed.disposeAsync();
        expect(disposed.disposed).toBe(true);
        const result = await disposed.disposeAsync();
        expect(result).toBe(undefined);
      });

      it("handles sync Symbol.asyncDispose method (test262)", async () => {
        const resource = { disposed: false } as {
          disposed: boolean;
        } & AsyncDisposable;
        resource[disposeSymbol] = function (this: {
          disposed: boolean;
        }): Promise<void> {
          this.disposed = true;
          return Promise.resolve();
        };

        const stack = new Stack();
        stack.use(resource);
        await stack.disposeAsync();
        expect(resource.disposed).toBe(true);
      });
    });

    describe("Symbol.asyncDispose", () => {
      it("is the same function as disposeAsync", () => {
        expect(Stack.prototype[disposeSymbol]).toBe(
          Stack.prototype.disposeAsync,
        );
      });
    });

    describe("toStringTag", () => {
      it("has the correct [[Class]]", () => {
        const instance = new Stack();
        expect(Object.prototype.toString.call(instance)).toBe(
          "[object AsyncDisposableStack]",
        );
      });
    });

    describe("prototype-from-newtarget-abrupt (test262)", () => {
      it("aborts construction when newTarget.prototype getter throws", () => {
        let calls = 0;
        const newTarget = function () {}.bind(null);
        Object.defineProperty(newTarget, "prototype", {
          configurable: true,
          get() {
            calls += 1;
            throw new EvalError();
          },
        });

        expect(() => {
          Reflect.construct(Stack, [], newTarget);
        }).toThrow(EvalError);

        expect(calls).toBe(1);
      });
    });
  },
);

describe("Symbol.dispose", () => {
  it("is a symbol", () => {
    expect(typeof Symbol.dispose).toBe("symbol");
  });

  it("is not a registered symbol", () => {
    expect(Symbol.keyFor(Symbol.dispose)).toBe(undefined);
  });
});

describe("Symbol.asyncDispose", () => {
  it("is a symbol", () => {
    expect(typeof Symbol.asyncDispose).toBe("symbol");
  });

  it("is not a registered symbol", () => {
    expect(Symbol.keyFor(Symbol.asyncDispose)).toBe(undefined);
  });
});
