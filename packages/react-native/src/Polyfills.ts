/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-member-access */

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
import { loadNativeSqlite } from "./sqlite/Loader.ts";

difference.shim();
intersection.shim();
isDisjointFrom.shim();
isSubsetOf.shim();
isSupersetOf.shim();
symmetricDifference.shim();
union.shim();

/**
 * Installs polyfills required by Evolu in React Native runtimes.
 *
 * It installs `crypto.getRandomValues` from the platform's CSPRNG through
 * Evolu's native module when the runtime lacks it, as React Native does, and
 * keeps one that another library installed.
 *
 * Call it in a module of its own that the app's entry file imports first, since
 * a file's imports run before its own code and `@evolu/common` reads randomness
 * when it's imported.
 */
export const installPolyfills = (): void => {
  installCommonPolyfills();
  installArrayPolyfills();
  installPromisePolyfills();
  installAbortControllerPolyfills();
  installGetRandomValuesPolyfill();
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

interface GetRandomValues {
  readonly getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
}

/** The typed arrays of integers, which Web Crypto's getRandomValues fills. */
const integerTypedArrays = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  BigInt64Array,
  BigUint64Array,
];

const installGetRandomValuesPolyfill = (): void => {
  const crypto = (globalThis.crypto as GetRandomValues | undefined) ?? {};
  if (typeof crypto.getRandomValues === "function") return;

  const nativeSqlite = loadNativeSqlite();
  Object.defineProperty(crypto, "getRandomValues", {
    configurable: true,
    enumerable: false,
    writable: true,
    // With Web Crypto's checks.
    value: <T extends ArrayBufferView | null>(array: T): T => {
      if (!integerTypedArrays.some((type) => array instanceof type))
        throw createNamedError(
          "TypeMismatchError",
          "The array must be an integer typed array.",
        );
      // An integer typed array is an ArrayBufferView.
      const { buffer, byteOffset, byteLength } = array as ArrayBufferView;
      if (byteLength > 65_536)
        throw createNamedError(
          "QuotaExceededError",
          "The array must have at most 65,536 bytes.",
        );
      nativeSqlite.fillRandom(new Uint8Array(buffer, byteOffset, byteLength));
      return array;
    },
  });
  if (globalThis.crypto !== crypto)
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: crypto,
    });
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

/* oxlint-disable evolu/no-unnecessary-global-this -- Patch the global object constructors even if realm lexical bindings shadow them. */
const installAbortControllerPolyfills = (): void => {
  installAbortReasonPolyfill(
    globalThis.AbortController,
    globalThis.AbortSignal,
  );
  installAbortSignalThrowIfAbortedPolyfill(globalThis.AbortSignal);
  installAbortSignalStaticMethods(
    globalThis.AbortController,
    globalThis.AbortSignal,
  );
};
/* oxlint-enable evolu/no-unnecessary-global-this */

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

const installAbortSignalThrowIfAbortedPolyfill = (
  abortSignal: AbortSignalConstructor,
): void => {
  if (typeof abortSignal.prototype.throwIfAborted === "function") return;

  Object.defineProperty(abortSignal.prototype, "throwIfAborted", {
    configurable: true,
    enumerable: false,
    writable: true,
    value(this: AbortSignal): void {
      if (this.aborted) throw this.reason;
    },
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
        // oxlint-disable-next-line evolu/no-unnecessary-global-this -- Use the global object timer even if a realm lexical binding shadows it.
        const timeoutId = globalThis.setTimeout(() => {
          controller.abort(createTimeoutError(milliseconds));
        }, milliseconds);

        controller.signal.addEventListener(
          "abort",
          () => {
            // oxlint-disable-next-line evolu/no-unnecessary-global-this -- Clear the timer through the same global object API used to create it.
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
      // oxlint-disable-next-line evolu/no-unnecessary-global-this -- Use the constructor on the global object even if a realm lexical binding shadows it.
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
      // oxlint-disable-next-line evolu/no-unnecessary-global-this -- Construct the same global object DOMException verified by the feature check.
      return new globalThis.DOMException(message, name);
    } catch {
      // Some runtimes expose DOMException but cannot construct it reliably.
    }
  }

  const error = new Error(message) as Error & { name: string };
  error.name = name;
  return error;
};
