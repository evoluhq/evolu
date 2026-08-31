import { test } from "node:test";
import {
  assertEqual,
  assertNotNull,
  assertThrowsInstanceOf,
} from "../../../../packages/common/src/Assert.ts";
import { createBroadcastChannel } from "../../../../packages/nodejs/src/Worker.ts";

test("createBroadcastChannel wraps native BroadcastChannel", async () => {
  const channelName = `test-channel-${crypto.randomUUID()}`;
  const channel1 = createBroadcastChannel<string>(channelName);
  const received1: Array<string> = [];
  const received2: Array<string> = [];

  {
    using _channel1 = channel1;
    using channel2 = createBroadcastChannel<string>(channelName);
    const received = Promise.withResolvers<void>();

    channel1.onMessage = (message) => {
      received1.push(message);
    };
    channel2.onMessage = (message) => {
      received2.push(message);
    };
    assertNotNull(channel2.onMessage);
    channel2.onMessage = null;
    assertEqual(channel2.onMessage, null);
    channel2.onMessage = (message) => {
      received2.push(message);
      received.resolve();
    };

    channel1.postMessage("hello");

    await received.promise;

    assertEqual(received2, ["hello"]);
    assertEqual(received1, []);
  }

  channel1.onMessage = (message) => {
    received1.push(message);
  };
  assertEqual(channel1.onMessage, null);
  assertEqual(
    assertThrowsInstanceOf(() => channel1.postMessage("closed"), Error).message,
    "Cannot use a disposed object.",
  );
});
