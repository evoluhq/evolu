import { afterEach, beforeEach, expect, test, vi } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { err, ok } from "../src/Result.js";
import { wait } from "../src/OldTask.js";
import type { AbortError, RetryError } from "../src/OldTask.js";
import { PositiveInt } from "../src/Type.js";
import { createWebSocket } from "../src/WebSocket.js";
import type {
  WebSocketError,
  WebSocketReadyState,
  WebSocketRetryError,
} from "../src/WebSocket.js";

let wsServer: WebSocketServer;
let serverUrl: string;

beforeEach(() => {
  // Create server with random port (0)
  wsServer = new WebSocketServer({ port: 0 });

  // Get the actual port assigned by the OS
  const address = wsServer.address();
  if (address && typeof address === "object") {
    serverUrl = `ws://localhost:${address.port}`;
  } else {
    throw new Error("Failed to get WebSocketServer address");
  }

  wsServer.on("connection", (socket) => {
    // Echo messages back to client
    socket.on("message", (data) => {
      socket.send(data);
    });

    socket.send("welcome");
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    wsServer.close(() => {
      resolve();
    });
  });
});

test("connects to WebSocket server", async () => {
  const { promise, resolve } = Promise.withResolvers<true>();

  const socket = createWebSocket(serverUrl, {
    onOpen: () => {
      resolve(true);
    },
  });

  await promise;

  expect(socket.getReadyState() === "open").toBe(true);
  socket[Symbol.dispose]();
});

test("receives data from server", async () => {
  const { promise, resolve } = Promise.withResolvers<string>();

  const socket = createWebSocket(serverUrl, {
    onMessage: (data) => {
      if (typeof data === "string" && data === "welcome") {
        resolve(data);
      }
    },
  });

  const message = await promise;
  expect(message).toBe("welcome");
  socket[Symbol.dispose]();
});

test("sends data to server and receives echo", async () => {
  const testMessage = "hello server";
  const { promise, resolve } = Promise.withResolvers<Blob>();

  const socket = createWebSocket(serverUrl, {
    onOpen: () => {
      const result = socket.send(testMessage);
      expect(result).toEqual(ok());
    },
    onMessage: (data) => {
      if (data instanceof Blob) {
        resolve(data);
      }
    },
  });

  const message = await (await promise).text();
  expect(message).toBe(testMessage);
  socket[Symbol.dispose]();
});

test("reports connection error", async () => {
  const INVALID_URL = "ws://localhost:12345"; // Port with no server
  const { promise, resolve } = Promise.withResolvers<WebSocketError>();

  const socket = createWebSocket(INVALID_URL, {
    onError: (error) => {
      if (error.type === "WebSocketConnectError") {
        resolve(error);
      }
    },
  });

  const connectionError = await promise;
  expect(connectionError.type).toBe("WebSocketConnectError");

  socket[Symbol.dispose]();
});

test("returns error when sending to closed connection", () => {
  const socket = createWebSocket(serverUrl);

  socket[Symbol.dispose](); // Close immediately

  // Try to send after closing
  const result = socket.send("test message");

  expect(result).toEqual(err({ type: "WebSocketSendError" }));
});

test("automatically reconnects on close", async () => {
  let openCount = 0;
  let closeCount = 0;
  const { promise: initialOpenPromise, resolve: initialOpenResolve } =
    Promise.withResolvers<undefined>();
  const { promise: reconnectPromise, resolve: reconnectResolve } =
    Promise.withResolvers<undefined>();
  const { promise: connectionPromise, resolve: connectionResolve } =
    Promise.withResolvers<WebSocket>();

  // Keep track of the server-side socket so we can close it
  wsServer.once("connection", (socket) => {
    connectionResolve(socket);
  });

  const socket = createWebSocket(serverUrl, {
    onOpen: () => {
      openCount++;
      if (openCount === 1) initialOpenResolve(undefined);
      if (openCount === 2) reconnectResolve(undefined);
    },
    onClose: () => {
      closeCount++;
    },
  });

  // Wait for initial connection
  await initialOpenPromise;
  expect(openCount).toBe(1);

  // Close server-side socket to trigger reconnection
  const serverSocket = await connectionPromise;
  serverSocket.close();

  // Wait for reconnection
  await reconnectPromise;

  expect(closeCount).toBe(1);
  expect(openCount).toBe(2); // Should have reconnected once

  socket[Symbol.dispose]();
});

test("calls onRetry during reconnection attempts", async () => {
  const INVALID_URL = "ws://localhost:12345"; // Port with no server
  const { promise, resolve } = Promise.withResolvers<WebSocketRetryError>();
  const onRetry = vi.fn().mockImplementation((error: WebSocketRetryError) => {
    resolve(error as never);
  });

  const socket = createWebSocket(INVALID_URL, {
    retryOptions: { retries: PositiveInt.orThrow(1), onRetry },
  });

  const error = await promise;

  expect(onRetry).toHaveBeenCalled();
  expect(error.type).toBe("WebSocketConnectError");

  socket[Symbol.dispose]();
});

test("uses binary type specified in options", async () => {
  const binaryData = new Uint8Array([1, 2, 3, 4]);
  const { promise, resolve } = Promise.withResolvers<ArrayBuffer>();

  const socket = createWebSocket(serverUrl, {
    binaryType: "arraybuffer",
    onOpen: () => {
      socket.send(binaryData);
    },
    onMessage: (data) => {
      if (data instanceof ArrayBuffer) {
        resolve(data);
      }
    },
  });

  const receivedBuffer = await promise;
  expect(receivedBuffer).toBeInstanceOf(ArrayBuffer);

  const receivedArray = new Uint8Array(receivedBuffer);
  expect(Array.from(receivedArray)).toEqual([1, 2, 3, 4]);

  socket[Symbol.dispose]();
});

test("respects protocol option", async () => {
  const customProtocol = "custom-protocol";
  const { promise, resolve } = Promise.withResolvers<boolean>();

  // Set up a special handler to check protocol
  wsServer.once("connection", (_socket, request) => {
    if (request.headers["sec-websocket-protocol"] === customProtocol) {
      resolve(true);
    } else {
      resolve(false);
    }
  });

  const socket = createWebSocket(serverUrl, {
    protocols: customProtocol,
  });

  const protocolUsed = await promise;
  expect(protocolUsed).toBe(true);

  socket[Symbol.dispose]();
});

test("handles multiple WebSocket instances", async () => {
  const { promise: promise1, resolve: resolve1 } =
    Promise.withResolvers<undefined>();
  const { promise: promise2, resolve: resolve2 } =
    Promise.withResolvers<undefined>();

  const socket1 = createWebSocket(serverUrl, {
    onOpen: () => {
      resolve1(undefined);
    },
  });

  const socket2 = createWebSocket(serverUrl, {
    onOpen: () => {
      resolve2(undefined);
    },
  });

  // Wait for connections
  await Promise.all([promise1, promise2]);

  expect(socket1.getReadyState() === "open").toBe(true);
  expect(socket2.getReadyState() === "open").toBe(true);

  socket1[Symbol.dispose]();
  socket2[Symbol.dispose]();
});

test("cleans up all resources when dispose is called", async () => {
  // Create spy functions to verify cleanup
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const onError = vi.fn();

  // Create WebSocket with spies
  const socket = createWebSocket(serverUrl, {
    onOpen,
    onClose,
    onError,
  });

  // Wait for the socket to open using a Promise.withResolvers pattern
  const { promise: openPromise, resolve: openResolve } =
    Promise.withResolvers<undefined>();

  // Update the onOpen spy to also resolve our promise
  onOpen.mockImplementation(() => {
    openResolve(undefined);
  });

  await openPromise;

  // Verify socket is open before disposing
  expect(socket.getReadyState() === "open").toBe(true);
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();

  // Dispose the socket
  socket[Symbol.dispose]();

  // Verify socket is properly closed by checking send behavior
  const sendResult = socket.send("test after dispose");
  expect(sendResult).toEqual(err({ type: "WebSocketSendError" }));

  // Wait a bit to ensure no reconnection attempts
  await wait("500ms")();

  // No additional onOpen calls should happen after disposal
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test("correctly transitions through readyState values", async () => {
  const states: Array<WebSocketReadyState> = [];
  let connectionPhase = 0;
  const { promise, resolve } = Promise.withResolvers<undefined>();

  // Track server-side socket for controlled closing
  const { promise: serverSocketPromise, resolve: serverSocketResolve } =
    Promise.withResolvers<WebSocket>();

  wsServer.once("connection", (socket) => {
    serverSocketResolve(socket);
  });

  const socket = createWebSocket(serverUrl, {
    onOpen: () => {
      states.push(socket.getReadyState());
      connectionPhase++;

      // After connection established, close it from server side
      if (connectionPhase === 1) {
        void serverSocketPromise.then((serverSocket) => {
          serverSocket.close();
        });
      }

      // After reconnection, we've seen all states we need
      if (connectionPhase === 2) {
        resolve(undefined);
      }
    },
    onClose: () => {
      states.push(socket.getReadyState());
    },
  });

  // Initial state should be CONNECTING
  states.push(socket.getReadyState());

  // Wait for open->close->reopen cycle to complete
  await promise;

  // Properly clean up
  socket[Symbol.dispose]();

  // We expect to see these state transitions:
  // 1. CONNECTING (initial state)
  // 2. OPEN (after connection established)
  // 3. CLOSED (after server closes connection)
  // 4. OPEN (after reconnection)
  expect(states).toContain("connecting");
  expect(states).toContain("open");
  expect(states).toContain("closed");

  // The first state should be CONNECTING
  expect(states[0] === "connecting").toBe(true);

  // We should see at least one OPEN state
  expect(states.filter((s) => s === "open").length).toBeGreaterThanOrEqual(1);
});

test("respects maxRetries limit", async () => {
  const INVALID_URL = "ws://localhost:12345"; // Port with no server
  const MAX_RETRIES = 3;

  const onRetry = vi.fn();
  const onError = vi.fn();
  const { promise, resolve } =
    Promise.withResolvers<RetryError<WebSocketRetryError>>();

  const socket = createWebSocket(INVALID_URL, {
    retryOptions: {
      retries: PositiveInt.orThrow(MAX_RETRIES),
      initialDelay: "100ms",
      maxDelay: "10s",
      jitter: 0.1,
      onRetry,
    },
    onError: (error) => {
      onError(error);
      if (error.type === "RetryError") {
        resolve(error);
      }
    },
  });

  // Wait for retries to exhaust
  const error = await promise;

  // Verify the retry function was called MAX_RETRIES times
  expect(onRetry).toHaveBeenCalledTimes(MAX_RETRIES);

  // Verify we received the expected error
  expect(error.type).toBe("RetryError");
  expect(error.cause.type).toBe("WebSocketConnectError");
  expect(error.attempts).toBe(MAX_RETRIES + 1); // Initial attempt + retries

  socket[Symbol.dispose]();
});

test("aborts connection attempts when disposed", async () => {
  const INVALID_URL = "ws://localhost:12345"; // Port with no server

  // Track retry calls
  const onRetry = vi.fn();
  let retryCallCount = 0;

  // Create a promise that resolves after first retry
  const { promise: retryPromise, resolve: retryResolve } =
    Promise.withResolvers<undefined>();

  const socket = createWebSocket(INVALID_URL, {
    retryOptions: {
      retries: PositiveInt.orThrow(1),
      onRetry: (error) => {
        onRetry(error);
        retryCallCount++;

        // After the first retry, resolve promise so we can dispose
        if (retryCallCount === 1) {
          retryResolve(undefined);
        }
      },
    },
  });

  // Wait for first retry to occur
  await retryPromise;

  // Now dispose the socket to abort reconnection
  socket[Symbol.dispose]();

  // Record the current call count
  const callCountAtDispose = onRetry.mock.calls.length;

  // Wait some time to ensure no more retries happen
  await wait("500ms")();

  // Verify no additional retry calls happened after dispose
  expect(onRetry.mock.calls.length).toBe(callCountAtDispose);
});

test("retries only on specific error types", async () => {
  const INVALID_URL = "ws://localhost:12345"; // Port with no server

  const onRetry = vi.fn();
  const { promise, resolve } = Promise.withResolvers<WebSocketRetryError>();

  // Create a predicate that only retries WebSocketConnectionCloseError but not WebSocketConnectError
  const retryablePredicate = vi.fn(
    (error: WebSocketRetryError | AbortError) => {
      // Only retry on connection close errors, not on connect errors
      return error.type === "WebSocketConnectionCloseError";
    },
  );

  const socket = createWebSocket(INVALID_URL, {
    retryOptions: {
      retries: PositiveInt.orThrow(1),
      onRetry: (error) => {
        onRetry(error);
      },
      retryable: retryablePredicate,
    },
    onError: (error) => {
      // When we get a RetryError, we want to see what error caused it
      if (error.type === "RetryError") {
        resolve(error.cause);
      }
    },
  });

  // Wait for the RetryError
  const errorCause = await promise;

  // We should get a WebSocketConnectError since our predicate doesn't allow retrying those
  expect(errorCause.type).toBe("WebSocketConnectError");

  // The retryable predicate should be called exactly once
  expect(retryablePredicate).toHaveBeenCalledTimes(1);

  // onRetry should not be called since we don't retry this error type
  expect(onRetry).not.toHaveBeenCalled();

  socket[Symbol.dispose]();
});

test("retries with increasing delays", async () => {
  const INVALID_URL = "ws://localhost:12345"; // Port with no server

  // Track delays between retries
  const delays: Array<number> = [];
  const { promise, resolve } = Promise.withResolvers<undefined>();

  const socket = createWebSocket(INVALID_URL, {
    retryOptions: {
      // Use specific backoff parameters for predictable testing
      maxDelay: "10s",
      jitter: 0.1,
      initialDelay: "10ms",
      factor: 2,
      retries: PositiveInt.orThrow(3),
      onRetry: (_error, _attempt, delay) => {
        delays.push(delay);
        if (delays.length === 3) {
          resolve(undefined);
        }
      },
    },
  });

  // Wait for all retries to complete
  await promise;

  // We should have 3 delays recorded (for retries=3)
  expect(delays.length).toBe(3);

  // Verify exponential backoff pattern - delays should increase
  // We don't check exact values because jitter might affect them
  expect(delays[1]).toBeGreaterThan(delays[0]);
  expect(delays[2]).toBeGreaterThan(delays[1]);

  // Second delay should be approximately double the first (with some jitter)
  const ratio1 = delays[1] / delays[0];
  expect(ratio1).toBeGreaterThan(1.5);
  expect(ratio1).toBeLessThan(2.5);

  // Third delay should be approximately double the second (with some jitter)
  const ratio2 = delays[2] / delays[1];
  expect(ratio2).toBeGreaterThan(1.5);
  expect(ratio2).toBeLessThan(2.5);

  socket[Symbol.dispose]();
});

test("should not retry on invalid payload data close code", async () => {
  // Create promises to track test flow
  const { promise: openPromise, resolve: openResolve } =
    Promise.withResolvers<undefined>();
  const { promise: serverSocketPromise, resolve: serverSocketResolve } =
    Promise.withResolvers<WebSocket>();
  const { promise: errorPromise, resolve: errorResolve } =
    Promise.withResolvers<RetryError<WebSocketRetryError>>();

  // Track the server-side socket
  wsServer.once("connection", (socket) => {
    serverSocketResolve(socket);
  });

  // Create a retryable predicate that doesn't retry on invalid payload data
  const retryablePredicate = vi.fn(
    (error: WebSocketRetryError | AbortError) => {
      if (error.type === "WebSocketConnectionCloseError") {
        // Don't retry on Invalid Payload Data (1007)
        return error.event.code !== 1007;
      }
      return true;
    },
  );

  const onRetry = vi.fn();

  const socket = createWebSocket(serverUrl, {
    onOpen: () => {
      openResolve(undefined);
    },
    retryOptions: {
      retries: PositiveInt.orThrow(1),
      retryable: retryablePredicate,
      onRetry,
    },
    onError: (error) => {
      if (error.type === "RetryError") {
        errorResolve(error);
      }
    },
  });

  await openPromise;

  // Get the server socket and close it with Invalid Payload Data code
  const serverSocket = await serverSocketPromise;
  const INVALID_PAYLOAD_CODE = 1007;
  serverSocket.close(INVALID_PAYLOAD_CODE);

  await errorPromise;

  // Verify retryable was called with the close error
  expect(retryablePredicate).toHaveBeenCalledTimes(1);

  // The first argument should be a WebSocketConnectionCloseError
  const closeError = retryablePredicate.mock.calls[0][0];
  expect(closeError.type).toBe("WebSocketConnectionCloseError");
  if (closeError.type === "WebSocketConnectionCloseError")
    expect(closeError.event.code).toBe(INVALID_PAYLOAD_CODE);

  // onRetry should not have been called since we don't retry this code
  expect(onRetry).not.toHaveBeenCalled();

  socket[Symbol.dispose]();
});
