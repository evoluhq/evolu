import { expectErr } from "@evolu/vitest";
import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { utf8ToBytes } from "../../../../packages/common/src/Bytes.ts";
import { isServer } from "../../../../packages/common/src/Platform.ts";
import type { RandomNumber } from "../../../../packages/common/src/Random.ts";
import { ok } from "../../../../packages/common/src/Result.ts";
import type { Schedule } from "../../../../packages/common/src/Schedule.ts";
import { spaced, take } from "../../../../packages/common/src/Schedule.ts";
import {
  createTime,
  durationToMillis,
  Millis,
  millisToDateIso,
  type Duration,
  type PerformanceTime,
  type Time,
} from "../../../../packages/common/src/Time.ts";
import {
  AbortError,
  createRun,
  testCreateDeps,
  testCreateRun,
} from "../../../../packages/common/src/Task.ts";
import {
  startTestWebSocketServer,
  stopTestWebSocketServer,
} from "./_webSocketTestServerControl.ts";
import {
  createWebSocket,
  testSetupWebSocket,
  testCreateWebSocket,
  webSocketReconnectSchedule,
  type WebSocketCloseEvent,
  type WebSocketRetryError,
  type WebSocketError,
} from "../../../../packages/common/src/WebSocket.ts";

let port: number | undefined;

const getServerUrl = (path = ""): string => {
  if (port === undefined) throw new Error("Server port not initialized");
  return `ws://localhost:${port}${path ? "/" + path : ""}`;
};

/**
 * A schedule that records which of its own steps each reconnect used, so a
 * restarted schedule shows up as the attempt counter returning to 1.
 */
const setupRecordingSchedule = () => {
  const attempts: Array<number> = [];

  const schedule: Schedule<Millis, WebSocketRetryError> = () => {
    let attempt = 0;
    return () => {
      attempt++;
      attempts.push(attempt);
      return ok([Millis.orThrow(attempt), Millis.orThrow(1)]);
    };
  };

  return { schedule, attempts };
};

/**
 * Wraps the real clock so the wall clock and elapsed time can be moved
 * independently, as a system clock adjustment and a long connection do.
 */
const setupAdjustableClock = () => {
  const real = createTime();
  let wallOffset = 0;
  let elapsedOffset = 0;

  const now = ((type?: "DateIso") => {
    const millis = Millis.orThrow(real.now() + wallOffset);
    return type === "DateIso" ? millisToDateIso(millis) : millis;
  }) as Time["now"];

  return {
    time: {
      ...real,
      now,
      performance: {
        ...real.performance,
        now: () => (real.performance.now() + elapsedOffset) as PerformanceTime,
      },
    },

    /**
     * Moves the wall clock without moving elapsed time, as an NTP correction
     * does.
     */
    jumpClock: (duration: Duration) => {
      wallOffset += durationToMillis(duration);
    },

    /** Moves elapsed time, as a long-lived connection would. */
    advanceElapsed: (duration: Duration) => {
      elapsedOffset += durationToMillis(duration);
    },
  };
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

describe("webSocketReconnectSchedule", () => {
  test("uses capped unlimited full-jitter backoff", () => {
    const deps = {
      ...testCreateDeps(),
      random: { next: () => 0.999999999 as RandomNumber },
    };
    const step = webSocketReconnectSchedule(deps);
    const error: WebSocketRetryError = {
      type: "WebSocketConnectError",
      event: new Event("error"),
    };

    expect(step(error)).toEqual(ok([100, 100]));
    for (let attempt = 2; attempt < 10; attempt++) step(error);
    expect(step(error)).toEqual(ok([51200, 30000]));
    expect(step(error).ok).toBe(true);
  });
});

describe("createWebSocket", () => {
  test("connects, receives message, sends message, and disposes", async () => {
    await using run = createRun();

    const messages: Array<Uint8Array> = [];

    const ws = await run.ok(
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

    const ws = await run.ok(
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

    const ws = await run.ok(
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
      static readonly CONNECTING = WebSocket.CONNECTING;
      static readonly OPEN = WebSocket.OPEN;
      static readonly CLOSING = WebSocket.CLOSING;
      static readonly CLOSED = WebSocket.CLOSED;

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
        // oxlint-disable-next-line eslint/no-useless-return -- Keeps this intentional no-op body explicit while ESLint remains enabled.
        return;
      }

      close(): void {
        nativeCloseCalled = true;
        this.readyState = FakeWebSocket.CLOSED;
      }
    }

    const ws = await run.ok(
      createWebSocket("ws://example.com", {
        onOpen: () => {
          openCalled.resolve();
        },
        WebSocketConstructor: FakeWebSocket as unknown as typeof WebSocket,
      }),
    );

    await openCalled.promise;

    await ws[Symbol.asyncDispose]();

    expect(nativeCloseCalled).toBe(true);
  });

  test("send returns error when socket is not ready", async () => {
    await using run = createRun();

    const ws = await run.ok(createWebSocket(getServerUrl()));

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

    await using _ws = await run.ok(
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

    await using _ws = await run.ok(
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
    await using ws = await run.ok(
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
    await using _ws = await run.ok(
      createWebSocket("ws://localhost:1", {
        // No retry - fail immediately
        schedule: take(0)(spaced("1ms")),
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

    await using _ws = await run.ok(
      createWebSocket(getServerUrl("close"), {
        // No retry
        schedule: take(0)(spaced("1ms")),
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

    await using _ws = await run.ok(
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
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(closeCount).toBe(1);
    expect(errors).toHaveLength(0);
  });

  test("reconnects after server closes connection", async () => {
    await using run = createRun();

    const messages: Array<Uint8Array> = [];
    let closeCount = 0;

    await using ws = await run.ok(
      createWebSocket(getServerUrl("close-after-message"), {
        binaryType: "arraybuffer",
        // Fast retry
        schedule: spaced("1ms"),
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
    await using _ws = await run.ok(
      createWebSocket(getServerUrl("close"), {
        // Allow 2 retries then exhaust
        schedule: take(2)(spaced("1ms")),
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

  test("restarts the reconnect schedule after a healthy connection", async () => {
    const { time, advanceElapsed } = setupAdjustableClock();
    await using run = createRun({ time });

    const { schedule, attempts } = setupRecordingSchedule();

    // The endpoint opens then closes, and each connection is made to outlast
    // the threshold, so each close must start the schedule over.
    await using _ws = await run.ok(
      createWebSocket(getServerUrl("close"), {
        schedule,
        onOpen: () => {
          advanceElapsed("31s");
        },
      }),
    );

    await vi.waitFor(() => expect(attempts.length).toBeGreaterThanOrEqual(3));
    expect(attempts.slice(0, 3)).toEqual([1, 1, 1]);
  });

  test("restarts the reconnect schedule after a custom healthy duration", async () => {
    const { time, advanceElapsed } = setupAdjustableClock();
    await using run = createRun({ time });

    const { schedule, attempts } = setupRecordingSchedule();

    // Each connection lasts six seconds, short of the default threshold but
    // past this schedule's own cap, so every close must start it over.
    await using _ws = await run.ok(
      createWebSocket(getServerUrl("close"), {
        schedule,
        healthyConnectionDuration: "5s",
        onOpen: () => {
          advanceElapsed("6s");
        },
      }),
    );

    await vi.waitFor(() => expect(attempts.length).toBeGreaterThanOrEqual(3));
    expect(attempts.slice(0, 3)).toEqual([1, 1, 1]);
  });

  test("keeps backing off when connections do not stay open", async () => {
    await using run = createRun();

    const { schedule, attempts } = setupRecordingSchedule();

    // The endpoint closes immediately, so no connection reaches the default
    // reset threshold and the backoff keeps advancing.
    await using _ws = await run.ok(
      createWebSocket(getServerUrl("close"), { schedule }),
    );

    await vi.waitFor(() => expect(attempts.length).toBeGreaterThanOrEqual(3));
    expect(attempts.slice(0, 3)).toEqual([1, 2, 3]);
  });

  test("reconnect abandons the connection and connects again", async () => {
    await using run = createRun();

    let openCount = 0;
    let closeCount = 0;

    await using ws = await run.ok(
      createWebSocket(getServerUrl(), {
        schedule: spaced("1ms"),
        onOpen: () => {
          openCount++;
        },
        onClose: () => {
          closeCount++;
        },
      }),
    );

    await vi.waitFor(() => expect(openCount).toBe(1));
    ws.reconnect();
    await vi.waitFor(() => expect(openCount).toBe(2));

    expect(ws.isOpen()).toBe(true);
    // The close is this call, not something to learn about.
    expect(closeCount).toBe(0);
  });

  test("reconnect starts the schedule over", async () => {
    await using run = createRun();

    const { schedule, attempts } = setupRecordingSchedule();
    let openCount = 0;

    // The connection never stays open long enough to clear the reset
    // threshold, so only `reconnect` can restart the schedule.
    await using ws = await run.ok(
      createWebSocket(getServerUrl(), {
        schedule,
        onOpen: () => {
          openCount++;
        },
      }),
    );

    await vi.waitFor(() => expect(openCount).toBe(1));
    ws.reconnect();
    await vi.waitFor(() => expect(openCount).toBe(2));
    ws.reconnect();
    await vi.waitFor(() => expect(openCount).toBe(3));

    expect(attempts).toEqual([1, 1]);
  });

  test("reconnect keeps the backoff when the connection never opened", async () => {
    await using run = createRun();

    const { schedule, attempts } = setupRecordingSchedule();
    let created = 0;

    // A connection that never opens, so `reconnect` is the only thing that can
    // end it. The ready-state constants are instance members because the DOM
    // puts them on the prototype and `reconnect` reads them from the socket.
    class NeverOpeningWebSocket {
      readonly CONNECTING = WebSocket.CONNECTING;
      readonly OPEN = WebSocket.OPEN;
      readonly CLOSING = WebSocket.CLOSING;
      readonly CLOSED = WebSocket.CLOSED;

      readonly url: string;
      readyState: number = WebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        created++;
      }

      close(): void {
        this.readyState = WebSocket.CLOSED;
      }
    }

    await using ws = await run.ok(
      createWebSocket("ws://example.com", {
        schedule,
        WebSocketConstructor:
          NeverOpeningWebSocket as unknown as typeof WebSocket,
      }),
    );

    expect(ws.getReadyState()).toBe("connecting");
    ws.reconnect();
    await vi.waitFor(() => expect(created).toBe(2));

    expect(ws.getReadyState()).toBe("connecting");
    ws.reconnect();
    await vi.waitFor(() => expect(created).toBe(3));

    // Neither connection proved the endpoint works, so the schedule advanced.
    // Restarting it would have taken step 1 twice.
    expect(attempts).toEqual([1, 2]);
  });

  test("reconnect from onClose leaves the close to settle", async () => {
    await using run = createRun();

    let socket: { readonly reconnect: () => void } | null = null;
    let openCount = 0;
    let closeCount = 0;

    // The endpoint accepts then closes, and the handler asks to reconnect
    // while that close is still settling. `shouldRetryOnClose` must still win.
    const ws = await run.ok(
      createWebSocket(getServerUrl("close"), {
        schedule: spaced("1ms"),
        shouldRetryOnClose: () => false,
        onOpen: () => {
          openCount++;
        },
        onClose: () => {
          closeCount++;
          assert(socket, "onClose ran before the socket was assigned");
          socket.reconnect();
        },
      }),
    );
    socket = ws;

    {
      await using _ws = ws;

      await vi.waitFor(() => expect(closeCount).toBe(1));
      // Far longer than the 1ms schedule needs to reconnect, if it retried.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
    }

    expect(openCount).toBe(1);
    expect(closeCount).toBe(1);
  });

  test("a system clock jump does not restart the schedule", async () => {
    const { time, jumpClock } = setupAdjustableClock();
    await using run = createRun({ time });

    const { schedule, attempts } = setupRecordingSchedule();

    // The endpoint accepts then closes, so each connection lasts milliseconds
    // and none should clear the reset threshold. The wall clock jumps an hour
    // while each one is open.
    await using _ws = await run.ok(
      createWebSocket(getServerUrl("close"), {
        schedule,
        onOpen: () => {
          jumpClock("1h");
        },
      }),
    );

    await vi.waitFor(() => expect(attempts.length).toBeGreaterThanOrEqual(3));
    expect(attempts.slice(0, 3)).toEqual([1, 2, 3]);
  });

  test("reconnect does nothing after disposal", async () => {
    await using run = createRun();

    const ws = await run.ok(createWebSocket(getServerUrl()));
    await ws[Symbol.asyncDispose]();
    ws.reconnect();

    expect(ws.getReadyState()).toBe("closed");
  });

  test("reconnect does nothing while the wrapper waits to retry", async () => {
    await using run = createRun();

    let created = 0;
    let closeCount = 0;

    class CountingWebSocket extends WebSocket {
      constructor(url: string | URL, protocols?: string | Array<string>) {
        super(url, protocols);
        created++;
      }
    }

    // The endpoint accepts then closes, and the schedule waits far longer than
    // the test, so once the close settles the wrapper holds no socket.
    await using ws = await run.ok(
      createWebSocket(getServerUrl("close"), {
        schedule: spaced("1h"),
        WebSocketConstructor: CountingWebSocket,
        onClose: () => {
          closeCount++;
        },
      }),
    );

    await vi.waitFor(() => expect(closeCount).toBe(1));
    // The closed socket is dropped when the close settles.
    await vi.waitFor(() => expect(ws.getReadyState()).toBe("connecting"));

    ws.reconnect();
    // Long enough for a connect to have been started, if one were.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    // The retry already owns the next connect; nothing was started early.
    expect(created).toBe(1);
    expect(ws.getReadyState()).toBe("connecting");
  });

  test("reconnect from onError leaves a failed connect to settle", async () => {
    await using run = createRun();

    const retryErrors: Array<WebSocketRetryError["type"]> = [];

    // Records what settles each connect. A connect that failed settles with
    // `WebSocketConnectError`; had `reconnect` run instead, it would have
    // settled first with `WebSocketReconnectError`.
    const schedule: Schedule<Millis, WebSocketRetryError> = (deps) => {
      const step = take(0)(spaced("1ms"))(deps);
      return (error) => {
        retryErrors.push(error.type);
        return step(error);
      };
    };

    // A socket whose connection the test fails on demand. As a platform does,
    // it is closed by the time it reports the error, and the close follows.
    const sockets: Array<FailingWebSocket> = [];
    class FailingWebSocket {
      readonly CONNECTING = WebSocket.CONNECTING;
      readonly OPEN = WebSocket.OPEN;
      readonly CLOSING = WebSocket.CLOSING;
      readonly CLOSED = WebSocket.CLOSED;

      readonly url: string;
      readyState: number = WebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        sockets.push(this);
      }

      close(): void {
        this.readyState = WebSocket.CLOSED;
      }

      fail(): void {
        this.readyState = WebSocket.CLOSED;
        this.onerror?.(new Event("error"));
        this.onclose?.({
          code: 1006,
          reason: "",
          wasClean: false,
        } as CloseEvent);
      }
    }

    await using ws = await run.ok(
      createWebSocket("ws://example.com", {
        schedule,
        WebSocketConstructor: FailingWebSocket as unknown as typeof WebSocket,
        onError: (error) => {
          if (error.type === "WebSocketConnectError") ws.reconnect();
        },
      }),
    );

    expect(sockets).toHaveLength(1);
    sockets[0].fail();

    await vi.waitFor(() => expect(retryErrors.length).toBe(1));
    expect(retryErrors).toEqual(["WebSocketConnectError"]);
  });

  test("WebSocketConnectionError behavior on abrupt termination", async () => {
    await using run = createRun();

    const errors: Array<WebSocketError> = [];
    let closeCalled = false;

    await using _ws = await run.ok(
      createWebSocket(getServerUrl("terminate"), {
        // No retry
        schedule: take(0)(spaced("1ms")),
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
        ? {
            type: e.type,
            attempts: e.attempts,
            causeType: e.lastError.type,
          }
        : { type: e.type },
    );

    // Platform difference: Server and macOS WebKit fire
    // WebSocketConnectionError, while Chromium, Firefox, and Linux WebKit don't.
    const isMacOsWebKit =
      !isServer &&
      (await import("vitest/browser").then(
        ({ server }) =>
          server.browser === "webkit" && server.platform === "darwin",
      ));

    if (isServer || isMacOsWebKit) {
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

    const ws = await run.ok(
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
    // A socket that has not opened yet is connecting, not closed.
    expect(ws.getReadyState()).toBe("connecting");

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

  test("panics when configured to throw on create", async () => {
    await using run = testCreateRun();

    const createTestWebSocket = testCreateWebSocket({ throwOnCreate: true });
    const reported = run.deps.reportDefect.next();
    const result = await run.abortable(createTestWebSocket("ws://example.com"));
    const abortError = await reported;

    expect(AbortError.is(abortError)).toBe(true);
    expectErr(result, abortError);
    expect(abortError).toMatchObject({
      reason: {
        type: "PanicAbortReason",
        defect: expect.objectContaining({
          message: "testCreateWebSocket is configured to throw on create",
        }),
      },
    });
  });

  test("defaults created sockets to open", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket();
    const ws = await run.ok(
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

  test("reports a close with no CloseEvent global", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket();
    const closes: Array<WebSocketCloseEvent> = [];
    await using _ws = await run.ok(
      createTestWebSocket("ws://no-close-event.example.com", {
        onClose: (event) => {
          closes.push(event);
        },
      }),
    );

    // React Native delivers close events but exposes no `CloseEvent` global,
    // so the double must not need the constructor.
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "CloseEvent",
    );
    delete (globalThis as { CloseEvent?: unknown }).CloseEvent;
    try {
      createTestWebSocket.close("ws://no-close-event.example.com", {
        code: 1001,
      });
    } finally {
      if (descriptor)
        Object.defineProperty(globalThis, "CloseEvent", descriptor);
    }

    expect(closes).toEqual([{ code: 1001, reason: "", wasClean: false }]);
  });

  test("passes through ArrayBuffer-backed Uint8Array", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket();
    const ws = await run.ok(createTestWebSocket("ws://bytes.example.com"));

    await using _ws = ws;

    const buffer = new ArrayBuffer(8);
    const data = new Uint8Array(buffer, 2, 3);
    data.set([1, 2, 3]);

    expect(ws.send(data)).toEqual({ ok: true, value: undefined });

    const sentData = createTestWebSocket.sentMessages[0]?.data;
    assert(sentData instanceof Uint8Array);
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
      const ws = await run.ok(
        createTestWebSocket("ws://shared-bytes.example.com"),
      );

      await using _ws = ws;

      const buffer = new SharedArrayBuffer(8);
      const data = new Uint8Array(buffer, 1, 3);
      data.set([4, 5, 6]);

      expect(ws.send(data)).toEqual({ ok: true, value: undefined });

      const sentData = createTestWebSocket.sentMessages[0]?.data;
      assert(sentData instanceof Uint8Array);
      expect(sentData.buffer).not.toBe(buffer);
      expect(sentData.byteOffset).toBe(0);
      expect(sentData.byteLength).toBe(data.byteLength);
      expect([...sentData]).toEqual([4, 5, 6]);
    },
  );

  test("reports close and error through callbacks", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket();
    const closeCodes: Array<number> = [];
    const errors: Array<WebSocketError> = [];

    await using ws = await run.ok(
      createTestWebSocket("ws://events.example.com", {
        onClose: (event) => {
          closeCodes.push(event.code);
        },
        onError: (error) => {
          errors.push(error);
        },
      }),
    );

    createTestWebSocket.close("ws://events.example.com", { code: 4000 });
    expect(closeCodes).toEqual([4000]);
    expect(ws.isOpen()).toBe(false);

    const error: WebSocketError = {
      type: "WebSocketConnectError",
      event: new Event("error"),
    };
    createTestWebSocket.error("ws://events.example.com", error);
    expect(errors).toEqual([error]);
  });

  test("reports the states createWebSocket reports", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket({ isOpen: false });
    const url = "ws://states.example.com";
    let closeReadyState: string | null = null;

    await using ws = await run.ok(
      createTestWebSocket(url, {
        // `createWebSocket` still holds the closed socket while it reports the
        // close, so a handler that publishes state must see `closed` here.
        onClose: () => {
          closeReadyState = ws.getReadyState();
        },
      }),
    );

    expect(ws.getReadyState()).toBe("connecting");

    createTestWebSocket.open(url);
    expect(ws.getReadyState()).toBe("open");

    // The wrapper holds the closed socket until the close settles, then drops
    // it and retries.
    createTestWebSocket.close(url);
    expect(closeReadyState).toBe("closed");
    expect(ws.getReadyState()).toBe("closed");
    await Promise.resolve();
    expect(ws.getReadyState()).toBe("connecting");
    expect(ws.isOpen()).toBe(false);

    createTestWebSocket.open(url);
    ws.reconnect();
    expect(ws.getReadyState()).toBe("connecting");
    expect(createTestWebSocket.reconnectedUrls).toEqual([url]);

    // Only disposal ends in `closed`, and a disposed socket takes no events.
    await ws[Symbol.asyncDispose]();
    expect(ws.getReadyState()).toBe("closed");
    expect(() => {
      createTestWebSocket.open(url);
    }).toThrow(`Test WebSocket for ${url} is disposed.`);
    expect(ws.isOpen()).toBe(false);
  });

  test("reconnect does nothing on a socket settling its own close", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket();
    const url = "ws://settling.example.com";

    await using ws = await run.ok(
      createTestWebSocket(url, {
        onClose: () => {
          ws.reconnect();
        },
      }),
    );

    createTestWebSocket.close(url);

    expect(createTestWebSocket.reconnectedUrls).toEqual([]);
  });

  test("reconnect does nothing while the wrapper waits to retry", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket();
    const url = "ws://retrying.example.com";

    await using ws = await run.ok(createTestWebSocket(url));

    createTestWebSocket.close(url);
    await Promise.resolve();
    ws.reconnect();
    expect(createTestWebSocket.reconnectedUrls).toEqual([]);

    createTestWebSocket.open(url);
    ws.reconnect();
    ws.reconnect();
    expect(createTestWebSocket.reconnectedUrls).toEqual([url]);

    createTestWebSocket.open(url);
    ws.reconnect();
    expect(createTestWebSocket.reconnectedUrls).toEqual([url, url]);
  });

  test("addresses the newest socket for a URL created again", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket({ isOpen: false });
    let openCount = 0;

    const first = await run.ok(createTestWebSocket("ws://again.example.com"));
    await first[Symbol.asyncDispose]();
    await using second = await run.ok(
      createTestWebSocket("ws://again.example.com", {
        onOpen: () => {
          openCount++;
        },
      }),
    );
    createTestWebSocket.open("ws://again.example.com");

    expect(createTestWebSocket.createdUrls).toEqual([
      "ws://again.example.com",
      "ws://again.example.com",
    ]);
    expect(openCount).toBe(1);
    // The disposed socket keeps its own state.
    expect(first.isOpen()).toBe(false);
    expect(second.isOpen()).toBe(true);
  });

  test("asserts when an event targets a disposed socket", async () => {
    await using run = createRun();

    const createTestWebSocket = testCreateWebSocket({ isOpen: false });
    const url = "ws://disposed.example.com";
    const events: Array<string> = [];

    const ws = await run.ok(
      createTestWebSocket(url, {
        onOpen: () => {
          events.push("open");
        },
        onMessage: () => {
          events.push("message");
        },
        onClose: () => {
          events.push("close");
        },
        onError: () => {
          events.push("error");
        },
      }),
    );
    await ws[Symbol.asyncDispose]();

    // createWebSocket detaches its handlers on disposal, so an event sent to
    // a disposed socket is a mistake in the test.
    const message = `Test WebSocket for ${url} is disposed.`;
    expect(() => {
      createTestWebSocket.open(url);
    }).toThrow(message);
    expect(() => {
      createTestWebSocket.message(url, "payload");
    }).toThrow(message);
    expect(() => {
      createTestWebSocket.close(url);
    }).toThrow(message);
    expect(() => {
      createTestWebSocket.error(url, {
        type: "WebSocketConnectError",
        event: new Event("error"),
      });
    }).toThrow(message);
    expect(events).toEqual([]);
  });

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
