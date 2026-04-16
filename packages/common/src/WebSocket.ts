/**
 * WebSocket with auto-reconnect.
 *
 * @module
 */

import { assert } from "./Assert.js";
import { lazyTrue } from "./Function.js";
import type { Result } from "./Result.js";
import { err, ok } from "./Result.js";
import type { Schedule } from "./Schedule.js";
import { exponential, jitter, maxDelay } from "./Schedule.js";
import type { RetryError, Task } from "./Task.js";
import { callback, retry } from "./Task.js";
import type { Millis } from "./Time.js";
import { ArrayBuffer, String, Uint8Array, type Typed } from "./Type.js";

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
 * Disposing starts closing the connection without waiting for the close event
 * so disposal stays immediate. This wrapper treats disposal as local teardown,
 * not as waiting for the full WebSocket close handshake to finish.
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
    data: BufferSource | Blob | string | globalThis.Uint8Array,
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
    await using disposer = new AsyncDisposableStack();

    let socket: globalThis.WebSocket | null = null;

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

    const retryFiber = disposer.use(run.daemon(retry(connect, schedule)));

    // Report RetryError (schedule exhausted) via onError callback
    void retryFiber.then((result) => {
      if (!result.ok && result.error.type === "RetryError") {
        onError?.(result.error);
      }
    });

    const disposables = disposer.move();

    return ok<WebSocket>({
      send: (data) => {
        // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send
        if (!socket || socket.readyState === socket.CONNECTING) {
          return err({ type: "WebSocketSendError" });
        }
        socket.send(ensureSendableData(data));
        return ok();
      },

      getReadyState: () => {
        if (disposables.disposed) return "closed";
        return socket ? nativeToStringState[socket.readyState] : "connecting";
      },

      isOpen: () =>
        !disposables.disposed &&
        socket?.readyState === globalThis.WebSocket.OPEN,

      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    });
  };

/** Clones SharedArrayBuffer-backed Uint8Array values before WebSocket.send. */
const ensureSendableData = (
  data: BufferSource | Blob | string | globalThis.Uint8Array,
): BufferSource | Blob | string => {
  if (!Uint8Array.is(data)) return data;
  return ArrayBuffer.is(data.buffer)
    ? (data as globalThis.Uint8Array<ArrayBuffer>)
    : new globalThis.Uint8Array(data);
};

const nativeToStringState: Record<number, WebSocketReadyState> = {
  [globalThis.WebSocket.CONNECTING]: "connecting",
  [globalThis.WebSocket.OPEN]: "open",
  [globalThis.WebSocket.CLOSING]: "closing",
  [globalThis.WebSocket.CLOSED]: "closed",
};

/**
 * An inspectable in-memory {@link CreateWebSocket} for testing by
 * {@link testCreateWebSocket}.
 */
export interface TestCreateWebSocket extends CreateWebSocket {
  readonly createdUrls: Array<string>;
  readonly sentMessages: Array<{
    readonly url: string;
    readonly data: BufferSource | Blob | string | globalThis.Uint8Array;
  }>;
  readonly message: (url: string, data: string | ArrayBuffer | Blob) => void;
  readonly open: (url: string) => void;
}

/** Creates {@link TestCreateWebSocket}. */
export const testCreateWebSocket = (
  options: {
    /** Throw immediately when a socket is created. */
    readonly throwOnCreate?: boolean;

    /** Initial open state of created sockets. Defaults to true. */
    readonly isOpen?: boolean;
  } = {},
): TestCreateWebSocket => {
  const createdUrls: Array<string> = [];
  const sentMessages: Array<{
    readonly url: string;
    readonly data: BufferSource | Blob | string | globalThis.Uint8Array;
  }> = [];
  const stateByUrl = new Map<
    string,
    {
      options: WebSocketOptions | undefined;
      isOpen: boolean;
      isDisposed: boolean;
    }
  >();

  const getState = (url: string) => {
    const state = stateByUrl.get(url);
    assert(state, `Test WebSocket for ${url} does not exist.`);
    return state;
  };

  const createWebSocket: CreateWebSocket = (url, socketOptions) => () => {
    if (options.throwOnCreate) {
      throw new Error("testCreateWebSocket is configured to throw on create");
    }

    createdUrls.push(url);
    stateByUrl.set(url, {
      options: socketOptions,
      isOpen: options.isOpen ?? true,
      isDisposed: false,
    });

    return ok({
      send: (data) => {
        const state = getState(url);
        if (state.isDisposed || !state.isOpen) {
          return err({ type: "WebSocketSendError" });
        }
        sentMessages.push({
          url,
          data: ensureSendableData(data),
        });
        return ok();
      },

      getReadyState: () => {
        const state = getState(url);
        if (state.isDisposed) return "closed";
        return state.isOpen ? "open" : "closed";
      },

      isOpen: () => {
        const state = getState(url);
        return !state.isDisposed && state.isOpen;
      },

      [Symbol.asyncDispose]: () => {
        const state = getState(url);
        state.isDisposed = true;
        state.isOpen = false;
        return Promise.resolve();
      },
    });
  };

  return Object.assign(createWebSocket, {
    createdUrls,
    sentMessages,
    message: (url: string, data: string | ArrayBuffer | Blob) => {
      getState(url).options?.onMessage?.(data);
    },
    open: (url: string) => {
      const state = getState(url);
      state.isOpen = true;
      state.options?.onOpen?.();
    },
  });
};

/**
 * A native {@link WebSocket} prepared for integration tests by
 * {@link testSetupWebSocket}.
 */
export interface TestSetupWebSocket extends AsyncDisposable {
  readonly socket: globalThis.WebSocket;
  readonly send: (
    data: BufferSource | Blob | string | globalThis.Uint8Array,
  ) => void;
  readonly waitForMessage: () => Promise<string | globalThis.Uint8Array>;
}

/** Opens a native {@link WebSocket} and returns {@link TestSetupWebSocket}. */
export const testSetupWebSocket = async (
  url: string,
): Promise<TestSetupWebSocket> => {
  const socket = new globalThis.WebSocket(url);
  socket.binaryType = "arraybuffer";

  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      socket.close();
      reject(new Error("WebSocket connection failed"));
    };

    const cleanup = () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
    };

    socket.addEventListener("open", onOpen, { once: true });
    socket.addEventListener("error", onError, { once: true });
  });

  return {
    socket,
    send: (data) => {
      socket.send(ensureSendableData(data));
    },
    waitForMessage: () =>
      new Promise((resolve, reject) => {
        if (socket.readyState === globalThis.WebSocket.CLOSED) {
          reject(new Error("WebSocket closed before message"));
          return;
        }

        const onMessage = (event: MessageEvent) => {
          cleanup();

          if (typeof event.data === "string") {
            resolve(event.data);
            return;
          }

          resolve(new globalThis.Uint8Array(event.data as ArrayBuffer));
        };

        const onClose = () => {
          cleanup();
          reject(new Error("WebSocket closed before message"));
        };

        const cleanup = () => {
          socket.removeEventListener("message", onMessage);
          socket.removeEventListener("close", onClose);
        };

        socket.addEventListener("message", onMessage, { once: true });
        socket.addEventListener("close", onClose, { once: true });
      }),
    [Symbol.asyncDispose]: async () => {
      if (socket.readyState === globalThis.WebSocket.CLOSED) return;

      const closed = new Promise<void>((resolve) => {
        socket.addEventListener("close", () => resolve(), { once: true });
      });

      socket.close();
      await closed;
    },
  };
};
