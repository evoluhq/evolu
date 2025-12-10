import {
  assert,
  MessageChannel,
  MessagePort,
  SharedWorker,
  SharedWorkerGlobalScope,
  Worker,
  WorkerGlobalScope,
} from "@evolu/common";

/**
 * Creates a fake {@link Worker} for React Native.
 *
 * Since React Native doesn't support Web Workers yet, this creates a fake
 * worker that runs in the main thread. The worker logic runs synchronously but
 * messages are delivered asynchronously via microtasks to maintain similar
 * semantics.
 */
export const createWorker = <Input, Output>(
  initWorker: (scope: WorkerGlobalScope<Input, Output>) => void,
): Worker<Input, Output> => {
  let workerScope: WorkerGlobalScope<Input, Output> | null = null;

  const worker: Worker<Input, Output> = {
    postMessage: (message) => {
      queueMicrotask(() => {
        assert(
          workerScope?.onMessage != null,
          "Worker onMessage must be set before receiving messages",
        );
        workerScope.onMessage(message);
      });
    },
    onMessage: null,
    [Symbol.dispose]: () => {
      worker.onMessage = null;
      workerScope?.[Symbol.dispose]();
      workerScope = null;
    },
  };

  workerScope = {
    onMessage: null,
    postMessage: (message) => {
      queueMicrotask(() => {
        assert(
          worker.onMessage != null,
          "onMessage must be set before receiving messages",
        );
        worker.onMessage(message);
      });
    },
    [Symbol.dispose]: () => {
      if (workerScope) workerScope.onMessage = null;
    },
  };

  // Initialize the worker
  initWorker(workerScope);

  return worker;
};

/**
 * Creates a fake {@link SharedWorker} for React Native.
 *
 * Since React Native doesn't support SharedWorkers, this creates a fake shared
 * worker that runs in the main thread. All "connections" share the same
 * instance.
 */
export const createSharedWorker = <Input, Output>(
  initWorker: (scope: SharedWorkerGlobalScope<Input, Output>) => void,
): SharedWorker<Input, Output> => {
  let workerPort: MessagePort<Output, Input> | null = null;

  const clientPort: MessagePort<Input, Output> = {
    postMessage: (message) => {
      queueMicrotask(() => {
        assert(
          workerPort?.onMessage != null,
          "Worker port onMessage must be set before receiving messages",
        );
        workerPort.onMessage(message);
      });
    },
    onMessage: null,
    [Symbol.dispose]: () => {
      clientPort.onMessage = null;
    },
  };

  workerPort = {
    postMessage: (message) => {
      queueMicrotask(() => {
        assert(
          clientPort.onMessage != null,
          "onMessage must be set before receiving messages",
        );
        clientPort.onMessage(message);
      });
    },
    onMessage: null,
    [Symbol.dispose]: () => {
      if (workerPort) workerPort.onMessage = null;
    },
  };

  const workerScope: SharedWorkerGlobalScope<Input, Output> = {
    onConnect: null,
    [Symbol.dispose]: () => {
      workerScope.onConnect = null;
      workerPort[Symbol.dispose]();
    },
  };

  // Initialize the worker
  initWorker(workerScope);

  // Simulate connection
  queueMicrotask(() => {
    assert(
      workerScope.onConnect != null,
      "onConnect must be set before receiving connections",
    );
    workerScope.onConnect(workerPort);
  });

  return {
    port: clientPort,
    [Symbol.dispose]: () => {
      clientPort[Symbol.dispose]();
    },
  };
};

/**
 * Creates a fake {@link MessageChannel} for React Native.
 *
 * Since React Native doesn't support MessageChannel yet, this creates a simple
 * in-memory channel with two connected ports.
 */
export const createMessageChannel = <Input, Output = never>(): MessageChannel<
  Input,
  Output
> => {
  const port1: MessagePort<Input, Output> = {
    postMessage: (message) => {
      queueMicrotask(() => {
        assert(
          port2.onMessage != null,
          "onMessage must be set before receiving messages",
        );
        port2.onMessage(message);
      });
    },
    onMessage: null,
    [Symbol.dispose]: () => {
      port1.onMessage = null;
    },
  };

  const port2: MessagePort<Output, Input> = {
    postMessage: (message) => {
      queueMicrotask(() => {
        assert(
          port1.onMessage != null,
          "onMessage must be set before receiving messages",
        );
        port1.onMessage(message);
      });
    },
    onMessage: null,
    [Symbol.dispose]: () => {
      port2.onMessage = null;
    },
  };

  return {
    port1,
    port2,
    [Symbol.dispose]: () => {
      port1[Symbol.dispose]();
      port2[Symbol.dispose]();
    },
  };
};
