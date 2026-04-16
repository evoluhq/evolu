import type {
  CreateMessagePort,
  MessageChannel,
  MessagePort,
  NativeMessagePort,
  SharedWorker,
  SharedWorkerSelf,
  Transferable,
  Worker,
  WorkerDeps,
  WorkerSelf,
} from "@evolu/common";
import { assert, createConsole, createConsoleStoreOutput } from "@evolu/common";

/** Creates a {@link Worker} from a Web Worker. */
export const createWorker = <Input, Output>(
  nativeWorker: globalThis.Worker,
): Worker<Input, Output> => wrap(nativeWorker);

/** Creates an Evolu {@link SharedWorker} from a Web SharedWorker. */
export const createSharedWorker = <Input, Output = never>(
  nativeSharedWorker: globalThis.SharedWorker,
): SharedWorker<Input, Output> => {
  const port = wrap<Input, Output>(nativeSharedWorker.port);
  return {
    port,
    [Symbol.dispose]: port[Symbol.dispose],
  };
};

/**
 * Creates a {@link MessageChannel} from a Web MessageChannel.
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
  const channel = new globalThis.MessageChannel();
  using stack = new DisposableStack();

  const port1 = stack.use(wrap<Input, Output>(channel.port1));
  const port2 = stack.use(wrap<Output, Input>(channel.port2));
  const moved = stack.move();

  return {
    port1,
    port2,
    [Symbol.dispose]: () => {
      moved.dispose();
    },
  };
};

/**
 * Creates an Evolu {@link MessagePort} from a Web MessagePort.
 *
 * Use this for ports received via postMessage transfer.
 */
export const createMessagePort: CreateMessagePort = (nativePort) =>
  wrap(nativePort as unknown as globalThis.MessagePort);

/**
 * Creates an Evolu {@link WorkerSelf} from a Web `DedicatedWorkerGlobalScope`
 * (`self` inside a dedicated worker).
 */
export const createWorkerSelf = <Input, Output = never>(
  nativeSelf: globalThis.DedicatedWorkerGlobalScope,
): WorkerSelf<Input, Output> => wrap<Output, Input>(nativeSelf);

/**
 * Creates an Evolu {@link SharedWorkerSelf} from a Web `SharedWorkerGlobalScope`
 * (`self` inside a shared worker).
 *
 * Disposing closes the shared worker scope for all connected clients.
 */
export const createSharedWorkerSelf = <Input, Output = never>(
  nativeSelf: globalThis.SharedWorkerGlobalScope,
): SharedWorkerSelf<Input, Output> => {
  const self: SharedWorkerSelf<Input, Output> = {
    onConnect: null,
    [Symbol.dispose]: () => {
      nativeSelf.onconnect = null;
      nativeSelf.close();
    },
  };

  nativeSelf.onconnect = (e) => {
    assert(
      self.onConnect != null,
      "onConnect must be set before receiving connections",
    );
    self.onConnect(wrap<Output, Input>(e.ports[0]));
  };

  return self;
};

/** Creates deps shared by web worker entry points. */
export const createWorkerDeps = (): WorkerDeps => {
  const consoleStoreOutput = createConsoleStoreOutput();
  const console = createConsole({ output: consoleStoreOutput });

  return {
    console,
    consoleStoreOutputEntry: consoleStoreOutput.entry,
    createMessagePort,
  };
};

const wrap = <Input, Output>(
  native:
    | DedicatedWorkerGlobalScope
    | globalThis.MessagePort
    | globalThis.Worker,
): MessagePort<Input, Output> => {
  let onMessageHandler: ((message: Output) => void) | null = null;

  return {
    postMessage: (message: Input, transfer?: ReadonlyArray<Transferable>) => {
      if (transfer == null) native.postMessage(message);
      else native.postMessage(message, [...transfer]);
    },

    get onMessage() {
      return onMessageHandler;
    },
    set onMessage(fn) {
      onMessageHandler = fn;
      if (fn) {
        // Messages are queued until onMessage is assigned.
        native.onmessage = (event: MessageEvent<Output>) => {
          fn(event.data);
        };
      } else {
        native.onmessage = null;
      }
    },

    native: native as unknown as NativeMessagePort<Input, Output>,

    [Symbol.dispose]: () => {
      native.onmessage = null;
      if ("terminate" in native) native.terminate();
      else native.close();
    },
  };
};
