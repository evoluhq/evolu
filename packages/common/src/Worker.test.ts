import { describe, it } from "node:test";

import {
  assertEqual,
  assertFalse,
  assertNonNullable,
  assertNotNull,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
} from "./Assert.ts";
import { constVoid } from "./Function.ts";
import type { NativeMessagePort } from "./Worker.ts";
import {
  createWorker,
  createSharedWorker,
  createBroadcastChannel,
  testCreateWorker,
  testCreateSharedWorker,
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateBroadcastChannel,
  testWaitForWorkerMessage,
} from "./Worker.ts";

const expectArrayAfterWorkerMessage = async <T>(
  actual: ReadonlyArray<T>,
  expected: ReadonlyArray<T>,
): Promise<void> => {
  await testWaitForWorkerMessage();
  assertEqual(actual, expected);
};

describe("createWorker", () => {
  it("messages are queued and delivered asynchronously after worker self onMessage is assigned", async () => {
    let self!: { onMessage: ((message: string) => void) | null };

    const worker = createWorker<string>((nextSelf) => {
      self = nextSelf;
    });

    worker.postMessage("queued");

    const received: Array<string> = [];
    self.onMessage = (message) => {
      received.push(message);
    };

    await expectArrayAfterWorkerMessage(received, ["queued"]);
  });
});

describe("createSharedWorker", () => {
  it("messages are queued and delivered asynchronously after worker-side port onMessage is assigned", async () => {
    let workerPort!: { onMessage: ((message: string) => void) | null };

    const worker = createSharedWorker<string>((self) => {
      self.onConnect = (port) => {
        workerPort = port;
      };
    });

    worker.port.postMessage("queued");

    const received: Array<string> = [];
    workerPort.onMessage = (message) => {
      received.push(message);
    };

    await expectArrayAfterWorkerMessage(received, ["queued"]);
  });
});

describe("testCreateMessageChannel", () => {
  it("native ports are object tokens for WeakMap compatibility", () => {
    const channel = testCreateMessageChannel<string, number>();
    assertEqual(typeof channel.port1.native, "object");
    assertNotNull(channel.port1.native);
    assertEqual(typeof channel.port2.native, "object");
    assertNotNull(channel.port2.native);
  });

  it("port1 postMessage delivers to port2 onMessage asynchronously", async () => {
    const channel = testCreateMessageChannel<string, number>();
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => {
      received.push(msg);
    };
    channel.port1.postMessage("hello");

    await expectArrayAfterWorkerMessage(received, ["hello"]);
  });

  it("port2 postMessage delivers to port1 onMessage asynchronously", async () => {
    const channel = testCreateMessageChannel<string, number>();
    const received: Array<number> = [];
    channel.port1.onMessage = (msg) => {
      received.push(msg);
    };
    channel.port2.postMessage(42);

    await expectArrayAfterWorkerMessage(received, [42]);
  });

  it("messages are queued until onMessage is assigned and then flushed asynchronously", async () => {
    const channel = testCreateMessageChannel<string, number>();
    channel.port1.postMessage("a");
    channel.port1.postMessage("b");
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => {
      received.push(msg);
    };

    await expectArrayAfterWorkerMessage(received, ["a", "b"]);
  });

  it("messages remain queued when dispatch runs before onMessage is assigned", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];

    channel.port1.postMessage("buffered");
    await testWaitForWorkerMessage();

    channel.port2.onMessage = (msg) => {
      received.push(msg);
    };
    await expectArrayAfterWorkerMessage(received, ["buffered"]);
  });

  it("messages sent after onMessage is assigned are delivered asynchronously", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => {
      received.push(msg);
    };
    channel.port1.postMessage("first");
    channel.port1.postMessage("second");

    await expectArrayAfterWorkerMessage(received, ["first", "second"]);
  });

  it("setting onMessage to null stops future asynchronous delivery", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => {
      received.push(msg);
    };
    channel.port1.postMessage("delivered");
    await expectArrayAfterWorkerMessage(received, ["delivered"]);

    channel.port2.onMessage = null;
    channel.port1.postMessage("queued");
    await testWaitForWorkerMessage();

    assertEqual(received, ["delivered"]);
  });

  it("dispose nulls out handlers", () => {
    const channel = testCreateMessageChannel<string>();
    channel.port1.onMessage = constVoid;
    channel.port2.onMessage = constVoid;
    assertNotNull(channel.port1.onMessage);
    assertNotNull(channel.port2.onMessage);
    channel[Symbol.dispose]();
    assertSame(channel.port1.onMessage, null);
    assertSame(channel.port2.onMessage, null);
  });

  it("dispose before scheduled flush drops queued messages", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];
    const clearTimeout = globalThis.clearTimeout;

    globalThis.clearTimeout = () => undefined;

    try {
      channel.port2.onMessage = (message) => {
        received.push(message);
      };
      channel.port1.postMessage("queued");
      channel.port2[Symbol.dispose]();

      await testWaitForWorkerMessage();

      assertEqual(received, []);
    } finally {
      globalThis.clearTimeout = clearTimeout;
    }
  });

  it("dispose during flush stops remaining queued messages", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];

    channel.port2.onMessage = (message) => {
      received.push(message);
      channel.port2[Symbol.dispose]();
    };

    channel.port1.postMessage("first");
    channel.port1.postMessage("second");

    await expectArrayAfterWorkerMessage(received, ["first"]);
  });

  it("isDisposed reflects disposal state", () => {
    const channel = testCreateMessageChannel<string>();

    assertFalse(channel.isDisposed());
    channel[Symbol.dispose]();
    assertTrue(channel.isDisposed());
  });

  it("each channel creates independent ports", () => {
    const channel1 = testCreateMessageChannel<string>();
    const channel2 = testCreateMessageChannel<string>();
    assertFalse(Object.is(channel1.port1.native, channel2.port1.native));
    assertFalse(Object.is(channel1.port2.native, channel2.port2.native));
  });

  it("bidirectional communication works asynchronously", async () => {
    const channel = testCreateMessageChannel<string, number>();
    const strings: Array<string> = [];
    const numbers: Array<number> = [];

    channel.port2.onMessage = (msg) => {
      strings.push(msg);
    };
    channel.port1.onMessage = (msg) => {
      numbers.push(msg);
    };

    channel.port1.postMessage("hello");
    channel.port2.postMessage(42);

    await expectArrayAfterWorkerMessage(strings, ["hello"]);
    assertEqual(numbers, [42]);
  });

  it("disposed port ignores onMessage reassignment and repeated dispose", () => {
    const channel = testCreateMessageChannel<string>();

    channel.port2[Symbol.dispose]();
    channel.port2.onMessage = constVoid;
    channel.port2[Symbol.dispose]();

    assertSame(channel.port2.onMessage, null);
  });

  it("sending to a disposed peer is ignored", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];

    channel.port2.onMessage = (message) => {
      received.push(message);
    };
    channel.port2[Symbol.dispose]();
    channel.port1.postMessage("ignored");

    await testWaitForWorkerMessage();

    assertEqual(received, []);
  });

  it("non-port transferables are ignored", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];

    channel.port2.onMessage = (message) => {
      received.push(message);
    };
    channel.port1.postMessage("hello", [{} as NativeMessagePort]);
    channel.port1.postMessage("world", [new ArrayBuffer(8)]);

    await expectArrayAfterWorkerMessage(received, ["hello", "world"]);
  });

  it("transferred native ports can be wrapped after transfer", async () => {
    const channel =
      testCreateMessageChannel<NativeMessagePort<never, string>>();
    const transferredChannel = testCreateMessageChannel<never, string>();
    let transferredNative: NativeMessagePort<never, string> | undefined;

    channel.port2.onMessage = (nativePort) => {
      transferredNative = nativePort;
    };

    channel.port1.postMessage(transferredChannel.port1.native, [
      transferredChannel.port1.native,
    ]);

    await testWaitForWorkerMessage();
    assertNonNullable(transferredNative);

    transferredChannel.port1[Symbol.dispose]();

    const wrappedPort = testCreateMessagePort<never, string>(transferredNative);
    const received: Array<string> = [];
    wrappedPort.onMessage = (message) => {
      received.push(message);
    };

    transferredChannel.port2.postMessage("hello");

    await expectArrayAfterWorkerMessage(received, ["hello"]);
  });
});

describe("testCreateMessagePort", () => {
  it("looks up port by native token from channel", () => {
    const channel = testCreateMessageChannel<string, number>();
    const port = testCreateMessagePort<string, number>(channel.port1.native);
    assertSame(port.native, channel.port1.native);
  });

  it("looks up port2 by native token", () => {
    const channel = testCreateMessageChannel<string, number>();
    const port = testCreateMessagePort<number, string>(channel.port2.native);
    assertSame(port.native, channel.port2.native);
  });

  it("transferred ports remain usable after original channel dispose", async () => {
    const channel = testCreateMessageChannel<string, number>();
    const transferredPort1 = testCreateMessagePort<string, number>(
      channel.port1.native,
    );
    const transferredPort2 = testCreateMessagePort<number, string>(
      channel.port2.native,
    );

    const received: Array<string> = [];
    transferredPort2.onMessage = (message) => {
      received.push(message);
    };

    channel[Symbol.dispose]();
    transferredPort1.postMessage("hello");

    await expectArrayAfterWorkerMessage(received, ["hello"]);
  });

  it("disposed wrapper postMessage is ignored", async () => {
    const channel = testCreateMessageChannel<string, number>();
    const transferredPort1 = testCreateMessagePort<string, number>(
      channel.port1.native,
    );
    const transferredPort2 = testCreateMessagePort<number, string>(
      channel.port2.native,
    );

    const received: Array<string> = [];
    transferredPort2.onMessage = (message) => {
      received.push(message);
    };

    channel.port1[Symbol.dispose]();
    channel.port1.postMessage("ignored");
    transferredPort1.postMessage("delivered");

    await expectArrayAfterWorkerMessage(received, ["delivered"]);
  });

  it("throws for disposed native port", () => {
    const channel = testCreateMessageChannel<string>();
    const native = channel.port1.native;

    channel.port1[Symbol.dispose]();

    const error = assertThrowsInstanceOf(
      () => testCreateMessagePort(native),
      Error,
    );
    assertTrue(error.message.includes("Unknown native port"));
  });

  it("throws for unknown native port", () => {
    const unknownNative = {} as NativeMessagePort;
    const error = assertThrowsInstanceOf(
      () => testCreateMessagePort(unknownNative),
      Error,
    );
    assertTrue(error.message.includes("Unknown native port"));
  });
});

describe("createBroadcastChannel", () => {
  it("postMessage delivers to other channels with the same name asynchronously", async () => {
    using channel1 = createBroadcastChannel<string>("test-channel");
    using channel2 = createBroadcastChannel<string>("test-channel");
    const received: Array<string> = [];

    channel2.onMessage = (message) => {
      received.push(message);
    };
    channel1.postMessage("hello");

    assertEqual(received, []);
    await expectArrayAfterWorkerMessage(received, ["hello"]);
  });

  it("postMessage does not deliver to the sending channel", async () => {
    using channel = createBroadcastChannel<string>("test-channel-self");
    const received: Array<string> = [];

    channel.onMessage = (message) => {
      received.push(message);
    };
    channel.postMessage("ignored");

    await testWaitForWorkerMessage();

    assertEqual(received, []);
  });

  it("postMessage fans out to all other channels with the same name", async () => {
    using channel1 = createBroadcastChannel<string>("test-channel-fanout");
    using channel2 = createBroadcastChannel<string>("test-channel-fanout");
    using channel3 = createBroadcastChannel<string>("test-channel-fanout");
    const received2: Array<string> = [];
    const received3: Array<string> = [];

    channel2.onMessage = (message) => {
      received2.push(message);
    };
    channel3.onMessage = (message) => {
      received3.push(message);
    };
    channel1.postMessage("hello");

    await testWaitForWorkerMessage();

    assertEqual(received2, ["hello"]);
    assertEqual(received3, ["hello"]);
  });

  it("channels with different names are isolated", async () => {
    using channel1 = createBroadcastChannel<string>("test-channel-a");
    using channel2 = createBroadcastChannel<string>("test-channel-b");
    const received: Array<string> = [];

    channel2.onMessage = (message) => {
      received.push(message);
    };
    channel1.postMessage("ignored");

    await testWaitForWorkerMessage();

    assertEqual(received, []);
  });

  it("messages posted before onMessage is assigned are delivered if assigned before dispatch", async () => {
    using channel1 = createBroadcastChannel<string>("test-channel-queued");
    using channel2 = createBroadcastChannel<string>("test-channel-queued");
    const received: Array<string> = [];

    channel1.postMessage("queued");
    channel2.onMessage = (message) => {
      received.push(message);
    };

    await expectArrayAfterWorkerMessage(received, ["queued"]);
  });

  it("messages are dropped when no onMessage is assigned at dispatch", async () => {
    using channel1 = createBroadcastChannel<string>("test-channel-drop");
    using channel2 = createBroadcastChannel<string>("test-channel-drop");
    const received: Array<string> = [];

    channel1.postMessage("dropped");
    await testWaitForWorkerMessage();
    channel2.onMessage = (message) => {
      received.push(message);
    };

    await testWaitForWorkerMessage();

    assertEqual(received, []);
  });

  it("setting onMessage to null before dispatch drops the message", async () => {
    using channel1 = createBroadcastChannel<string>("test-channel-null");
    using channel2 = createBroadcastChannel<string>("test-channel-null");
    const received: Array<string> = [];

    channel2.onMessage = (message) => {
      received.push(message);
    };
    channel1.postMessage("dropped");
    channel2.onMessage = null;

    await testWaitForWorkerMessage();

    assertEqual(received, []);
  });

  it("dispose removes channel from future delivery", async () => {
    using channel1 = createBroadcastChannel<string>("test-channel-dispose");
    const channel2 = createBroadcastChannel<string>("test-channel-dispose");
    const received: Array<string> = [];

    channel2.onMessage = (message) => {
      received.push(message);
    };
    channel2[Symbol.dispose]();
    channel1.postMessage("ignored");

    await testWaitForWorkerMessage();

    assertEqual(received, []);
  });

  it("dispose before scheduled dispatch drops the message", async () => {
    using channel1 = createBroadcastChannel<string>(
      "test-channel-dispose-queued",
    );
    const channel2 = createBroadcastChannel<string>(
      "test-channel-dispose-queued",
    );
    const received: Array<string> = [];

    channel2.onMessage = (message) => {
      received.push(message);
    };
    channel1.postMessage("queued");
    channel2[Symbol.dispose]();

    await testWaitForWorkerMessage();

    assertEqual(received, []);
  });

  it("disposed channel postMessage asserts not disposed", () => {
    const channel = createBroadcastChannel<string>(
      "test-channel-disposed-send",
    );

    channel[Symbol.dispose]();

    const error = assertThrowsInstanceOf(
      () => channel.postMessage("ignored"),
      Error,
    );
    assertTrue(error.message.includes("Cannot use a disposed object."));
  });

  it("disposed channel ignores onMessage reassignment", async () => {
    using channel1 = createBroadcastChannel<string>(
      "test-channel-disposed-send",
    );
    using channel2 = createBroadcastChannel<string>(
      "test-channel-disposed-send",
    );
    const received: Array<string> = [];

    channel1.onMessage = (message) => {
      received.push(message);
    };
    channel1[Symbol.dispose]();
    channel1.onMessage = (message) => {
      received.push(message);
    };
    channel2.postMessage("ignored");

    await testWaitForWorkerMessage();

    assertSame(channel1.onMessage, null);
    assertEqual(received, []);
  });
});

describe("testCreateWorker", () => {
  it("worker and self communicate through ports asynchronously", async () => {
    const worker = testCreateWorker<string, number>();
    const workerReceived: Array<number> = [];
    const selfReceived: Array<string> = [];

    worker.onMessage = (msg) => {
      workerReceived.push(msg);
    };
    worker.self.onMessage = (msg) => {
      selfReceived.push(msg);
    };

    worker.postMessage("to-self");
    worker.self.postMessage(123);

    await testWaitForWorkerMessage();

    assertEqual(selfReceived, ["to-self"]);
    assertEqual(workerReceived, [123]);
  });

  it("messages are queued until onMessage is assigned and then flushed asynchronously", async () => {
    const worker = testCreateWorker<string>();
    worker.postMessage("queued");

    const received: Array<string> = [];
    worker.self.onMessage = (msg) => {
      received.push(msg);
    };

    await expectArrayAfterWorkerMessage(received, ["queued"]);
  });

  it("worker dispose clears handlers", () => {
    const worker = testCreateWorker<string>();
    worker.onMessage = constVoid;
    worker.self.onMessage = constVoid;

    worker[Symbol.dispose]();

    assertSame(worker.onMessage, null);
    assertSame(worker.self.onMessage, null);
  });

  it("self dispose clears self handler", () => {
    const worker = testCreateWorker<string>();
    worker.self.onMessage = constVoid;

    worker.self[Symbol.dispose]();

    assertSame(worker.self.onMessage, null);
  });
});

describe("testCreateSharedWorker", () => {
  it("connect triggers onConnect with worker port", () => {
    const worker = testCreateSharedWorker<string>();
    let connected = false;
    worker.self.onConnect = () => {
      connected = true;
    };
    worker.connect();
    assertTrue(connected);
  });

  it("connect throws when onConnect is null", () => {
    const worker = testCreateSharedWorker<string>();
    const error = assertThrowsInstanceOf(() => worker.connect(), Error);
    assertTrue(
      error.message.includes(
        "onConnect must be set before receiving connections",
      ),
    );
  });

  it("worker and self communicate through ports asynchronously", async () => {
    const worker = testCreateSharedWorker<string, number>();
    const workerReceived: Array<string> = [];
    const clientReceived: Array<number> = [];

    worker.self.onConnect = (port) => {
      port.onMessage = (msg) => {
        workerReceived.push(msg);
      };
      port.postMessage(99);
    };

    worker.port.onMessage = (msg) => {
      clientReceived.push(msg);
    };
    worker.connect();

    worker.port.postMessage("hello");

    await testWaitForWorkerMessage();

    assertEqual(workerReceived, ["hello"]);
    assertEqual(clientReceived, [99]);
  });

  it("messages sent before connect are queued and delivered asynchronously", async () => {
    const worker = testCreateSharedWorker<string>();
    worker.port.postMessage("before-connect");

    const received: Array<string> = [];
    worker.self.onConnect = (port) => {
      port.onMessage = (msg) => {
        received.push(msg);
      };
    };
    worker.connect();

    await expectArrayAfterWorkerMessage(received, ["before-connect"]);
  });

  it("worker dispose disposes channel", () => {
    const worker = testCreateSharedWorker<string>();
    worker.port.onMessage = constVoid;
    assertNotNull(worker.port.onMessage);
    worker[Symbol.dispose]();
    assertSame(worker.port.onMessage, null);
  });

  it("self dispose nulls onConnect", () => {
    const worker = testCreateSharedWorker<string>();
    worker.self.onConnect = constVoid;
    assertNotNull(worker.self.onConnect);
    worker.self[Symbol.dispose]();
    assertSame(worker.self.onConnect, null);
  });
});

describe("testCreateBroadcastChannel", () => {
  it("forwards postMessage and onMessage to the underlying channel", async () => {
    using channel1 = testCreateBroadcastChannel<string>("test-channel-helper");
    using channel2 = testCreateBroadcastChannel<string>("test-channel-helper");
    const received: Array<string> = [];

    channel2.onMessage = (message) => {
      received.push(message);
    };
    channel1.postMessage("hello");

    await expectArrayAfterWorkerMessage(received, ["hello"]);

    assertNotNull(channel2.onMessage);
  });

  it("isDisposed reflects disposal state", () => {
    const channel = testCreateBroadcastChannel<string>("test-channel-state");

    assertFalse(channel.isDisposed());
    channel[Symbol.dispose]();
    assertTrue(channel.isDisposed());
  });
});

describe("testWaitForWorkerMessage", () => {
  it("waits for scheduled worker message delivery", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];
    channel.port2.onMessage = (message) => {
      received.push(message);
    };
    channel.port1.postMessage("delivered");

    assertEqual(received, []);
    await testWaitForWorkerMessage();
    assertEqual(received, ["delivered"]);
  });

  it("waits for delivery scheduled during the idle checkpoint", async () => {
    const idle = testWaitForWorkerMessage();
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];
    channel.port2.onMessage = (message) => {
      received.push(message);
    };
    channel.port1.postMessage("delivered");

    await idle;
    assertEqual(received, ["delivered"]);
  });
});
