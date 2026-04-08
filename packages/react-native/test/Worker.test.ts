import type { NativeMessagePort } from "@evolu/common";
import { lazyVoid } from "@evolu/common";
import { testWaitForMacrotask } from "@evolu/common";
import { describe, expect, test } from "vitest";
import {
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
  createWorker,
} from "../src/Worker.js";

describe("createWorker", () => {
  test("worker and self communicate asynchronously", async () => {
    const receivedByWorker: Array<number> = [];
    const receivedBySelf: Array<string> = [];

    const worker = createWorker<string, number>((self) => {
      self.onMessage = (message) => receivedBySelf.push(message);
      self.postMessage(123);
    });

    worker.onMessage = (message) => receivedByWorker.push(message);
    worker.postMessage("hello");

    await testWaitForMacrotask();

    expect(receivedBySelf).toEqual(["hello"]);
    expect(receivedByWorker).toEqual([123]);
  });
});

describe("createSharedWorker", () => {
  test("connects and allows client communication asynchronously", async () => {
    const receivedByWorker: Array<string> = [];
    const receivedByClient: Array<number> = [];

    const worker = createSharedWorker<string, number>((self) => {
      self.onConnect = (port) => {
        port.onMessage = (message) => receivedByWorker.push(message);
        port.postMessage(42);
      };
    });

    worker.port.onMessage = (message) => receivedByClient.push(message);
    worker.port.postMessage("ping");

    await testWaitForMacrotask();

    expect(receivedByWorker).toEqual(["ping"]);
    expect(receivedByClient).toEqual([42]);
  });

  test("throws when onConnect is missing", () => {
    expect(() => createSharedWorker(lazyVoid)).toThrow(
      "onConnect must be set before receiving connections",
    );
  });
});

describe("createMessageChannel", () => {
  test("creates connected ports with asynchronous delivery", async () => {
    const channel = createMessageChannel<string, number>();
    const strings: Array<string> = [];
    const numbers: Array<number> = [];

    channel.port2.onMessage = (message) => strings.push(message);
    channel.port1.onMessage = (message) => numbers.push(message);

    channel.port1.postMessage("hello");
    channel.port2.postMessage(7);

    await testWaitForMacrotask();

    expect(strings).toEqual(["hello"]);
    expect(numbers).toEqual([7]);
  });
});

describe("createMessagePort", () => {
  test("resolves transferred native ports", () => {
    const channel = createMessageChannel<string, number>();
    const port = createMessagePort<string, number>(channel.port1.native);

    expect(port.native).toBe(channel.port1.native);
  });

  test("throws for unknown native ports", () => {
    const unknownNative = Symbol("unknown") as unknown as NativeMessagePort;

    expect(() => createMessagePort(unknownNative)).toThrow(
      "Unknown native port",
    );
  });
});
