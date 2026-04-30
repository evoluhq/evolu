import { expect, test, vi } from "vitest";
import { createBroadcastChannel } from "../src/index.js";

test("createBroadcastChannel wraps native BroadcastChannel", async () => {
  const channelName = `test-channel-${crypto.randomUUID()}`;
  const channel1 = createBroadcastChannel<string>(channelName);
  const received1: Array<string> = [];
  const received2: Array<string> = [];

  {
    using _channel1 = channel1;
    using channel2 = createBroadcastChannel<string>(channelName);

    channel1.onMessage = (message) => {
      received1.push(message);
    };
    channel2.onMessage = (message) => {
      received2.push(message);
    };
    expect(channel2.onMessage).not.toBeNull();
    channel2.onMessage = null;
    expect(channel2.onMessage).toBeNull();
    channel2.onMessage = (message) => {
      received2.push(message);
    };

    channel1.postMessage("hello");

    await vi.waitFor(() => {
      expect(received2).toEqual(["hello"]);
    });

    expect(received1).toEqual([]);
  }

  channel1.onMessage = (message) => {
    received1.push(message);
  };
  expect(channel1.onMessage).toBeNull();
  expect(() => channel1.postMessage("closed")).toThrow(
    "Expected value to not be disposed.",
  );
});
