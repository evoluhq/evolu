import {
  assert,
  Lazy,
  MessageChannel,
  MessagePort,
  SharedWorker,
  SharedWorkerGlobalScope,
  Worker,
  WorkerGlobalScope,
} from "@evolu/common";

const createMessagePort = <Input, Output>(
  nativePort: globalThis.MessagePort,
): MessagePort<Input, Output> => {
  const port: MessagePort<Input, Output> = {
    postMessage: (message: Input) => {
      nativePort.postMessage(message);
    },
    onMessage: null,
    [Symbol.dispose]: () => {
      nativePort.onmessage = null;
      nativePort.close();
    },
  };

  nativePort.onmessage = (event: MessageEvent<Output>) => {
    assert(
      port.onMessage != null,
      "onMessage must be set before receiving messages",
    );
    port.onMessage(event.data);
  };

  return port;
};

/**
 * Creates a {@link Worker} from a native Worker.
 *
 * ### Example
 *
 * ```ts
 * type MyInput = { type: "process"; data: string };
 * type MyOutput = { type: "result"; value: number };
 *
 * const worker = createWorker<MyInput, MyOutput>(
 *   () =>
 *     new globalThis.Worker(new URL("Worker.worker.js", import.meta.url), {
 *       type: "module",
 *     }),
 * );
 *
 * worker.onMessage = (msg) => {
 *   if (msg.type === "result") console.log("Result:", msg.value);
 * };
 *
 * worker.postMessage({ type: "process", data: "hello" });
 * ```
 */
export const createWorker = <Input, Output>(
  createNativeWorker: Lazy<globalThis.Worker>,
): Worker<Input, Output> => {
  const nativeWorker = createNativeWorker();

  const worker: Worker<Input, Output> = {
    postMessage: (message: Input, transfer?: ReadonlyArray<unknown>) => {
      nativeWorker.postMessage(message, transfer as Array<Transferable>);
    },
    onMessage: null,
    [Symbol.dispose]: () => {
      nativeWorker.onmessage = null;
      nativeWorker.terminate();
    },
  };

  nativeWorker.onmessage = (event: MessageEvent<Output>) => {
    assert(
      worker.onMessage != null,
      "onMessage must be set before receiving messages",
    );
    worker.onMessage(event.data);
  };

  return worker;
};

/**
 * Creates a {@link SharedWorker} from a native SharedWorker.
 *
 * ### Example
 *
 * ```ts
 * type MyInput = { type: "ping" } | { type: "sync" };
 * type MyOutput = { type: "pong" } | { type: "error"; message: string };
 *
 * const sharedWorker = createSharedWorker<MyInput, MyOutput>(
 *   () =>
 *     new globalThis.SharedWorker(
 *       new URL("SharedWorker.worker.js", import.meta.url),
 *       { type: "module" },
 *     ),
 * );
 *
 * sharedWorker.port.onMessage = (msg) => {
 *   if (msg.type === "pong") console.log("Received pong");
 * };
 *
 * sharedWorker.port.postMessage({ type: "ping" });
 * ```
 */
export const createSharedWorker = <Input, Output>(
  createNativeSharedWorker: Lazy<globalThis.SharedWorker>,
): SharedWorker<Input, Output> => {
  const nativeSharedWorker = createNativeSharedWorker();
  const port = createMessagePort<Input, Output>(nativeSharedWorker.port);

  return {
    port,
    [Symbol.dispose]: port[Symbol.dispose],
  };
};

/**
 * Creates a {@link MessageChannel} from the native browser MessageChannel.
 *
 * ### Example
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
    createMessagePort<Input, Output>(nativeChannel.port1),
  );
  const port2 = stack.use(
    createMessagePort<Output, Input>(nativeChannel.port2),
  );

  return {
    port1,
    port2,
    [Symbol.dispose]: () => {
      stack.dispose();
    },
  };
};

/**
 * Creates a {@link WorkerGlobalScope} wrapper for web's native
 * `DedicatedWorkerGlobalScope`.
 *
 * This wires native `onmessage` events to our platform-agnostic `onMessage`
 * callback.
 *
 * ### Example
 *
 * ```ts
 * /// <reference lib="webworker" />
 * declare const self: DedicatedWorkerGlobalScope;
 *
 * import { createWorkerGlobalScope } from "@evolu/web";
 *
 * const scope = createWorkerGlobalScope<MyInput, MyOutput>(self);
 * scope.onMessage = (message) => {
 *   // Handle message from main thread
 *   scope.postMessage({ type: "result", value: 42 });
 * };
 * ```
 */
export const createWorkerGlobalScope = <Input, Output = never>(
  nativeSelf: globalThis.DedicatedWorkerGlobalScope,
): WorkerGlobalScope<Input, Output> => {
  const scope: WorkerGlobalScope<Input, Output> = {
    onMessage: null,
    postMessage: (message, transfer) => {
      nativeSelf.postMessage(message, transfer as Array<Transferable>);
    },
    [Symbol.dispose]: () => {
      nativeSelf.close();
    },
  };

  nativeSelf.onmessage = (event: MessageEvent<Input>) => {
    assert(
      scope.onMessage != null,
      "onMessage must be set before receiving messages",
    );
    scope.onMessage(event.data);
  };

  return scope;
};

/**
 * Creates a {@link SharedWorkerGlobalScope} wrapper for web's native
 * `SharedWorkerGlobalScope`.
 *
 * ### Example
 *
 * ```ts
 * /// <reference lib="webworker" />
 * declare const self: SharedWorkerGlobalScope;
 *
 * import { createSharedWorkerGlobalScope } from "@evolu/web";
 * import { initSharedWorker } from "@evolu/common/local-first";
 *
 * initSharedWorker(createSharedWorkerGlobalScope(self));
 * ```
 */
export const createSharedWorkerGlobalScope = <Input, Output = never>(
  nativeSelf: globalThis.SharedWorkerGlobalScope,
): SharedWorkerGlobalScope<Input, Output> => {
  const scope: SharedWorkerGlobalScope<Input, Output> = {
    onConnect: null,
    [Symbol.dispose]: () => {
      nativeSelf.close();
    },
  };

  nativeSelf.onconnect = (e) => {
    assert(
      scope.onConnect != null,
      "onConnect must be set before receiving connections",
    );

    const port = createMessagePort<Output, Input>(e.ports[0]);
    scope.onConnect(port);
  };

  return scope;
};
