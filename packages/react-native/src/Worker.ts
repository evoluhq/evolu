import {
  createMessageChannel as createCommonMessageChannel,
  createMessagePort as createCommonMessagePort,
  createSharedWorker as createCommonSharedWorker,
  createWorker as createCommonWorker,
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
): Worker<Input, Output> => createCommonWorker(initWorker);

/**
 * Creates an in-memory {@link SharedWorker} for React Native.
 *
 * Since React Native doesn't support SharedWorkers, this runs in the main
 * thread. Messages are queued until `onMessage` is assigned.
 */
export const createSharedWorker = <Input, Output>(
  initWorker: (self: SharedWorkerSelf<Input, Output>) => void,
): SharedWorker<Input, Output> => createCommonSharedWorker(initWorker);

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
> => createCommonMessageChannel<Input, Output>();

/**
 * Creates an Evolu {@link MessagePort} from a "native" port.
 *
 * Uses the shared in-memory native-port registry from `@evolu/common`.
 */
export const createMessagePort = <Input, Output = never>(
  nativePort: NativeMessagePort<Input, Output>,
): MessagePort<Input, Output> => createCommonMessagePort(nativePort);
