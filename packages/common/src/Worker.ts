import { createUnknownError } from "./Error.js";

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
 * Uses callback properties instead of `EventTarget` to avoid polyfills on
 * platforms that don't support it yet (e.g., React Native).
 *
 * Message deserialization errors (structured clone failures) bubble to global
 * error handlers — they're programming errors, not recoverable runtime
 * conditions.
 *
 * For one-way communication, omit `Output` (defaults to `never`).
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
   *
   * Uses `unknown` for transfer types since transferable objects vary by
   * platform (ArrayBuffer, MessagePort, etc.) and cannot be enforced at the
   * type level anyway.
   */
  readonly postMessage: (
    message: Input,
    transfer?: ReadonlyArray<unknown>,
  ) => void;

  /**
   * Callback for messages from the port (like `onmessage` on MessagePort).
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/message_event
   */
  onMessage: ((message: Output) => void) | null;
}

/**
 * Platform-agnostic message channel for creating connected message ports.
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
 * This pattern captures unexpected errors (bugs, crashes) from workers while
 * preserving stack traces via {@link createUnknownError}.
 *
 * Main thread:
 *
 * ```ts
 * const errorChannel = createMessageChannel<UnknownError>();
 * sharedWorker.port.postMessage(
 *   { type: "registerErrorPort", errorPort: errorChannel.port1 },
 *   [errorChannel.port1], // transfer ownership to worker
 * );
 * errorChannel.port2.onMessage = (error) => {
 *   console.error("Worker error:", error);
 * };
 * ```
 *
 * Inside worker (hook global error handlers):
 *
 * TODO: Update
 *
 * ```ts
 * self.onerror = (event) => {
 *   errorPort.postMessage(createUnknownError(event.error));
 * };
 * self.onunhandledrejection = (event) => {
 *   errorPort.postMessage(createUnknownError(event.reason));
 * };
 * ```
 *
 * Benefits:
 *
 * - No try/catch wrappers needed around worker code
 * - Catches all sync errors and unhandled promise rejections automatically
 * - Full stack trace preserved via {@link createUnknownError}
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

/** Dependency wrapper for {@link CreateMessageChannel}. */
export interface CreateMessageChannelDep {
  readonly createMessageChannel: CreateMessageChannel;
}

// Worker-side types (for code running inside workers)

/**
 * Platform-agnostic interface for dedicated Worker global scope (worker-side).
 *
 * This is the worker-side counterpart to {@link Worker}. The worker receives
 * `Input` messages and sends `Output` messages back to the main thread.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope
 */
export interface WorkerGlobalScope<Input, Output = never> extends Disposable {
  /** Callback for messages from the main thread. */
  onMessage: ((message: Input) => void) | null;

  /** Sends a message to the main thread. */
  readonly postMessage: (
    message: Output,
    transfer?: ReadonlyArray<unknown>,
  ) => void;
}

/**
 * Platform-agnostic interface for SharedWorker global scope (worker-side).
 *
 * This is the worker-side counterpart to {@link SharedWorker}.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SharedWorkerGlobalScope
 */
export interface SharedWorkerGlobalScope<
  Input,
  Output = never,
> extends Disposable {
  onConnect: ((port: MessagePort<Output, Input>) => void) | null;
}
