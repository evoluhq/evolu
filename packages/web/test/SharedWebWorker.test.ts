/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { createSharedWebWorker } from "../src/SharedWebWorker.js";
import { getOrThrow, SimpleName, wait } from "@evolu/common";

// Mock BroadcastChannel
class MockBroadcastChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public name: string) {}

  postMessage = vi.fn();
  close = vi.fn();
}

// Mock Web Locks API
const mockLocks = {
  request: vi.fn(),
};

// Mock Web Worker
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

beforeEach(() => {
  // Create a spy for BroadcastChannel constructor
  global.BroadcastChannel = vi
    .fn()
    .mockImplementation((name: string) => new MockBroadcastChannel(name));
  global.document = {} as any; // Simulate browser environment

  // Mock navigator.locks properly - remove the global.navigator assignment
  Object.defineProperty(global.navigator, "locks", {
    value: mockLocks,
    writable: true,
    configurable: true,
  });

  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("createSharedWebWorker creates BroadcastChannel and requests lock", () => {
  const mockCreateWorker = vi.fn(() => new MockWorker() as any);

  const sharedWorker = createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  // Should create BroadcastChannel with namespaced name
  expect(global.BroadcastChannel).toHaveBeenCalledWith(
    "evolu-sharedwebworker-test-worker",
  );

  // Should request owner-ready immediately
  const channelInstance = vi.mocked(global.BroadcastChannel).mock.results[0]
    .value;
  expect(channelInstance.postMessage).toHaveBeenCalledWith({
    type: "request-owner-ready",
  });

  // Should attempt to acquire Web Lock
  expect(mockLocks.request).toHaveBeenCalledWith(
    "evolu-sharedwebworker-test-worker",
    expect.any(Function),
  );

  // Should return worker interface
  expect(sharedWorker).toHaveProperty("postMessage");
  expect(sharedWorker).toHaveProperty("onMessage");
  expect(typeof sharedWorker.postMessage).toBe("function");
  expect(typeof sharedWorker.onMessage).toBe("function");
});

test("createSharedWebWorker returns no-op on server", () => {
  // Simulate server environment
  delete (global as any).document;

  const mockCreateWorker = vi.fn();
  const sharedWorker = createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  // Should not create BroadcastChannel or request locks
  expect(global.BroadcastChannel).not.toHaveBeenCalled();
  expect(mockLocks.request).not.toHaveBeenCalled();

  // Should return no-op worker
  expect(sharedWorker.postMessage).toBeDefined();
  expect(sharedWorker.onMessage).toBeDefined();

  // Restore document for other tests
  global.document = {} as any;
});

test("createSharedWebWorker queues messages when owner not ready", () => {
  const mockCreateWorker = vi.fn(() => new MockWorker() as any);

  const sharedWorker = createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  const channelInstance = vi.mocked(global.BroadcastChannel).mock.results[0]
    .value;

  // Send message before owner is ready
  sharedWorker.postMessage({ type: "test-message" });

  // Should not send to channel yet (owner not ready)
  expect(channelInstance.postMessage).toHaveBeenCalledTimes(1); // Only request-owner-ready

  // Simulate owner-ready message
  const ownerReadyEvent = new MessageEvent("message", {
    data: { type: "owner-ready" },
  });
  channelInstance.onmessage?.(ownerReadyEvent);

  // Should now send the queued message
  expect(channelInstance.postMessage).toHaveBeenCalledWith({
    type: "to-worker",
    message: { type: "test-message" },
  });
});

test("createSharedWebWorker forwards messages when owner ready", () => {
  const mockCreateWorker = vi.fn(() => new MockWorker() as any);

  const sharedWorker = createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  const channelInstance = vi.mocked(global.BroadcastChannel).mock.results[0]
    .value;

  // Simulate owner-ready message
  const ownerReadyEvent = new MessageEvent("message", {
    data: { type: "owner-ready" },
  });
  channelInstance.onmessage?.(ownerReadyEvent);

  // Send message after owner is ready
  sharedWorker.postMessage({ type: "test-message" });

  // Should send directly to channel
  expect(channelInstance.postMessage).toHaveBeenCalledWith({
    type: "to-worker",
    message: { type: "test-message" },
  });
});

test("createSharedWebWorker handles onMessage callback", () => {
  const mockCreateWorker = vi.fn(() => new MockWorker() as any);
  const onMessageCallback = vi.fn();

  const sharedWorker = createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  sharedWorker.onMessage(onMessageCallback);

  const channelInstance = vi.mocked(global.BroadcastChannel).mock.results[0]
    .value;

  // Simulate message from worker
  const workerMessage = new MessageEvent("message", {
    data: { type: "from-worker", message: { result: "test" } },
  });
  channelInstance.onmessage?.(workerMessage);

  // Should call the callback
  expect(onMessageCallback).toHaveBeenCalledWith({ result: "test" });
});

test("createSharedWebWorker handles multiple tabs - first tab becomes owner", async () => {
  let lockCallback: (() => Promise<void>) | undefined;

  // Mock locks.request to capture the callback but not execute it immediately
  mockLocks.request.mockImplementation(
    (_name: string, callback: () => Promise<void>) => {
      if (!lockCallback) {
        lockCallback = callback;
        // Simulate first tab acquiring the lock
        setTimeout(() => {
          void lockCallback?.();
        }, 0);
      }
      return Promise.resolve();
    },
  );

  const mockCreateWorker = vi.fn(() => new MockWorker() as any);

  // Create first tab (will become owner)
  createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  // Create second tab
  createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  // Both tabs should create BroadcastChannels
  expect(global.BroadcastChannel).toHaveBeenCalledTimes(2);

  const tab1Channel = vi.mocked(global.BroadcastChannel).mock.results[0].value;
  const tab2Channel = vi.mocked(global.BroadcastChannel).mock.results[1].value;

  // Both tabs should request owner-ready
  expect(tab1Channel.postMessage).toHaveBeenCalledWith({
    type: "request-owner-ready",
  });
  expect(tab2Channel.postMessage).toHaveBeenCalledWith({
    type: "request-owner-ready",
  });

  // Wait for lock acquisition
  await wait(10);

  // Only first tab should create worker (it became owner)
  expect(mockCreateWorker).toHaveBeenCalledTimes(1);

  // First tab should announce ownership
  expect(tab1Channel.postMessage).toHaveBeenCalledWith({ type: "owner-ready" });
});

test("createSharedWebWorker handles cross-tab message forwarding", () => {
  const mockCreateWorker = vi.fn(() => new MockWorker() as any);

  // Create two tabs
  const tab1 = createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  const tab2 = createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  const tab1Channel = vi.mocked(global.BroadcastChannel).mock.results[0].value;
  const tab2Channel = vi.mocked(global.BroadcastChannel).mock.results[1].value;

  // Simulate tab1 receiving owner-ready (tab1 becomes aware of owner)
  const ownerReadyEvent = new MessageEvent("message", {
    data: { type: "owner-ready" },
  });
  tab1Channel.onmessage?.(ownerReadyEvent);

  // Simulate tab2 receiving owner-ready
  tab2Channel.onmessage?.(ownerReadyEvent);

  // Both tabs send messages
  tab1.postMessage({ from: "tab1" });
  tab2.postMessage({ from: "tab2" });

  // Both should forward to channel
  expect(tab1Channel.postMessage).toHaveBeenCalledWith({
    type: "to-worker",
    message: { from: "tab1" },
  });
  expect(tab2Channel.postMessage).toHaveBeenCalledWith({
    type: "to-worker",
    message: { from: "tab2" },
  });
});

test("createSharedWebWorker handles worker responses across tabs", () => {
  const mockCreateWorker = vi.fn(() => new MockWorker() as any);
  const tab1Callback = vi.fn();
  const tab2Callback = vi.fn();

  // Create two tabs
  const tab1 = createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  const tab2 = createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  // Set up message callbacks
  tab1.onMessage(tab1Callback);
  tab2.onMessage(tab2Callback);

  const tab1Channel = vi.mocked(global.BroadcastChannel).mock.results[0].value;
  const tab2Channel = vi.mocked(global.BroadcastChannel).mock.results[1].value;

  // Simulate worker response broadcast
  const workerResponse = new MessageEvent("message", {
    data: { type: "from-worker", message: { result: "shared-result" } },
  });

  // Both tabs receive the same worker response
  tab1Channel.onmessage?.(workerResponse);
  tab2Channel.onmessage?.(workerResponse);

  // Both callbacks should be called with the same data
  expect(tab1Callback).toHaveBeenCalledWith({ result: "shared-result" });
  expect(tab2Callback).toHaveBeenCalledWith({ result: "shared-result" });
});

test("createSharedWebWorker multi-tab scenario", () => {
  const mockCreateWorker = vi.fn(() => new MockWorker() as any);
  const channelInstances: Array<MockBroadcastChannel> = [];

  // Track all BroadcastChannel instances
  global.BroadcastChannel = vi.fn().mockImplementation((name: string) => {
    const instance = new MockBroadcastChannel(name);
    channelInstances.push(instance);

    // Override postMessage to broadcast to all instances with same name
    instance.postMessage = vi.fn().mockImplementation((data) => {
      channelInstances
        .filter((ch) => ch.name === name)
        .forEach((ch) => ch.onmessage?.(new MessageEvent("message", { data })));
    });

    return instance;
  });

  // Mock lock - only first caller gets the lock
  let lockAcquired = false;
  mockLocks.request.mockImplementation(
    (_name: string, callback: () => Promise<void>) => {
      if (!lockAcquired) {
        lockAcquired = true;
        void callback(); // First tab becomes owner
      }
      return Promise.resolve();
    },
  );

  // Create two tabs
  createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );
  createSharedWebWorker(
    getOrThrow(SimpleName.from("test-worker")),
    mockCreateWorker,
  );

  // Only first tab should create worker (owner)
  expect(mockCreateWorker).toHaveBeenCalledTimes(1);
});
