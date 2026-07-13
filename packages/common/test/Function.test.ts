import { describe, expect, expectTypeOf, test } from "vitest";
import {
  disposable,
  isDisposable,
  lazyFalse,
  lazyNull,
  lazyTrue,
  lazyUndefined,
  lazyVoid,
  exhaustiveCheck,
  identity,
  todo,
} from "../src/Function.js";

describe("exhaustiveCheck", () => {
  test("throws error for unhandled case", () => {
    expect(() => exhaustiveCheck("unexpected" as never)).toThrow(
      'exhaustiveCheck unhandled case: "unexpected"',
    );
  });
});

describe("identity", () => {
  test("returns the same value", () => {
    expect(identity(42)).toBe(42);
    expect(identity("hello")).toBe("hello");
    expect(identity(null)).toBe(null);
  });

  test("preserves object reference", () => {
    const obj = { a: 1 };
    expect(identity(obj)).toBe(obj);
  });

  test("preserves type", () => {
    const num = identity(42);
    expectTypeOf(num).toEqualTypeOf<number>();

    const str = identity("hello");
    expectTypeOf(str).toEqualTypeOf<string>();
  });
});

test("disposable", async () => {
  interface Counter extends Disposable {
    readonly increment: () => number;
  }

  let count = 0;

  const value = disposable<Counter>({
    increment: () => {
      count += 1;
      return count;
    },
  });

  expect(value.increment()).toBe(1);
  value[Symbol.dispose]();
  expect(() => value.increment()).toThrow("Cannot use a disposed object.");

  disposable<Counter>({
    // @ts-expect-error - extra properties are not part of Counter.
    extra: 1,
    increment: () => 1,
  });

  const disposer = new DisposableStack();
  let disposedCount = 0;
  disposer.defer(() => {
    disposedCount += 1;
  });
  const valueWithDisposer = disposable<Counter>(
    {
      increment: () => count,
    },
    disposer,
  );

  expect(disposer.disposed).toBe(true);
  expect(valueWithDisposer.increment()).toBe(1);
  expect(disposedCount).toBe(0);
  valueWithDisposer[Symbol.dispose]();
  expect(disposedCount).toBe(1);
  expect(() => valueWithDisposer.increment()).toThrow(
    "Cannot use a disposed object.",
  );

  interface AsyncCounter extends AsyncDisposable {
    readonly increment: () => number;
  }

  const asyncDisposer = new AsyncDisposableStack();
  let asyncDisposed = false;
  asyncDisposer.defer(() => {
    asyncDisposed = true;
  });
  let asyncCount = 0;

  const asyncValue = disposable<AsyncCounter>(
    {
      increment: () => {
        asyncCount += 1;
        return asyncCount;
      },
    },
    asyncDisposer,
  );

  expect(asyncDisposer.disposed).toBe(true);
  expect(asyncValue.increment()).toBe(1);
  expect(asyncDisposed).toBe(false);
  await asyncValue[Symbol.asyncDispose]();
  expect(asyncDisposed).toBe(true);
  expect(() => asyncValue.increment()).toThrow("Cannot use a disposed object.");
});

describe("isDisposable", () => {
  test("recognizes synchronous and asynchronous disposable objects", () => {
    expect(isDisposable({ [Symbol.dispose]: lazyVoid })).toBe(true);
    expect(
      isDisposable({ [Symbol.asyncDispose]: () => Promise.resolve() }),
    ).toBe(true);
  });

  test("rejects non-disposable values", () => {
    expect(isDisposable(undefined)).toBe(false);
    expect(isDisposable(null)).toBe(false);
    expect(isDisposable({})).toBe(false);
  });
});

describe("lazy", () => {
  test("lazyVoid returns void", () => {
    expectTypeOf<ReturnType<typeof lazyVoid>>().toEqualTypeOf<void>();
  });

  test("lazyUndefined returns undefined", () => {
    expectTypeOf<ReturnType<typeof lazyUndefined>>().toEqualTypeOf<undefined>();
  });

  test("lazyNull returns null", () => {
    expect(lazyNull()).toBe(null);
  });

  test("lazyTrue returns true", () => {
    expect(lazyTrue()).toBe(true);
  });

  test("lazyFalse returns false", () => {
    expect(lazyFalse()).toBe(false);
  });
});

describe("todo", () => {
  test("throws", () => {
    expect(() => todo()).toThrow("not yet implemented");
  });

  test("infers type from return type annotation", () => {
    const fn = (): number => todo();
    expectTypeOf(fn).returns.toEqualTypeOf<number>();
  });

  test("accepts explicit generic when no return type", () => {
    const fn = () => todo<string>();
    expectTypeOf(fn).returns.toEqualTypeOf<string>();
  });
});
