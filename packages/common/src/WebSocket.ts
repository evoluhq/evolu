/**
 * WebSocket with auto-reconnect.
 *
 * @module
 */

import { assert } from "./Assert.ts";
import { constTrue } from "./Function.ts";
import type { Result } from "./Result.ts";
import { err, ok } from "./Result.ts";
import type { Schedule } from "./Schedule.ts";
import { exponential, jitter, maxDelay } from "./Schedule.ts";
import type { RetryError, Task } from "./Task.ts";
import { callback, retry } from "./Task.ts";
import type { Duration, Millis, PerformanceTime } from "./Time.ts";
import { durationToMillis, performanceDurationBetween } from "./Time.ts";
import { ArrayBuffer, String, Uint8Array, type Typed } from "./Type.ts";

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
 * ### Connecting and sending
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertLength,
 *   assertOk,
 *   assertSame,
 *   createRun,
 *   createWebSocket,
 *   testCreateWebSocket,
 *   type CreateWebSocket,
 *   type Task,
 *   type WebSocketSendError,
 * } from "@evolu/common";
 *
 * const connectAndSend =
 *   (
 *     createSocket: CreateWebSocket = createWebSocket,
 *   ): Task<void, WebSocketSendError> =>
 *   async (run) => {
 *     await using socket = await run.ok(
 *       createSocket("wss://example.com", {
 *         protocols: ["evolu"],
 *         binaryType: "arraybuffer",
 *       }),
 *     );
 *     return socket.send("Hello");
 *   };
 *
 * const socketFactory = testCreateWebSocket();
 * await using run = createRun();
 *
 * assertOk(await run(connectAndSend(socketFactory)), undefined);
 * assertLength(socketFactory.sentMessages, 1);
 * const message = socketFactory.sentMessages[0];
 * assertSame(typeof message.data, "string");
 * assertEqual(
 *   { url: message.url, data: message.data },
 *   { url: "wss://example.com", data: "Hello" },
 * );
 * ```
 *
 * @group Core
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

  /**
   * Abandons the current connection and connects again.
   *
   * Use it when the connection is dead although it never closed, for example
   * when a request stays unanswered. The wrapper cannot detect that by itself:
   * no close or error event arrives, so its own reconnect never runs.
   *
   * The connection is dropped without waiting for a close handshake, and
   * neither {@link WebSocketOptions.onClose} nor
   * {@link WebSocketOptions.shouldRetryOnClose} is consulted, because the close
   * is this call rather than something to learn about or veto. A connection
   * that was open restarts the {@link WebSocketOptions.schedule}, as a close
   * after {@link WebSocketOptions.healthyConnectionDuration} does; one that was
   * still connecting keeps its backoff, having proved nothing.
   *
   * A connection already closing or closed is left to settle on its own, and
   * after disposal this does nothing, so a timer or handler that outlives the
   * connection is safe to call it from.
   */
  readonly reconnect: () => void;
}

/**
 * An error that occurs when trying to send data but WebSocket is not available
 * or is in the CONNECTING state.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/send
 *
 * @group Errors
 */
export interface WebSocketSendError extends Typed<"WebSocketSendError"> {}

/**
 * WebSocket connection states.
 *
 * @group Core
 */
export type WebSocketReadyState = "connecting" | "open" | "closing" | "closed";

/**
 * What a {@link WebSocket} reports when a connection closes.
 *
 * These are the fields every platform provides. Evolu does not use the DOM
 * `CloseEvent` type: React Native delivers its own close event and exposes no
 * `CloseEvent` global, so promising the DOM type would promise an inheritance
 * chain and an `instanceof` that do not hold there. A platform's own close
 * event is structurally assignable to this, and {@link createWebSocket} passes
 * it through unchanged, so a caller that knows its platform can narrow it.
 *
 * @group Core
 */
export interface WebSocketCloseEvent {
  /** https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code */
  readonly code: number;

  /** https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/reason */
  readonly reason: string;

  /** Whether the connection closed after a completed closing handshake. */
  readonly wasClean: boolean;
}

/**
 * {@link Task} that creates a {@link WebSocket}.
 *
 * @group Core
 */
export type CreateWebSocket = (
  url: string,
  options?: WebSocketOptions,
) => Task<WebSocket>;

/**
 * Dependency wrapper for {@link CreateWebSocket}.
 *
 * @group Core
 */
export interface CreateWebSocketDep {
  readonly createWebSocket: CreateWebSocket;
}

/**
 * Options for creating {@link WebSocket}.
 *
 * @group Core
 */
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
  readonly onClose?: (event: WebSocketCloseEvent) => void;

  /**
   * Determines whether a closed connection should trigger a retry.
   *
   * Return false to stop retrying, for example on auth errors or maintenance.
   */
  readonly shouldRetryOnClose?: (event: WebSocketCloseEvent) => boolean;

  /** Callback when message data is received. */
  readonly onMessage?: (data: string | ArrayBuffer | Blob) => void;

  /**
   * Retry schedule for reconnection. Defaults to
   * {@link webSocketReconnectSchedule}.
   */
  readonly schedule?: Schedule<Millis, WebSocketRetryError>;

  /**
   * How long a connection must stay open for its close to start
   * {@link WebSocketOptions.schedule} over. Defaults to 30 seconds, the delay
   * cap of {@link webSocketReconnectSchedule}.
   *
   * The schedule is stateful and spans every reconnect, so without this a
   * client that has disconnected often keeps waiting the longest backoff delay
   * forever, even after hours of healthy connection. A connection that outlasts
   * the longest delay the schedule can produce shows the endpoint works, so the
   * next disconnect starts from the base delay again. Shorter connections reset
   * nothing, so an endpoint that accepts and immediately drops connections
   * still backs off.
   *
   * Choose it with the schedule rather than on its own: it is the schedule's
   * delay cap, which only the schedule knows. A schedule cannot be asked for
   * that cap, which is why this is an option rather than something derived. The
   * delays a schedule has already produced are no substitute, because a
   * jittered one produces delays near zero early on, and a threshold that low
   * would reset the backoff for exactly the endpoint it protects against.
   */
  readonly healthyConnectionDuration?: Duration;

  /**
   * For custom WebSocket implementations.
   *
   * This supports blob:
   *
   * https://github.com/callstackincubator/react-native-fast-io
   */
  readonly WebSocketConstructor?: typeof globalThis.WebSocket;
}

/**
 * Any error reported by a {@link WebSocket}, including exhausted reconnect
 * retries.
 *
 * @group Errors
 */
export type WebSocketError =
  | WebSocketConnectError
  | WebSocketConnectionError
  | RetryError<WebSocketRetryError>;

/**
 * An error that occurs when a connection cannot be established due to a network
 * error. Fires before `onclose`.
 *
 * @group Errors
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
 *
 * @group Errors
 */
export interface WebSocketConnectionError extends Typed<"WebSocketConnectionError"> {
  readonly event: Event;
}

/**
 * Errors that trigger a reconnect attempt under
 * {@link webSocketReconnectSchedule}.
 *
 * @group Errors
 */
export type WebSocketRetryError =
  | WebSocketConnectError
  | WebSocketConnectionCloseError
  | WebSocketReconnectError;

/**
 * The error {@link WebSocket.reconnect} settles the current connection with.
 *
 * Reconnecting is not a close, so it carries no close event: nothing observed
 * one to report.
 *
 * @group Errors
 */
export interface WebSocketReconnectError extends Typed<"WebSocketReconnectError"> {}

/**
 * An error that occurs when the connection is closed by the server.
 *
 * @group Errors
 */
export interface WebSocketConnectionCloseError extends Typed<"WebSocketConnectionCloseError"> {
  readonly event: WebSocketCloseEvent;
}

/**
 * Default WebSocket reconnect schedule.
 *
 * Uses unlimited exponential backoff with a 100ms base, 30s cap, and full
 * jitter.
 *
 * @group Core
 */
export const webSocketReconnectSchedule: Schedule<Millis, WebSocketRetryError> =
  /*#__PURE__*/ jitter("100%")(
    /*#__PURE__*/ maxDelay("30s")(/*#__PURE__*/ exponential("100ms")),
  );

/** The delay cap of {@link webSocketReconnectSchedule}. */
const defaultHealthyConnectionDuration = /*#__PURE__*/ durationToMillis("30s");

/**
 * Create a new {@link WebSocket}.
 *
 * @group Core
 */
export const createWebSocket: CreateWebSocket =
  (
    url,
    {
      protocols,
      binaryType,
      onOpen,
      onClose,
      shouldRetryOnClose = constTrue,
      onMessage,
      onError,
      schedule = webSocketReconnectSchedule,
      healthyConnectionDuration = defaultHealthyConnectionDuration,
      WebSocketConstructor = globalThis.WebSocket,
    } = {},
  ) =>
  async (run) => {
    await using disposer = new AsyncDisposableStack();

    const healthyConnectionMillis = durationToMillis(healthyConnectionDuration);

    let socket: globalThis.WebSocket | null = null;
    // Set by a close that proves the endpoint works and by `reconnect`, and
    // consumed by the next schedule step.
    let shouldResetSchedule = false;
    let resolveConnect: ConnectResolve | null = null;

    const closeSocket = () => {
      if (!socket) return;

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- This adapter owns and clears one handler.
      socket.onopen = null;
      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- This adapter owns and clears one handler.
      socket.onclose = null;
      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- This adapter owns and clears one handler.
      socket.onmessage = null;
      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- This adapter owns and clears one handler.
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
    const connect: Task<void, WebSocketRetryError> = callback(({ resolve }) => {
      closeSocket();
      resolveConnect = resolve;

      socket = new WebSocketConstructor(
        url,
        String.is(protocols) ? protocols : protocols && [...protocols],
      );

      if (binaryType) socket.binaryType = binaryType;

      let isOpen = false;
      // Monotonic: how long the connection lasted must not follow a system
      // clock adjustment, which would reset the schedule for a connection that
      // proved nothing, or withhold the reset from one that proved the
      // endpoint works.
      let openedAt: PerformanceTime | null = null;

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- This adapter owns and clears one handler.
      socket.onopen = () => {
        isOpen = true;
        openedAt = run.deps.time.performance.now();
        onOpen?.();
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- This adapter owns and clears one handler.
      socket.onclose = (event) => {
        if (
          openedAt !== null &&
          performanceDurationBetween(
            openedAt,
            run.deps.time.performance.now(),
          ) >= healthyConnectionMillis
        )
          shouldResetSchedule = true;
        onClose?.(event);
        if (shouldRetryOnClose(event)) {
          resolve(err({ type: "WebSocketConnectionCloseError", event }));
        } else {
          resolve(ok());
        }
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- This adapter owns and clears one handler.
      socket.onmessage = (event: MessageEvent<string | ArrayBuffer | Blob>) => {
        onMessage?.(event.data);
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- This adapter owns and clears one handler.
      socket.onerror = (event) => {
        const error: WebSocketConnectionError | WebSocketConnectError = isOpen
          ? { type: "WebSocketConnectionError", event }
          : { type: "WebSocketConnectError", event };
        onError?.(error);

        if (error.type === "WebSocketConnectError") resolve(err(error));
      };

      return () => {
        resolveConnect = null;
        closeSocket();
      };
    });

    /**
     * Wraps `schedule` so a healthy connection starts its backoff over.
     *
     * `retry` builds one schedule step per call and `connect` settles only when
     * a connection closes, so a single step would otherwise accumulate backoff
     * across every close for this wrapper's lifetime.
     */
    const reconnectSchedule: Schedule<Millis, WebSocketRetryError> = (deps) => {
      let step = schedule(deps);
      return (error) => {
        if (shouldResetSchedule) {
          shouldResetSchedule = false;
          step = schedule(deps);
        }
        return step(error);
      };
    };

    const retryFiber = disposer.use(
      run.daemon(retry(connect, reconnectSchedule)),
    );

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

      reconnect: () => {
        const resolve = resolveConnect;
        if (disposables.disposed || !resolve || !socket) return;
        // A closing or closed socket settles the connection on its own.
        // Reconnecting it would discard `shouldRetryOnClose` and restart the
        // schedule for a close that proved nothing. `onClose` and `onError`
        // run before that settlement, so a handler can reach this.
        if (
          socket.readyState !== socket.CONNECTING &&
          socket.readyState !== socket.OPEN
        )
          return;
        // Only a connection that was open makes the backoff before it stale.
        if (socket.readyState === socket.OPEN) shouldResetSchedule = true;
        resolveConnect = null;
        // Handlers are cleared before settling, so the abandoned connection
        // reports nothing while `retry` waits out its delay.
        closeSocket();
        resolve(err({ type: "WebSocketReconnectError" }));
      },

      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    });
  };

/** The `resolve` a {@link callback} hands to the connect Task. */
type ConnectResolve = (result: Result<void, WebSocketRetryError>) => void;

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
 *
 * Sockets report the states {@link createWebSocket} reports, including the
 * `connecting` a socket is in before it opens and while the wrapper retries
 * after a close or a {@link WebSocket.reconnect}. Only disposal ends in
 * `closed`. The `closing` state is not modeled: no helper starts a close
 * handshake.
 *
 * @group Testing
 */
export interface TestCreateWebSocket extends CreateWebSocket {
  readonly createdUrls: Array<string>;
  /** URLs whose newest socket was reconnected, in call order. */
  readonly reconnectedUrls: Array<string>;
  readonly sentMessages: Array<{
    readonly url: string;
    readonly data: BufferSource | Blob | string | globalThis.Uint8Array;
  }>;
  readonly message: (url: string, data: string | ArrayBuffer | Blob) => void;
  readonly open: (url: string) => void;
  /**
   * Reports the close event, with `code` defaulting to 1006, and leaves the
   * socket connecting.
   */
  readonly close: (url: string, event?: Partial<WebSocketCloseEvent>) => void;
  readonly error: (url: string, error: WebSocketError) => void;
}

/**
 * Creates {@link TestCreateWebSocket}.
 *
 * @group Testing
 */
export const testCreateWebSocket = (
  options: {
    /** Throw immediately when a socket is created. */
    readonly throwOnCreate?: boolean;

    /**
     * Whether created sockets start open, skipping
     * {@link TestCreateWebSocket.open}. Defaults to true. A socket that does not
     * start open is connecting.
     */
    readonly isOpen?: boolean;
  } = {},
): TestCreateWebSocket => {
  const createdUrls: Array<string> = [];
  const reconnectedUrls: Array<string> = [];
  const sentMessages: Array<{
    readonly url: string;
    readonly data: BufferSource | Blob | string | globalThis.Uint8Array;
  }> = [];
  const stateByUrl = new Map<string, TestWebSocketState>();

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
    // A URL can be created again after its socket was disposed. Each socket
    // keeps its own state; the helpers address the newest socket for a URL.
    const state: TestWebSocketState = {
      options: socketOptions,
      readyState: (options.isOpen ?? true) ? "open" : "connecting",
      isDisposed: false,
    };
    stateByUrl.set(url, state);

    return ok({
      send: (data) => {
        if (state.isDisposed || state.readyState !== "open") {
          return err({ type: "WebSocketSendError" });
        }
        sentMessages.push({
          url,
          data: ensureSendableData(data),
        });
        return ok();
      },

      getReadyState: () => (state.isDisposed ? "closed" : state.readyState),

      isOpen: () => !state.isDisposed && state.readyState === "open",

      reconnect: () => {
        // A closed socket settles on its own, as in `createWebSocket`.
        if (state.isDisposed || state.readyState === "closed") return;
        state.readyState = "connecting";
        reconnectedUrls.push(url);
      },

      [Symbol.asyncDispose]: () => {
        state.isDisposed = true;
        state.readyState = "closed";
        return Promise.resolve();
      },
    });
  };

  return Object.assign(createWebSocket, {
    createdUrls,
    reconnectedUrls,
    sentMessages,
    message: (url: string, data: string | ArrayBuffer | Blob) => {
      getState(url).options?.onMessage?.(data);
    },
    open: (url: string) => {
      const state = getState(url);
      state.readyState = "open";
      state.options?.onOpen?.();
    },
    close: (url: string, event: Partial<WebSocketCloseEvent> = {}) => {
      const state = getState(url);
      state.readyState = "closed";
      state.options?.onClose?.({
        code: 1006,
        reason: "",
        wasClean: false,
        ...event,
      });
      // `createWebSocket` still holds the closed socket while it reports the
      // close, and drops it to retry once that settles. Anything the handler
      // schedules therefore still reads `closed`; anything later reads
      // `connecting`.
      queueMicrotask(() => {
        if (state.readyState === "closed" && !state.isDisposed)
          state.readyState = "connecting";
      });
    },
    error: (url: string, error: WebSocketError) => {
      getState(url).options?.onError?.(error);
    },
  });
};

/** Mutable state of one socket created by {@link testCreateWebSocket}. */
interface TestWebSocketState {
  options: WebSocketOptions | undefined;
  readyState: WebSocketReadyState;
  isDisposed: boolean;
}

/**
 * A native {@link WebSocket} prepared for integration tests by
 * {@link testSetupWebSocket}.
 *
 * @group Testing
 */
export interface TestSetupWebSocket extends AsyncDisposable {
  readonly socket: globalThis.WebSocket;
  readonly send: (
    data: BufferSource | Blob | string | globalThis.Uint8Array,
  ) => void;
  readonly waitForMessage: () => Promise<string | globalThis.Uint8Array>;
}

/**
 * Opens a native {@link WebSocket} and returns {@link TestSetupWebSocket}.
 *
 * @group Testing
 */
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
