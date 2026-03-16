import { afterEach, assert, beforeEach, expect, test, vi } from "vitest";
import { utf8ToBytes } from "../src/Buffer.js";
import { isServer } from "../src/Platform.js";
import { spaced, take } from "../src/Schedule.js";
import { createRun } from "../src/Task.js";
import { createWebSocket, type WebSocketError } from "../src/WebSocket.js";

declare module "vitest/browser" {
  interface BrowserCommands {
    startWsServer: () => Promise<number>;
    stopWsServer: (port: number) => Promise<void>;
  }
}

let port: number | undefined;
const getServerUrl = (path = ""): string => {
  if (port === undefined) throw new Error("Server port not initialized");
  return `ws://localhost:${port}${path ? "/" + path : ""}`;
};

beforeEach(async () => {
  if (isServer) {
    const { createServer } = await import("./_globalSetup.js");
    port = await createServer();
  } else {
    const { commands } = await import("vitest/browser");
    port = await commands.startWsServer();
  }
});

afterEach(async () => {
  if (port === undefined) return;
  const currentPort = port;
  port = undefined;
  if (isServer) {
    const { closeServer } = await import("./_globalSetup.js");
    await closeServer(currentPort);
  } else {
    const { commands } = await import("vitest/browser");
    await commands.stopWsServer(currentPort);
  }
});

test("connects, receives message, sends message, and disposes", async () => {
  await using run = createRun();

  const messages: Array<Uint8Array> = [];

  const ws = await run.orThrow(
    createWebSocket(getServerUrl(), {
      binaryType: "arraybuffer",
      onMessage: (data) => {
        assert(data instanceof ArrayBuffer);
        messages.push(new Uint8Array(data));
      },
    }),
  );

  {
    await using _ws = ws;

    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(messages).toEqual([utf8ToBytes("welcome")]);

    const sendResult = ws.send(utf8ToBytes("hello"));
    expect(sendResult.ok).toBe(true);

    await vi.waitFor(() => expect(messages).toHaveLength(2));
    expect(messages).toEqual([utf8ToBytes("welcome"), utf8ToBytes("hello")]);
  }

  expect(ws.getReadyState()).toBe("closed");
});

test("calls onOpen callback", async () => {
  await using run = createRun();

  let openCalled = false;

  const ws = await run.orThrow(
    createWebSocket(getServerUrl(), {
      onOpen: () => {
        openCalled = true;
      },
    }),
  );

  {
    await using _ws = ws;

    await vi.waitFor(() => expect(openCalled).toBe(true));
    expect(ws.isOpen()).toBe(true);
    expect(ws.getReadyState()).toBe("open");
  }

  expect(ws.isOpen()).toBe(false);
});

test("does not call onClose when disposed", async () => {
  await using run = createRun();

  let openCalled = false;
  let closeCalled = false;

  const ws = await run.orThrow(
    createWebSocket(getServerUrl(), {
      onOpen: () => {
        openCalled = true;
      },
      onClose: () => {
        closeCalled = true;
      },
    }),
  );

  {
    await using _ws = ws;

    await vi.waitFor(() => expect(openCalled).toBe(true));
  }

  expect(closeCalled).toBe(false);
});

test("send returns error when socket is not ready", async () => {
  await using run = createRun();

  const ws = await run.orThrow(createWebSocket(getServerUrl()));

  {
    await using _ws = ws;
  }

  // Now send should fail
  const sendResult = ws.send("test");
  expect(sendResult.ok).toBe(false);
  if (!sendResult.ok) {
    expect(sendResult.error.type).toBe("WebSocketSendError");
  }
});

test("supports protocols as array", async () => {
  await using run = createRun();

  let openCalled = false;

  await using _ws = await run.orThrow(
    createWebSocket(getServerUrl(), {
      protocols: ["protocol1", "protocol2"],
      onOpen: () => {
        openCalled = true;
      },
    }),
  );

  await vi.waitFor(() => expect(openCalled).toBe(true));
});

test("supports protocols as string", async () => {
  await using run = createRun();

  let openCalled = false;

  await using _ws = await run.orThrow(
    createWebSocket(getServerUrl(), {
      protocols: "protocol1",
      onOpen: () => {
        openCalled = true;
      },
    }),
  );

  await vi.waitFor(() => expect(openCalled).toBe(true));
});

test("getReadyState returns connecting when socket is null", async () => {
  await using run = createRun();

  // Create with invalid URL and no retries to test null socket state
  await using ws = await run.orThrow(
    createWebSocket("ws://localhost:1", {
      schedule: take(0)(spaced("1ms")),
    }),
  );

  // After failed connection with no retries, socket is null
  await vi.waitFor(() => expect(ws.getReadyState()).toBe("connecting"));
});

test("calls onError on connection failure", async () => {
  await using run = createRun();

  const errors: Array<WebSocketError> = [];

  // Use invalid port to trigger connection error
  await using _ws = await run.orThrow(
    createWebSocket("ws://localhost:1", {
      schedule: take(0)(spaced("1ms")), // No retry - fail immediately
      onError: (error) => {
        errors.push(error);
      },
    }),
  );

  await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0));
  expect(errors[0]?.type).toBe("WebSocketConnectError");
});

test("calls onClose when server closes connection", async () => {
  await using run = createRun();

  let closeCalled = false;

  await using _ws = await run.orThrow(
    createWebSocket(getServerUrl("close"), {
      schedule: take(0)(spaced("1ms")), // No retry
      onClose: () => {
        closeCalled = true;
      },
    }),
  );

  await vi.waitFor(() => expect(closeCalled).toBe(true));
});

test("does not retry when shouldRetryOnClose returns false", async () => {
  await using run = createRun();

  const errors: Array<WebSocketError> = [];
  let closeCount = 0;

  await using _ws = await run.orThrow(
    createWebSocket(getServerUrl("close"), {
      schedule: take(2)(spaced("1ms")),
      shouldRetryOnClose: () => false,
      onClose: () => {
        closeCount++;
      },
      onError: (error) => {
        errors.push(error);
      },
    }),
  );

  await vi.waitFor(() => expect(closeCount).toBe(1));
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(closeCount).toBe(1);
  expect(errors).toHaveLength(0);
});

test("reconnects after server closes connection", async () => {
  await using run = createRun();

  const messages: Array<Uint8Array> = [];
  let closeCount = 0;

  await using ws = await run.orThrow(
    createWebSocket(getServerUrl("close-after-message"), {
      binaryType: "arraybuffer",
      schedule: spaced("1ms"), // Fast retry
      onMessage: (data) => {
        assert(data instanceof ArrayBuffer);
        messages.push(new Uint8Array(data));
      },
      onClose: () => {
        closeCount++;
      },
    }),
  );

  // Trigger close by sending a message (server closes after first message)
  await vi.waitFor(() => expect(messages).toHaveLength(1));
  ws.send("trigger-close");

  // Wait for reconnection (should receive "hello" from both connections)
  await vi.waitFor(() => expect(messages.length).toBeGreaterThanOrEqual(2));
  expect(closeCount).toBeGreaterThan(0);
});

test("reports RetryError when schedule is exhausted", async () => {
  await using run = createRun();

  const errors: Array<WebSocketError> = [];

  // Use close endpoint so each connection attempt succeeds then closes,
  // triggering retry until schedule is exhausted
  await using _ws = await run.orThrow(
    createWebSocket(getServerUrl("close"), {
      schedule: take(2)(spaced("1ms")), // Allow 2 retries then exhaust
      onError: (error) => {
        errors.push(error);
      },
    }),
  );

  await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0));
  expect(errors.map((e) => e.type)).toMatchInlineSnapshot(`
    [
      "RetryError",
    ]
  `);
});

test("WebSocketConnectionError behavior on abrupt termination", async () => {
  await using run = createRun();

  const errors: Array<WebSocketError> = [];
  let closeCalled = false;

  await using _ws = await run.orThrow(
    createWebSocket(getServerUrl("terminate"), {
      schedule: take(0)(spaced("1ms")), // No retry
      onError: (error) => {
        errors.push(error);
      },
      onClose: () => {
        closeCalled = true;
      },
    }),
  );

  await vi.waitFor(() => expect(closeCalled).toBe(true), { timeout: 2000 });

  // Map errors to snapshot-friendly shape (Event internals differ across platforms)
  const mapped = errors.map((e) =>
    e.type === "RetryError"
      ? { type: e.type, attempts: e.attempts, causeType: e.cause.type }
      : { type: e.type },
  );

  // Platform difference: Server/WebKit fires WebSocketConnectionError, Chromium/Firefox doesn't
  const isWebKit =
    !isServer &&
    (await import("vitest/browser").then((m) => m.server.browser === "webkit"));

  if (isServer || isWebKit) {
    expect(mapped).toMatchInlineSnapshot(`
      [
        {
          "type": "WebSocketConnectionError",
        },
        {
          "attempts": 1,
          "causeType": "WebSocketConnectionCloseError",
          "type": "RetryError",
        },
      ]
    `);
  } else {
    expect(mapped).toMatchInlineSnapshot(`
      [
        {
          "attempts": 1,
          "causeType": "WebSocketConnectionCloseError",
          "type": "RetryError",
        },
      ]
    `);
  }
});
