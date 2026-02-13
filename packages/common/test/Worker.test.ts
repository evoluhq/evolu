import { describe, expect, test } from "vitest";
import { lazyVoid } from "../src/Function.js";
import type { NativeMessagePort } from "../src/Worker.js";
import {
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
} from "../src/Worker.js";

describe("testCreateMessageChannel", () => {
  test("port1 postMessage delivers to port2 onMessage", () => {
    const channel = testCreateMessageChannel<string, number>();
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => received.push(msg);
    channel.port1.postMessage("hello");
    expect(received).toEqual(["hello"]);
  });

  test("port2 postMessage delivers to port1 onMessage", () => {
    const channel = testCreateMessageChannel<string, number>();
    const received: Array<number> = [];
    channel.port1.onMessage = (msg) => received.push(msg);
    channel.port2.postMessage(42);
    expect(received).toEqual([42]);
  });

  test("messages are queued until onMessage is assigned", () => {
    const channel = testCreateMessageChannel<string, number>();
    channel.port1.postMessage("a");
    channel.port1.postMessage("b");
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => received.push(msg);
    expect(received).toEqual(["a", "b"]);
  });

  test("messages sent after onMessage is assigned are delivered immediately", () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => received.push(msg);
    channel.port1.postMessage("first");
    channel.port1.postMessage("second");
    expect(received).toEqual(["first", "second"]);
  });

  test("setting onMessage to null stops delivery", () => {
    const channel = testCreateMessageChannel<string>();
    const received: Array<string> = [];
    channel.port2.onMessage = (msg) => received.push(msg);
    channel.port1.postMessage("delivered");
    channel.port2.onMessage = null;
    channel.port1.postMessage("queued");
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

  test("each channel creates independent ports", () => {
    const channel1 = testCreateMessageChannel<string>();
    const channel2 = testCreateMessageChannel<string>();
    expect(channel1.port1.native).not.toBe(channel2.port1.native);
    expect(channel1.port2.native).not.toBe(channel2.port2.native);
  });

  test("bidirectional communication works", () => {
    const channel = testCreateMessageChannel<string, number>();
    const strings: Array<string> = [];
    const numbers: Array<number> = [];

    channel.port2.onMessage = (msg) => strings.push(msg);
    channel.port1.onMessage = (msg) => numbers.push(msg);

    channel.port1.postMessage("hello");
    channel.port2.postMessage(42);

    expect(strings).toEqual(["hello"]);
    expect(numbers).toEqual([42]);
  });
});

describe("testCreateMessagePort", () => {
  test("looks up port by native token from channel", () => {
    const channel = testCreateMessageChannel<string, number>();
    const port = testCreateMessagePort<string, number>(channel.port1.native);
    expect(port).toBe(channel.port1);
  });

  test("looks up port2 by native token", () => {
    const channel = testCreateMessageChannel<string, number>();
    const port = testCreateMessagePort<number, string>(channel.port2.native);
    expect(port).toBe(channel.port2);
  });

  test("throws for unknown native port", () => {
    const unknownNative = Symbol("unknown") as unknown as NativeMessagePort;
    expect(() => testCreateMessagePort(unknownNative)).toThrow(
      "Unknown native port",
    );
  });
});

describe("testCreateSharedWorker", () => {
  test("connect triggers onConnect with worker port", () => {
    const { self, connect } = testCreateSharedWorker<string>();
    let connected = false;
    self.onConnect = () => {
      connected = true;
    };
    connect();
    expect(connected).toBe(true);
  });

  test("connect does nothing when onConnect is null", () => {
    const { connect } = testCreateSharedWorker<string>();
    expect(() => connect()).not.toThrow();
  });

  test("worker and self communicate through ports", () => {
    const { worker, self, connect } = testCreateSharedWorker<string, number>();
    const workerReceived: Array<string> = [];
    const clientReceived: Array<number> = [];

    self.onConnect = (port) => {
      port.onMessage = (msg) => workerReceived.push(msg);
      port.postMessage(99);
    };

    worker.port.onMessage = (msg) => clientReceived.push(msg);
    connect();

    worker.port.postMessage("hello");

    expect(workerReceived).toEqual(["hello"]);
    expect(clientReceived).toEqual([99]);
  });

  test("messages sent before connect are queued", () => {
    const { worker, self, connect } = testCreateSharedWorker<string>();
    worker.port.postMessage("before-connect");

    const received: Array<string> = [];
    self.onConnect = (port) => {
      port.onMessage = (msg) => received.push(msg);
    };
    connect();

    expect(received).toEqual(["before-connect"]);
  });

  test("worker dispose disposes channel", () => {
    const { worker } = testCreateSharedWorker<string>();
    worker.port.onMessage = lazyVoid;
    expect(worker.port.onMessage).not.toBeNull();
    worker[Symbol.dispose]();
    expect(worker.port.onMessage).toBeNull();
  });

  test("self dispose nulls onConnect", () => {
    const { self } = testCreateSharedWorker<string>();
    self.onConnect = lazyVoid;
    expect(self.onConnect).not.toBeNull();
    self[Symbol.dispose]();
    expect(self.onConnect).toBeNull();
  });
});
