import {
  assert,
  type MessageChannel,
  type MessagePort,
  type NativeMessagePort,
  type SharedWorker,
  type SharedWorkerSelf,
  type Worker,
  type WorkerSelf,
} from "@evolu/common";

/**
 * Creates an in-memory {@link Worker} for React Native.
 *
 * Since React Native doesn't support Web Workers yet, this runs in the main
 * thread. Messages are queued until `onMessage` is assigned.
 */
export const createWorker = <Input, Output>(
  initWorker: (self: WorkerSelf<Input, Output>) => void,
): Worker<Input, Output> => {
  const workerReceive: PortState<Input> = { handler: null, queue: [] };
  const clientReceive: PortState<Output> = { handler: null, queue: [] };

  const workerSelf = createRnPort<Output, Input>(workerReceive, clientReceive);
  const worker = createRnPort<Input, Output>(clientReceive, workerReceive, () =>
    workerSelf[Symbol.dispose](),
  );

  initWorker(workerSelf);

  return worker;
};

/**
 * Creates an in-memory {@link SharedWorker} for React Native.
 *
 * Since React Native doesn't support SharedWorkers, this runs in the main
 * thread. Messages are queued until `onMessage` is assigned.
 */
export const createSharedWorker = <Input, Output>(
  initWorker: (self: SharedWorkerSelf<Input, Output>) => void,
): SharedWorker<Input, Output> => {
  const workerReceive: PortState<Input> = { handler: null, queue: [] };
  const clientReceive: PortState<Output> = { handler: null, queue: [] };

  const clientPort = createRnPort<Input, Output>(clientReceive, workerReceive);
  const workerPort = createRnPort<Output, Input>(workerReceive, clientReceive);

  const self: SharedWorkerSelf<Input, Output> = {
    onConnect: null,
    [Symbol.dispose]: () => {
      self.onConnect = null;
      workerPort[Symbol.dispose]();
    },
  };

  initWorker(self);

  assert(
    self.onConnect != null,
    "onConnect must be set before receiving connections",
  );
  self.onConnect(workerPort);

  return {
    port: clientPort,
    [Symbol.dispose]: () => {
      clientPort[Symbol.dispose]();
    },
  };
};

/**
 * Creates an in-memory {@link MessageChannel} for React Native.
 *
 * Since React Native doesn't support MessageChannel yet, this creates two
 * connected ports running in-process. Messages are queued until `onMessage` is
 * assigned.
 */
export const createMessageChannel = <Input, Output = never>(): MessageChannel<
  Input,
  Output
> => {
  const state1: PortState<Output> = { handler: null, queue: [] };
  const state2: PortState<Input> = { handler: null, queue: [] };

  const port1 = createRnPort<Input, Output>(state1, state2);
  const port2 = createRnPort<Output, Input>(state2, state1);

  return {
    port1,
    port2,
    [Symbol.dispose]: () => {
      port1[Symbol.dispose]();
      port2[Symbol.dispose]();
    },
  };
};

/**
 * Creates an Evolu {@link MessagePort} from a "native" port.
 *
 * In React Native, since we run in-process, the "native" port is already our
 * wrapper, so this is a passthrough.
 */
export const createMessagePort = <Input, Output = never>(
  nativePort: NativeMessagePort<Input, Output>,
): MessagePort<Input, Output> =>
  nativePort as unknown as MessagePort<Input, Output>;

interface PortState<T> {
  handler: ((message: T) => void) | null;
  readonly queue: Array<T>;
}

const createRnPort = <Input, Output>(
  receive: PortState<Output>,
  peerReceive: PortState<Input>,
  onDispose?: () => void,
): MessagePort<Input, Output> => ({
  postMessage: (message) => {
    if (peerReceive.handler) peerReceive.handler(message);
    else peerReceive.queue.push(message);
  },
  get onMessage() {
    return receive.handler;
  },
  set onMessage(fn) {
    receive.handler = fn;
    if (fn) {
      for (const msg of receive.queue.splice(0)) fn(msg);
    }
  },
  native: null as unknown as NativeMessagePort<Input, Output>,
  [Symbol.dispose]: () => {
    receive.handler = null;
    onDispose?.();
  },
});
