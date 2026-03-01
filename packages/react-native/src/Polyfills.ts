import { installPolyfills as installCommonPolyfills } from "@evolu/common/polyfills";
import difference from "set.prototype.difference";
import intersection from "set.prototype.intersection";
import isDisjointFrom from "set.prototype.isdisjointfrom";
import isSubsetOf from "set.prototype.issubsetof";
import isSupersetOf from "set.prototype.issupersetof";
import symmetricDifference from "set.prototype.symmetricdifference";
import union from "set.prototype.union";

difference.shim();
intersection.shim();
isDisjointFrom.shim();
isSubsetOf.shim();
isSupersetOf.shim();
symmetricDifference.shim();
union.shim();

/** Installs polyfills required by Evolu in React Native runtimes. */
export const installPolyfills = (): void => {
  installCommonPolyfills();
  installPromisePolyfills();
  installAbortControllerPolyfills();
};

const installPromisePolyfills = () => {
  // @see https://github.com/facebook/hermes/pull/1452
  if (typeof Promise.withResolvers !== "function") {
    // @ts-expect-error This is OK.
    Promise.withResolvers = () => {
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  // @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/try
  if (typeof Promise.try !== "function") {
    // @ts-expect-error This is OK.
    Promise.try = (
      func: (...args: ReadonlyArray<unknown>) => unknown,
      ...args: ReadonlyArray<unknown>
    ): Promise<unknown> =>
      new Promise((resolve, reject) => {
        try {
          resolve(func(...args));
        } catch (error) {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error);
        }
      });
  }
};

interface AbortControllerConstructor {
  new (): AbortController;
  readonly prototype: AbortController;
}

interface AbortSignalConstructor {
  readonly prototype: AbortSignal;
  abort?: (reason?: unknown) => AbortSignal;
  timeout?: (milliseconds: number) => AbortSignal;
  any?: (signals: Array<AbortSignal>) => AbortSignal;
}

interface AbortControllerPrototype extends AbortController {
  abort: (reason?: unknown) => void;
  readonly __evoluAbortReasonPatched?: true;
}

interface AbortSignalWithReason extends AbortSignal {
  readonly reason: unknown;
}

interface AnyControllersRegistry {
  readonly add: (controller: AbortController) => void;
  readonly remove: (controller: AbortController) => void;
}

interface WeakRefLike<T extends object> {
  deref(): T | undefined;
}

type ControllerRef = WeakRefLike<AbortController>;

const abortReasonBySignal = new WeakMap<AbortSignal, unknown>();
const anyControllersBySignal = new WeakMap<
  AbortSignal,
  AnyControllersRegistry
>();

const installAbortControllerPolyfills = (): void => {
  installAbortReasonPolyfill(
    globalThis.AbortController as AbortControllerConstructor,
    globalThis.AbortSignal as AbortSignalConstructor,
  );
  installAbortSignalStaticMethods(
    globalThis.AbortController as AbortControllerConstructor,
    globalThis.AbortSignal as AbortSignalConstructor,
  );
};

const installAbortReasonPolyfill = (
  abortController: AbortControllerConstructor,
  abortSignal: AbortSignalConstructor,
): void => {
  if (!("reason" in abortSignal.prototype)) {
    Object.defineProperty(abortSignal.prototype, "reason", {
      configurable: true,
      enumerable: false,
      get(this: AbortSignal): unknown {
        return abortReasonBySignal.get(this);
      },
    });
  }

  const prototype = abortController.prototype as AbortControllerPrototype;
  if (prototype.__evoluAbortReasonPatched) return;

  const nativeAbort = prototype.abort;
  prototype.abort = function (this: AbortController, reason?: unknown): void {
    const normalizedReason = reason === undefined ? createAbortError() : reason;
    abortReasonBySignal.set(this.signal, normalizedReason);
    nativeAbort.call(this, normalizedReason);
  };

  Object.defineProperty(prototype, "__evoluAbortReasonPatched", {
    value: true,
    configurable: true,
    enumerable: false,
    writable: false,
  });
};

const installAbortSignalStaticMethods = (
  abortController: AbortControllerConstructor,
  abortSignal: AbortSignalConstructor,
): void => {
  if (typeof abortSignal.abort !== "function") {
    Object.defineProperty(abortSignal, "abort", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: (reason?: unknown): AbortSignal => {
        const controller = new abortController();
        controller.abort(reason);
        return controller.signal;
      },
    });
  }

  if (typeof abortSignal.timeout !== "function") {
    Object.defineProperty(abortSignal, "timeout", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: (milliseconds: number): AbortSignal => {
        const controller = new abortController();
        const timeoutId = globalThis.setTimeout(() => {
          controller.abort(createTimeoutError(milliseconds));
        }, milliseconds);

        controller.signal.addEventListener(
          "abort",
          () => {
            globalThis.clearTimeout(timeoutId);
          },
          { once: true },
        );

        return controller.signal;
      },
    });
  }

  if (typeof abortSignal.any !== "function") {
    Object.defineProperty(abortSignal, "any", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: (signals: ReadonlyArray<AbortSignal>): AbortSignal =>
        createAbortSignalAny(abortController, signals),
    });
  }
};

const createAbortSignalAny = (
  abortController: AbortControllerConstructor,
  signals: ReadonlyArray<AbortSignal>,
): AbortSignal => {
  const controller = new abortController();
  if (signals.length === 0) return controller.signal;

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(readSignalReason(signal));
      return controller.signal;
    }
  }

  const sources = Array.from(new Set(signals));

  for (const signal of sources) {
    const registry =
      anyControllersBySignal.get(signal) ??
      createAnyControllersRegistry(signal);
    anyControllersBySignal.set(signal, registry);
    registry.add(controller);
  }

  controller.signal.addEventListener(
    "abort",
    () => {
      for (const signal of sources) {
        anyControllersBySignal.get(signal)?.remove(controller);
      }
    },
    { once: true },
  );

  return controller.signal;
};

const createAnyControllersRegistry = (
  sourceSignal: AbortSignal,
): AnyControllersRegistry => {
  let refs: Array<ControllerRef> = [];

  const cleanup = (): void => {
    refs = refs.filter((ref) => {
      const controller = ref.deref();
      return controller != null && !controller.signal.aborted;
    });

    if (refs.length === 0) {
      sourceSignal.removeEventListener("abort", onAbort);
      anyControllersBySignal.delete(sourceSignal);
    }
  };

  const onAbort = (): void => {
    const reason = readSignalReason(sourceSignal);

    for (const ref of refs) {
      const controller = ref.deref();
      if (!controller || controller.signal.aborted) continue;
      controller.abort(reason);
    }

    refs = [];
    sourceSignal.removeEventListener("abort", onAbort);
    anyControllersBySignal.delete(sourceSignal);
  };

  sourceSignal.addEventListener("abort", onAbort, { once: true });

  return {
    add: (controller) => {
      refs.push(new globalThis.WeakRef(controller));
      cleanup();
    },
    remove: (controller) => {
      refs = refs.filter((ref) => {
        const candidate = ref.deref();
        return candidate != null && candidate !== controller;
      });
      cleanup();
    },
  };
};

const readSignalReason = (signal: AbortSignal): unknown => {
  if ("reason" in signal) {
    return (signal as AbortSignalWithReason).reason;
  }
  return createAbortError();
};

const createTimeoutError = (milliseconds: number): Error =>
  createNamedError("TimeoutError", `signal timed out after ${milliseconds} ms`);

const createAbortError = (): Error =>
  createNamedError("AbortError", "This operation was aborted");

const createNamedError = (name: string, message: string): Error => {
  if (typeof globalThis.DOMException === "function") {
    try {
      return new globalThis.DOMException(message, name);
    } catch {
      // Some runtimes expose DOMException but cannot construct it reliably.
    }
  }

  const error = new Error(message) as Error & { name: string };
  error.name = name;
  return error;
};
