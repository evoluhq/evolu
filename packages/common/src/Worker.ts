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
 * A channel creates two entangled ports: keep one and transfer the other (e.g.,
 * to a SharedWorker via `postMessage` with `transfer`). Messages sent to one
 * port are received by the other.
 *
 * For one-way communication, omit `Output` (defaults to `never`).
 *
 * ### Example
 *
 * One-way console channel: worker sends entries, main thread receives them.
 *
 * Main thread:
 *
 * ```ts
 * const consoleChannel = createMessageChannel<ConsoleEntry>();
 * const consoleStore = createStore<ConsoleEntry | null>(null);
 *
 * sharedWorker.port.postMessage(
 *   { type: "InitConsole", port: consoleChannel.port1.native },
 *   [consoleChannel.port1.native], // transfer ownership to worker
 * );
 *
 * consoleChannel.port2.onMessage = (entry) => {
 *   consoleStore.set(entry);
 * };
 * ```
 *
 * Inside worker:
 *
 * ```ts
 * scope.onError = (error) => {
 *   consolePort.postMessage(error);
 * };
 * ```
 *
 * Bidirectional channel (both sides send and receive):
 *
 * ```ts
 * const channel = createMessageChannel<Request, Response>();
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
