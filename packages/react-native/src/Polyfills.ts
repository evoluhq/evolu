/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { installPolyfills as installCommonPolyfills } from "@evolu/common/polyfills";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
import fromAsync from "array-from-async";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
import withResolvers from "promise.withresolvers";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
import promiseTry from "promise.try";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
import toSorted from "array.prototype.tosorted";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
import difference from "set.prototype.difference";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
import intersection from "set.prototype.intersection";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
import isDisjointFrom from "set.prototype.isdisjointfrom";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
import isSubsetOf from "set.prototype.issubsetof";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
import isSupersetOf from "set.prototype.issupersetof";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
import symmetricDifference from "set.prototype.symmetricdifference";
// @ts-expect-error Runtime polyfill package has no TypeScript declarations.
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
  installArrayPolyfills();
  installPromisePolyfills();
  installAbortControllerPolyfills();
};

const installArrayPolyfills = (): void => {
  if (typeof Array.fromAsync !== "function") {
    Object.defineProperty(Array, "fromAsync", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: fromAsync as typeof Array.fromAsync,
    });
  }

  toSorted.shim();
};

const installPromisePolyfills = () => {
  withResolvers.shim();
  promiseTry.shim();
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
    globalThis.AbortController,
    globalThis.AbortSignal,
  );
  installAbortSignalStaticMethods(
    globalThis.AbortController,
    globalThis.AbortSignal,
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
    return signal.reason;
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
