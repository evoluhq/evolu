/**
 * WebSocket with auto-reconnect.
 *
 * @module
 */

import { lazyTrue } from "./Function.js";
import type { Result } from "./Result.js";
import { err, ok } from "./Result.js";
import type { Schedule } from "./Schedule.js";
import { exponential, jitter, maxDelay } from "./Schedule.js";
import type { RetryError, Task } from "./Task.js";
import { callback, retry } from "./Task.js";
import type { Millis } from "./Time.js";
import { String, type Typed } from "./Type.js";

/**
 * WebSocket with auto-reconnect.
 *
 * The API mirrors native
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/WebSocket | WebSocket}
 * but retries connections indefinitely by default. This design accounts for the
 * fact that browser and React Native online/offline detection APIs are
 * unreliable — they may report online status incorrectly, so the only reliable
 * approach is to keep attempting reconnection.
 *
 * Created via {@link createWebSocket} which returns a {@link Task}.
 *
 * Disposing the WebSocket closes the connection.
 *
 * ## How Binary Messages Work
 *
 * The Server Chooses the Message Type:
 *
 * - Text (0x1) → Sent as UTF-8 encoded text (always received as a string in the
 *   browser).
 * - Binary (0x2) → Sent as raw binary data (received as a Blob or ArrayBuffer,
 *   depending on binaryType).
 *
 * The Client's binaryType Controls How Binary Data is Processed:
 *
 * - If the server sends a text frame (0x1), the browser always delivers
 *   event.data as a string, regardless of binaryType.
 * - If the server sends a binary frame (0x2), the browser delivers event.data as:
 *
 *   - A Blob (default: "blob")
 *   - An ArrayBuffer ("arraybuffer")
 *
 * ### Example
 *
 * ```ts
 * const ws = await run(
 *   createWebSocket("wss://example.com", {
 *     onMessage: (data) => console.log("Received:", data),
 *     onOpen: () => console.log("Connected"),
 *     onClose: () => console.log("Disconnected"),
 *   }),
 * );
 * if (ws.ok) {
 *   ws.value.send("Hello");
 *   // Later: await ws.value[Symbol.asyncDispose]();
 * }
 * ```
 */
export interface WebSocket extends AsyncDisposable {
  /**
   * Send data through the WebSocket connection. Returns {@link Result} with an
   * error if the data couldn't be sent.
   */
  send: (
    data: string | ArrayBufferLike | Blob | ArrayBufferView,
  ) => Result<void, WebSocketSendError>;

  readonly getReadyState: () => WebSocketReadyState;

  /** Returns true if the WebSocket is open and ready to send data. */
  readonly isOpen: () => boolean;
}

/**
 * An error that occurs when trying to send data but WebSocket is not available
 * or is in the CONNECTING state.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send
 */
export interface WebSocketSendError extends Typed<"WebSocketSendError"> {}

/** WebSocket connection states. */
export type WebSocketReadyState = "connecting" | "open" | "closing" | "closed";

/** {@link Task} that creates a {@link WebSocket}. */
export type CreateWebSocket = (
  url: string,
  options?: WebSocketOptions,
) => Task<WebSocket>;

export interface CreateWebSocketDep {
  readonly createWebSocket: CreateWebSocket;
}

/** Options for creating {@link WebSocket}. */
export interface WebSocketOptions {
  /** Protocol(s) to use with the WebSocket connection. */
  readonly protocols?: string | ReadonlyArray<string>;

  /** Sets the binary type for the data being received. */
  readonly binaryType?: "blob" | "arraybuffer";

  /** Callback when the connection is established. */
  readonly onOpen?: () => void;

  /** Callback when an error occurs. */
  readonly onError?: (error: WebSocketError) => void;

  /** Callback when the connection is closed. */
  readonly onClose?: (event: CloseEvent) => void;

  /**
   * Determines whether a closed connection should trigger a retry.
   *
   * Return false to stop retrying, for example on auth errors or maintenance.
   */
  readonly shouldRetryOnClose?: (event: CloseEvent) => boolean;

  /** Callback when message data is received. */
  readonly onMessage?: (data: string | ArrayBuffer | Blob) => void;

  /**
   * Retry schedule for reconnection. Defaults to:
   *
   * ```ts
   * // A jittered, capped, unlimited exponential backoff.
   * jitter(1)(maxDelay("30s")(exponential("100ms")));
   * ```
   */
  readonly schedule?: Schedule<Millis, WebSocketRetryError>;

  /**
   * For custom WebSocket implementations.
   *
   * This supports blob:
   *
   * https://github.com/callstackincubator/react-native-fast-io
   */
  readonly WebSocketConstructor?: typeof globalThis.WebSocket;
}

export type WebSocketError =
  | WebSocketConnectError
  | WebSocketConnectionError
  | RetryError<WebSocketRetryError>;

/**
 * An error that occurs when a connection cannot be established due to a network
 * error. Fires before `onclose`.
 */
export interface WebSocketConnectError extends Typed<"WebSocketConnectError"> {
  readonly event: Event;
}

/**
 * An error that occurs when an established connection encounters an issue
 * (e.g., failure to send data). Fires before `onclose`.
 *
 * Note: Only Node.js and WebKit fire this error on abrupt server termination.
 * Chromium and Firefox only fire `onclose` without a preceding error event.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/error_event
 */
export interface WebSocketConnectionError extends Typed<"WebSocketConnectionError"> {
  readonly event: Event;
}

export type WebSocketRetryError =
  | WebSocketConnectError
  | WebSocketConnectionCloseError;

/** An error that occurs when the connection is closed by the server. */
export interface WebSocketConnectionCloseError extends Typed<"WebSocketConnectionCloseError"> {
  readonly event: CloseEvent;
}

/** Create a new {@link WebSocket}. */
export const createWebSocket: CreateWebSocket =
  (
    url,
    {
      protocols,
      binaryType,
      onOpen,
      onClose,
      shouldRetryOnClose = lazyTrue,
      onMessage,
      onError,
      schedule = jitter(1)(maxDelay("30s")(exponential("100ms"))),
      WebSocketConstructor = globalThis.WebSocket,
    } = {},
  ) =>
  async (run) => {
    await using stack = new AsyncDisposableStack();

    let socket: globalThis.WebSocket | null = null;
    let disposed = false;

    const closeSocket = () => {
      if (!socket) return;

      socket.onopen = null;
      socket.onclose = null;
      socket.onmessage = null;
      socket.onerror = null;

      if (
        socket.readyState !== socket.CLOSING &&
        socket.readyState !== socket.CLOSED
      ) {
        socket.close();
      }

      socket = null;
    };

    /**
     * A task that connects and stays connected until the connection closes or
     * errors. Returns error to trigger retry.
     */
    const connect: Task<void, WebSocketRetryError> = callback(({ err, ok }) => {
      closeSocket();

      socket = new WebSocketConstructor(
        url,
        String.is(protocols) ? protocols : protocols && [...protocols],
      );

      if (binaryType) socket.binaryType = binaryType;

      let isOpen = false;

      socket.onopen = () => {
        isOpen = true;
        onOpen?.();
      };

      socket.onclose = (event) => {
        onClose?.(event);
        if (shouldRetryOnClose(event)) {
          err({ type: "WebSocketConnectionCloseError", event });
        } else {
          ok();
        }
      };

      socket.onmessage = (event: MessageEvent<string | ArrayBuffer | Blob>) => {
        onMessage?.(event.data);
      };

      socket.onerror = (event) => {
        const error: WebSocketConnectionError | WebSocketConnectError = isOpen
          ? { type: "WebSocketConnectionError", event }
          : { type: "WebSocketConnectError", event };
        onError?.(error);

        if (error.type === "WebSocketConnectError") err(error);
      };

      return closeSocket;
    });

    const retryFiber = stack.use(run.daemon(retry(connect, schedule)));

    // Report RetryError (schedule exhausted) via onError callback
    void retryFiber.then((result) => {
      if (!result.ok && result.error.type === "RetryError") {
        onError?.(result.error);
      }
    });

    const moved = stack.move();

    return ok<WebSocket>({
      send: (data) => {
        // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send
        if (!socket || socket.readyState === socket.CONNECTING) {
          return err({ type: "WebSocketSendError" });
        }
        socket.send(data);
        return ok();
      },

      getReadyState: () => {
        if (disposed) return "closed";
        return socket ? nativeToStringState[socket.readyState] : "connecting";
      },

      isOpen: () =>
        !disposed && socket?.readyState === globalThis.WebSocket.OPEN,

      [Symbol.asyncDispose]: async () => {
        disposed = true;
        await moved.disposeAsync();
      },
    });
  };

/** Creates a deterministic in-memory {@link CreateWebSocket} for testing. */
export const testCreateWebSocket =
  (
    options: {
      /** Throw immediately when a socket is created. */
      readonly throwOnCreate?: boolean;

      /** Initial open state of created sockets. Defaults to true. */
      readonly isOpen?: boolean;
    } = {},
  ): CreateWebSocket =>
  () =>
  () => {
    if (options.throwOnCreate) {
      throw new Error("testCreateWebSocket is configured to throw on create");
    }

    let isDisposed = false;
    let isOpen = options.isOpen ?? true;

    return ok({
      send: () => {
        if (isDisposed || !isOpen) return err({ type: "WebSocketSendError" });
        return ok();
      },

      getReadyState: () => {
        if (isDisposed) return "closed";
        return isOpen ? "open" : "closed";
      },

      isOpen: () => !isDisposed && isOpen,

      [Symbol.asyncDispose]: () => {
        isDisposed = true;
        isOpen = false;
        return Promise.resolve();
      },
    });
  };

const nativeToStringState: Record<number, WebSocketReadyState> = {
  [globalThis.WebSocket.CONNECTING]: "connecting",
  [globalThis.WebSocket.OPEN]: "open",
  [globalThis.WebSocket.CLOSING]: "closing",
  [globalThis.WebSocket.CLOSED]: "closed",
};
