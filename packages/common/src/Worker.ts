/**
 * Platform-agnostic Worker abstractions.
 *
 * @module
 */

import type { Brand } from "./Brand.js";

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
  readonly native: NativeMessagePort;
}

/**
 * Objects whose ownership can be transferred between threads via `postMessage`.
 *
 * Intentionally scoped to types Evolu uses. The web platform defines additional
 * transferable types (`ImageBitmap`, `OffscreenCanvas`, `ReadableStream`, etc.)
 * that can be added here if needed.
 */
export type Transferable = NativeMessagePort | ArrayBuffer;

/**
 * Opaque type for platform-specific native MessagePort.
 *
 * Exists because `postMessage` transfer requires the native object itself, not
 * a wrapper. Ensures type-safe wiring between {@link MessagePort.native} and
 * {@link CreateMessagePort} without exposing platform details.
 */
export type NativeMessagePort = Brand<"NativeMessagePort">;

/** Factory function to create a {@link MessagePort} from a native port. */
export type CreateMessagePort = <Input, Output = never>(
  nativePort: NativeMessagePort,
) => MessagePort<Input, Output>;

export interface CreateMessagePortDep {
  readonly createMessagePort: CreateMessagePort;
}

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
 *   { type: "InitEvolu", port: channel.port1.native },
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
 * Creates a connected {@link SharedWorker} / {@link SharedWorkerSelf} pair for
 * testing.
 *
 * Returns both sides so tests can exercise the full worker ↔ client pipeline
 * without a real worker thread. Calling `connect()` triggers `self.onConnect`.
 */
export const testCreateSharedWorker = <Input, Output = never>(): {
  readonly worker: SharedWorker<Input, Output>;
  readonly self: SharedWorkerSelf<Input, Output>;
  readonly connect: () => void;
} => {
  const channel = testCreateMessageChannel<Input, Output>();

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

  const connect = () => {
    if (self.onConnect) self.onConnect(channel.port2);
  };

  return { worker, self, connect };
};

/** {@link MessageChannel} with disposal tracking for testing. */
export interface TestMessageChannel<
  Input,
  Output = never,
> extends MessageChannel<Input, Output> {
  readonly isDisposed: () => boolean;
}

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
  const state1: TestPortState<Output> = { handler: null, queue: [] };
  const state2: TestPortState<Input> = { handler: null, queue: [] };

  const native1 = Symbol("NativeMessagePort1") as unknown as NativeMessagePort;
  const native2 = Symbol("NativeMessagePort2") as unknown as NativeMessagePort;

  const port1 = createTestPort<Input, Output>(state1, state2, native1);
  const port2 = createTestPort<Output, Input>(state2, state1, native2);

  nativePortRegistry.set(native1, port1);
  nativePortRegistry.set(native2, port2);

  let disposed = false;

  return {
    port1,
    port2,
    isDisposed: () => disposed,
    [Symbol.dispose]: () => {
      disposed = true;
      port1[Symbol.dispose]();
      port2[Symbol.dispose]();
    },
  };
};

/** Creates an in-memory {@link CreateMessagePort} for testing. */
export const testCreateMessagePort: CreateMessagePort = <Input, Output = never>(
  nativePort: NativeMessagePort,
): MessagePort<Input, Output> => {
  const pair = nativePortRegistry.get(nativePort);
  if (!pair) throw new Error("Unknown native port — did you transfer it?");
  return pair as MessagePort<Input, Output>;
};

interface TestPortState<T> {
  handler: ((message: T) => void) | null;
  readonly queue: Array<T>;
}

const createTestPort = <Input, Output>(
  receive: TestPortState<Output>,
  peerReceive: TestPortState<Input>,
  native: NativeMessagePort,
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
  native,
  [Symbol.dispose]: () => {
    receive.handler = null;
  },
});

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
  NativeMessagePort,
  MessagePort<any, any>
>();
