import { describe, it, test } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
} from "./Assert.ts";

import {
  constFalse,
  constNull,
  constTrue,
  constUndefined,
  constVoid,
  constant,
  disposable,
  isDisposable,
  exhaustiveCheck,
  identity,
  type Thunk,
  todo,
} from "./Function.ts";
import { assertType } from "./Type.ts";

describe("exhaustiveCheck", () => {
  it("throws error for unhandled case", () => {
    const error = assertThrowsInstanceOf(
      () => exhaustiveCheck("unexpected" as never),
      Error,
    );
    assertTrue(
      error.message.includes('exhaustiveCheck unhandled case: "unexpected"'),
    );
  });
});

describe("identity", () => {
  it("returns the same value", () => {
    assertEqual(identity(42), 42);
    assertEqual(identity("hello"), "hello");
    assertSame(identity(null), null);
  });

  it("preserves object reference", () => {
    const obj = { a: 1 };
    assertSame(identity(obj), obj);
  });

  it("preserves type", () => {
    const num = identity(42);
    assertType<typeof num, 42>();

    const str = identity("hello");
    assertType<typeof str, "hello">();
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

  assertEqual(value.increment(), 1);
  value[Symbol.dispose]();
  const disposedError = assertThrowsInstanceOf(() => value.increment(), Error);
  assertTrue(disposedError.message.includes("Cannot use a disposed object."));

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

  assertTrue(disposer.disposed);
  assertEqual(valueWithDisposer.increment(), 1);
  assertEqual(disposedCount, 0);
  valueWithDisposer[Symbol.dispose]();
  assertEqual(disposedCount, 1);
  const disposedWithDisposerError = assertThrowsInstanceOf(
    () => valueWithDisposer.increment(),
    Error,
  );
  assertTrue(
    disposedWithDisposerError.message.includes("Cannot use a disposed object."),
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

  assertTrue(asyncDisposer.disposed);
  assertEqual(asyncValue.increment(), 1);
  assertFalse(asyncDisposed);
  await asyncValue[Symbol.asyncDispose]();
  assertTrue(asyncDisposed);
  const asyncDisposedError = assertThrowsInstanceOf(
    () => asyncValue.increment(),
    Error,
  );
  assertTrue(
    asyncDisposedError.message.includes("Cannot use a disposed object."),
  );
});

describe("isDisposable", () => {
  it("recognizes synchronous and asynchronous disposable objects", () => {
    assertTrue(isDisposable({ [Symbol.dispose]: constVoid }));
    assertTrue(
      isDisposable({ [Symbol.asyncDispose]: () => Promise.resolve() }),
    );
  });

  it("rejects non-disposable values", () => {
    assertFalse(isDisposable(undefined));
    assertFalse(isDisposable(null));
    assertFalse(isDisposable({}));
  });
});

describe("constant", () => {
  it("creates a Thunk returning the same value", () => {
    const value = { id: 1 };
    const getValue = constant(value);

    assertType<typeof getValue, Thunk<typeof value>>();
    assertSame(getValue(), value);
  });

  it("constVoid returns void", () => {
    assertType<ReturnType<typeof constVoid>, void>();
  });

  it("constUndefined returns undefined", () => {
    assertType<ReturnType<typeof constUndefined>, undefined>();
  });

  it("constNull returns null", () => {
    assertSame(constNull(), null);
  });

  it("constTrue returns true", () => {
    assertTrue(constTrue());
  });

  it("constFalse returns false", () => {
    assertFalse(constFalse());
  });
});

describe("todo", () => {
  it("throws", () => {
    const error = assertThrowsInstanceOf(() => todo(), Error);
    assertTrue(error.message.includes("not yet implemented"));
  });

  it("infers type from return type annotation", () => {
    const fn = (): number => todo();
    assertType<ReturnType<typeof fn>, number>();
  });

  it("accepts explicit generic when no return type", () => {
    const fn = () => todo<string>();
    assertType<ReturnType<typeof fn>, string>();
  });
});
