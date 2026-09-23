import {
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertNonEmptyArray,
  assertNotNull,
  assertNotUndefined,
  assertSame,
  assertTrue,
  assertType,
  constFalse,
  constTrue,
  Port,
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
  createTimestampsBuffer,
  defaultProtocolMessageMaxSize,
  InfiniteUpperBound,
  MessageType,
  RangeType,
  SubscriptionFlags,
  testAppOwner,
  testCreateCrdtMessage,
} from "@evolu/common/local-first";
import { EventEmitter, once } from "events";
import { existsSync, unlinkSync } from "fs";
import { afterEach, describe, it, type TestContext } from "node:test";
import { WebSocket as WsWebSocket } from "ws";
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
        port: Port.orThrow(0),
        name: testName,
        isOwnerWithinQuota: () => true,
        ...config,
      }),
    ),
  );

  assertNotUndefined(driver);
  assertTrue(relay.port > 0);
  assertTrue(Port.is(relay.port));
  assertType<NonNullable<NodeJsRelayConfig["port"]>, Port>();

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

/**
 * Subscribes a client to the app owner. `broadcast` uploads frames of about 500
 * KB from another connection, which the relay broadcasts to the client, and
 * `received` resolves once the client has received that many in total, or once
 * its connection closes.
 */
const setupSubscriber = async (
  setup: Awaited<ReturnType<typeof startTestRelay>>,
) => {
  const url = `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`;
  const subscriber = new WsWebSocket(url);
  await once(subscriber, "open");
  const closed = once(subscriber, "close").then(() => "close" as const);
  subscriber.send(
    createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.Subscribe,
    }).unwrap(),
  );
  await once(subscriber, "message");

  let receivedCount = 0;
  subscriber.on("message", () => {
    receivedCount++;
  });
  const createId = testCreateId();
  let frameCount = 0;

  const broadcast = async (count: number): Promise<void> => {
    await using writer = await testSetupWebSocket(url);
    for (const frame of Array.from({ length: count }, () => frameCount++)) {
      const messages = Array.from({ length: 80 }, (_, index) =>
        testCreateCrdtMessage(
          createId(),
          frame * 100 + index + 1,
          "x".repeat(8000),
        ),
      );
      assertNonEmptyArray(messages);
      const response = writer.waitForMessage();
      writer.send(
        createProtocolMessageFromCrdtMessages(setup.run.deps)(
          testAppOwner,
          messages,
        ),
      );
      await response;
    }
  };

  const received = (count: number): Promise<"received" | "close"> =>
    Promise.race([
      new Promise<"received">((resolve) => {
        const check = () => {
          if (receivedCount < count) return;
          subscriber.off("message", check);
          resolve("received");
        };
        subscriber.on("message", check);
        check();
      }),
      closed,
    ]);

  return { subscriber, closed, broadcast, received };
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

  it("pings connections and keeps those that answer", async () => {
    await using setup = await startTestRelay({ pingInterval: "50ms" });
    const { time } = setup.run.deps;
    const client = new WsWebSocket(
      `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
    );
    await once(client, "open");
    const closed = once(client, "close");

    // The client answers each ping automatically and sends nothing else, so
    // only its pongs keep the connection.
    for (let tick = 0; tick < 3; tick++) {
      const outcome = Promise.race([
        once(client, "ping").then(() => "ping"),
        closed.then(() => "close"),
      ]);
      time.advance("50ms");
      assertSame(await outcome, "ping");
      // ws writes the automatic pong before emitting "ping". Any request to
      // confirm the relay read it would count as data too, so wait real time
      // before the next fake-clock tick, then one more event-loop turn: a
      // stalled loop runs the timer before it polls the relay's socket.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    assertSame(client.readyState, WsWebSocket.OPEN);

    client.close();
    await closed;
  });

  it("terminates a connection that stops answering pings", async () => {
    await using setup = await startTestRelay({ pingInterval: "50ms" });
    const { time } = setup.run.deps;
    const client = new WsWebSocket(
      `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      { autoPong: false },
    );
    await once(client, "open");
    const closed = once(client, "close");

    // The first tick pings; the second finds no answer.
    const ping = once(client, "ping");
    time.advance("50ms");
    await ping;
    time.advance("50ms");

    const [code] = (await closed) as [number];
    assertSame(code, 1006);
  });

  it("keeps a connection that sends data while its pong is delayed", async () => {
    await using setup = await startTestRelay({ pingInterval: "50ms" });
    const { time } = setup.run.deps;
    // The client never answers pings, as when its pong waits behind an
    // upload on a slow link, but data keeps arriving.
    const client = new WsWebSocket(
      `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`,
      { autoPong: false },
    );
    await once(client, "open");
    const closed = once(client, "close");

    for (let tick = 0; tick < 3; tick++) {
      const outcome = Promise.race([
        once(client, "ping").then(() => "ping"),
        closed.then(() => "close"),
      ]);
      time.advance("50ms");
      assertSame(await outcome, "ping");
      // The client's ping is incoming data; the relay's automatic pong
      // confirms it was received before the next fake-clock tick.
      const pong = Promise.race([
        once(client, "pong").then(() => "pong"),
        closed.then(() => "close"),
      ]);
      client.ping();
      assertSame(await pong, "pong");
    }
    assertSame(client.readyState, WsWebSocket.OPEN);

    // Once data stops, the next tick pings and the one after terminates.
    const ping = once(client, "ping");
    time.advance("50ms");
    await ping;
    time.advance("50ms");
    const [code] = (await closed) as [number];
    assertSame(code, 1006);
  });

  it("keeps a connection until the data queued for it is sent", async () => {
    await using setup = await startTestRelay({ pingInterval: "50ms" });
    const { time } = setup.run.deps;
    const { subscriber, closed, broadcast, received } =
      await setupSubscriber(setup);

    // The stalled reader stands in for a large frame crossing a slow link,
    // and the broadcasts outgrow the socket buffers, so the rest waits on the
    // relay together with any ping sent after them. No answer can arrive
    // meanwhile, and neither tick terminates it.
    subscriber.pause();
    await broadcast(24);
    time.advance("50ms");
    time.advance("50ms");
    subscriber.resume();
    assertSame(await received(24), "received");

    // Written broadcasts no longer count toward the cap, so a client that
    // keeps reading receives more than 16 MB over its connection.
    await broadcast(24);
    assertSame(await received(48), "received");
    assertSame(subscriber.readyState, WsWebSocket.OPEN);

    subscriber.close();
    await closed;
  });

  it("terminates a connection more than 16 MB behind on broadcasts", async () => {
    await using setup = await startTestRelay();
    const { subscriber, broadcast, received } = await setupSubscriber(setup);

    subscriber.pause();
    await broadcast(50);
    subscriber.resume();
    assertSame(await received(50), "close");
  });

  it("keeps a connection whose replies to its own requests exceed 16 MB", async () => {
    await using setup = await startTestRelay({ pingInterval: "50ms" });
    const { console, time } = setup.run.deps;
    const url = `ws://127.0.0.1:${setup.relay.port}/?ownerId=${testAppOwner.id}`;
    {
      await using writer = await testSetupWebSocket(url);
      const createId = testCreateId();
      for (let frame = 0; frame < 2; frame++) {
        const messages = Array.from({ length: 80 }, (_, index) =>
          testCreateCrdtMessage(
            createId(),
            frame * 100 + index + 1,
            "x".repeat(8000),
          ),
        );
        assertNonEmptyArray(messages);
        const response = writer.waitForMessage();
        writer.send(
          createProtocolMessageFromCrdtMessages(setup.run.deps)(
            testAppOwner,
            messages,
          ),
        );
        await response;
      }
    }

    // A client with nothing stored asks for the owner's history in more
    // rounds than 16 full replies, as one socket does for many owners, and
    // reads them slowly.
    const client = new WsWebSocket(url);
    await once(client, "open");
    const closed = once(client, "close");
    const roundCount = 30;
    let receivedCount = 0;
    const received = new Promise<"received">((resolve) => {
      client.on("message", () => {
        if (++receivedCount === roundCount) resolve("received");
      });
    });
    client.pause();
    const round = createProtocolMessageBuffer(testAppOwner.id, {
      messageType: MessageType.Request,
      subscriptionFlag: SubscriptionFlags.Subscribe,
    });
    round.addRange({
      type: RangeType.Timestamps,
      upperBound: InfiniteUpperBound,
      timestamps: createTimestampsBuffer(),
    });
    const roundBytes = round.unwrap();
    for (let index = 0; index < roundCount; index++) client.send(roundBytes);
    // Each round subscribes before its reply is written.
    await assertEventually(
      () =>
        console
          .getEntriesSnapshot()
          .filter(({ args }) => args[0] === "subscribe").length === roundCount,
    );
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });

    time.advance("50ms");
    time.advance("50ms");
    client.resume();
    assertSame(
      await Promise.race([received, closed.then(() => "close")]),
      "received",
    );
    assertSame(client.readyState, WsWebSocket.OPEN);

    client.close();
    await closed;
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

    assertEqual(ws.socket.readyState, WebSocket.OPEN);
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

    assertNotUndefined(signal);
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
    assertNotNull(socket);
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
    assertNotUndefined(entry);
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

  it("keeps serving after a client sends a frame over the maximum payload", async () => {
    await using setup = await setupRelay();
    const { console, relay, ws } = setup;
    console.clearEntries();
    const closeCode = new Promise<number>((resolve) => {
      ws.socket.addEventListener("close", (event) => resolve(event.code), {
        once: true,
      });
    });

    ws.send(new Uint8Array(defaultProtocolMessageMaxSize + 1));

    assertSame(await closeCode, 1009);
    const entry = console
      .getEntriesSnapshot()
      .find(({ args }) => args[0] instanceof RangeError);
    assertNotUndefined(entry);
    assertEqual(entry.path, ["relay"]);
    assertSame(entry.method, "debug");

    await using next = await testSetupWebSocket(
      `ws://127.0.0.1:${relay.port}/?ownerId=${testAppOwner.id}`,
    );
    const response = next.waitForMessage();
    next.send(
      createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Request,
        subscriptionFlag: SubscriptionFlags.Subscribe,
      }).unwrap(),
    );
    assertInstanceOf(await response, Uint8Array);
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
        port: Port.orThrow(0),
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
        port: Port.orThrow(0),
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
        port: Port.orThrow(0),
        name: testName,
        isOwnerWithinQuota: () => true,
      }),
    );

    class FakeSocket extends EventEmitter {
      readonly send = t.mock.fn();
    }

    const ws = new FakeSocket();

    wss.emit("connection", ws, { socket: new EventEmitter() });
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
        port: Port.orThrow(0),
        name: testName,
        isOwnerWithinQuota,
      }),
    );

    class FakeSocket extends EventEmitter {
      readonly send = t.mock.fn();
    }

    const ws = new FakeSocket();
    const createId = testCreateId();

    wss.emit("connection", ws, { socket: new EventEmitter() });
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

  it("stops pinging when disposed", async (t) => {
    const { relayModule, wss } = await loadRelayModuleWithMockedTransport(
      t.mock,
    );

    await using run = testCreateRun({
      ...relayModule.createRelayDeps(),
      console: testCreateConsole(),
    });
    const relay = await run.ok(
      relayModule.createRelay({
        port: Port.orThrow(0),
        name: testName,
        isOwnerWithinQuota: () => true,
        pingInterval: "1s",
      }),
    );

    class FakeSocket extends EventEmitter {
      readonly readyState = 1;
      readonly bufferedAmount = 0;
      readonly close = t.mock.fn();
      readonly ping = t.mock.fn();
      readonly terminate = t.mock.fn();
    }

    const ws = new FakeSocket();
    wss.clients.add(ws);
    wss.emit("connection", ws, { socket: new EventEmitter() });
    run.deps.time.advance("1s");
    assertSame(ws.ping.mock.callCount(), 1);

    // The mocked server keeps the connection, so a surviving timer would
    // terminate it at the next tick, as it sent nothing since the ping.
    await relay[Symbol.asyncDispose]();
    run.deps.time.advance("2s");
    assertSame(ws.ping.mock.callCount(), 1);
    assertSame(ws.terminate.mock.callCount(), 0);
  });

  it("stops serving connections once it is disposed", async (t) => {
    const { relayModule, server, wss } =
      await loadRelayModuleWithMockedTransport(t.mock);

    await using run = testCreateRun({
      ...relayModule.createRelayDeps(),
      console: testCreateConsole(),
    });
    const relay = await run.ok(
      relayModule.createRelay({
        port: Port.orThrow(0),
        name: testName,
        isOwnerAllowed: constTrue,
        isOwnerWithinQuota: () => true,
      }),
    );

    class FakeWebSocket extends EventEmitter {
      readonly readyState = 1;
      readonly close = t.mock.fn();
      readonly send = t.mock.fn();
    }

    class FakeSocket extends EventEmitter {
      destroyed = false;
      readonly write = t.mock.fn((_chunk: string) => true);
      readonly destroy = t.mock.fn(() => {
        this.destroyed = true;
      });
    }

    const ws = new FakeWebSocket();
    wss.clients.add(ws);
    wss.emit("connection", ws, { socket: new EventEmitter() });

    // The server waits for its connections to finish closing after the relay
    // disposed its Run, and meanwhile a closing client can still send and a
    // new one can still connect.
    const serverClosing = Promise.withResolvers<() => void>();
    wss.close.mock.mockImplementation((callback: () => void) => {
      serverClosing.resolve(callback);
    });
    const disposing = relay[Symbol.asyncDispose]();
    const closeServer = await serverClosing.promise;
    assertSame(ws.close.mock.callCount(), 1);

    ws.emit(
      "message",
      createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Request,
        subscriptionFlag: SubscriptionFlags.Subscribe,
      }).unwrap(),
    );
    // A rejection from processing the frame surfaces while this test runs.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    const socket = new FakeSocket();
    server.emit(
      "upgrade",
      { url: `/?ownerId=${testAppOwner.id}` },
      socket,
      new Uint8Array(),
    );
    closeServer();
    await disposing;

    assertSame(ws.send.mock.callCount(), 0);
    assertSame(socket.destroy.mock.callCount(), 1);
    assertSame(wss.handleUpgrade.mock.callCount(), 0);
  });
});
