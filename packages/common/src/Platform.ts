/**
 * Platform runtime utilities and capability abstractions.
 *
 * @module
 */

/** Returns true if running in React Native with Hermes engine. */
export const isHermes = "HermesInternal" in globalThis;

/** Returns true if running in a server environment (no DOM). */
export const isServer = typeof document === "undefined";

/**
 * True outside production builds.
 *
 * Bundlers (webpack, Vite, esbuild, Metro) replace the text
 * `process.env.NODE_ENV` statically at build time, so in production bundles
 * this expression folds to `false` and code behind it is dead-code-eliminated —
 * the same mechanism React uses. The `typeof` guard makes the runtime read safe
 * where no bundler ran, such as un-bundled browser ESM, where it fails closed
 * to production behavior. Node.js reads it natively; React Native polyfills it.
 * A missing `NODE_ENV` counts as development, matching React semantics.
 */
export const isDev =
  typeof process === "undefined"
    ? false
    : process.env.NODE_ENV !== "production";

/**
 * Detects if Node.js Buffer is available and should be used.
 *
 * React Native apps often polyfill Node.js APIs like Buffer, but we want to use
 * native methods when available for better performance.
 *
 * Returns false in React Native even if Buffer is polyfilled, as we prefer
 * native methods in that environment.
 *
 * @see https://github.com/craftzdog/react-native-quick-base64#installation
 */
export const hasNodeBuffer =
  !isHermes && typeof globalThis.Buffer !== "undefined";

/**
 * FlushSync is for libraries like React to flush updates synchronously inside
 * the provided callback to ensure the DOM is updated immediately.
 *
 * For example, with React, when we want to focus on an element rendered as a
 * result of a mutation, Evolu ensures all DOM changes are flushed synchronously
 * if an onComplete callback is used.
 *
 * https://react.dev/reference/react-dom/flushSync
 */
export type FlushSync = (callback: () => void) => void;

export interface FlushSyncDep {
  readonly flushSync: FlushSync;
}

/**
 * Reload the app in a platform-specific way.
 *
 * Use this after purging persistent storage to clear in-memory state and ensure
 * the app starts fresh. It does not purge storage itself.
 *
 * - Web: Redirects to the specified URL (defaults to `/`)
 * - React Native: Restarts the app (URL ignored)
 */
export type ReloadApp = (url?: string) => void;

export interface ReloadAppDep {
  readonly reloadApp: ReloadApp;
}

export interface TestGlobalErrors extends Disposable {
  readonly errors: ReadonlyArray<unknown>;
  readonly next: () => Promise<unknown>;

  /**
   * Waits until every error already reported to the platform has been delivered
   * to this recorder, then returns {@link TestGlobalErrors.errors}.
   *
   * Platforms deliver global errors asynchronously and provide no hook for
   * "nothing was reported", so settle emits a sentinel of the same kind and
   * resolves when it arrives. Platform delivery is ordered, so all earlier
   * errors are recorded by then. Use it to assert absence: `expect(await
   * unhandledRejections.settle()).toEqual([])`.
   */
  readonly settle: () => Promise<ReadonlyArray<unknown>>;
}

/** Records platform global uncaught-error reporting until disposed. */
export const testGlobalUncaughtErrors = (): TestGlobalErrors =>
  createTestGlobalErrors("uncaughtErrors");

/** Records platform global unhandled-rejection reporting until disposed. */
export const testGlobalUnhandledRejections = (): TestGlobalErrors =>
  createTestGlobalErrors("unhandledRejection");

const settleSentinel = new Error("TestGlobalErrors.settle sentinel");

const createTestGlobalErrors = (
  kind: "uncaughtErrors" | "unhandledRejection",
): TestGlobalErrors => {
  const nodeEvent =
    kind === "uncaughtErrors" ? "uncaughtException" : "unhandledRejection";
  const webEvent = kind === "uncaughtErrors" ? "error" : "unhandledrejection";
  const webErrorKey = kind === "uncaughtErrors" ? "error" : "reason";
  const errorType =
    kind === "uncaughtErrors" ? "uncaught-error" : "unhandled-rejection";
  const disposableStack = new DisposableStack();
  const errors: Array<unknown> = [];
  const nextWaiters: Array<(error: unknown) => void> = [];
  const settleWaiters: Array<() => void> = [];
  let nextIndex = 0;

  const next = (): Promise<unknown> => {
    if (nextIndex < errors.length) {
      const error = errors[nextIndex];
      nextIndex += 1;
      return Promise.resolve(error);
    }

    const next = Promise.withResolvers<unknown>();
    nextWaiters.push(next.resolve);
    return next.promise;
  };

  const record = (error: unknown): void => {
    if (error === settleSentinel) {
      settleWaiters.shift()?.();
      return;
    }

    errors.push(error);
    const resolveNext = nextWaiters.shift();
    if (!resolveNext) return;

    nextIndex += 1;
    resolveNext(error);
  };

  const settle = (): Promise<ReadonlyArray<unknown>> => {
    const settled = Promise.withResolvers<ReadonlyArray<unknown>>();
    settleWaiters.push(() => {
      settled.resolve(errors);
    });

    if (kind === "unhandledRejection") {
      void Promise.reject(settleSentinel);
    } else {
      queueMicrotask(() => {
        throw settleSentinel;
      });
    }

    return settled.promise;
  };

  if (
    typeof process === "object" &&
    typeof process.on === "function" &&
    typeof process.off === "function"
  ) {
    process.on(nodeEvent, record);
    disposableStack.defer(() => {
      process.off(nodeEvent, record);
    });
  } else if (typeof globalThis.addEventListener === "function") {
    const listener = (event: unknown): void => {
      (event as Event).preventDefault();
      record((event as Record<typeof webErrorKey, unknown>)[webErrorKey]);
    };

    globalThis.addEventListener(webEvent, listener);
    disposableStack.defer(() => {
      globalThis.removeEventListener(webEvent, listener);
    });
  } else {
    throw new Error(`Unsupported platform global ${errorType} reporting.`);
  }

  return {
    errors,
    next,
    settle,
    [Symbol.dispose]: () => {
      nextWaiters.length = 0;
      settleWaiters.length = 0;
      disposableStack.dispose();
    },
  };
};
