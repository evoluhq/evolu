import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { utf8ToBytes } from "../src/Buffer.js";
import { isServer } from "../src/Platform.js";
import { spaced, take } from "../src/Schedule.js";
import { createRun } from "../src/Task.js";
import {
  startTestWebSocketServer,
  stopTestWebSocketServer,
} from "./_webSocketTestServerControl.js";
import {
  createWebSocket,
  testSetupWebSocket,
  testCreateWebSocket,
  type WebSocketError,
} from "../src/WebSocket.js";

let port: number | undefined;

const getServerUrl = (path = ""): string => {
  if (port === undefined) throw new Error("Server port not initialized");
  return `ws://localhost:${port}${path ? "/" + path : ""}`;
};

beforeEach(async () => {
  port = await startTestWebSocketServer();
});

afterEach(async () => {
  if (port === undefined) return;
  const currentPort = port;
  port = undefined;
  await stopTestWebSocketServer(currentPort);
});

describe("createWebSocket", () => {
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

  test("closes the underlying websocket when disposed", async () => {
    await using run = createRun();

    const openCalled = Promise.withResolvers<void>();
    let nativeCloseCalled = false;

    class FakeWebSocket {
      static readonly CONNECTING = globalThis.WebSocket.CONNECTING;
      static readonly OPEN = globalThis.WebSocket.OPEN;
      static readonly CLOSING = globalThis.WebSocket.CLOSING;
      static readonly CLOSED = globalThis.WebSocket.CLOSED;

      readonly url: string;
      readonly protocol = "";
      readonly extensions = "";
      readonly bufferedAmount = 0;
      binaryType: BinaryType = "blob";
      readyState: number = FakeWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        queueMicrotask(() => {
          this.readyState = FakeWebSocket.OPEN;
          this.onopen?.(new Event("open"));
        });
      }

      send(_data: string | BufferSource | Blob): void {
        return;
      }

      close(): void {
        nativeCloseCalled = true;
        this.readyState = FakeWebSocket.CLOSED;
      }
    }

    const ws = await run.orThrow(
      createWebSocket("ws://example.com", {
        onOpen: () => {
          openCalled.resolve();
        },
        WebSocketConstructor:
          FakeWebSocket as unknown as typeof globalThis.WebSocket,
      }),
    );

    await openCalled.promise;

    await ws[Symbol.asyncDispose]();

    expect(nativeCloseCalled).toBe(true);
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
      (await import("vitest/browser").then(
        (m) => m.server.browser === "webkit",
      ));

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
});

describe("testCreateWebSocket", () => {
  test("tracks socket state, callbacks, and sent messages", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket({ isOpen: false });
    const receivedMessages: Array<string | ArrayBuffer | Blob> = [];
    let openCount = 0;

    const ws = await run.orThrow(
      createTestWebSocket("ws://example.com", {
        onOpen: () => {
          openCount++;
        },
        onMessage: (data) => {
          receivedMessages.push(data);
        },
      }),
    );

    expect(createTestWebSocket.createdUrls).toEqual(["ws://example.com"]);
    expect(ws.isOpen()).toBe(false);
    expect(ws.getReadyState()).toBe("closed");

    const sendBeforeOpen = ws.send("before-open");
    expect(sendBeforeOpen).toEqual({
      ok: false,
      error: { type: "WebSocketSendError" },
    });

    createTestWebSocket.open("ws://example.com");

    expect(openCount).toBe(1);
    expect(ws.isOpen()).toBe(true);
    expect(ws.getReadyState()).toBe("open");

    const sendAfterOpen = ws.send("after-open");
    expect(sendAfterOpen).toEqual({ ok: true, value: undefined });
    expect(createTestWebSocket.sentMessages).toEqual([
      { url: "ws://example.com", data: "after-open" },
    ]);

    const helloBytes = utf8ToBytes("hello");
    const binaryMessage = new ArrayBuffer(helloBytes.byteLength);
    new Uint8Array(binaryMessage).set(helloBytes);
    createTestWebSocket.message("ws://example.com", binaryMessage);
    expect(receivedMessages).toEqual([binaryMessage]);

    await ws[Symbol.asyncDispose]();

    expect(ws.isOpen()).toBe(false);
    expect(ws.getReadyState()).toBe("closed");
    expect(ws.send("after-dispose")).toEqual({
      ok: false,
      error: { type: "WebSocketSendError" },
    });
  });

  test("throws when configured to throw on create", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket({ throwOnCreate: true });

    await expect(
      run.orThrow(createTestWebSocket("ws://example.com")),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: testCreateWebSocket is configured to throw on create]`,
    );
  });

  test("defaults created sockets to open", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket();
    const ws = await run.orThrow(
      createTestWebSocket("ws://default-open.example.com"),
    );

    await using _ws = ws;

    expect(ws.isOpen()).toBe(true);
    expect(ws.getReadyState()).toBe("open");
    expect(ws.send("payload")).toEqual({ ok: true, value: undefined });
    expect(createTestWebSocket.sentMessages).toEqual([
      { url: "ws://default-open.example.com", data: "payload" },
    ]);
  });

  test("passes through ArrayBuffer-backed Uint8Array", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket();
    const ws = await run.orThrow(createTestWebSocket("ws://bytes.example.com"));

    await using _ws = ws;

    const buffer = new globalThis.ArrayBuffer(8);
    const data = new globalThis.Uint8Array(buffer, 2, 3);
    data.set([1, 2, 3]);

    expect(ws.send(data)).toEqual({ ok: true, value: undefined });

    const sentData = createTestWebSocket.sentMessages[0]?.data;
    assert(sentData instanceof globalThis.Uint8Array);
    expect(sentData).toBe(data);
    expect(sentData.buffer).toBe(buffer);
    expect(sentData.byteOffset).toBe(data.byteOffset);
    expect(sentData.byteLength).toBe(data.byteLength);
    expect([...sentData]).toEqual([1, 2, 3]);
  });

  test.runIf(typeof globalThis.SharedArrayBuffer !== "undefined")(
    "clones SharedArrayBuffer-backed Uint8Array before send",
    async () => {
      await using run = createRun();

      const createTestWebSocket = testCreateWebSocket();
      const ws = await run.orThrow(
        createTestWebSocket("ws://shared-bytes.example.com"),
      );

      await using _ws = ws;

      const buffer = new globalThis.SharedArrayBuffer(8);
      const data = new globalThis.Uint8Array(buffer, 1, 3);
      data.set([4, 5, 6]);

      expect(ws.send(data)).toEqual({ ok: true, value: undefined });

      const sentData = createTestWebSocket.sentMessages[0]?.data;
      assert(sentData instanceof globalThis.Uint8Array);
      expect(sentData.buffer).not.toBe(buffer);
      expect(sentData.byteOffset).toBe(0);
      expect(sentData.byteLength).toBe(data.byteLength);
      expect([...sentData]).toEqual([4, 5, 6]);
    },
  );

  test("asserts when opening or messaging an unknown socket", () => {
    const createTestWebSocket = testCreateWebSocket();

    expect(() => {
      createTestWebSocket.open("ws://missing.example.com");
    }).toThrow("Test WebSocket for ws://missing.example.com does not exist.");

    expect(() => {
      createTestWebSocket.message("ws://missing.example.com", "payload");
    }).toThrow("Test WebSocket for ws://missing.example.com does not exist.");
  });
});

describe("testSetupWebSocket", () => {
  test("receives text messages", async () => {
    await using ws = await testSetupWebSocket(getServerUrl("text"));

    await expect(ws.waitForMessage()).resolves.toBe("hello");
  });

  test("sends messages", async () => {
    await using ws = await testSetupWebSocket(getServerUrl());

    await expect(ws.waitForMessage()).resolves.toEqual(utf8ToBytes("welcome"));

    ws.send("hello");

    await expect(ws.waitForMessage()).resolves.toEqual(utf8ToBytes("hello"));
  });

  test("receives binary messages", async () => {
    await using ws = await testSetupWebSocket(getServerUrl());

    await expect(ws.waitForMessage()).resolves.toEqual(utf8ToBytes("welcome"));
  });

  test("rejects failed connections", async () => {
    await expect(testSetupWebSocket("ws://127.0.0.1:1")).rejects.toThrow(
      "WebSocket connection failed",
    );
  });

  test("rejects waiting when socket closes", async () => {
    await using ws = await testSetupWebSocket(getServerUrl("close"));

    await expect(ws.waitForMessage()).rejects.toThrow(
      "WebSocket closed before message",
    );
  });

  test("rejects waiting after socket already closed", async () => {
    const ws = await testSetupWebSocket(getServerUrl("close"));

    await new Promise<void>((resolve) => {
      ws.socket.addEventListener("close", () => resolve(), { once: true });
    });

    await expect(ws.waitForMessage()).rejects.toThrow(
      "WebSocket closed before message",
    );
  });

  test("dispose tolerates already closed sockets", async () => {
    const ws = await testSetupWebSocket(getServerUrl("close"));

    await new Promise<void>((resolve) => {
      ws.socket.addEventListener("close", () => resolve(), { once: true });
    });

    await expect(ws[Symbol.asyncDispose]()).resolves.toBeUndefined();
  });
});
