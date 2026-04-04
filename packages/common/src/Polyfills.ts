/**
 * Polyfills.
 *
 * @module
 */

/**
 * Installs polyfills required by `@evolu/common`.
 *
 * Installs:
 *
 * - Resource-management polyfills (`Symbol.dispose`, `Symbol.asyncDispose`,
 *   `DisposableStack`, `AsyncDisposableStack`, and `SuppressedError`) for
 *   Safari and React Native
 * - `Map` and `WeakMap` upsert polyfills (`Map.prototype.getOrInsert`,
 *   `Map.prototype.getOrInsertComputed`, `WeakMap.prototype.getOrInsert`, and
 *   `WeakMap.prototype.getOrInsertComputed`) for Node 24 and React Native
 *
 * `@evolu/react-native` has its own `Polyfills` module and its
 * `installPolyfills` calls this function first, then installs React Native
 * specific polyfills.
 *
 * Call this explicitly from the app entry point.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management
 * @see https://github.com/es-shims/DisposableStack
 * @see https://github.com/es-shims/DisposableStack/issues/9
 */
export const installPolyfills = (): void => {
  /**
   * This module intentionally owns `DisposableStack` and `AsyncDisposableStack`
   * polyfills instead of depending on `es-shims/DisposableStack` at runtime.
   *
   * Evolu originally used the upstream package, but WebKit hit a known async
   * disposal completion bug (`completion["?"]` crash, see issue #9). The local
   * implementation applies the fix and keeps behavior deterministic across
   * runtimes used by Evolu.
   *
   * Conformance is validated by tests that combine upstream-style and test262
   * parity cases with Evolu-specific regressions. Those tests run against
   * native Node.js behavior and against this polyfill path in browser projects,
   * including WebKit.
   */
  installDisposableStack();
  installMapAndWeakMapUpsertPolyfills();
};

interface DisposableResource {
  readonly dispose: () => void;
}

interface AsyncDisposableResource {
  readonly dispose: () => Promise<void>;
}

/** Installs `DisposableStack`-related polyfills missing from the runtime. */
const installDisposableStack = (): void => {
  installSuppressedError();

  const symbolDispose = getOrInstallSymbol("dispose", "Symbol.dispose");
  const symbolAsyncDispose = getOrInstallSymbol(
    "asyncDispose",
    "Symbol.asyncDispose",
  );

  if (typeof globalThis.DisposableStack !== "function") {
    defineGlobalValue(
      globalThis,
      "DisposableStack",
      createDisposableStackPolyfill(symbolDispose),
    );
  }

  if (typeof globalThis.AsyncDisposableStack !== "function") {
    defineGlobalValue(
      globalThis,
      "AsyncDisposableStack",
      createAsyncDisposableStackPolyfill(symbolDispose, symbolAsyncDispose),
    );
  }
};

type SymbolWithDisposable = SymbolConstructor & {
  dispose?: symbol;
  asyncDispose?: symbol;
};

const suppressedErrorMessage = "An error was suppressed during disposal.";

const disposedMessage = (className: string, method: string): string =>
  `Cannot call ${className}.prototype.${method} on an already-disposed DisposableStack`;

const defineGlobalValue = (
  target: object,
  key: PropertyKey,
  value: unknown,
): void => {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: false,
    writable: true,
    value,
  });
};

const defineMethodAlias = (
  target: object,
  alias: symbol,
  methodName: string,
): void => {
  defineGlobalValue(
    target,
    alias,
    Object.getOwnPropertyDescriptor(target, methodName)?.value,
  );
};

const throwIfDisposed = (disposed: boolean, message: string): void => {
  if (disposed) {
    throw new ReferenceError(message);
  }
};

const appendDisposeError = (
  currentError: unknown,
  previousError: unknown,
): unknown =>
  new globalThis.SuppressedError(
    currentError,
    previousError,
    suppressedErrorMessage,
  );

const assertObjectOrFunction = (value: unknown): object => {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    throw new TypeError("Disposable value must be an object or function.");
  }

  return value;
};

const getMethod = (
  value: object,
  key: symbol,
): ((this: unknown) => unknown) | undefined => {
  const method = (value as Record<symbol, unknown>)[key];
  if (method === undefined) return undefined;
  if (typeof method !== "function") {
    throw new TypeError("Disposable method must be a function.");
  }
  return method as (this: unknown) => unknown;
};

const getOrInstallSymbol = (
  key: "dispose" | "asyncDispose",
  description: string,
): symbol => {
  const SymbolCtor = globalThis.Symbol as SymbolWithDisposable;
  const installedValue = Object.getOwnPropertyDescriptor(SymbolCtor, key)
    ?.value as unknown;
  const installed =
    typeof installedValue === "symbol" ? installedValue : undefined;
  if (installed != null) return installed;

  const symbol = Symbol(description);
  Object.defineProperty(SymbolCtor, key, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: symbol,
  });
  return symbol;
};

const installSuppressedError = (): void => {
  if (typeof globalThis.SuppressedError === "function") return;

  class SuppressedErrorPolyfill
    extends Error
    implements globalThis.SuppressedError
  {
    readonly error: unknown;
    readonly suppressed: unknown;

    constructor(error: unknown, suppressed: unknown, message?: string) {
      super(message ?? suppressedErrorMessage);
      this.name = "SuppressedError";
      this.error = error;
      this.suppressed = suppressed;
    }
  }

  defineGlobalValue(globalThis, "SuppressedError", SuppressedErrorPolyfill);
};

const createDisposableStackPolyfill = (
  symbolDispose: symbol,
): new () => DisposableStack => {
  class DisposableStackPolyfill implements DisposableStack {
    #disposed = false;
    #resources: Array<DisposableResource> = [];

    declare readonly [Symbol.toStringTag]: "DisposableStack";
    declare [Symbol.dispose]: () => void;

    get disposed(): boolean {
      return this.#disposed;
    }

    use<T extends object | null | undefined>(value: T): T {
      throwIfDisposed(
        this.#disposed,
        disposedMessage("DisposableStack", "use"),
      );
      if (value == null) return value;

      const target = assertObjectOrFunction(value);
      const method = getMethod(target, symbolDispose);
      if (method == null) {
        throw new TypeError("Resource does not implement Symbol.dispose.");
      }

      this.#resources.push({
        dispose: () => {
          method.call(target);
        },
      });

      return value;
    }

    adopt<T>(value: T, onDispose: (value: T) => void): T {
      throwIfDisposed(
        this.#disposed,
        disposedMessage("DisposableStack", "adopt"),
      );
      if (typeof onDispose !== "function") {
        throw new TypeError("onDispose must be a function.");
      }

      this.#resources.push({
        dispose: () => {
          onDispose(value);
        },
      });

      return value;
    }

    defer(onDispose: () => void): void {
      throwIfDisposed(
        this.#disposed,
        disposedMessage("DisposableStack", "defer"),
      );
      if (typeof onDispose !== "function") {
        throw new TypeError("onDispose must be a function.");
      }

      this.#resources.push({
        dispose: () => {
          onDispose();
        },
      });
    }

    move(): DisposableStack {
      throwIfDisposed(
        this.#disposed,
        disposedMessage("DisposableStack", "move"),
      );

      const moved = new DisposableStackPolyfill();
      moved.#resources = this.#resources;

      this.#resources = [];
      this.#disposed = true;

      return moved;
    }

    dispose(): void {
      if (this.#disposed) return;

      this.#disposed = true;
      const resources = this.#resources;
      this.#resources = [];

      let completionError: unknown = undefined;
      let hasCompletionError = false;

      for (let i = resources.length - 1; i >= 0; i--) {
        try {
          resources[i].dispose();
        } catch (error) {
          completionError = hasCompletionError
            ? appendDisposeError(error, completionError)
            : error;
          hasCompletionError = true;
        }
      }

      if (hasCompletionError) {
        throw completionError;
      }
    }
  }

  defineMethodAlias(
    DisposableStackPolyfill.prototype,
    symbolDispose,
    "dispose",
  );

  Object.defineProperty(DisposableStackPolyfill.prototype, Symbol.toStringTag, {
    configurable: true,
    enumerable: false,
    writable: false,
    value: "DisposableStack",
  });

  return DisposableStackPolyfill;
};

const createAsyncDisposableStackPolyfill = (
  symbolDispose: symbol,
  symbolAsyncDispose: symbol,
): new () => AsyncDisposableStack => {
  class AsyncDisposableStackPolyfill implements AsyncDisposableStack {
    #disposed = false;
    #resources: Array<AsyncDisposableResource> = [];

    declare readonly [Symbol.toStringTag]: "AsyncDisposableStack";
    declare [Symbol.asyncDispose]: () => Promise<void>;

    get disposed(): boolean {
      return this.#disposed;
    }

    use<T extends object | null | undefined>(value: T): T {
      throwIfDisposed(
        this.#disposed,
        disposedMessage("AsyncDisposableStack", "use"),
      );
      if (value == null) return value;

      const target = assertObjectOrFunction(value);
      const asyncMethod = getMethod(target, symbolAsyncDispose);

      if (asyncMethod != null) {
        this.#resources.push({
          dispose: async () => {
            await asyncMethod.call(target);
          },
        });
        return value;
      }

      const syncMethod = getMethod(target, symbolDispose);

      if (syncMethod != null) {
        this.#resources.push({
          dispose: () =>
            Promise.resolve().then(() => {
              syncMethod.call(target);
            }),
        });
        return value;
      }

      throw new TypeError(
        "Resource does not implement Symbol.asyncDispose or Symbol.dispose.",
      );
    }

    adopt<T>(value: T, onDisposeAsync: (value: T) => void | Promise<void>): T {
      throwIfDisposed(
        this.#disposed,
        disposedMessage("AsyncDisposableStack", "adopt"),
      );
      if (typeof onDisposeAsync !== "function") {
        throw new TypeError("onDisposeAsync must be a function.");
      }

      this.#resources.push({
        dispose: () => Promise.resolve().then(() => onDisposeAsync(value)),
      });

      return value;
    }

    defer(onDisposeAsync: () => void | Promise<void>): void {
      throwIfDisposed(
        this.#disposed,
        disposedMessage("AsyncDisposableStack", "defer"),
      );
      if (typeof onDisposeAsync !== "function") {
        throw new TypeError("onDisposeAsync must be a function.");
      }

      this.#resources.push({
        dispose: () => Promise.resolve().then(() => onDisposeAsync()),
      });
    }

    move(): AsyncDisposableStack {
      throwIfDisposed(
        this.#disposed,
        disposedMessage("AsyncDisposableStack", "move"),
      );

      const moved = new AsyncDisposableStackPolyfill();
      moved.#resources = this.#resources;

      this.#resources = [];
      this.#disposed = true;

      return moved;
    }

    async disposeAsync(): Promise<void> {
      if (this.#disposed) return;

      this.#disposed = true;
      const resources = this.#resources;
      this.#resources = [];

      let completionError: unknown = undefined;
      let hasCompletionError = false;

      for (let i = resources.length - 1; i >= 0; i--) {
        try {
          await resources[i].dispose();
        } catch (error) {
          completionError = hasCompletionError
            ? appendDisposeError(error, completionError)
            : error;
          hasCompletionError = true;
        }
      }

      if (hasCompletionError) {
        throw completionError;
      }
    }
  }

  defineMethodAlias(
    AsyncDisposableStackPolyfill.prototype,
    symbolAsyncDispose,
    "disposeAsync",
  );

  Object.defineProperty(
    AsyncDisposableStackPolyfill.prototype,
    Symbol.toStringTag,
    {
      configurable: true,
      enumerable: false,
      writable: false,
      value: "AsyncDisposableStack",
    },
  );

  return AsyncDisposableStackPolyfill;
};

/** Installs `Map` and `WeakMap` upsert polyfills missing from the runtime. */
const installMapAndWeakMapUpsertPolyfills = (): void => {
  const getOrInsert: typeof Map.prototype.getOrInsert = function (
    this: Map<unknown, unknown> | WeakMap<object, unknown>,
    key: unknown,
    defaultValue: unknown,
  ): unknown {
    if (!this.has(key as never)) {
      this.set(key as never, defaultValue);
    }

    return this.get(key as never);
  };

  const getOrInsertComputed: typeof Map.prototype.getOrInsertComputed =
    function (
      this: Map<unknown, unknown> | WeakMap<object, unknown>,
      key: unknown,
      callbackFunction: (key: unknown) => unknown,
    ): unknown {
      if (!this.has(key as never)) {
        this.set(key as never, callbackFunction(key));
      }

      return this.get(key as never);
    };

  if (typeof Map.prototype.getOrInsert !== "function") {
    defineGlobalValue(Map.prototype, "getOrInsert", getOrInsert);
  }

  if (typeof Map.prototype.getOrInsertComputed !== "function") {
    defineGlobalValue(
      Map.prototype,
      "getOrInsertComputed",
      getOrInsertComputed,
    );
  }

  if (typeof WeakMap.prototype.getOrInsert !== "function") {
    defineGlobalValue(WeakMap.prototype, "getOrInsert", getOrInsert);
  }

  if (typeof WeakMap.prototype.getOrInsertComputed !== "function") {
    defineGlobalValue(
      WeakMap.prototype,
      "getOrInsertComputed",
      getOrInsertComputed,
    );
  }
};
