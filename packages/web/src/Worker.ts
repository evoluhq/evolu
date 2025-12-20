import {
  assert,
  CreateMessagePort,
  handleGlobalError,
  MessageChannel,
  MessagePort,
  NativeMessagePort,
  SharedWorker,
  SharedWorkerScope,
  Worker,
  WorkerScope,
} from "@evolu/common";

/** Creates an Evolu {@link Worker} from a native Worker. */
export const createWorker = <Input, Output>(
  nativeWorker: globalThis.Worker,
): Worker<Input, Output> =>
  wrapMessagePortLike(nativeWorker, () => {
    nativeWorker.terminate();
  });

/** Creates an Evolu {@link SharedWorker} from a native SharedWorker. */
export const createSharedWorker = <Input, Output = never>(
  nativeSharedWorker: globalThis.SharedWorker,
): SharedWorker<Input, Output> => {
  const port = wrapNativeMessagePort<Input, Output>(nativeSharedWorker.port);
  return {
    port,
    [Symbol.dispose]: port[Symbol.dispose],
  };
};

/** Wraps a native MessagePort into an Evolu {@link MessagePort}. */
const wrapNativeMessagePort = <Input, Output>(
  nativePort: globalThis.MessagePort,
): MessagePort<Input, Output> =>
  wrapMessagePortLike(nativePort, () => {
    nativePort.close();
  });

/**
 * Wraps any object with a `postMessage`/`onmessage` interface into an Evolu
 * {@link MessagePort}.
 */
const wrapMessagePortLike = <Input, Output>(
  native:
    | DedicatedWorkerGlobalScope
    | globalThis.MessagePort
    | globalThis.Worker,
  dispose: () => void,
): MessagePort<Input, Output> => {
  const port: MessagePort<Input, Output> = {
    postMessage: (message: Input, transfer?: ReadonlyArray<unknown>) => {
      native.postMessage(message, transfer as Array<Transferable>);
    },
    onMessage: null,
    native: native as unknown as NativeMessagePort,
    [Symbol.dispose]: () => {
      native.onmessage = null;
      dispose();
    },
  };

  native.onmessage = (event: MessageEvent<Output>) => {
    assert(
      port.onMessage != null,
      "onMessage must be set before receiving messages",
    );
    port.onMessage(event.data);
  };

  return port;
};

/**
 * Creates a {@link MessageChannel} from the native browser MessageChannel.
 *
 * ## Example
 *
 * ```ts
 * const channel = createMessageChannel<Request, Response>();
 * channel.port1.onMessage = (response) => console.log(response);
 * channel.port1.postMessage({ type: "ping" });
 * ```
 */
export const createMessageChannel = <Input, Output = never>(): MessageChannel<
  Input,
  Output
> => {
  const nativeChannel = new globalThis.MessageChannel();
  const stack = new DisposableStack();

  const port1 = stack.use(
    wrapNativeMessagePort<Input, Output>(nativeChannel.port1),
  );
  const port2 = stack.use(
    wrapNativeMessagePort<Output, Input>(nativeChannel.port2),
  );

  return {
    port1,
    port2,
    [Symbol.dispose]: () => {
      stack.dispose();
    },
  };
};

// Worker-side code (for code running inside workers)

/**
 * Creates an Evolu MessagePort from a native MessagePort.
 *
 * Use this for ports received via postMessage transfer.
 */
export const createMessagePort: CreateMessagePort = (nativePort) =>
  wrapNativeMessagePort(nativePort as unknown as globalThis.MessagePort);

/**
 * Creates an Evolu {@link WorkerScope} from the native
 * `DedicatedWorkerGlobalScope` (`self` inside a dedicated worker).
 */
export const createWorkerScope = <Input, Output = never>(
  nativeSelf: globalThis.DedicatedWorkerGlobalScope,
): WorkerScope<Input, Output> => {
  const stack = new DisposableStack();

  const port = stack.use(
    wrapMessagePortLike<Output, Input>(nativeSelf, () => {
      nativeSelf.close();
    }),
  );

  const scope: WorkerScope<Input, Output> = {
    ...port,
    onError: null,
    [Symbol.dispose]: () => {
      stack.dispose();
    },
  };

  const errorHandler = (event: ErrorEvent) => {
    handleGlobalError(scope, event.error);
  };
  const rejectionHandler = (event: PromiseRejectionEvent) => {
    handleGlobalError(scope, event.reason);
  };

  nativeSelf.addEventListener("error", errorHandler);
  nativeSelf.addEventListener("unhandledrejection", rejectionHandler);

  stack.defer(() => {
    nativeSelf.removeEventListener("error", errorHandler);
    nativeSelf.removeEventListener("unhandledrejection", rejectionHandler);
  });

  return scope;
};

/**
 * Creates an Evolu {@link SharedWorkerScope} from the native
 * `SharedWorkerGlobalScope` (`self` inside a shared worker).
 */
export const createSharedWorkerScope = <Input, Output = never>(
  nativeSelf: globalThis.SharedWorkerGlobalScope,
): SharedWorkerScope<Input, Output> => {
  const stack = new DisposableStack();

  const scope: SharedWorkerScope<Input, Output> = {
    onConnect: null,
    onError: null,
    [Symbol.dispose]: () => {
      stack.dispose();
    },
  };

  nativeSelf.onconnect = (e) => {
    assert(
      scope.onConnect != null,
      "onConnect must be set before receiving connections",
    );
    const port = wrapNativeMessagePort<Output, Input>(e.ports[0]);
    scope.onConnect(port);
  };

  const errorHandler = (event: ErrorEvent) => {
    handleGlobalError(scope, event.error);
  };
  const rejectionHandler = (event: PromiseRejectionEvent) => {
    handleGlobalError(scope, event.reason);
  };

  nativeSelf.addEventListener("error", errorHandler);
  nativeSelf.addEventListener("unhandledrejection", rejectionHandler);

  stack.defer(() => {
    nativeSelf.removeEventListener("error", errorHandler);
    nativeSelf.removeEventListener("unhandledrejection", rejectionHandler);
  });

  return scope;
};
