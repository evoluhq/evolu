import type {
  ConsoleStoreOutputEntryDep,
  CreateMessagePort,
  CreateMessagePortDep,
  MessageChannel,
  MessagePort,
  NativeMessagePort,
  Run,
  RunDeps,
  SharedWorker,
  SharedWorkerSelf,
  Transferable,
  Worker,
  WorkerSelf,
} from "@evolu/common";
import {
  assert,
  createConsole,
  createConsoleStoreOutput,
  createMultiOutput,
  createNativeConsoleOutput,
} from "@evolu/common";
import { createRun } from "./Task.js";

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
  const stack = new DisposableStack();

  return {
    port1: stack.use(wrap<Input, Output>(channel.port1)),
    port2: stack.use(wrap<Output, Input>(channel.port2)),
    [Symbol.dispose]: () => {
      stack.dispose();
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

/**
 * Creates {@link Run} for a Web Worker or SharedWorker.
 *
 * Sets up console with {@link createConsoleStoreOutput} combined with native
 * console via {@link createMultiOutput}, and provides the store output's entry
 * as the `consoleEntry` dependency and {@link createMessagePort} as the
 * `createMessagePort` dependency.
 *
 * ### Example
 *
 * ```ts
 * await using run = createRun();
 * ```
 *
 * @group Worker Run
 */
export const createWorkerRun = (): Run<
  RunDeps & ConsoleStoreOutputEntryDep & CreateMessagePortDep
> => {
  const consoleStoreOutput = createConsoleStoreOutput();
  const console = createConsole({
    output: createMultiOutput([
      createNativeConsoleOutput(),
      consoleStoreOutput,
    ]),
  });

  return createRun({
    console,
    consoleStoreOutputEntry: consoleStoreOutput.entry,
    createMessagePort,
  });
};

const wrap = <Input, Output>(
  native:
    | DedicatedWorkerGlobalScope
    | globalThis.MessagePort
    | globalThis.Worker,
): MessagePort<Input, Output> => {
  const port: MessagePort<Input, Output> = {
    postMessage: (message: Input, transfer?: ReadonlyArray<Transferable>) => {
      if (transfer == null) native.postMessage(message);
      else native.postMessage(message, [...transfer]);
    },

    onMessage: null,

    native: native as unknown as NativeMessagePort,

    [Symbol.dispose]: () => {
      native.onmessage = null;
      if (native instanceof globalThis.Worker) native.terminate();
      else native.close();
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
