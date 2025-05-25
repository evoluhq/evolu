/**
 * SharedWebWorker (WebWorker + BroadcastChannel + Web Locks)
 *
 * A SharedWebWorker is a Web Worker that is shared across multiple browser
 * tabs. This implementation provides a shared worker-like experience even in
 * browsers that do not support the native SharedWorker API.
 *
 * Unlike a true SharedWorker (which uses MessagePorts for direct, tab-specific
 * communication), this approach uses BroadcastChannel for cross-tab messaging
 * and Web Locks to ensure only one tab owns and runs the actual Worker
 * instance.
 *
 * All tabs communicate via BroadcastChannel, so every message is broadcast to
 * all tabs, and each tab must filter/process only relevant messages. This is
 * less efficient than MessagePorts, but it works everywhere and is "good
 * enough" for most use cases.
 *
 * See the protocol and coordination logic below for details.
 *
 * @module SharedWebWorker
 */

import { constVoid, SimpleName, Worker } from "@evolu/common";

/**
 * Ownership protocol explanation:
 *
 * - When a tab becomes the owner (acquires the lock), it announces ownership by
 *   posting { type: "owner-ready" } to the BroadcastChannel. This notifies all
 *   currently open tabs.
 * - Tabs that open later may miss this announcement, since BroadcastChannel does
 *   not replay messages. Therefore, new tabs request ownership status by
 *   posting { type: "request-owner-ready" }, and the owner responds with {
 *   type: "owner-ready" }.
 * - Once a tab receives "owner-ready", it knows where to send messages and does
 *   not need to ask again.
 * - This ensures all tabs, regardless of when they open, can reliably detect the
 *   current owner.
 *
 * Internal note:
 *
 * - Announcing ownership is for immediate notification of already-open tabs.
 * - Requesting ownership is a fallback for tabs that open later and miss the
 *   announcement.
 * - Both are required for robust cross-tab coordination.
 */
type SharedWebWorkerChannelMessage<Input, Output> =
  | { type: "owner-ready" }
  | { type: "request-owner-ready" }
  | { type: "to-worker"; message: Input }
  | { type: "from-worker"; message: Output };

/**
 * Creates a shared Web Worker using BroadcastChannel and Web Locks. This allows
 * multiple tabs to share a single Web Worker instance. The first tab to acquire
 * the lock becomes the owner and runs the worker. Other tabs act as proxies,
 * forwarding messages to the owner.
 */
export const createSharedWebWorker = <Input, Output>(
  name: SimpleName,
  createWebWorker: () => globalThis.Worker,
): Worker<Input, Output> => {
  // Server.
  if (typeof document === "undefined")
    return {
      postMessage: constVoid,
      onMessage: constVoid,
    };

  const namespacedName = `evolu-sharedwebworker-${name}`;
  const channel = new BroadcastChannel(namespacedName);

  let worker: globalThis.Worker | undefined;
  let onMessageCallback: ((message: Output) => void) | undefined;
  let ownerReady = false;

  const pendingMessages: Array<Input> = [];

  // Listen for owner-ready and worker responses
  channel.onmessage = (
    event: MessageEvent<SharedWebWorkerChannelMessage<Input, Output>>,
  ) => {
    const data = event.data;
    if (data.type === "owner-ready") {
      ownerReady = true;
      // Flush pending messages to the new owner
      for (const message of pendingMessages) {
        channel.postMessage({ type: "to-worker", message });
      }
      pendingMessages.length = 0;
    } else if (!worker && data.type === "from-worker") {
      onMessageCallback?.(data.message);
    }
  };

  // Request owner-ready when not the owner
  channel.postMessage({ type: "request-owner-ready" });

  // Try to acquire the lock and become the owner
  void navigator.locks.request(namespacedName, async () => {
    worker = createWebWorker();

    // Flush pending messages to the worker
    for (const message of pendingMessages) {
      worker.postMessage(message);
    }
    pendingMessages.length = 0;

    // Forward messages from channel to worker
    channel.onmessage = (
      event: MessageEvent<SharedWebWorkerChannelMessage<Input, Output>>,
    ) => {
      const data = event.data;
      if (data.type === "to-worker") {
        worker!.postMessage(data.message);
      } else if (data.type === "request-owner-ready") {
        // Respond to request
        channel.postMessage({ type: "owner-ready" });
      }
    };

    // Forward messages from worker to channel
    worker.onmessage = (event: MessageEvent<Output>) => {
      channel.postMessage({ type: "from-worker", message: event.data });
      onMessageCallback?.(event.data);
    };

    // Announce ownership
    channel.postMessage({ type: "owner-ready" });

    // Hold the lock forever
    await new Promise(constVoid);
  });

  return {
    postMessage: (message: Input) => {
      if (worker) {
        worker.postMessage(message);
      } else if (ownerReady) {
        channel.postMessage({ type: "to-worker", message });
      } else {
        pendingMessages.push(message);
      }
    },
    onMessage: (callback) => {
      onMessageCallback = callback;
    },
  };
};
