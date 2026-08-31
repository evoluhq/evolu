import {
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertRejectsSame,
  assertSame,
  assertTrue,
} from "@evolu/common";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installPolyfills } from "./Polyfills.ts";

interface GlobalAbort {
  readonly AbortController: typeof AbortController | undefined;
  readonly AbortSignal: typeof AbortSignal | undefined;
  readonly DOMException: typeof DOMException | undefined;
}

interface PromiseStatics {
  withResolvers?: () => {
    promise: Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  };
  try?: (
    func: (...args: ReadonlyArray<unknown>) => unknown,
    ...args: ReadonlyArray<unknown>
  ) => Promise<unknown>;
}

interface ArrayConstructorWithFromAsync {
  fromAsync?: typeof Array.fromAsync;
}

type FakeAbortListener = () => void;

interface FakeAbortSignal {
  aborted: boolean;
  addEventListener: (
    type: string,
    listener: FakeAbortListener,
    options?: { readonly once?: boolean },
  ) => void;
  removeEventListener: (type: string, listener: FakeAbortListener) => void;
  dispatchAbort: () => void;
  getListenerCount: () => number;
}

const createFakeAbortRuntime = (): {
  readonly AbortSignal: typeof AbortSignal;
  readonly AbortController: typeof AbortController;
  readonly getAbortCallCount: () => number;
} => {
  let abortCallCount = 0;

  class TestAbortSignal {
    public aborted = false;
    private readonly listeners = new Set<FakeAbortListener>();

    public addEventListener(
      _type: string,
      listener: FakeAbortListener,
      _options?: { readonly once?: boolean },
    ): void {
      this.listeners.add(listener);
    }

    public removeEventListener(
      _type: string,
      listener: FakeAbortListener,
    ): void {
      this.listeners.delete(listener);
    }

    public dispatchAbort(): void {
      if (this.aborted) return;
      this.aborted = true;
      for (const listener of this.listeners) listener();
    }

    public getListenerCount(): number {
      return this.listeners.size;
    }
  }

  class TestAbortController {
    public readonly signal =
      new TestAbortSignal() as unknown as AbortController["signal"];

    public abort(): void {
      abortCallCount += 1;
      (this.signal as unknown as FakeAbortSignal).dispatchAbort();
    }
  }

  return {
    AbortController: TestAbortController,
    AbortSignal: TestAbortSignal as unknown as typeof AbortSignal,
    getAbortCallCount: () => abortCallCount,
  };
};

const setAbortGlobals = (globals: GlobalAbort): void => {
  if (globals.AbortController === undefined) {
    delete (globalThis as { AbortController?: typeof AbortController })
      .AbortController;
  } else {
    (
      globalThis as { AbortController?: typeof AbortController }
    ).AbortController = globals.AbortController;
  }

  if (globals.AbortSignal === undefined) {
    delete (globalThis as { AbortSignal?: typeof AbortSignal }).AbortSignal;
  } else {
    (globalThis as { AbortSignal?: typeof AbortSignal }).AbortSignal =
      globals.AbortSignal;
  }

  if (globals.DOMException === undefined) {
    delete (globalThis as { DOMException?: typeof DOMException }).DOMException;
  } else {
    (globalThis as { DOMException?: typeof DOMException }).DOMException =
      globals.DOMException;
  }
};

describe("installPolyfills", () => {
  let originalGlobals: GlobalAbort;
  let originalArrayFromAsync: PropertyDescriptor | undefined;
  let originalPromiseWithResolvers: PropertyDescriptor | undefined;
  let originalPromiseTry: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalGlobals = {
      AbortController: AbortController,
      AbortSignal: AbortSignal,
      DOMException: DOMException,
    };

    originalArrayFromAsync = Object.getOwnPropertyDescriptor(
      Array,
      "fromAsync",
    );
    originalPromiseWithResolvers = Object.getOwnPropertyDescriptor(
      Promise,
      "withResolvers",
    );
    originalPromiseTry = Object.getOwnPropertyDescriptor(Promise, "try");
  });

  afterEach(() => {
    setAbortGlobals(originalGlobals);

    if (originalArrayFromAsync === undefined) {
      delete (Array as ArrayConstructorWithFromAsync).fromAsync;
    } else {
      Object.defineProperty(Array, "fromAsync", originalArrayFromAsync);
    }

    if (originalPromiseWithResolvers === undefined) {
      delete (Promise as PromiseStatics).withResolvers;
    } else {
      Object.defineProperty(
        Promise,
        "withResolvers",
        originalPromiseWithResolvers,
      );
    }

    if (originalPromiseTry === undefined) {
      delete (Promise as PromiseStatics).try;
    } else {
      Object.defineProperty(Promise, "try", originalPromiseTry);
    }
  });

  it("polyfills Array.fromAsync", async () => {
    delete (Array as ArrayConstructorWithFromAsync).fromAsync;

    installPolyfills();

    assertEqual(await Array.fromAsync(new Set([1, 2, 3])), [1, 2, 3]);
  });

  it("polyfills Promise.withResolvers", async () => {
    delete (Promise as PromiseStatics).withResolvers;

    installPolyfills();

    const PromiseStatic = Promise as PromiseStatics;
    assertEqual(typeof PromiseStatic.withResolvers, "function");

    const { promise, resolve } = PromiseStatic.withResolvers!();
    resolve("ok");

    assertEqual(await promise, "ok");
  });

  it("polyfills Promise.try and forwards arguments", async () => {
    delete (Promise as PromiseStatics).try;

    installPolyfills();

    const PromiseStatic = Promise as PromiseStatics;
    assertEqual(typeof PromiseStatic.try, "function");

    const result = await PromiseStatic.try!(
      (a, b) => `${String(a)}-${String(b)}`,
      "a",
      1,
    );
    assertEqual(result, "a-1");
  });

  it("Promise.try rejects when callback throws", async () => {
    delete (Promise as PromiseStatics).try;

    installPolyfills();

    const PromiseStatic = Promise as PromiseStatics;
    const error = new Error("boom");

    await assertRejectsSame(
      PromiseStatic.try!(() => {
        throw error;
      }),
      error,
    );
  });

  it("does not override existing Promise static methods", () => {
    const withResolvers = () => {
      const promise = Promise.resolve("existing");
      return {
        promise,
        resolve: () => undefined,
        reject: () => undefined,
      };
    };
    const promiseTry = () => Promise.resolve("existing");

    (Promise as PromiseStatics).withResolvers = withResolvers;
    (Promise as PromiseStatics).try = promiseTry;

    installPolyfills();

    const PromiseStatic = Promise as PromiseStatics;
    assertSame(PromiseStatic.withResolvers, withResolvers);
    assertSame(PromiseStatic.try, promiseTry);
  });

  it("polyfills reason propagation", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    installPolyfills();

    const controller = new AbortController();
    const reason = new Error("stop");
    controller.abort(reason);

    assertSame(
      (controller.signal as { readonly reason: unknown }).reason,
      reason,
    );
  });

  it("creates AbortError reason when none is provided", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: undefined });

    installPolyfills();

    const controller = new AbortController();
    controller.abort();

    const reason = (controller.signal as { readonly reason: Error }).reason;
    assertEqual(reason.name, "AbortError");
    assertEqual(reason.message, "This operation was aborted");
  });

  it("polyfills AbortSignal.throwIfAborted", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    installPolyfills();

    const controller = new AbortController();
    controller.signal.throwIfAborted();

    const reason = new Error("stop");
    controller.abort(reason);

    let thrown: unknown;
    try {
      controller.signal.throwIfAborted();
    } catch (error) {
      thrown = error;
    }

    assertSame(thrown, reason);
  });

  it("does not override AbortSignal.throwIfAborted", () => {
    const runtime = createFakeAbortRuntime();
    let called = false;
    const throwIfAborted = () => {
      called = true;
    };
    Object.defineProperty(runtime.AbortSignal.prototype, "throwIfAborted", {
      value: throwIfAborted,
    });
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    installPolyfills();

    new AbortController().signal.throwIfAborted();

    assertTrue(called);
  });

  it("polyfills AbortSignal.abort", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    installPolyfills();

    const signal = (
      AbortSignal as typeof AbortSignal & {
        abort: (reason?: unknown) => AbortSignal;
      }
    ).abort("manual");

    assertTrue(signal.aborted);
    assertEqual((signal as { readonly reason: unknown }).reason, "manual");
  });

  it("polyfills AbortSignal.timeout without DOMException", async () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: undefined });

    installPolyfills();

    const signal = (
      AbortSignal as typeof AbortSignal & {
        timeout: (milliseconds: number) => AbortSignal;
      }
    ).timeout(1);

    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });

    const reason = (signal as { readonly reason: Error }).reason;
    assertTrue(signal.aborted);
    assertEqual(reason.name, "TimeoutError");
  });

  it("polyfills AbortSignal.any with first aborted reason", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    installPolyfills();

    const controller1 = new AbortController();
    const controller2 = new AbortController();
    const signal = (
      AbortSignal as typeof AbortSignal & {
        any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
      }
    ).any([controller1.signal, controller2.signal]);

    const reason = new Error("cancelled");
    controller2.abort(reason);

    assertTrue(signal.aborted);
    assertSame((signal as { readonly reason: unknown }).reason, reason);
  });

  it("is idempotent and does not re-patch abort", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    installPolyfills();
    installPolyfills();

    const controller = new AbortController();
    controller.abort(new Error("stop"));

    assertEqual(runtime.getAbortCallCount(), 1);
  });

  it("does not override existing AbortSignal static methods", () => {
    const runtime = createFakeAbortRuntime();
    const abort = () => ({ aborted: true }) as AbortSignal;
    const timeout = () => ({ aborted: false }) as AbortSignal;
    const any = () => ({ aborted: false }) as AbortSignal;

    Object.assign(runtime.AbortSignal, { abort, timeout, any });
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    installPolyfills();

    const AbortSignalStatic = AbortSignal as typeof AbortSignal & {
      abort: typeof abort;
      timeout: typeof timeout;
      any: typeof any;
    };

    const descriptors = Object.getOwnPropertyDescriptors(AbortSignalStatic);
    assertSame(descriptors.abort.value, abort);
    assertSame(descriptors.timeout.value, timeout);
    assertSame(descriptors.any.value, any);
  });

  it("AbortSignal.any handles empty input", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    installPolyfills();

    const signal = (
      AbortSignal as typeof AbortSignal & {
        any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
      }
    ).any([]);

    assertFalse(signal.aborted);
  });

  it("AbortSignal.any dedupes duplicate source signals", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    installPolyfills();

    const sourceController = new AbortController();
    const sourceSignal = sourceController.signal as unknown as FakeAbortSignal;

    const signal = (
      AbortSignal as typeof AbortSignal & {
        any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
      }
    ).any([
      sourceController.signal,
      sourceController.signal,
      sourceController.signal,
    ]);

    assertTrue(sourceSignal.getListenerCount() <= 1);

    const reason = new Error("duplicate-source");
    sourceController.abort(reason);

    assertTrue(signal.aborted);
    assertSame((signal as { readonly reason: unknown }).reason, reason);
  });

  it("AbortSignal.any uses first already-aborted signal in input order", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    installPolyfills();

    const firstController = new AbortController();
    const secondController = new AbortController();

    const firstReason = new Error("first");
    const secondReason = new Error("second");
    firstController.abort(firstReason);
    secondController.abort(secondReason);

    const signal = (
      AbortSignal as typeof AbortSignal & {
        any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
      }
    ).any([firstController.signal, secondController.signal]);

    assertTrue(signal.aborted);
    assertSame((signal as { readonly reason: unknown }).reason, firstReason);
  });

  it("AbortSignal.any uses AbortError when aborted signal has no reason", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: undefined });

    installPolyfills();

    const signalWithoutReason = {
      aborted: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as AbortSignal;

    const signal = (
      AbortSignal as typeof AbortSignal & {
        any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
      }
    ).any([signalWithoutReason]);

    const reason = (signal as { readonly reason: Error }).reason;
    assertEqual(reason.name, "AbortError");
  });

  it("falls back to Error when DOMException constructor throws", async () => {
    const runtime = createFakeAbortRuntime();
    const throwingDomException = function () {
      throw new Error("broken DOMException");
    } as unknown as typeof DOMException;

    setAbortGlobals({ ...runtime, DOMException: throwingDomException });

    installPolyfills();

    const signal = (
      AbortSignal as typeof AbortSignal & {
        timeout: (milliseconds: number) => AbortSignal;
      }
    ).timeout(1);

    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });

    const reason = (signal as { readonly reason: Error }).reason;
    assertInstanceOf(reason, Error);
    assertEqual(reason.name, "TimeoutError");
  });

  it("AbortSignal.any does not add unbounded listeners to a long-lived source", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    installPolyfills();

    const sourceController = new AbortController();
    const sourceSignal = sourceController.signal as unknown as FakeAbortSignal;

    const AbortSignalStatic = AbortSignal as typeof AbortSignal & {
      any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
    };

    for (let i = 0; i < 100; i += 1) {
      AbortSignalStatic.any([sourceController.signal]);
    }

    assertTrue(sourceSignal.getListenerCount() <= 1);
  });

  it("AbortSignal.any tolerates stale aborted references", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    const originalWeakRef = WeakRef;
    let callCount = 0;

    (globalThis as { WeakRef?: unknown }).WeakRef = function (
      this: unknown,
      controller: AbortController,
    ) {
      const preAbortedController = new AbortController();
      preAbortedController.abort("already-done");

      return {
        deref: () => {
          callCount += 1;
          return callCount === 1 ? controller : preAbortedController;
        },
      };
    };

    try {
      installPolyfills();

      const sourceController = new AbortController();
      (
        AbortSignal as typeof AbortSignal & {
          any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
        }
      ).any([sourceController.signal]);

      sourceController.abort("ignored");
    } finally {
      (globalThis as { WeakRef?: unknown }).WeakRef = originalWeakRef;
    }
  });

  it("AbortSignal.any tolerates cleared weak refs", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: DOMException });

    const originalWeakRef = WeakRef;

    let callCount = 0;

    (globalThis as { WeakRef?: unknown }).WeakRef = function (
      this: unknown,
      controller: AbortController,
    ) {
      return {
        deref: () => {
          callCount += 1;
          return callCount === 1 ? controller : undefined;
        },
      };
    };

    try {
      installPolyfills();

      const sourceController = new AbortController();
      (
        AbortSignal as typeof AbortSignal & {
          any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
        }
      ).any([sourceController.signal]);

      sourceController.abort("ignored");
    } finally {
      (globalThis as { WeakRef?: unknown }).WeakRef = originalWeakRef;
    }
  });
});
