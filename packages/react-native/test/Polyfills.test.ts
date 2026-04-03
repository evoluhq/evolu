import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { installPolyfills } from "../src/Polyfills.js";

interface GlobalAbort {
  readonly AbortController: typeof globalThis.AbortController | undefined;
  readonly AbortSignal: typeof globalThis.AbortSignal | undefined;
  readonly DOMException: typeof globalThis.DOMException | undefined;
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
    AbortController: TestAbortController as unknown as typeof AbortController,
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
  let originalPromiseWithResolvers: PropertyDescriptor | undefined;
  let originalPromiseTry: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalGlobals = {
      AbortController: globalThis.AbortController,
      AbortSignal: globalThis.AbortSignal,
      DOMException: globalThis.DOMException,
    };

    originalPromiseWithResolvers = Object.getOwnPropertyDescriptor(
      Promise,
      "withResolvers",
    );
    originalPromiseTry = Object.getOwnPropertyDescriptor(Promise, "try");
  });

  afterEach(() => {
    setAbortGlobals(originalGlobals);

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

  test("polyfills Promise.withResolvers", async () => {
    delete (Promise as PromiseStatics).withResolvers;

    installPolyfills();

    const PromiseStatic = Promise as PromiseStatics;
    expect(typeof PromiseStatic.withResolvers).toBe("function");

    const { promise, resolve } = PromiseStatic.withResolvers!();
    resolve("ok");

    await expect(promise).resolves.toBe("ok");
  });

  test("polyfills Promise.try and forwards arguments", async () => {
    delete (Promise as PromiseStatics).try;

    installPolyfills();

    const PromiseStatic = Promise as PromiseStatics;
    expect(typeof PromiseStatic.try).toBe("function");

    const result = await PromiseStatic.try!(
      (a, b) => `${String(a)}-${String(b)}`,
      "a",
      1,
    );
    expect(result).toBe("a-1");
  });

  test("Promise.try rejects when callback throws", async () => {
    delete (Promise as PromiseStatics).try;

    installPolyfills();

    const PromiseStatic = Promise as PromiseStatics;
    const error = new Error("boom");

    await expect(
      PromiseStatic.try!(() => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  test("does not override existing Promise static methods", () => {
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
    expect(PromiseStatic.withResolvers).toBe(withResolvers);
    expect(PromiseStatic.try).toBe(promiseTry);
  });

  test("polyfills reason propagation", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: globalThis.DOMException });

    installPolyfills();

    const controller = new globalThis.AbortController();
    const reason = new Error("stop");
    controller.abort(reason);

    expect((controller.signal as { readonly reason: unknown }).reason).toBe(
      reason,
    );
  });

  test("creates AbortError reason when none is provided", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: undefined });

    installPolyfills();

    const controller = new globalThis.AbortController();
    controller.abort();

    const reason = (controller.signal as { readonly reason: Error }).reason;
    expect(reason.name).toBe("AbortError");
    expect(reason.message).toBe("This operation was aborted");
  });

  test("polyfills AbortSignal.abort", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: globalThis.DOMException });

    installPolyfills();

    const signal = (
      globalThis.AbortSignal as typeof AbortSignal & {
        abort: (reason?: unknown) => AbortSignal;
      }
    ).abort("manual");

    expect(signal.aborted).toBe(true);
    expect((signal as { readonly reason: unknown }).reason).toBe("manual");
  });

  test("polyfills AbortSignal.timeout without DOMException", async () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: undefined });

    installPolyfills();

    const signal = (
      globalThis.AbortSignal as typeof AbortSignal & {
        timeout: (milliseconds: number) => AbortSignal;
      }
    ).timeout(1);

    await new Promise((resolve) => globalThis.setTimeout(resolve, 5));

    const reason = (signal as { readonly reason: Error }).reason;
    expect(signal.aborted).toBe(true);
    expect(reason.name).toBe("TimeoutError");
  });

  test("polyfills AbortSignal.any with first aborted reason", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: globalThis.DOMException });

    installPolyfills();

    const controller1 = new globalThis.AbortController();
    const controller2 = new globalThis.AbortController();
    const signal = (
      globalThis.AbortSignal as typeof AbortSignal & {
        any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
      }
    ).any([controller1.signal, controller2.signal]);

    const reason = new Error("cancelled");
    controller2.abort(reason);

    expect(signal.aborted).toBe(true);
    expect((signal as { readonly reason: unknown }).reason).toBe(reason);
  });

  test("is idempotent and does not re-patch abort", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: globalThis.DOMException });

    installPolyfills();
    installPolyfills();

    const controller = new globalThis.AbortController();
    controller.abort(new Error("stop"));

    expect(runtime.getAbortCallCount()).toBe(1);
  });

  test("does not override existing AbortSignal static methods", () => {
    const runtime = createFakeAbortRuntime();
    const abort = () => ({ aborted: true }) as AbortSignal;
    const timeout = () => ({ aborted: false }) as AbortSignal;
    const any = () => ({ aborted: false }) as AbortSignal;

    Object.assign(runtime.AbortSignal, { abort, timeout, any });
    setAbortGlobals({ ...runtime, DOMException: globalThis.DOMException });

    installPolyfills();

    const AbortSignalStatic = globalThis.AbortSignal as typeof AbortSignal & {
      abort: typeof abort;
      timeout: typeof timeout;
      any: typeof any;
    };

    expect(AbortSignalStatic.abort).toBe(abort);
    expect(AbortSignalStatic.timeout).toBe(timeout);
    expect(AbortSignalStatic.any).toBe(any);
  });

  test("AbortSignal.any handles empty input", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: globalThis.DOMException });

    installPolyfills();

    const signal = (
      globalThis.AbortSignal as typeof AbortSignal & {
        any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
      }
    ).any([]);

    expect(signal.aborted).toBe(false);
  });

  test("AbortSignal.any dedupes duplicate source signals", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: globalThis.DOMException });

    installPolyfills();

    const sourceController = new globalThis.AbortController();
    const sourceSignal = sourceController.signal as unknown as FakeAbortSignal;

    const signal = (
      globalThis.AbortSignal as typeof AbortSignal & {
        any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
      }
    ).any([
      sourceController.signal,
      sourceController.signal,
      sourceController.signal,
    ]);

    expect(sourceSignal.getListenerCount()).toBeLessThanOrEqual(1);

    const reason = new Error("duplicate-source");
    sourceController.abort(reason);

    expect(signal.aborted).toBe(true);
    expect((signal as { readonly reason: unknown }).reason).toBe(reason);
  });

  test("AbortSignal.any uses first already-aborted signal in input order", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: globalThis.DOMException });

    installPolyfills();

    const firstController = new globalThis.AbortController();
    const secondController = new globalThis.AbortController();

    const firstReason = new Error("first");
    const secondReason = new Error("second");
    firstController.abort(firstReason);
    secondController.abort(secondReason);

    const signal = (
      globalThis.AbortSignal as typeof AbortSignal & {
        any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
      }
    ).any([firstController.signal, secondController.signal]);

    expect(signal.aborted).toBe(true);
    expect((signal as { readonly reason: unknown }).reason).toBe(firstReason);
  });

  test("AbortSignal.any uses AbortError when aborted signal has no reason", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: undefined });

    installPolyfills();

    const signalWithoutReason = {
      aborted: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as AbortSignal;

    const signal = (
      globalThis.AbortSignal as typeof AbortSignal & {
        any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
      }
    ).any([signalWithoutReason]);

    const reason = (signal as { readonly reason: Error }).reason;
    expect(reason.name).toBe("AbortError");
  });

  test("falls back to Error when DOMException constructor throws", async () => {
    const runtime = createFakeAbortRuntime();
    const throwingDomException = function () {
      throw new Error("broken DOMException");
    } as unknown as typeof DOMException;

    setAbortGlobals({ ...runtime, DOMException: throwingDomException });

    installPolyfills();

    const signal = (
      globalThis.AbortSignal as typeof AbortSignal & {
        timeout: (milliseconds: number) => AbortSignal;
      }
    ).timeout(1);

    await new Promise((resolve) => globalThis.setTimeout(resolve, 5));

    const reason = (signal as { readonly reason: Error }).reason;
    expect(reason).toBeInstanceOf(Error);
    expect(reason.name).toBe("TimeoutError");
  });

  test("AbortSignal.any does not add unbounded listeners to a long-lived source", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: globalThis.DOMException });

    installPolyfills();

    const sourceController = new globalThis.AbortController();
    const sourceSignal = sourceController.signal as unknown as FakeAbortSignal;

    const AbortSignalStatic = globalThis.AbortSignal as typeof AbortSignal & {
      any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
    };

    for (let i = 0; i < 100; i += 1) {
      AbortSignalStatic.any([sourceController.signal]);
    }

    expect(sourceSignal.getListenerCount()).toBeLessThanOrEqual(1);
  });

  test("AbortSignal.any tolerates stale aborted references", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: globalThis.DOMException });

    const originalWeakRef = globalThis.WeakRef;
    let callCount = 0;

    (globalThis as { WeakRef?: unknown }).WeakRef = function (
      this: unknown,
      controller: AbortController,
    ) {
      const preAbortedController = new globalThis.AbortController();
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

      const sourceController = new globalThis.AbortController();
      (
        globalThis.AbortSignal as typeof AbortSignal & {
          any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
        }
      ).any([sourceController.signal]);

      expect(() => sourceController.abort("ignored")).not.toThrow();
    } finally {
      (globalThis as { WeakRef?: unknown }).WeakRef = originalWeakRef;
    }
  });

  test("AbortSignal.any tolerates cleared weak refs", () => {
    const runtime = createFakeAbortRuntime();
    setAbortGlobals({ ...runtime, DOMException: globalThis.DOMException });

    const originalWeakRef = globalThis.WeakRef;

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

      const sourceController = new globalThis.AbortController();
      (
        globalThis.AbortSignal as typeof AbortSignal & {
          any: (signals: ReadonlyArray<AbortSignal>) => AbortSignal;
        }
      ).any([sourceController.signal]);

      expect(() => sourceController.abort("ignored")).not.toThrow();
    } finally {
      (globalThis as { WeakRef?: unknown }).WeakRef = originalWeakRef;
    }
  });
});
