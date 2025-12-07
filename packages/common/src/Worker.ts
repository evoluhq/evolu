/**
 * Platform-agnostic Worker.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Worker
 */
export interface Worker<Input, Output> extends MessagePort<Input, Output> {}

/**
 * Platform-agnostic SharedWorker.
 *
 * A shared worker is shared across multiple clients (tabs, windows, iframes)
 * and provides a port for bidirectional communication with each client.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker
 */
export interface SharedWorker<Input, Output> {
  /** Port for communicating with the shared worker. */
  readonly port: MessagePort<Input, Output>;
}

/**
 * Platform-agnostic MessagePort for bidirectional communication.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/MessagePort
 */
export interface MessagePort<Input, Output> extends Disposable {
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

  /** Callback for messages from the port. */
  onMessage: ((message: Output) => void) | null;
}

/**
 * Platform-agnostic message channel for creating connected message ports.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel
 */
export interface MessageChannel<Input, Output> {
  /** The first port of the channel. */
  readonly port1: MessagePort<Input, Output>;

  /** The second port of the channel. */
  readonly port2: MessagePort<Output, Input>;
}
