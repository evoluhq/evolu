import {
  assert,
  lazyFalse,
  lazyTrue,
  sql,
  testCreateConsole,
  testCreateId,
  testCreateDeps,
  testCreateRun,
  testName,
  type CreateSqliteDriver,
  type SqliteDriver,
} from "@evolu/common";
import {
  createAppOwner,
  createOwnerSecret,
  createProtocolMessageBuffer,
  createProtocolMessageForUnsubscribe,
  createProtocolMessageFromCrdtMessages,
  MessageType,
  SubscriptionFlags,
  testAppOwner,
  testCreateCrdtMessage,
} from "@evolu/common/local-first";
import { EventEmitter } from "events";
import { existsSync, unlinkSync } from "fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { testSetupWebSocket } from "../../common/src/WebSocket.js";
import {
  createRelayDeps,
  startRelay,
  testSendWebSocketUpgradeRequest,
  testSetupWebSocketUpgradeRequest,
  type NodeJsRelayConfig,
} from "../src/index.js";

const testRelayAppOwner2 = createAppOwner(
  createOwnerSecret(testCreateDeps({ seed: "nodejs-relay-owner-2" })),
);

const startTestRelay = async (config: Partial<NodeJsRelayConfig> = {}) => {
  const console = testCreateConsole();
  const relayDeps = createRelayDeps();
  let driver: SqliteDriver | undefined;

  const createSqliteDriver: CreateSqliteDriver =
    (name, options) => async (run) => {
      const result = await run(relayDeps.createSqliteDriver(name, options));
      if (result.ok) driver = result.value;
      return result;
    };

  await using stack = new AsyncDisposableStack();

  const run = stack.use(
    testCreateRun({
      ...relayDeps,
      createSqliteDriver,
      console,
    }),
  );

  const relay = stack.use(
    await run.orThrow(
      startRelay({
        port: 0,
        name: testName,
        isOwnerWithinQuota: () => true,
        ...config,
      }),
    ),
  );

  assert(driver, "Expected relay SQLite driver");

  const moved = stack.move();

  return {
    console,
    driver,
    relay,
    run,
    [Symbol.asyncDispose]: () => moved.disposeAsync(),
  };
};

const setupRelay = async () => {
  await using stack = new AsyncDisposableStack();

  const relaySetup = stack.use(await startTestRelay());
  const ws = stack.use(
    await testSetupWebSocket(
      `ws://127.0.0.1:${relaySetup.relay.port}/?ownerId=${testAppOwner.id}`,
    ),
  );

  const moved = stack.move();

  return {
    ...relaySetup,
    ws,
    [Symbol.asyncDispose]: () => moved.disposeAsync(),
  };
};

const loadRelayModuleWithMockedTransport = async () => {
  vi.resetModules();

  class FakeServer extends EventEmitter {
    readonly listen = vi.fn((_port?: number) => {
      queueMicrotask(() => {
        this.emit("listening");
      });
      return this;
    });

    readonly address = vi.fn(() => ({
      port: 1234,
      address: "127.0.0.1",
      family: "IPv4" as const,
    }));

    readonly [Symbol.asyncDispose] = () => {
      this.emit("close");
      return Promise.resolve();
    };
  }

  class FakeWebSocketServer extends EventEmitter {
    readonly clients = new Set<{
      readonly readyState: number;
      close: (code?: number, reason?: string) => void;
    }>();

    readonly handleUpgrade = vi.fn();

    readonly close = vi.fn((callback: () => void) => {
      callback();
    });
  }

  const server = new FakeServer();
  const wss = new FakeWebSocketServer();

  vi.doMock("http", () => ({
    createServer: () => server,
  }));

  vi.doMock("ws", () => ({
    WebSocket: { OPEN: 1 },
    WebSocketServer: function MockWebSocketServer() {
      return wss;
    },
  }));

  const relayModule = await import("../src/local-first/Relay.js");

  return { relayModule, server, wss };
};

describe("startRelay", () => {
  afterEach(() => {
    for (const suffix of [".db", ".db-shm", ".db-wal"]) {
      const filePath = `${testName}${suffix}`;
      if (existsSync(filePath)) unlinkSync(filePath);
    }
  });

  test("processes websocket messages after startup task settles", async () => {
    await using setup = await setupRelay();
    const createId = testCreateId();
    const { driver, run, ws } = setup;

    const responsePromise = ws.waitForMessage();

    ws.send(
      createProtocolMessageFromCrdtMessages(run.deps)(testAppOwner, [
        testCreateCrdtMessage(createId(), 1, "Victoria"),
      ]),
    );

    const response = await responsePromise;

    expect(response).toBeInstanceOf(Uint8Array);

    const row = driver.exec(sql`select count(*) as count from evolu_message;`)
      .rows[0] as { readonly count: number };

    expect(row.count).toBe(1);
  });

  test("rejects websocket upgrades without ownerId", async () => {
    await using setup = await startTestRelay({
      isOwnerAllowed: lazyTrue,
    });

    const response = await testSendWebSocketUpgradeRequest(
      setup.relay.port,
      "/",
    );

    expect(response.statusCode).toBe(400);
  });

  test("rejects unauthorized owner websocket upgrades", async () => {
    await using setup = await startTestRelay({
      isOwnerAllowed: lazyFalse,
    });

    const response = await testSendWebSocketUpgradeRequest(
      setup.relay.port,
      `/?ownerId=${testAppOwner.id}`,
    );

    expect(response.statusCode).toBe(401);
  });

  test("accepts websocket upgrades when owner authorization is disabled", async () => {
    await using setup = await startTestRelay();
    await using ws = await testSetupWebSocket(
      `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
    );

    expect(ws.socket.readyState).toBe(globalThis.WebSocket.OPEN);
  });

  test("authorizes websocket upgrades with signal-aware callback", async () => {
    let signal: AbortSignal | undefined;

    await using setup = await startTestRelay({
      isOwnerAllowed: (_ownerId, options) => {
        signal = options.signal;
        return true;
      },
    });
    await using _ws = await testSetupWebSocket(
      `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
    );

    assert(signal, "Expected owner authorization signal");
  });

  test("aborts pending owner authorization when relay is disposed", async () => {
    const signalPromise = Promise.withResolvers<AbortSignal>();
    const pendingAuthorization = Promise.withResolvers<boolean>();

    await using setup = await startTestRelay({
      isOwnerAllowed: (_ownerId, { signal }) => {
        signalPromise.resolve(signal);
        return pendingAuthorization.promise;
      },
    });
    await using upgradeRequest = testSetupWebSocketUpgradeRequest(
      setup.relay.port,
      `/?ownerId=${testAppOwner.id}`,
    );
    const { req } = upgradeRequest;
    req.end();

    const signal = await signalPromise.promise;
    expect(signal.aborted).toBe(false);

    await setup.relay[Symbol.asyncDispose]();
    pendingAuthorization.reject(new Error("ignored after abort"));

    expect(signal.aborted).toBe(true);
  });

  test("aborts pending owner authorization when client disconnects", async () => {
    const signalPromise = Promise.withResolvers<AbortSignal>();
    const pendingAuthorization = Promise.withResolvers<boolean>();

    await using setup = await startTestRelay({
      isOwnerAllowed: (_ownerId, { signal }) => {
        signalPromise.resolve(signal);
        return pendingAuthorization.promise;
      },
    });
    await using upgradeRequest = testSetupWebSocketUpgradeRequest(
      setup.relay.port,
      `/?ownerId=${testAppOwner.id}`,
    );
    const { req } = upgradeRequest;

    req.end();

    const signal = await signalPromise.promise;
    expect(signal.aborted).toBe(false);

    const socket =
      req.socket ??
      (await new Promise<NonNullable<typeof req.socket>>((resolve) => {
        req.once("socket", resolve);
      }));
    const socketClosed = new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
    });

    socket.resetAndDestroy();
    await socketClosed;

    await vi.waitFor(() => {
      expect(signal.aborted).toBe(true);
    });

    pendingAuthorization.resolve(true);
  });

  test("ignores unauthorized owner completion after client disconnect", async () => {
    const authorizationStarted = Promise.withResolvers<void>();
    const continueAuthorization = Promise.withResolvers<boolean>();

    await using setup = await startTestRelay({
      isOwnerAllowed: () => {
        authorizationStarted.resolve();
        return continueAuthorization.promise;
      },
    });
    const { console } = setup;
    console.clearEntries();

    await using upgradeRequest = testSetupWebSocketUpgradeRequest(
      setup.relay.port,
      `/?ownerId=${testAppOwner.id}`,
    );
    const { req } = upgradeRequest;

    req.end();

    await authorizationStarted.promise;
    const socket = req.socket;
    assert(socket, "Expected upgrade request socket");
    const socketClosed = new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
    });

    socket.resetAndDestroy();
    await socketClosed;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    continueAuthorization.resolve(false);

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(
      console
        .getEntriesSnapshot()
        .some(
          (entry) =>
            entry.method === "debug" &&
            entry.args[0] === "unauthorized owner" &&
            entry.args[1] === testAppOwner.id,
        ),
    ).toBe(false);
  });

  test("returns service unavailable when owner authorization throws", async () => {
    await using setup = await startTestRelay({
      isOwnerAllowed: () => {
        throw new Error("boom");
      },
    });
    const { console } = setup;
    console.clearEntries();

    const response = await testSendWebSocketUpgradeRequest(
      setup.relay.port,
      `/?ownerId=${testAppOwner.id}`,
    );

    expect(response.statusCode).toBe(503);
    await vi.waitFor(() => {
      expect(
        console.getEntriesSnapshot().some((entry) => entry.method === "error"),
      ).toBe(true);
    });
  });

  test("logs invalid websocket messages without crashing the relay", async () => {
    await using setup = await setupRelay();
    const { console, ws } = setup;
    console.clearEntries();

    ws.send(new Uint8Array([1, 2, 3]));
    await vi.waitFor(() => {
      expect(
        console.getEntriesSnapshot().some((entry) => entry.method === "error"),
      ).toBe(true);
    });
  });

  test("ignores text websocket messages", async () => {
    await using setup = await setupRelay();
    const { driver, ws } = setup;

    ws.send("hello");

    await expect(
      Promise.race([
        ws.waitForMessage().then(() => "message" as const),
        new Promise<"timeout">((resolve) => {
          setTimeout(() => resolve("timeout"), 100);
        }),
      ]),
    ).resolves.toBe("timeout");

    const row = driver.exec(sql`select count(*) as count from evolu_message;`)
      .rows[0] as { readonly count: number };

    expect(row.count).toBe(0);
  });

  test("does not broadcast back to the subscribed writer", async () => {
    await using stack = new AsyncDisposableStack();
    const createId = testCreateId();
    const setup = stack.use(await startTestRelay());
    const writer = stack.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );

    writer.send(
      createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Request,
        subscriptionFlag: SubscriptionFlags.Subscribe,
      }).unwrap(),
    );
    await writer.waitForMessage();

    const writerResponse = writer.waitForMessage();

    writer.send(
      createProtocolMessageFromCrdtMessages(setup.run.deps)(testAppOwner, [
        testCreateCrdtMessage(createId(), 1, "Victoria"),
      ]),
    );

    await writerResponse;

    await expect(
      Promise.race([
        writer.waitForMessage().then(() => "message" as const),
        new Promise<"timeout">((resolve) => {
          setTimeout(() => resolve("timeout"), 20);
        }),
      ]),
    ).resolves.toBe("timeout");
  });

  test("removes closed subscribed sockets before later broadcasts", async () => {
    await using stack = new AsyncDisposableStack();
    const createId = testCreateId();
    const setup = stack.use(await startTestRelay());
    const { console } = setup;
    const writer = stack.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );
    const subscriber = stack.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );

    subscriber.send(
      createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Request,
        subscriptionFlag: SubscriptionFlags.Subscribe,
      }).unwrap(),
    );
    await subscriber.waitForMessage();

    console.clearEntries();
    await subscriber[Symbol.asyncDispose]();

    await vi.waitFor(() => {
      expect(
        console
          .getEntriesSnapshot()
          .some(
            (entry) =>
              entry.method === "debug" &&
              entry.args[0] === "ws close" &&
              entry.args[1] === 1,
          ),
      ).toBe(true);
    });

    const writerResponse = writer.waitForMessage();

    writer.send(
      createProtocolMessageFromCrdtMessages(setup.run.deps)(testAppOwner, [
        testCreateCrdtMessage(createId(), 1, "Victoria"),
      ]),
    );

    await writerResponse;

    expect(
      console
        .getEntriesSnapshot()
        .some(
          (entry) =>
            entry.method === "debug" &&
            entry.args[0] === "broadcast" &&
            entry.args[1] === testAppOwner.id &&
            entry.args[2] === 0,
        ),
    ).toBe(true);
  });

  test("broadcasts to subscribed sockets and stops after unsubscribe", async () => {
    await using stack = new AsyncDisposableStack();
    const createId = testCreateId();
    const setup = stack.use(await startTestRelay());
    const writer = stack.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );
    const subscriber = stack.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );

    subscriber.send(
      createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Request,
        subscriptionFlag: SubscriptionFlags.Subscribe,
      }).unwrap(),
    );
    await subscriber.waitForMessage();

    const writerResponse1 = writer.waitForMessage();
    const subscriberBroadcast1 = subscriber.waitForMessage();

    writer.send(
      createProtocolMessageFromCrdtMessages(setup.run.deps)(testAppOwner, [
        testCreateCrdtMessage(createId(), 1, "Victoria"),
      ]),
    );

    const writerMessage1 = await writerResponse1;
    const subscriberMessage1 = await subscriberBroadcast1;

    expect(writerMessage1).toBeInstanceOf(Uint8Array);
    expect(subscriberMessage1).toBeInstanceOf(Uint8Array);

    subscriber.send(createProtocolMessageForUnsubscribe(testAppOwner.id));
    await subscriber.waitForMessage();

    const writerResponse2 = writer.waitForMessage();

    writer.send(
      createProtocolMessageFromCrdtMessages(setup.run.deps)(testAppOwner, [
        testCreateCrdtMessage(createId(), 2, "Alice"),
      ]),
    );

    await writerResponse2;
    await expect(
      Promise.race([
        subscriber.waitForMessage().then(() => "message" as const),
        new Promise<"timeout">((resolve) => {
          setTimeout(() => resolve("timeout"), 20);
        }),
      ]),
    ).resolves.toBe("timeout");
  });

  test("one socket can subscribe to multiple owners", async () => {
    await using stack = new AsyncDisposableStack();
    const createId = testCreateId();
    const setup = stack.use(await startTestRelay());
    const subscriber = stack.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );
    const writer = stack.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );

    subscriber.send(
      createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Request,
        subscriptionFlag: SubscriptionFlags.Subscribe,
      }).unwrap(),
    );
    await subscriber.waitForMessage();

    subscriber.send(
      createProtocolMessageBuffer(testRelayAppOwner2.id, {
        messageType: MessageType.Request,
        subscriptionFlag: SubscriptionFlags.Subscribe,
      }).unwrap(),
    );
    await subscriber.waitForMessage();

    const writerResponse1 = writer.waitForMessage();
    const subscriberBroadcast1 = subscriber.waitForMessage();

    writer.send(
      createProtocolMessageFromCrdtMessages(setup.run.deps)(testAppOwner, [
        testCreateCrdtMessage(createId(), 1, "Victoria"),
      ]),
    );

    expect(await writerResponse1).toBeInstanceOf(Uint8Array);
    expect(await subscriberBroadcast1).toBeInstanceOf(Uint8Array);

    const writerResponse2 = writer.waitForMessage();
    const subscriberBroadcast2 = subscriber.waitForMessage();

    writer.send(
      createProtocolMessageFromCrdtMessages(setup.run.deps)(
        testRelayAppOwner2,
        [testCreateCrdtMessage(createId(), 2, "Alice")],
      ),
    );

    expect(await writerResponse2).toBeInstanceOf(Uint8Array);
    expect(await subscriberBroadcast2).toBeInstanceOf(Uint8Array);
  });

  test("closing a multi-owner socket removes all owner subscriptions", async () => {
    await using stack = new AsyncDisposableStack();
    const createId = testCreateId();
    const setup = stack.use(await startTestRelay());
    const { console } = setup;
    const subscriber = stack.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );
    const writer = stack.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );

    subscriber.send(
      createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Request,
        subscriptionFlag: SubscriptionFlags.Subscribe,
      }).unwrap(),
    );
    await subscriber.waitForMessage();

    subscriber.send(
      createProtocolMessageBuffer(testRelayAppOwner2.id, {
        messageType: MessageType.Request,
        subscriptionFlag: SubscriptionFlags.Subscribe,
      }).unwrap(),
    );
    await subscriber.waitForMessage();

    console.clearEntries();
    await subscriber[Symbol.asyncDispose]();

    await vi.waitFor(() => {
      expect(
        console
          .getEntriesSnapshot()
          .some(
            (entry) =>
              entry.method === "debug" &&
              entry.args[0] === "ws close" &&
              entry.args[1] === 1,
          ),
      ).toBe(true);
    });

    const writerResponse1 = writer.waitForMessage();
    writer.send(
      createProtocolMessageFromCrdtMessages(setup.run.deps)(testAppOwner, [
        testCreateCrdtMessage(createId(), 1, "Victoria"),
      ]),
    );
    await writerResponse1;

    const writerResponse2 = writer.waitForMessage();
    writer.send(
      createProtocolMessageFromCrdtMessages(setup.run.deps)(
        testRelayAppOwner2,
        [testCreateCrdtMessage(createId(), 2, "Alice")],
      ),
    );
    await writerResponse2;

    await vi.waitFor(() => {
      const entries = console.getEntriesSnapshot();

      expect(
        entries.some(
          (entry) =>
            entry.method === "debug" &&
            entry.args[0] === "broadcast" &&
            entry.args[1] === testAppOwner.id &&
            entry.args[2] === 0,
        ),
      ).toBe(true);

      expect(
        entries.some(
          (entry) =>
            entry.method === "debug" &&
            entry.args[0] === "broadcast" &&
            entry.args[1] === testRelayAppOwner2.id &&
            entry.args[2] === 0,
        ),
      ).toBe(true);
    });
  });

  test("reuses the existing relay database on restart", async () => {
    {
      await using setup = await setupRelay();
      const createId = testCreateId();
      const { run, ws } = setup;

      const responsePromise = ws.waitForMessage();
      ws.send(
        createProtocolMessageFromCrdtMessages(run.deps)(testAppOwner, [
          testCreateCrdtMessage(createId(), 1, "Victoria"),
        ]),
      );
      await responsePromise;
    }

    await using restarted = await startTestRelay();

    const row = restarted.driver.exec(sql`
      select count(*) as count from evolu_message;
    `).rows[0] as { readonly count: number };

    expect(row.count).toBe(1);
  });

  test("logs shutdown in resource disposal order with open websocket clients", async () => {
    await using setup = await setupRelay();
    const { console, relay } = setup;
    console.clearEntries();

    await relay[Symbol.asyncDispose]();

    expect(
      console
        .getEntriesSnapshot()
        .filter((entry) => entry.method === "info")
        .flatMap((entry) =>
          typeof entry.args[0] === "string" ? [entry.args[0]] : [],
        ),
    ).toEqual([
      "Shutting down...",
      "WebSocketServer closed",
      "HTTP server closed",
      "Shutdown complete",
    ]);
  });

  test("logs shutdown in resource disposal order with no open websocket clients", async () => {
    await using setup = await setupRelay();
    const { console, relay, ws } = setup;
    await ws[Symbol.asyncDispose]();
    console.clearEntries();

    await relay[Symbol.asyncDispose]();

    expect(
      console
        .getEntriesSnapshot()
        .filter((entry) => entry.method === "info")
        .flatMap((entry) =>
          typeof entry.args[0] === "string" ? [entry.args[0]] : [],
        ),
    ).toEqual([
      "Shutting down...",
      "WebSocketServer closed",
      "HTTP server closed",
      "Shutdown complete",
    ]);
  });

  test("rejects websocket upgrades when request url is missing", async () => {
    const { relayModule, server } = await loadRelayModuleWithMockedTransport();

    try {
      const console = testCreateConsole();
      await using run = testCreateRun({
        ...relayModule.createRelayDeps(),
        console,
      });
      await using _relay = await run.orThrow(
        relayModule.startRelay({
          port: 0,
          name: testName,
          isOwnerAllowed: lazyTrue,
          isOwnerWithinQuota: () => true,
        }),
      );

      class FakeSocket extends EventEmitter {
        destroyed = false;

        readonly write = vi.fn((_chunk: string) => true);

        readonly destroy = vi.fn(() => {
          this.destroyed = true;
        });
      }

      const socket = new FakeSocket();

      server.emit("upgrade", { url: undefined }, socket, new Uint8Array());

      expect(socket.write).toHaveBeenCalledWith(
        "HTTP/1.1 400 Bad Request\r\n\r\n",
      );
      expect(socket.destroy).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("http");
      vi.doUnmock("ws");
      vi.resetModules();
    }
  });

  test("does not write rejection response for already destroyed upgrade sockets", async () => {
    const { relayModule, server } = await loadRelayModuleWithMockedTransport();

    try {
      const console = testCreateConsole();
      await using run = testCreateRun({
        ...relayModule.createRelayDeps(),
        console,
      });
      await using _relay = await run.orThrow(
        relayModule.startRelay({
          port: 0,
          name: testName,
          isOwnerAllowed: lazyTrue,
          isOwnerWithinQuota: () => true,
        }),
      );

      class FakeSocket extends EventEmitter {
        destroyed = true;

        readonly write = vi.fn((_chunk: string) => true);

        readonly destroy = vi.fn(() => undefined);
      }

      const socket = new FakeSocket();

      server.emit("upgrade", { url: undefined }, socket, new Uint8Array());

      expect(socket.write).not.toHaveBeenCalled();
      expect(socket.destroy).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("http");
      vi.doUnmock("ws");
      vi.resetModules();
    }
  });

  test("ignores non Uint8Array websocket payloads", async () => {
    const { relayModule, wss } = await loadRelayModuleWithMockedTransport();

    try {
      const console = testCreateConsole();
      await using run = testCreateRun({
        ...relayModule.createRelayDeps(),
        console,
      });
      await using _relay = await run.orThrow(
        relayModule.startRelay({
          port: 0,
          name: testName,
          isOwnerWithinQuota: () => true,
        }),
      );

      class FakeSocket extends EventEmitter {
        readonly send = vi.fn();
      }

      const ws = new FakeSocket();

      wss.emit("connection", ws);
      ws.emit("message", new ArrayBuffer(3));

      expect(ws.send).not.toHaveBeenCalled();
      expect(
        console.getEntriesSnapshot().some((entry) => entry.method === "error"),
      ).toBe(false);
    } finally {
      vi.doUnmock("http");
      vi.doUnmock("ws");
      vi.resetModules();
    }
  });
});
