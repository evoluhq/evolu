/**
 * Platform-agnostic Worker abstractions.
 *
 * @module
 */

import { assert } from "./Assert.js";
import type { Brand } from "./Brand.js";
import type { ConsoleDep, ConsoleStoreOutputEntryDep } from "./Console.js";

/**
 * Platform-agnostic Worker.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Worker
 */
export interface Worker<Input, Output = never> extends MessagePort<
  Input,
  Output
> {}

/**
 * Platform-agnostic SharedWorker.
 *
 * A shared worker is shared across multiple clients (tabs, windows, iframes)
 * and provides a port for bidirectional communication with each client.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker
 */
export interface SharedWorker<Input, Output = never> extends Disposable {
  /** Port for communicating with the shared worker. */
  readonly port: MessagePort<Input, Output>;
}

/**
 * Platform-agnostic MessagePort.
 *
 * Note: There is no reliable way to detect when a port is closed or
 * disconnected. Calling `postMessage` on a disposed port does not throw — it
 * silently fails. To detect dead ports, use a heartbeat pattern where the other
 * end periodically sends "alive" messages and stale ports are pruned after a
 * timeout.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/MessagePort
 */
export interface MessagePort<Input, Output = never> extends Disposable {
  readonly postMessage: (
    message: Input,
    transfer?: ReadonlyArray<Transferable>,
  ) => void;

  /**
   * Handler for incoming messages. Messages are queued until this is assigned,
   * matching native `MessagePort` behavior where setting `onmessage` implicitly
   * calls `start()`. This enables safe async initialization — the sender can
   * post messages immediately while the receiver sets up.
   */
  onMessage: ((message: Output) => void) | null;

  /**
   * The native underlying port for transferring via `postMessage`.
   *
   * ### Example
   *
   * ```ts
   * sharedWorker.port.postMessage(
   *   { type: "InitConsole", port: consoleChannel.port1.native },
   *   [consoleChannel.port1.native],
   * );
   * ```
   */
  readonly native: NativeMessagePort<Input, Output>;
}

/**
 * Objects whose ownership can be transferred between threads via `postMessage`.
 *
 * Intentionally scoped to types Evolu uses. The web platform defines additional
 * transferable types (`ImageBitmap`, `OffscreenCanvas`, `ReadableStream`, etc.)
 * that can be added here if needed.
 */
export type Transferable = NativeMessagePort<any, any> | ArrayBuffer;

/**
 * Opaque type for platform-specific native MessagePort.
 *
 * Exists because `postMessage` transfer requires the native object itself, not
 * a wrapper. Ensures type-safe wiring between {@link MessagePort.native} and
 * {@link CreateMessagePort} without exposing platform details.
 */
export type NativeMessagePort<
  Input = unknown,
  Output = never,
> = Brand<"NativeMessagePort"> & {
  readonly [nativeMessagePortInput]?: Input;
  readonly [nativeMessagePortOutput]?: Output;
};

declare const nativeMessagePortInput: unique symbol;
declare const nativeMessagePortOutput: unique symbol;

/** Factory function to create a {@link MessagePort} from a native port. */
export type CreateMessagePort = <Input, Output = never>(
  nativePort: NativeMessagePort<Input, Output>,
) => MessagePort<Input, Output>;

export interface CreateMessagePortDep {
  readonly createMessagePort: CreateMessagePort;
}

/** Common dependencies for worker entry points. */
export type WorkerDeps = ConsoleDep &
  ConsoleStoreOutputEntryDep &
  CreateMessagePortDep;

/**
 * Platform-agnostic MessageChannel.
 *
 * Creates two entangled ports: keep one and transfer the other (e.g., to a
 * SharedWorker via `postMessage` with `transfer`). Messages sent to one port
 * are received by the other.
 *
 * Messages are queued until `onMessage` is assigned, enabling safe async
 * initialization. The sender can post messages immediately while the receiver
 * performs async setup — no manual buffering required.
 *
 * For one-way communication, omit `Output` (defaults to `never`).
 *
 * ### Example
 *
 * Transfer a channel port to a SharedWorker for async initialization:
 *
 * ```ts
 * // Main thread: create channel, transfer port1, use port2 immediately.
 * const channel = createMessageChannel<EvoluRequest, EvoluResponse>();
 *
 * sharedWorker.port.postMessage(
 *   { type: "CreateEvolu", port: channel.port1.native },
 *   [channel.port1.native],
 * );
 *
 * // Safe to send immediately — messages queue until worker is ready.
 * channel.port2.postMessage({ type: "Query", query });
 * channel.port2.onMessage = (response) => {
 *   handleResponse(response);
 * };
 * ```
 *
 * ```ts
 * // Worker: receive the port, do async init, then start listening.
 * const evoluPort = createMessagePort<EvoluResponse, EvoluRequest>(
 *   message.port,
 * );
 * await openDatabase(name);
 * evoluPort.onMessage = (request) => {
 *   handleRequest(request);
 * };
 * // Queued messages are now delivered in order.
 * ```
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel
 */
export interface MessageChannel<Input, Output = never> extends Disposable {
  /** The first port of the channel. */
  readonly port1: MessagePort<Input, Output>;

  /** The second port of the channel. */
  readonly port2: MessagePort<Output, Input>;
}

/** Factory function to create a {@link MessageChannel}. */
export type CreateMessageChannel = <Input, Output = never>() => MessageChannel<
  Input,
  Output
>;

export interface CreateMessageChannelDep {
  readonly createMessageChannel: CreateMessageChannel;
}

/**
 * Typed `self` for code running inside a dedicated worker.
 *
 * This is the worker-side counterpart to {@link Worker} — a typed
 * {@link MessagePort} that wraps `self` inside the worker.
 */
export interface WorkerSelf<Input, Output = never> extends MessagePort<
  Output,
  Input
> {}

/**
 * Typed `self` for code running inside a shared worker.
 *
 * This is the worker-side counterpart to {@link SharedWorker}. It wraps `self`
 * inside the shared worker, providing typed `onConnect` callbacks.
 */
export interface SharedWorkerSelf<Input, Output = never> extends Disposable {
  onConnect: ((port: MessagePort<Output, Input>) => void) | null;
}

/**
 * Creates an in-memory {@link Worker}.
 *
 * This is a memory-only fallback for platforms without native worker support.
 * Message delivery is asynchronous in-process.
 */
export const createWorker = <Input, Output = never>(
  initWorker: (self: WorkerSelf<Input, Output>) => void,
): Worker<Input, Output> => {
  const { worker, self } = createMemoryWorkerPair<Input, Output>();
  initWorker(self);
  return worker;
};

/**
 * Creates an in-memory {@link SharedWorker}.
 *
 * This is a memory-only fallback for platforms without native SharedWorker
 * support. Connection is synchronous while message delivery is asynchronous
 * in-process.
 *
 * Intended usage is one shared worker instance per process/app runtime.
 */
export const createSharedWorker = <Input, Output = never>(
  initWorker: (self: SharedWorkerSelf<Input, Output>) => void,
): SharedWorker<Input, Output> => {
  const { worker, self, connect } = createMemorySharedWorkerPair<
    Input,
    Output
  >();

  initWorker(self);
  connect();

  return worker;
};

/**
 * Creates an in-memory {@link MessageChannel}.
 *
 * This is a memory-only fallback for platforms without native MessageChannel
 * support. Message delivery is asynchronous in-process.
 */
export const createMessageChannel: CreateMessageChannel = <
  Input,
  Output = never,
>(): MessageChannel<Input, Output> => {
  const state1: PortState<Output> = {
    handler: null,
    queue: [],
    flushScheduled: false,
  };
  const state2: PortState<Input> = {
    handler: null,
    queue: [],
    flushScheduled: false,
  };

  const native1 = createNativeMessagePortToken<Input, Output>();
  const native2 = createNativeMessagePortToken<Output, Input>();

  const port1 = createTestPort<Input, Output>(state1, state2, native1);
  const port2 = createTestPort<Output, Input>(state2, state1, native2);

  nativePortRegistry.set(native1, port1);
  nativePortRegistry.set(native2, port2);

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
 * Creates an in-memory {@link MessagePort} from a native token.
 *
 * This is a memory-only fallback for platforms without native MessagePort
 * support. Message delivery through returned ports is asynchronous in-process.
 */
export const createMessagePort: CreateMessagePort = <Input, Output = never>(
  nativePort: NativeMessagePort<Input, Output>,
): MessagePort<Input, Output> => {
  const pair = nativePortRegistry.get(nativePort);
  assert(pair, "Unknown native port — did you transfer it?");
  return pair as MessagePort<Input, Output>;
};

/**
 * Test {@link Worker} with access to its paired worker-side `self`.
 *
 * Use `self` to simulate messages and behavior from inside the worker.
 */
export interface TestWorker<Input, Output = never> extends Worker<
  Input,
  Output
> {
  /** Typed `self` counterpart for worker-side testing assertions. */
  readonly self: WorkerSelf<Input, Output>;
}

/**
 * Test {@link SharedWorker} with direct access to `self` and `connect`.
 *
 * Call `connect()` to simulate a client connection and trigger
 * `self.onConnect`.
 */
export interface TestSharedWorker<Input, Output = never> extends SharedWorker<
  Input,
  Output
> {
  readonly self: SharedWorkerSelf<Input, Output>;
  readonly connect: () => void;
}

/** {@link MessageChannel} with disposal tracking for testing. */
export interface TestMessageChannel<
  Input,
  Output = never,
> extends MessageChannel<Input, Output> {
  readonly isDisposed: () => boolean;
}

/**
 * Creates a connected {@link TestWorker} for testing.
 *
 * The returned worker includes its typed {@link TestWorker.self} counterpart, so
 * tests can exercise dedicated worker communication without a real thread.
 */
export const testCreateWorker = <Input, Output = never>(): TestWorker<
  Input,
  Output
> => {
  let self!: WorkerSelf<Input, Output>;

  const worker = createWorker<Input, Output>((nextSelf) => {
    self = nextSelf;
  });

  return Object.assign(worker, { self }) as TestWorker<Input, Output>;
};

/**
 * Creates a connected {@link TestSharedWorker} for testing.
 *
 * The returned worker includes `self` and `connect` so tests can exercise the
 * full worker ↔ client pipeline without a real worker thread.
 */
export const testCreateSharedWorker = <
  Input,
  Output = never,
>(): TestSharedWorker<Input, Output> => {
  const { worker, self, connect } = createMemorySharedWorkerPair<
    Input,
    Output
  >();
  return Object.assign(worker, {
    self,
    connect,
  }) as TestSharedWorker<Input, Output>;
};

/**
 * Creates an in-memory {@link MessageChannel} for testing.
 *
 * Messages are queued until `onMessage` is assigned, matching the browser
 * MessagePort behavior where the port message queue starts disabled.
 *
 * Both ports are registered in the native port registry so
 * {@link testCreateMessagePort} can look them up by their native token.
 */
export const testCreateMessageChannel = <
  Input,
  Output = never,
>(): TestMessageChannel<Input, Output> => {
  const channel = createMessageChannel<Input, Output>();

  let disposed = false;

  return {
    port1: channel.port1,
    port2: channel.port2,
    isDisposed: () => disposed,
    [Symbol.dispose]: () => {
      disposed = true;
      channel[Symbol.dispose]();
    },
  };
};

/** Creates an in-memory {@link CreateMessagePort} for testing. */
export const testCreateMessagePort: CreateMessagePort = <Input, Output = never>(
  nativePort: NativeMessagePort<Input, Output>,
): MessagePort<Input, Output> => createMessagePort(nativePort);

const createMemoryWorkerPair = <Input, Output = never>(): {
  readonly worker: Worker<Input, Output>;
  readonly self: WorkerSelf<Input, Output>;
} => {
  const channel = createMessageChannel<Input, Output>();

  const self: WorkerSelf<Input, Output> = {
    postMessage: channel.port2.postMessage,
    get onMessage() {
      return channel.port2.onMessage;
    },
    set onMessage(value) {
      channel.port2.onMessage = value;
    },
    native: channel.port2.native,
    [Symbol.dispose]: () => {
      channel.port2[Symbol.dispose]();
    },
  };

  const worker: Worker<Input, Output> = {
    postMessage: channel.port1.postMessage,
    get onMessage() {
      return channel.port1.onMessage;
    },
    set onMessage(value) {
      channel.port1.onMessage = value;
    },
    native: channel.port1.native,
    [Symbol.dispose]: () => {
      channel[Symbol.dispose]();
    },
  };

  return { worker, self };
};

const createMemorySharedWorkerPair = <Input, Output = never>(): {
  readonly worker: SharedWorker<Input, Output>;
  readonly self: SharedWorkerSelf<Input, Output>;
  readonly connect: () => void;
} => {
  const channel = createMessageChannel<Input, Output>();

  const self: SharedWorkerSelf<Input, Output> = {
    onConnect: null,
    [Symbol.dispose]: () => {
      self.onConnect = null;
    },
  };

  const worker: SharedWorker<Input, Output> = {
    port: channel.port1,
    [Symbol.dispose]: () => {
      channel[Symbol.dispose]();
    },
  };

  const connect = (): void => {
    assert(
      self.onConnect,
      "onConnect must be set before receiving connections",
    );
    self.onConnect(channel.port2);
  };

  return { worker, self, connect };
};

interface PortState<T> {
  handler: ((message: T) => void) | null;
  readonly queue: Array<T>;
  flushScheduled: boolean;
}

const createPort = <Input, Output>(
  receive: PortState<Output>,
  peerReceive: PortState<Input>,
  native: NativeMessagePort<Input, Output>,
): MessagePort<Input, Output> => {
  const scheduleFlush = (state: PortState<any>): void => {
    if (state.flushScheduled) return;
    state.flushScheduled = true;

    // Native worker messages are task-queued; use macrotask timing.
    setTimeout(() => {
      state.flushScheduled = false;

      const handler = state.handler;
      if (!handler) return;

      for (const message of state.queue.splice(0)) {
        handler(message);
      }
    }, 0);
  };

  return {
    postMessage: (message) => {
      peerReceive.queue.push(message);
      scheduleFlush(peerReceive);
    },
    get onMessage() {
      return receive.handler;
    },
    set onMessage(fn) {
      receive.handler = fn;
      if (fn) scheduleFlush(receive);
    },
    native,
    [Symbol.dispose]: () => {
      receive.handler = null;
      receive.flushScheduled = false;
    },
  };
};

const createTestPort = <Input, Output>(
  receive: PortState<Output>,
  peerReceive: PortState<Input>,
  native: NativeMessagePort<Input, Output>,
): MessagePort<Input, Output> => createPort(receive, peerReceive, native);

const createNativeMessagePortToken = <Input, Output>(): NativeMessagePort<
  Input,
  Output
> => ({}) as NativeMessagePort<Input, Output>;

/**
 * Registry mapping native port tokens to their in-memory port counterparts.
 *
 * When {@link testCreateMessageChannel} creates a pair, both ports are
 * registered here. When {@link testCreateMessagePort} wraps a native token
 * (received via `postMessage` transfer), it looks up the actual port.
 *
 * Uses `WeakMap` so entries are garbage collected when the native token is no
 * longer referenced.
 */
const nativePortRegistry = new WeakMap<
  NativeMessagePort<any, any>,
  MessagePort<any, any>
>();
