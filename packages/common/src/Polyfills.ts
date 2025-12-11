/**
 * Evolu inlines polyfills instead of adding npm dependencies to minimize bundle
 * size and reduce supply chain risk.
 *
 * ## Resource Management
 *
 * Provides `Symbol.dispose`, `Symbol.asyncDispose`, `DisposableStack` and
 * `AsyncDisposableStack` for environments without native support (e.g., Safari
 * as of December 2024).
 *
 * Implementation is based on the es-shims reference implementation and follows
 * the ECMAScript specification. Code was ported with LLM assistance and
 * manually reviewed for correctness. Behavior is verified against 124 tests
 * that run against both native and polyfill implementations.
 *
 * Note: This implementation fixes
 * https://github.com/es-shims/DisposableStack/issues/9 (deferred functions are
 * all called even when one throws).
 *
 * @module
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Resource_management
 * @see https://github.com/es-shims/DisposableStack
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

interface DisposableResource {
  readonly value: unknown;
  readonly method: (() => void | PromiseLike<void>) | undefined;
}

interface StackState {
  state: "pending" | "disposed";
  stack: Array<DisposableResource>;
}

type DisposeMethod = () => void | PromiseLike<void>;

const getDisposeMethod = (
  value: unknown,
  async: boolean,
): DisposeMethod | undefined => {
  if (value == null) return undefined;
  if (typeof value !== "object" && typeof value !== "function") {
    throw new TypeError("Value must be an object or null/undefined");
  }

  const obj = value as Record<symbol, unknown>;

  if (async) {
    const asyncMethod = obj[Symbol.asyncDispose];
    if (asyncMethod !== undefined) {
      if (typeof asyncMethod !== "function") {
        throw new TypeError("Dispose method must be callable");
      }
      return asyncMethod as DisposeMethod;
    }
    // Fall back to sync method for async disposal
    const syncMethod = obj[Symbol.dispose];
    if (typeof syncMethod === "function") {
      return function (this: unknown) {
        (syncMethod as DisposeMethod).call(this);
      };
    }
    return undefined;
  }

  const method = obj[Symbol.dispose];
  if (method === undefined) return undefined;
  if (typeof method !== "function") {
    throw new TypeError("Dispose method must be callable");
  }
  return method as DisposeMethod;
};

const disposeSync = (stack: ReadonlyArray<DisposableResource>): void => {
  let error: unknown;
  let hasError = false;

  for (let i = stack.length - 1; i >= 0; i--) {
    const { method, value } = stack[i];
    if (method) {
      try {
        method.call(value);
      } catch (e) {
        error = hasError ? new SuppressedError(e, error) : e;
        hasError = true;
      }
    }
  }

  if (hasError) throw error;
};

const disposeAsync = async (
  stack: ReadonlyArray<DisposableResource>,
): Promise<void> => {
  let error: unknown;
  let hasError = false;

  for (let i = stack.length - 1; i >= 0; i--) {
    const { method, value } = stack[i];
    if (method) {
      try {
        await method.call(value);
      } catch (e) {
        error = hasError ? new SuppressedError(e, error) : e;
        hasError = true;
      }
    }
  }

  if (hasError) throw error;
};

const createState = (): StackState => ({ state: "pending", stack: [] });

const getState = (
  map: WeakMap<object, StackState>,
  instance: object,
  name: string,
): StackState => {
  const data = map.get(instance);
  if (!data) throw new TypeError(`Invalid ${name}`);
  return data;
};

const assertNotDisposed = (data: StackState, name: string): void => {
  if (data.state === "disposed") {
    throw new ReferenceError(`${name} has already been disposed`);
  }
};

const assertFunction = (fn: unknown): void => {
  if (typeof fn !== "function") {
    throw new TypeError("onDispose must be a function");
  }
};

// WeakMaps for private state
const syncState = new WeakMap<object, StackState>();
const asyncState = new WeakMap<object, StackState>();

// DisposableStack implementation
function DisposableStackConstructor(this: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!new.target) {
    throw new TypeError("Constructor DisposableStack requires 'new'");
  }
  syncState.set(this as object, createState());
}

Object.defineProperty(DisposableStackConstructor.prototype, "disposed", {
  configurable: true,
  enumerable: false,
  get: function (this: object): boolean {
    return getState(syncState, this, "DisposableStack").state === "disposed";
  },
});

DisposableStackConstructor.prototype.use = function <T>(
  this: object,
  value: T,
): T {
  const data = getState(syncState, this, "DisposableStack");
  assertNotDisposed(data, "DisposableStack");

  if (value == null) return value;

  const method = getDisposeMethod(value, false);
  if (method === undefined) {
    throw new TypeError("Value must have a Symbol.dispose method");
  }

  data.stack.push({ value, method });
  return value;
};

DisposableStackConstructor.prototype.adopt = function <T>(
  this: object,
  value: T,
  onDispose: (value: T) => void,
): T {
  const data = getState(syncState, this, "DisposableStack");
  assertNotDisposed(data, "DisposableStack");
  assertFunction(onDispose);

  data.stack.push({
    value: undefined,
    method: () => {
      onDispose(value);
    },
  });
  return value;
};

DisposableStackConstructor.prototype.defer = function (
  this: object,
  onDispose: () => void,
): void {
  const data = getState(syncState, this, "DisposableStack");
  assertNotDisposed(data, "DisposableStack");
  assertFunction(onDispose);

  data.stack.push({ value: undefined, method: onDispose });
};

DisposableStackConstructor.prototype.move = function (this: object): object {
  const data = getState(syncState, this, "DisposableStack");
  assertNotDisposed(data, "DisposableStack");

  const newStack = Object.create(
    DisposableStackConstructor.prototype as object,
  ) as object;
  syncState.set(newStack, { state: "pending", stack: data.stack });

  data.stack = [];
  data.state = "disposed";
  return newStack;
};

DisposableStackConstructor.prototype.dispose = function (this: object): void {
  const data = getState(syncState, this, "DisposableStack");
  if (data.state === "disposed") return;

  data.state = "disposed";
  const stack = data.stack;
  data.stack = [];

  disposeSync(stack);
};

DisposableStackConstructor.prototype[Symbol.dispose] =
  DisposableStackConstructor.prototype.dispose;

Object.defineProperty(
  DisposableStackConstructor.prototype,
  Symbol.toStringTag,
  {
    configurable: true,
    enumerable: false,
    writable: false,
    value: "DisposableStack",
  },
);

// AsyncDisposableStack implementation
function AsyncDisposableStackConstructor(this: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!new.target) {
    throw new TypeError("Constructor AsyncDisposableStack requires 'new'");
  }
  asyncState.set(this as object, createState());
}

Object.defineProperty(AsyncDisposableStackConstructor.prototype, "disposed", {
  configurable: true,
  enumerable: false,
  get: function (this: object): boolean {
    return (
      getState(asyncState, this, "AsyncDisposableStack").state === "disposed"
    );
  },
});

AsyncDisposableStackConstructor.prototype.use = function <T>(
  this: object,
  value: T,
): T {
  const data = getState(asyncState, this, "AsyncDisposableStack");
  assertNotDisposed(data, "AsyncDisposableStack");

  if (value == null) return value;

  const method = getDisposeMethod(value, true);
  if (method === undefined) {
    throw new TypeError(
      "Value must have a Symbol.asyncDispose or Symbol.dispose method",
    );
  }

  data.stack.push({ value, method });
  return value;
};

AsyncDisposableStackConstructor.prototype.adopt = function <T>(
  this: object,
  value: T,
  onDispose: (value: T) => void | PromiseLike<void>,
): T {
  const data = getState(asyncState, this, "AsyncDisposableStack");
  assertNotDisposed(data, "AsyncDisposableStack");
  assertFunction(onDispose);

  data.stack.push({ value: undefined, method: () => onDispose(value) });
  return value;
};

AsyncDisposableStackConstructor.prototype.defer = function (
  this: object,
  onDispose: () => void | PromiseLike<void>,
): void {
  const data = getState(asyncState, this, "AsyncDisposableStack");
  assertNotDisposed(data, "AsyncDisposableStack");
  assertFunction(onDispose);

  data.stack.push({ value: undefined, method: onDispose });
};

AsyncDisposableStackConstructor.prototype.move = function (
  this: object,
): object {
  const data = getState(asyncState, this, "AsyncDisposableStack");
  assertNotDisposed(data, "AsyncDisposableStack");

  const newStack = Object.create(
    AsyncDisposableStackConstructor.prototype as object,
  ) as object;
  asyncState.set(newStack, { state: "pending", stack: data.stack });

  data.stack = [];
  data.state = "disposed";
  return newStack;
};

AsyncDisposableStackConstructor.prototype.disposeAsync = async function (
  this: object,
): Promise<void> {
  const data = getState(asyncState, this, "AsyncDisposableStack");
  if (data.state === "disposed") return;

  data.state = "disposed";
  const stack = data.stack;
  data.stack = [];

  await disposeAsync(stack);
};

AsyncDisposableStackConstructor.prototype[Symbol.asyncDispose] =
  AsyncDisposableStackConstructor.prototype.disposeAsync;

Object.defineProperty(
  AsyncDisposableStackConstructor.prototype,
  Symbol.toStringTag,
  {
    configurable: true,
    enumerable: false,
    writable: false,
    value: "AsyncDisposableStack",
  },
);

export const DisposableStack = DisposableStackConstructor as unknown as {
  new (): globalThis.DisposableStack;
  prototype: globalThis.DisposableStack;
};
Object.defineProperty(DisposableStack, "name", {
  value: "DisposableStack",
  configurable: true,
});

export const AsyncDisposableStack =
  AsyncDisposableStackConstructor as unknown as {
    new (): globalThis.AsyncDisposableStack;
    prototype: globalThis.AsyncDisposableStack;
  };
Object.defineProperty(AsyncDisposableStack, "name", {
  value: "AsyncDisposableStack",
  configurable: true,
});

export const ensurePolyfills = (): void => {
  const globalAny = globalThis as any;
  globalAny.DisposableStack ??= DisposableStack;
  globalAny.AsyncDisposableStack ??= AsyncDisposableStack;
  // @ts-expect-error Symbol.dispose is readonly in TS
  Symbol.dispose ??= Symbol("Symbol.dispose");
  // @ts-expect-error Symbol.asyncDispose is readonly in TS
  Symbol.asyncDispose ??= Symbol("Symbol.asyncDispose");
};
