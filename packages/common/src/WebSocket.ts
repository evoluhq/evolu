import { constVoid } from "./Function.js";
import { err, ok, Result } from "./Result.js";
import { retry, RetryError, RetryOptions } from "./Task.js";
import { maxPositiveInt } from "./Type.js";

/** WebSocket with auto-reconnect and offline support. */
export interface WebSocket extends Disposable {
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
export interface WebSocketSendError {
  readonly type: "WebSocketSendError";
}

/** WebSocket connection states. */
export type WebSocketReadyState = "connecting" | "open" | "closing" | "closed";

export type CreateWebSocket = (
  url: string,
  options?: WebSocketOptions,
) => WebSocket;

export interface CreateWebSocketDep {
  readonly createWebSocket: CreateWebSocket;
}

/** Options for creating {@link WebSocket} */
export interface WebSocketOptions {
  /** Protocol(s) to use with the WebSocket connection. */
  protocols?: string | Array<string>;

  /** Sets the binary type for the data being received. */
  binaryType?: "blob" | "arraybuffer";

  /** Callback when the connection is established. */
  onOpen?: () => void;

  /** Callback when an error occurs. */
  onError?: (error: WebSocketError) => void;

  /** Callback when the connection is closed. */
  onClose?: (event: CloseEvent) => void;

  /** Callback when message data is received. */
  onMessage?: (data: string | ArrayBuffer | Blob) => void;

  /** Options for retry behavior. */
  retryOptions?: Omit<RetryOptions<WebSocketRetryError>, "signal">;

  /**
   * For custom WebSocket implementations.
   *
   * This suppors blob:
   *
   * https://github.com/callstackincubator/react-native-fast-io
   */
  WebSocketConstructor?: typeof globalThis.WebSocket;
}

export type WebSocketError =
  | WebSocketConnectError
  | WebSocketConnectionError
  | RetryError<WebSocketRetryError>;

/**
 * An error that occurs when a connection cannot be established due to a network
 * error.
 */
export interface WebSocketConnectError {
  readonly type: "WebSocketConnectError";
  readonly event: Event;
}

/**
 * An error that occurs when a connection is closed due to an issue (e.g.,
 * failure to send some data).
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/error_event
 */
export interface WebSocketConnectionError {
  readonly type: "WebSocketConnectionError";
  readonly event: Event;
}

export type WebSocketRetryError =
  | WebSocketConnectError
  | WebSocketConnectionCloseError;

export interface WebSocketConnectionCloseError {
  readonly type: "WebSocketConnectionCloseError";
  readonly event: CloseEvent;
}

/**
 * Create a new {@link WebSocket}.
 *
 * The default behavior is that WebSocket tries to reconnect repeatedly in case
 * the application is offline, because online events (both web and native) are
 * not reliable. Once it connects and the connection is closed, it tries to
 * reconnect again. Retrying the connection can be controlled using the
 * retryOptions retryable predicate.
 *
 * ### How Binary Messages Work in WebSockets
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
 * TODO:
 */
export const createWebSocket: CreateWebSocket = (
  url,
  {
    protocols,
    binaryType,
    onOpen,
    onClose,
    onMessage,
    onError,
    retryOptions,
    WebSocketConstructor = globalThis.WebSocket,
  } = {},
) => {
  let isDisposed = false;

  const reconnectController = new AbortController();

  const defaultRetryOptions: RetryOptions<WebSocketRetryError> = {
    retries: maxPositiveInt, // Practically infinite retries
  };

  let socket: globalThis.WebSocket | null = null;

  const disposeSocket = () => {
    if (!socket) return;

    // Remove all listeners before closing
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

  // To prevent a memory leak from pending connection promise.
  let disposePromise: null | typeof constVoid = null;

  /**
   * This promise represents continuous connection which:
   *
   * - Is rejected when a connection cannot be established.
   * - Is rejected when a connection is closed.
   * - Is resolved when WebSocket is disposed().
   */
  void retry(
    {
      ...defaultRetryOptions,
      ...retryOptions,
    },
    (): Promise<Result<void, WebSocketRetryError>> =>
      new Promise((resolve) => {
        disposePromise = () => {
          resolve(ok());
        };

        if (isDisposed) disposePromise();

        disposeSocket();

        socket = new WebSocketConstructor(url, protocols);
        if (binaryType) socket.binaryType = binaryType;

        let isOpen = false;

        socket.onopen = () => {
          isOpen = true;
          onOpen?.();
        };

        socket.onerror = (event) => {
          const error: WebSocketConnectionError | WebSocketConnectError = isOpen
            ? { type: "WebSocketConnectionError", event }
            : { type: "WebSocketConnectError", event };
          onError?.(error);

          // Trigger reconnect only on WebSocketConnectError.
          if (error.type === "WebSocketConnectError") {
            resolve(err(error));
          }
        };

        socket.onclose = (event) => {
          onClose?.(event);
          resolve(err({ type: "WebSocketConnectionCloseError", event }));
        };

        socket.onmessage = (
          event: MessageEvent<string | ArrayBuffer | Blob>,
        ) => {
          onMessage?.(event.data);
        };
      }),
  )(reconnectController).then((result) => {
    if (result.ok || result.error.type === "AbortError") return;
    onError?.(result.error as WebSocketError);
  });

  return {
    send: (data) => {
      // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send
      if (!socket || socket.readyState === socket.CONNECTING) {
        return err({ type: "WebSocketSendError" });
      }
      socket.send(data);
      return ok();
    },

    getReadyState: () =>
      socket ? nativeToStringState[socket.readyState] : "connecting",

    isOpen: () => (socket ? socket.readyState === socket.OPEN : false),

    [Symbol.dispose]() {
      if (isDisposed) return;
      isDisposed = true;
      reconnectController.abort();
      disposeSocket();
      disposePromise?.();
    },
  };
};

const nativeToStringState: Record<number, WebSocketReadyState> = {
  [WebSocket.CONNECTING]: "connecting",
  [WebSocket.OPEN]: "open",
  [WebSocket.CLOSING]: "closing",
  [WebSocket.CLOSED]: "closed",
};
