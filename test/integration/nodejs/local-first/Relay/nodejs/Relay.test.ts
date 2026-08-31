import {
  assert,
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertSame,
  assertTrue,
  constFalse,
  constTrue,
  sql,
  testCreateConsole,
  testCreateDeps,
  testCreateId,
  testCreateRun,
  testName,
  testSetupWebSocket,
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
import { afterEach, describe, it, type TestContext } from "node:test";
import { installPolyfills } from "../../../../../../packages/common/src/Polyfills.ts";
import {
  createRelayDeps,
  createRelay,
  testSendWebSocketUpgradeRequest,
  testSetupWebSocketUpgradeRequest,
  type NodeJsRelayConfig,
} from "../../../../../../packages/nodejs/src/index.ts";

installPolyfills();

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

  await using disposer = new AsyncDisposableStack();

  const run = disposer.use(
    testCreateRun({
      ...relayDeps,
      createSqliteDriver,
      console,
    }),
  );

  const relay = disposer.use(
    await run.ok(
      createRelay({
        port: 0,
        name: testName,
        isOwnerWithinQuota: () => true,
        ...config,
      }),
    ),
  );

  assert(driver, "Expected relay SQLite driver");

  const disposables = disposer.move();

  return {
    console,
    driver,
    relay,
    run,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

const setupRelay = async () => {
  await using disposer = new AsyncDisposableStack();

  const relaySetup = disposer.use(await startTestRelay());
  const ws = disposer.use(
    await testSetupWebSocket(
      `ws://127.0.0.1:${relaySetup.relay.port}/?ownerId=${testAppOwner.id}`,
    ),
  );

  const disposables = disposer.move();

  return {
    ...relaySetup,
    ws,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

let relayModuleImportId = 0;

const loadRelayModuleWithMockedTransport = async (
  mock: TestContext["mock"],
) => {
  class FakeServer extends EventEmitter {
    readonly listen = mock.fn((_port?: number) => {
      queueMicrotask(() => {
        this.emit("listening");
      });
      return this;
    });

    readonly address = mock.fn(() => ({
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

    readonly handleUpgrade = mock.fn();

    readonly close = mock.fn((callback: () => void) => {
      callback();
    });
  }

  const server = new FakeServer();
  const wss = new FakeWebSocketServer();

  mock.module("http", {
    // @ts-expect-error -- Node.js 24.20 replaces the deprecated namedExports option with exports, which @types/node 24.13 does not declare yet.
    exports: {
      createServer: () => server,
    },
  });

  mock.module("ws", {
    // @ts-expect-error -- Node.js 24.20 replaces the deprecated namedExports option with exports, which @types/node 24.13 does not declare yet.
    exports: {
      WebSocket: { OPEN: 1 },
      WebSocketServer: function MockWebSocketServer() {
        return wss;
      },
    },
  });

  const relayModule: typeof import("../../../../../../packages/nodejs/src/local-first/Relay.ts") =
    await import(
      `../../../../../../packages/nodejs/src/local-first/Relay.ts?test=${relayModuleImportId++}`
    );

  return { relayModule, server, wss };
};

const assertEventually = async (condition: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  assertTrue(condition());
};

describe("createRelay", () => {
  afterEach(() => {
    for (const suffix of [".db", ".db-shm", ".db-wal"]) {
      const filePath = `${testName}${suffix}`;
      if (existsSync(filePath)) unlinkSync(filePath);
    }
  });

  it("processes websocket messages after startup task settles", async () => {
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

    assertInstanceOf(response, Uint8Array);

    const row = driver.exec(sql`select count(*) as count from evolu_message;`)
      .rows[0] as { readonly count: number };

    assertEqual(row.count, 1);
  });

  it("rejects websocket upgrades without ownerId", async () => {
    await using setup = await startTestRelay({
      isOwnerAllowed: constTrue,
    });

    const response = await testSendWebSocketUpgradeRequest(
      setup.relay.port,
      "/",
    );

    assertEqual(response.statusCode, 400);
  });

  it("rejects unauthorized owner websocket upgrades", async () => {
    await using setup = await startTestRelay({
      isOwnerAllowed: constFalse,
    });

    const response = await testSendWebSocketUpgradeRequest(
      setup.relay.port,
      `/?ownerId=${testAppOwner.id}`,
    );

    assertEqual(response.statusCode, 401);
  });

  it("accepts websocket upgrades when owner authorization is disabled", async () => {
    await using setup = await startTestRelay();
    await using ws = await testSetupWebSocket(
      `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
    );

    assertEqual(ws.socket.readyState, globalThis.WebSocket.OPEN);
  });

  it("authorizes websocket upgrades with signal-aware callback", async () => {
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

  it("aborts pending owner authorization when relay is disposed", async () => {
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
    assertFalse(signal.aborted);

    await setup.relay[Symbol.asyncDispose]();
    pendingAuthorization.resolve(true);

    assertTrue(signal.aborted);
  });

  it("aborts pending owner authorization when client disconnects", async () => {
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
    assertFalse(signal.aborted);

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

    await assertEventually(() => signal.aborted);

    pendingAuthorization.resolve(true);
  });

  it("ignores unauthorized owner completion after client disconnect", async () => {
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

    assertFalse(
      console
        .getEntriesSnapshot()
        .some(
          (entry) =>
            entry.method === "debug" &&
            entry.args[0] === "unauthorized owner" &&
            entry.args[1] === testAppOwner.id,
        ),
    );
  });

  it("returns service unavailable when owner authorization throws", async () => {
    const error = new Error("boom");
    await using setup = await startTestRelay({
      isOwnerAllowed: () => {
        throw error;
      },
    });

    const response = await testSendWebSocketUpgradeRequest(
      setup.relay.port,
      `/?ownerId=${testAppOwner.id}`,
    );

    assertEqual(response.statusCode, 503);
    const entry = setup.console
      .getEntriesSnapshot()
      .find((entry) => entry.method === "error");
    assert(entry, "Expected an error console entry");
    assertEqual(entry.path, ["relay"]);
    assertEqual(entry.args.length, 1);
    assertSame(entry.args[0], error);
  });

  it("logs invalid websocket messages without crashing the relay", async () => {
    await using setup = await setupRelay();
    const { console, ws } = setup;
    console.clearEntries();

    ws.send(new Uint8Array([1, 2, 3]));
    await assertEventually(() =>
      console.getEntriesSnapshot().some((entry) => entry.method === "error"),
    );
  });

  it("ignores text websocket messages", async () => {
    await using setup = await setupRelay();
    const { driver, ws } = setup;

    ws.send("hello");

    assertEqual(
      await Promise.race([
        ws.waitForMessage().then(() => "message" as const),
        new Promise<"timeout">((resolve) => {
          setTimeout(() => resolve("timeout"), 100);
        }),
      ]),
      "timeout",
    );

    const row = driver.exec(sql`select count(*) as count from evolu_message;`)
      .rows[0] as { readonly count: number };

    assertEqual(row.count, 0);
  });

  it("does not broadcast back to the subscribed writer", async () => {
    await using disposer = new AsyncDisposableStack();
    const createId = testCreateId();
    const setup = disposer.use(await startTestRelay());
    const writer = disposer.use(
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

    assertEqual(
      await Promise.race([
        writer.waitForMessage().then(() => "message" as const),
        new Promise<"timeout">((resolve) => {
          setTimeout(() => resolve("timeout"), 20);
        }),
      ]),
      "timeout",
    );
  });

  it("removes closed subscribed sockets before later broadcasts", async () => {
    await using disposer = new AsyncDisposableStack();
    const createId = testCreateId();
    const setup = disposer.use(await startTestRelay());
    const { console } = setup;
    const writer = disposer.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );
    const subscriber = disposer.use(
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

    await assertEventually(() =>
      console
        .getEntriesSnapshot()
        .some(
          (entry) =>
            entry.method === "debug" &&
            entry.args[0] === "ws close" &&
            entry.args[1] === 1,
        ),
    );

    const writerResponse = writer.waitForMessage();

    writer.send(
      createProtocolMessageFromCrdtMessages(setup.run.deps)(testAppOwner, [
        testCreateCrdtMessage(createId(), 1, "Victoria"),
      ]),
    );

    await writerResponse;

    assertTrue(
      console
        .getEntriesSnapshot()
        .some(
          (entry) =>
            entry.method === "debug" &&
            entry.args[0] === "broadcast" &&
            entry.args[1] === testAppOwner.id &&
            entry.args[2] === 0,
        ),
    );
  });

  it("broadcasts to subscribed sockets and stops after unsubscribe", async () => {
    await using disposer = new AsyncDisposableStack();
    const createId = testCreateId();
    const setup = disposer.use(await startTestRelay());
    const writer = disposer.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );
    const subscriber = disposer.use(
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

    assertInstanceOf(writerMessage1, Uint8Array);
    assertInstanceOf(subscriberMessage1, Uint8Array);

    subscriber.send(createProtocolMessageForUnsubscribe(testAppOwner.id));
    await subscriber.waitForMessage();

    const writerResponse2 = writer.waitForMessage();

    writer.send(
      createProtocolMessageFromCrdtMessages(setup.run.deps)(testAppOwner, [
        testCreateCrdtMessage(createId(), 2, "Alice"),
      ]),
    );

    await writerResponse2;
    assertEqual(
      await Promise.race([
        subscriber.waitForMessage().then(() => "message" as const),
        new Promise<"timeout">((resolve) => {
          setTimeout(() => resolve("timeout"), 20);
        }),
      ]),
      "timeout",
    );
  });

  it("one socket can subscribe to multiple owners", async () => {
    await using disposer = new AsyncDisposableStack();
    const createId = testCreateId();
    const setup = disposer.use(await startTestRelay());
    const subscriber = disposer.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );
    const writer = disposer.use(
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

    assertInstanceOf(await writerResponse1, Uint8Array);
    assertInstanceOf(await subscriberBroadcast1, Uint8Array);

    const writerResponse2 = writer.waitForMessage();
    const subscriberBroadcast2 = subscriber.waitForMessage();

    writer.send(
      createProtocolMessageFromCrdtMessages(setup.run.deps)(
        testRelayAppOwner2,
        [testCreateCrdtMessage(createId(), 2, "Alice")],
      ),
    );

    assertInstanceOf(await writerResponse2, Uint8Array);
    assertInstanceOf(await subscriberBroadcast2, Uint8Array);
  });

  it("closing a multi-owner socket removes all owner subscriptions", async () => {
    await using disposer = new AsyncDisposableStack();
    const createId = testCreateId();
    const setup = disposer.use(await startTestRelay());
    const { console } = setup;
    const subscriber = disposer.use(
      await testSetupWebSocket(
        `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      ),
    );
    const writer = disposer.use(
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

    await assertEventually(() =>
      console
        .getEntriesSnapshot()
        .some(
          (entry) =>
            entry.method === "debug" &&
            entry.args[0] === "ws close" &&
            entry.args[1] === 1,
        ),
    );

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

    await assertEventually(() => {
      const entries = console.getEntriesSnapshot();

      return (
        entries.some(
          (entry) =>
            entry.method === "debug" &&
            entry.args[0] === "broadcast" &&
            entry.args[1] === testAppOwner.id &&
            entry.args[2] === 0,
        ) &&
        entries.some(
          (entry) =>
            entry.method === "debug" &&
            entry.args[0] === "broadcast" &&
            entry.args[1] === testRelayAppOwner2.id &&
            entry.args[2] === 0,
        )
      );
    });
  });

  it("reuses the existing relay database on restart", async () => {
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

    assertEqual(row.count, 1);
  });

  it("logs resource disposal order with open websocket clients", async () => {
    await using setup = await setupRelay();
    const { console, relay } = setup;
    console.clearEntries();

    await relay[Symbol.asyncDispose]();

    assertEqual(
      console
        .getEntriesSnapshot()
        .filter((entry) => entry.method === "info")
        .flatMap((entry) =>
          typeof entry.args[0] === "string" ? [entry.args[0]] : [],
        ),
      ["WebSocketServer closed", "HTTP server closed"],
    );
  });

  it("logs resource disposal order with no open websocket clients", async () => {
    await using setup = await setupRelay();
    const { console, relay, ws } = setup;
    await ws[Symbol.asyncDispose]();
    console.clearEntries();

    await relay[Symbol.asyncDispose]();

    assertEqual(
      console
        .getEntriesSnapshot()
        .filter((entry) => entry.method === "info")
        .flatMap((entry) =>
          typeof entry.args[0] === "string" ? [entry.args[0]] : [],
        ),
      ["WebSocketServer closed", "HTTP server closed"],
    );
  });

  it("rejects websocket upgrades when request url is missing", async (t) => {
    const { relayModule, server } = await loadRelayModuleWithMockedTransport(
      t.mock,
    );

    const console = testCreateConsole();
    await using run = testCreateRun({
      ...relayModule.createRelayDeps(),
      console,
    });
    await using _relay = await run.ok(
      relayModule.createRelay({
        port: 0,
        name: testName,
        isOwnerAllowed: constTrue,
        isOwnerWithinQuota: () => true,
      }),
    );

    class FakeSocket extends EventEmitter {
      destroyed = false;

      readonly write = t.mock.fn((_chunk: string) => true);

      readonly destroy = t.mock.fn(() => {
        this.destroyed = true;
      });
    }

    const socket = new FakeSocket();

    server.emit("upgrade", { url: undefined }, socket, new Uint8Array());

    assertEqual(
      socket.write.mock.calls.map(({ arguments: args }) => args),
      [["HTTP/1.1 400 Bad Request\r\n\r\n"]],
    );
    assertEqual(socket.destroy.mock.callCount(), 1);
  });

  it("does not write rejection response for already destroyed upgrade sockets", async (t) => {
    const { relayModule, server } = await loadRelayModuleWithMockedTransport(
      t.mock,
    );

    const console = testCreateConsole();
    await using run = testCreateRun({
      ...relayModule.createRelayDeps(),
      console,
    });
    await using _relay = await run.ok(
      relayModule.createRelay({
        port: 0,
        name: testName,
        isOwnerAllowed: constTrue,
        isOwnerWithinQuota: () => true,
      }),
    );

    class FakeSocket extends EventEmitter {
      destroyed = true;

      readonly write = t.mock.fn((_chunk: string) => true);

      readonly destroy = t.mock.fn(() => undefined);
    }

    const socket = new FakeSocket();

    server.emit("upgrade", { url: undefined }, socket, new Uint8Array());

    assertEqual(socket.write.mock.callCount(), 0);
    assertEqual(socket.destroy.mock.callCount(), 0);
  });

  it("ignores non Uint8Array websocket payloads", async (t) => {
    const { relayModule, wss } = await loadRelayModuleWithMockedTransport(
      t.mock,
    );

    const console = testCreateConsole();
    await using run = testCreateRun({
      ...relayModule.createRelayDeps(),
      console,
    });
    await using _relay = await run.ok(
      relayModule.createRelay({
        port: 0,
        name: testName,
        isOwnerWithinQuota: () => true,
      }),
    );

    class FakeSocket extends EventEmitter {
      readonly send = t.mock.fn();
    }

    const ws = new FakeSocket();

    wss.emit("connection", ws);
    ws.emit("message", new ArrayBuffer(3));

    assertEqual(ws.send.mock.callCount(), 0);
    assertFalse(
      console.getEntriesSnapshot().some((entry) => entry.method === "error"),
    );
  });

  it("ignores websocket message processing aborted during shutdown", async (t) => {
    const { relayModule, wss } = await loadRelayModuleWithMockedTransport(
      t.mock,
    );

    const console = testCreateConsole();
    const continueQuotaCheck = Promise.withResolvers<boolean>();
    const isOwnerWithinQuota = t.mock.fn(() => continueQuotaCheck.promise);
    const run = testCreateRun({
      ...relayModule.createRelayDeps(),
      console,
    });
    await using _relay = await run.ok(
      relayModule.createRelay({
        port: 0,
        name: testName,
        isOwnerWithinQuota,
      }),
    );

    class FakeSocket extends EventEmitter {
      readonly send = t.mock.fn();
    }

    const ws = new FakeSocket();
    const createId = testCreateId();

    wss.emit("connection", ws);
    const createMessage = () =>
      createProtocolMessageFromCrdtMessages(run.deps)(testAppOwner, [
        testCreateCrdtMessage(createId(), 1, "Victoria"),
      ]);

    ws.emit("message", createMessage());
    await assertEventually(() => isOwnerWithinQuota.mock.callCount() === 1);
    ws.emit("message", createMessage());

    const disposePromise = run[Symbol.asyncDispose]();
    continueQuotaCheck.resolve(true);
    await disposePromise;

    await assertEventually(() => ws.send.mock.callCount() === 1);
    assertFalse(
      console.getEntriesSnapshot().some((entry) => entry.method === "error"),
    );
  });
});
