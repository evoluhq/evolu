/**
 * Platform-agnostic Worker and MessageChannel abstractions.
 *
 * @module
 */

import type { Brand } from "./Brand.js";
import type { GlobalErrorScope } from "./Error.js";

/**
 * Platform-agnostic Worker.
 *
 * Initialization errors (script load failures, syntax errors) bubble to global
 * error handlers — they're programming errors, not recoverable runtime
 * conditions.
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
 * Initialization errors (script load failures, syntax errors) bubble to global
 * error handlers — they're programming errors, not recoverable runtime
 * conditions.
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
 * Message deserialization errors (structured clone failures) bubble to global
 * error handlers — they're programming errors, not recoverable runtime
 * conditions.
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
  /**
   * Sends a message.
   *
   * Transferable objects in the optional transfer array will have their
   * ownership transferred to the receiver, making them unusable in the sender.
   * The transferable objects must be reachable from the message object.
   */
  readonly postMessage: (
    message: Input,
    transfer?: ReadonlyArray<Transferable>,
  ) => void;

  /**
   * Callback for messages from the port (like `onmessage` on MessagePort).
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/message_event
   */
  onMessage: ((message: Output) => void) | null;

  /** The native underlying port. Use this only for transferring via postMessage. */
  readonly native: NativeMessagePort;
}

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
 * One-way error channel: worker sends errors, main thread receives them.
 *
 * Main thread:
 *
 * ```ts
 * const errorChannel = createMessageChannel<UnknownError>();
 * const errorStore = createStore<UnknownError | null>(null);
 *
 * sharedWorker.port.postMessage(
 *   { type: "initErrorStore", port: errorChannel.port1.native },
 *   [errorChannel.port1.native], // transfer ownership to worker
 * );
 *
 * errorChannel.port2.onMessage = (error) => {
 *   errorStore.set(error);
 * };
 * ```
 *
 * Inside worker:
 *
 * ```ts
 * scope.onError = (error) => {
 *   errorPort.postMessage(error);
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

// Worker-side types (for code running inside workers)

/**
 * Typed scope for code running inside a dedicated worker.
 *
 * This is the worker-side counterpart to {@link Worker} — a typed
 * {@link MessagePort} combined with {@link GlobalErrorScope} that wraps `self`
 * inside the worker.
 */
export interface WorkerScope<Input, Output = never>
  extends MessagePort<Output, Input>, GlobalErrorScope {}

/**
 * Typed scope for code running inside a shared worker.
 *
 * This is the worker-side counterpart to {@link SharedWorker}. It wraps `self`
 * inside the shared worker, providing typed `onConnect` callbacks.
 */
export interface SharedWorkerScope<Input, Output = never>
  extends GlobalErrorScope, Disposable {
  onConnect: ((port: MessagePort<Output, Input>) => void) | null;
}
