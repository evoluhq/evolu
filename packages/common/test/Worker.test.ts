import { describe, expect, test } from "vitest";
import { lazyVoid } from "../src/Function.js";
import { testWaitForMacrotask } from "../src/Test.js";
import type { NativeMessagePort } from "../src/Worker.js";
import {
  createSharedWorker,
  createWorker,
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
  testCreateWorker,
} from "../src/Worker.js";

describe("createWorker", () => {
  test("messages are queued and delivered asynchronously after worker self onMessage is assigned", async () => {
    let self!: { onMessage: ((message: string) => void) | null };

    const worker = createWorker<string>((nextSelf) => {
      self = nextSelf;
    });

    worker.postMessage("queued");

    const received: Array<string> = [];
    self.onMessage = (message) => received.push(message);

    await testWaitForMacrotask();

    expect(received).toEqual(["queued"]);
  });
});

describe("createSharedWorker", () => {
  test("messages are queued and delivered asynchronously after worker-side port onMessage is assigned", async () => {
    let workerPort!: { onMessage: ((message: string) => void) | null };

    const worker = createSharedWorker<string>((self) => {
      self.onConnect = (port) => {
        workerPort = port;
      };
    });

    worker.port.postMessage("queued");

    const received: Array<string> = [];
    workerPort.onMessage = (message) => received.push(message);

    await testWaitForMacrotask();

    expect(received).toEqual(["queued"]);
  });
});

describe("testCreateMessageChannel", () => {
  test("native ports are object tokens for WeakMap compatibility", () => {
    const channel = testCreateMessageChannel<string, number>();
    expect(typeof channel.port1.native).toBe("object");
    expect(channel.port1.native).not.toBeNull();
    expect(typeof channel.port2.native).toBe("object");
    expect(channel.port2.native).not.toBeNull();
  });

  test("port1 postMessage delivers to port2 onMessage asynchronously", async () => {
    const channel = testCreateMessageChannel<string, number>();
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => received.push(msg);
    channel.port1.postMessage("hello");

    await testWaitForMacrotask();

    expect(received).toEqual(["hello"]);
  });

  test("port2 postMessage delivers to port1 onMessage asynchronously", async () => {
    const channel = testCreateMessageChannel<string, number>();
    const received: Array<number> = [];
    channel.port1.onMessage = (msg) => received.push(msg);
    channel.port2.postMessage(42);

    await testWaitForMacrotask();

    expect(received).toEqual([42]);
  });

  test("messages are queued until onMessage is assigned and then flushed asynchronously", async () => {
    const channel = testCreateMessageChannel<string, number>();
    channel.port1.postMessage("a");
    channel.port1.postMessage("b");
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => received.push(msg);

    await testWaitForMacrotask();

    expect(received).toEqual(["a", "b"]);
  });

  test("messages sent after onMessage is assigned are delivered asynchronously", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => received.push(msg);
    channel.port1.postMessage("first");
    channel.port1.postMessage("second");

    await testWaitForMacrotask();

    expect(received).toEqual(["first", "second"]);
  });

  test("setting onMessage to null stops future asynchronous delivery", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => received.push(msg);
    channel.port1.postMessage("delivered");
    await testWaitForMacrotask();

    channel.port2.onMessage = null;
    channel.port1.postMessage("queued");
    await testWaitForMacrotask();

    expect(received).toEqual(["delivered"]);
  });

  test("dispose nulls out handlers", () => {
    const channel = testCreateMessageChannel<string>();
    channel.port1.onMessage = lazyVoid;
    channel.port2.onMessage = lazyVoid;
    expect(channel.port1.onMessage).not.toBeNull();
    expect(channel.port2.onMessage).not.toBeNull();
    channel[Symbol.dispose]();
    expect(channel.port1.onMessage).toBeNull();
    expect(channel.port2.onMessage).toBeNull();
  });

  test("dispose before scheduled flush drops queued messages", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];
    const clearTimeout = globalThis.clearTimeout;
    const ignoreClearTimeout: typeof globalThis.clearTimeout = (
      _timeout,
    ) => undefined;

    try {
      globalThis.clearTimeout = ignoreClearTimeout;

      channel.port2.onMessage = (message) => received.push(message);
      channel.port1.postMessage("queued");
      channel.port2[Symbol.dispose]();

      await testWaitForMacrotask();

      expect(received).toEqual([]);
    } finally {
      globalThis.clearTimeout = clearTimeout;
    }
  });

  test("dispose during flush stops remaining queued messages", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];

    channel.port2.onMessage = (message) => {
      received.push(message);
      channel.port2[Symbol.dispose]();
    };

    channel.port1.postMessage("first");
    channel.port1.postMessage("second");

    await testWaitForMacrotask();

    expect(received).toEqual(["first"]);
  });

  test("isDisposed reflects disposal state", () => {
    const channel = testCreateMessageChannel<string>();

    expect(channel.isDisposed()).toBe(false);
    channel[Symbol.dispose]();
    expect(channel.isDisposed()).toBe(true);
  });

  test("each channel creates independent ports", () => {
    const channel1 = testCreateMessageChannel<string>();
    const channel2 = testCreateMessageChannel<string>();
    expect(channel1.port1.native).not.toBe(channel2.port1.native);
    expect(channel1.port2.native).not.toBe(channel2.port2.native);
  });

  test("bidirectional communication works asynchronously", async () => {
    const channel = testCreateMessageChannel<string, number>();
    const strings: Array<string> = [];
    const numbers: Array<number> = [];

    channel.port2.onMessage = (msg) => strings.push(msg);
    channel.port1.onMessage = (msg) => numbers.push(msg);

    channel.port1.postMessage("hello");
    channel.port2.postMessage(42);

    await testWaitForMacrotask();

    expect(strings).toEqual(["hello"]);
    expect(numbers).toEqual([42]);
  });

  test("disposed port ignores onMessage reassignment and repeated dispose", () => {
    const channel = testCreateMessageChannel<string>();

    channel.port2[Symbol.dispose]();
    channel.port2.onMessage = lazyVoid;
    channel.port2[Symbol.dispose]();

    expect(channel.port2.onMessage).toBeNull();
  });

  test("sending to a disposed peer is ignored", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];

    channel.port2.onMessage = (message) => received.push(message);
    channel.port2[Symbol.dispose]();
    channel.port1.postMessage("ignored");

    await testWaitForMacrotask();

    expect(received).toEqual([]);
  });

  test("unknown transferables are ignored", async () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];

    channel.port2.onMessage = (message) => received.push(message);
    channel.port1.postMessage("hello", [{} as NativeMessagePort]);

    await testWaitForMacrotask();

    expect(received).toEqual(["hello"]);
  });

  test("transferred native ports can be wrapped after transfer", async () => {
    const channel = testCreateMessageChannel<
      NativeMessagePort<never, string>,
      never
    >();
    const transferredChannel = testCreateMessageChannel<never, string>();
    let transferredNative!: NativeMessagePort<never, string>;

    channel.port2.onMessage = (nativePort) => {
      transferredNative = nativePort;
    };

    channel.port1.postMessage(transferredChannel.port1.native, [
      transferredChannel.port1.native,
    ]);

    await testWaitForMacrotask();

    transferredChannel.port1[Symbol.dispose]();

    const wrappedPort = testCreateMessagePort<never, string>(
      transferredNative,
    );
    const received: Array<string> = [];
    wrappedPort.onMessage = (message) => received.push(message);

    transferredChannel.port2.postMessage("hello");

    await testWaitForMacrotask();

    expect(received).toEqual(["hello"]);
  });
});

describe("testCreateMessagePort", () => {
  test("looks up port by native token from channel", () => {
    const channel = testCreateMessageChannel<string, number>();
    const port = testCreateMessagePort<string, number>(channel.port1.native);
    expect(port.native).toBe(channel.port1.native);
  });

  test("looks up port2 by native token", () => {
    const channel = testCreateMessageChannel<string, number>();
    const port = testCreateMessagePort<number, string>(channel.port2.native);
    expect(port.native).toBe(channel.port2.native);
  });

  test("transferred ports remain usable after original channel dispose", async () => {
    const channel = testCreateMessageChannel<string, number>();
    const transferredPort1 = testCreateMessagePort<string, number>(
      channel.port1.native,
    );
    const transferredPort2 = testCreateMessagePort<number, string>(
      channel.port2.native,
    );

    const received: Array<string> = [];
    transferredPort2.onMessage = (message) => received.push(message);

    channel[Symbol.dispose]();
    transferredPort1.postMessage("hello");

    await testWaitForMacrotask();

    expect(received).toEqual(["hello"]);
  });

  test("disposed wrapper postMessage is ignored", async () => {
    const channel = testCreateMessageChannel<string, number>();
    const transferredPort1 = testCreateMessagePort<string, number>(
      channel.port1.native,
    );
    const transferredPort2 = testCreateMessagePort<number, string>(
      channel.port2.native,
    );

    const received: Array<string> = [];
    transferredPort2.onMessage = (message) => received.push(message);

    channel.port1[Symbol.dispose]();
    channel.port1.postMessage("ignored");
    transferredPort1.postMessage("delivered");

    await testWaitForMacrotask();

    expect(received).toEqual(["delivered"]);
  });

  test("throws for unknown native port", () => {
    const unknownNative = {} as NativeMessagePort;
    expect(() => testCreateMessagePort(unknownNative)).toThrow(
      "Unknown native port",
    );
  });
});

describe("testCreateWorker", () => {
  test("worker and self communicate through ports asynchronously", async () => {
    const worker = testCreateWorker<string, number>();
    const workerReceived: Array<number> = [];
    const selfReceived: Array<string> = [];

    worker.onMessage = (msg) => workerReceived.push(msg);
    worker.self.onMessage = (msg) => selfReceived.push(msg);

    worker.postMessage("to-self");
    worker.self.postMessage(123);

    await testWaitForMacrotask();

    expect(selfReceived).toEqual(["to-self"]);
    expect(workerReceived).toEqual([123]);
  });

  test("messages are queued until onMessage is assigned and then flushed asynchronously", async () => {
    const worker = testCreateWorker<string>();
    worker.postMessage("queued");

    const received: Array<string> = [];
    worker.self.onMessage = (msg) => received.push(msg);

    await testWaitForMacrotask();

    expect(received).toEqual(["queued"]);
  });

  test("worker dispose clears handlers", () => {
    const worker = testCreateWorker<string>();
    worker.onMessage = lazyVoid;
    worker.self.onMessage = lazyVoid;

    worker[Symbol.dispose]();

    expect(worker.onMessage).toBeNull();
    expect(worker.self.onMessage).toBeNull();
  });

  test("self dispose clears self handler", () => {
    const worker = testCreateWorker<string>();
    worker.self.onMessage = lazyVoid;

    worker.self[Symbol.dispose]();

    expect(worker.self.onMessage).toBeNull();
  });
});

describe("testCreateSharedWorker", () => {
  test("connect triggers onConnect with worker port", () => {
    const worker = testCreateSharedWorker<string>();
    let connected = false;
    worker.self.onConnect = () => {
      connected = true;
    };
    worker.connect();
    expect(connected).toBe(true);
  });

  test("connect throws when onConnect is null", () => {
    const worker = testCreateSharedWorker<string>();
    expect(() => worker.connect()).toThrow(
      "onConnect must be set before receiving connections",
    );
  });

  test("worker and self communicate through ports asynchronously", async () => {
    const worker = testCreateSharedWorker<string, number>();
    const workerReceived: Array<string> = [];
    const clientReceived: Array<number> = [];

    worker.self.onConnect = (port) => {
      port.onMessage = (msg) => workerReceived.push(msg);
      port.postMessage(99);
    };

    worker.port.onMessage = (msg) => clientReceived.push(msg);
    worker.connect();

    worker.port.postMessage("hello");

    await testWaitForMacrotask();

    expect(workerReceived).toEqual(["hello"]);
    expect(clientReceived).toEqual([99]);
  });

  test("messages sent before connect are queued and delivered asynchronously", async () => {
    const worker = testCreateSharedWorker<string>();
    worker.port.postMessage("before-connect");

    const received: Array<string> = [];
    worker.self.onConnect = (port) => {
      port.onMessage = (msg) => received.push(msg);
    };
    worker.connect();

    await testWaitForMacrotask();

    expect(received).toEqual(["before-connect"]);
  });

  test("worker dispose disposes channel", () => {
    const worker = testCreateSharedWorker<string>();
    worker.port.onMessage = lazyVoid;
    expect(worker.port.onMessage).not.toBeNull();
    worker[Symbol.dispose]();
    expect(worker.port.onMessage).toBeNull();
  });

  test("self dispose nulls onConnect", () => {
    const worker = testCreateSharedWorker<string>();
    worker.self.onConnect = lazyVoid;
    expect(worker.self.onConnect).not.toBeNull();
    worker.self[Symbol.dispose]();
    expect(worker.self.onConnect).toBeNull();
  });
});
