import { expect, test } from "vitest";
import { createConsole } from "../../src/Console.js";
import { OwnerId } from "../../src/Evolu/Owner.js";
import { ProtocolMessage } from "../../src/Evolu/Protocol.js";
import { createSync } from "../../src/Evolu/Sync.js";
import { constFalse, constVoid } from "../../src/Function.js";
import { wait } from "../../src/Promise.js";
import { ok } from "../../src/Result.js";
import { WebSocket } from "../../src/WebSocket.js";
import { testCreateDummyWebSocket, testOwner, testOwner2 } from "../_deps.js";

interface MockWebSocket extends WebSocket {
  readonly onOpen?: (() => void) | undefined;
  readonly onMessage?:
    | ((data: string | ArrayBuffer | Blob) => void)
    | undefined;
  readonly sentMessages: Array<ProtocolMessage>;
}

const createMockWebSocketTracker = () => {
  const createdWebSockets = new Map<string, MockWebSocket>();
  const disposedWebSockets = new Set<string>();

  const mockCreateWebSocket = (
    url: string,
    options?: {
      onOpen?: () => void;
      onMessage?: (data: string | ArrayBuffer | Blob) => void;
    },
  ) => {
    const sentMessages: Array<ProtocolMessage> = [];
    const webSocket: MockWebSocket = {
      send: (data) => {
        // Cast to ProtocolMessage for tracking - in real usage this would be a ProtocolMessage
        sentMessages.push(data as ProtocolMessage);
        return ok();
      },
      getReadyState: () => "connecting" as const,
      isOpen: constFalse,
      onOpen: options?.onOpen ?? undefined,
      onMessage: options?.onMessage ?? undefined,
      sentMessages,
      [Symbol.dispose]: () => {
        disposedWebSockets.add(url);
      },
    };
    createdWebSockets.set(url, webSocket);
    return webSocket;
  };

  return {
    mockCreateWebSocket,
    createdWebSockets,
    disposedWebSockets,
    expectCreated: (count: number) => {
      expect(createdWebSockets.size).toBe(count);
    },
    expectDisposed: (count: number) => {
      expect(disposedWebSockets.size).toBe(count);
    },
    expectWebSocketExists: (url: string) => {
      expect(createdWebSockets.has(url)).toBe(true);
    },
    expectWebSocketDisposed: (url: string) => {
      expect(disposedWebSockets.has(url)).toBe(true);
    },
    getSentMessages: (url: string) => {
      const webSocket = createdWebSockets.get(url);
      return webSocket?.sentMessages ?? [];
    },
    expectMessagesSent: (url: string, count: number) => {
      const messages = createdWebSockets.get(url)?.sentMessages ?? [];
      expect(messages.length).toBe(count);
    },
  };
};

const createTestConfig = (overrides = {}) =>
  ({
    transports: [{ type: "WebSocket", url: "ws://localhost:3000" }],
    onOpen: constVoid,
    onMessage: constVoid,
    ...overrides,
  }) as const;

const createTestDeps = (createWebSocket = testCreateDummyWebSocket) => ({
  console: createConsole(),
  createWebSocket,
});

// Test owners
const testOwnerWithoutTransports = {
  id: testOwner.id,
  encryptionKey: testOwner.encryptionKey,
  writeKey: testOwner.writeKey,
  // No transports property - should use config transports
};

test("useOwner stores and removes owners correctly", () => {
  const sync = createSync(createTestDeps())(createTestConfig());

  // Initially owner doesn't exist
  expect(sync.getOwner(testOwner.id)).toBe(null);

  // Use the owner
  sync.useOwner(true, testOwner);

  // Now owner should be retrievable
  expect(sync.getOwner(testOwner.id)).toBe(testOwner);

  // Stop using the owner
  sync.useOwner(false, testOwner);
  expect(sync.getOwner(testOwner.id)).toBe(null);
});

test("useOwner with owner without transports uses config transports", () => {
  const sync = createSync(createTestDeps())(createTestConfig());

  // Initially owner doesn't exist
  expect(sync.getOwner(testOwnerWithoutTransports.id)).toBe(null);

  // Use owner without transports - should use config transports
  sync.useOwner(true, testOwnerWithoutTransports);

  // Owner should be retrievable because it uses config transports
  expect(sync.getOwner(testOwnerWithoutTransports.id)).toBe(
    testOwnerWithoutTransports,
  );

  // Stop using the owner
  sync.useOwner(false, testOwnerWithoutTransports);
  expect(sync.getOwner(testOwnerWithoutTransports.id)).toBe(null);
});

test("useOwner with owner without transports and empty config transports returns null", () => {
  const sync = createSync(createTestDeps())(
    createTestConfig({ transports: [] }),
  );

  // Initially owner doesn't exist
  expect(sync.getOwner(testOwnerWithoutTransports.id)).toBe(null);

  // Use owner without transports and config has no transports
  sync.useOwner(true, testOwnerWithoutTransports);

  // Owner should NOT be retrievable because no transports are available
  expect(sync.getOwner(testOwnerWithoutTransports.id)).toBe(null);

  // Stop using should also work (no-op)
  sync.useOwner(false, testOwnerWithoutTransports);
  expect(sync.getOwner(testOwnerWithoutTransports.id)).toBe(null);
});

test("useOwner with reference counting - owner persists with multiple uses", () => {
  const sync = createSync(createTestDeps())(createTestConfig());

  // Use the owner twice
  sync.useOwner(true, testOwner);
  sync.useOwner(true, testOwner);
  expect(sync.getOwner(testOwner.id)).toBe(testOwner);

  // Stop using once - owner should still be available
  sync.useOwner(false, testOwner);
  expect(sync.getOwner(testOwner.id)).toBe(testOwner);

  // Stop using second time - now owner should be removed
  sync.useOwner(false, testOwner);
  expect(sync.getOwner(testOwner.id)).toBe(null);
});

test("WebSocket lifecycle - creates connection when first owner is added", async () => {
  const tracker = createMockWebSocketTracker();
  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig(),
  );

  // Initially no WebSockets created
  tracker.expectCreated(0);

  // Add first owner - should create WebSocket
  sync.useOwner(true, testOwner);
  tracker.expectCreated(1);
  tracker.expectWebSocketExists("ws://localhost:3000");
  tracker.expectDisposed(0);

  // Remove owner - should dispose WebSocket (after delay)
  sync.useOwner(false, testOwner);

  // Wait for delayed disposal to complete
  await wait(150);
  tracker.expectDisposed(1);
  tracker.expectWebSocketDisposed("ws://localhost:3000");
});

test("WebSocket lifecycle - reuses connection for multiple owners", async () => {
  const tracker = createMockWebSocketTracker();
  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig(),
  );

  // Add first owner - creates WebSocket
  sync.useOwner(true, testOwner);
  tracker.expectCreated(1);

  // Add second owner - reuses WebSocket
  sync.useOwner(true, testOwner2);
  tracker.expectCreated(1); // Still only one WebSocket
  tracker.expectDisposed(0);

  // Remove first owner - WebSocket should remain
  sync.useOwner(false, testOwner);
  tracker.expectDisposed(0);

  // Remove second owner - now WebSocket should be disposed (after delay)
  sync.useOwner(false, testOwner2);

  // Wait for delayed disposal to complete
  await wait(150);
  tracker.expectDisposed(1);
  tracker.expectWebSocketDisposed("ws://localhost:3000");
});

test("WebSocket lifecycle - handles multiple transports", async () => {
  const tracker = createMockWebSocketTracker();
  const multiTransportConfig = createTestConfig({
    transports: [
      { type: "WebSocket", url: "ws://server1.com" },
      { type: "WebSocket", url: "ws://server2.com" },
    ],
  });

  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    multiTransportConfig,
  );

  sync.useOwner(true, testOwner);
  tracker.expectCreated(2);
  tracker.expectWebSocketExists("ws://server1.com");
  tracker.expectWebSocketExists("ws://server2.com");

  // Remove owner - should dispose both WebSockets (after delay)
  sync.useOwner(false, testOwner);

  // Wait for delayed disposal to complete
  await wait(150);
  tracker.expectDisposed(2);
  tracker.expectWebSocketDisposed("ws://server1.com");
  tracker.expectWebSocketDisposed("ws://server2.com");
});

test("WebSocket lifecycle - avoids unnecessary disposal and recreation", () => {
  const tracker = createMockWebSocketTracker();
  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig(),
  );

  sync.useOwner(true, testOwner);
  tracker.expectCreated(1);
  tracker.expectDisposed(0);

  const originalWebSocket = tracker.createdWebSockets.get(
    "ws://localhost:3000",
  );

  // Remove owner - should NOT immediately dispose WebSocket
  sync.useOwner(false, testOwner);
  tracker.expectDisposed(0); // Should not dispose yet

  // Re-add same owner quickly (simulating React re-render)
  sync.useOwner(true, testOwner);

  // Should reuse the same WebSocket, not create a new one
  tracker.expectCreated(1); // Still only one WebSocket
  tracker.expectDisposed(0); // Should not have disposed
  expect(tracker.createdWebSockets.get("ws://localhost:3000")).toBe(
    originalWebSocket,
  ); // Same instance
});

test("Sync dispose - cancels pending timeouts and disposes all WebSockets", async () => {
  const tracker = createMockWebSocketTracker();
  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig(),
  );

  sync.useOwner(true, testOwner);
  tracker.expectCreated(1);
  tracker.expectDisposed(0);

  // Remove owner - schedules delayed disposal
  sync.useOwner(false, testOwner);
  tracker.expectDisposed(0); // Not disposed yet due to delay

  sync[Symbol.dispose]();
  tracker.expectDisposed(1);
  tracker.expectWebSocketDisposed("ws://localhost:3000");

  // Wait longer than the timeout delay to ensure timeout was canceled
  await wait(150);
  tracker.expectDisposed(1); // Should still be 1, not 2 (timeout was canceled)
});

test("Sync dispose - prevents operations after disposal", () => {
  const tracker = createMockWebSocketTracker();
  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig(),
  );

  // Add owner before disposal
  sync.useOwner(true, testOwner);
  tracker.expectCreated(1);

  sync[Symbol.dispose]();

  // Operations after disposal should be no-ops
  sync.useOwner(true, testOwner); // Should be ignored
  tracker.expectCreated(1); // No new WebSocket created

  expect(sync.getOwner(testOwner.id)).toBeNull();
});

test("Sync configurable disposal delay", async () => {
  const tracker = createMockWebSocketTracker();
  const customConfig = createTestConfig({ disposalDelayMs: 50 });
  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    customConfig,
  );

  sync.useOwner(true, testOwner);
  sync.useOwner(false, testOwner);
  tracker.expectDisposed(0);

  // Wait for less than the delay - should not be disposed yet
  await wait(25);
  tracker.expectDisposed(0);

  // Wait for the full delay - should now be disposed
  await wait(50);
  tracker.expectDisposed(1);
});

test("WebSocket onOpen calls sync config onOpen with owner IDs", () => {
  const tracker = createMockWebSocketTracker();
  const onOpenCalls: Array<{ ownerIds: ReadonlyArray<OwnerId> }> = [];

  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig({
      onOpen: (
        ownerIds: ReadonlyArray<OwnerId>,
        _send: (message: ProtocolMessage) => void,
      ) => {
        onOpenCalls.push({ ownerIds });
      },
    }),
  );

  sync.useOwner(true, testOwner);

  const webSocket = tracker.createdWebSockets.get("ws://localhost:3000");
  webSocket?.onOpen?.();

  expect(onOpenCalls.length).toBe(1);
  expect(onOpenCalls[0].ownerIds).toEqual([testOwner.id]);
});

test("WebSocket onMessage calls sync config onMessage with message data", () => {
  const tracker = createMockWebSocketTracker();
  const onMessageCalls: Array<{
    message: Uint8Array;
    hasGetOwner: boolean;
    hasSend: boolean;
  }> = [];

  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig({
      onMessage: (
        message: Uint8Array,
        send: (message: ProtocolMessage) => void,
        getOwner: (ownerId: OwnerId) => any,
      ) => {
        onMessageCalls.push({
          message,
          hasGetOwner: typeof getOwner === "function",
          hasSend: typeof send === "function",
        });
      },
    }),
  );

  sync.useOwner(true, testOwner);

  const webSocket = tracker.createdWebSockets.get("ws://localhost:3000");

  // Create test message data
  const testMessage = new ArrayBuffer(10);
  const testView = new Uint8Array(testMessage);
  testView[0] = 42; // Set some test data

  // Simulate WebSocket message
  webSocket?.onMessage?.(testMessage);

  expect(onMessageCalls.length).toBe(1);
  expect(onMessageCalls[0].message).toEqual(new Uint8Array(testMessage));
  expect(onMessageCalls[0].hasGetOwner).toBe(true);
  expect(onMessageCalls[0].hasSend).toBe(true);
});

test("WebSocket onMessage ignores non-ArrayBuffer messages", () => {
  const tracker = createMockWebSocketTracker();
  const onMessageCalls: Array<any> = [];

  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig({
      onMessage: () => {
        onMessageCalls.push("called");
      },
    }),
  );

  sync.useOwner(true, testOwner);

  const webSocket = tracker.createdWebSockets.get("ws://localhost:3000");

  // Simulate string message (should be ignored)
  webSocket?.onMessage?.("string message");

  // Simulate Blob message (should be ignored)
  webSocket?.onMessage?.(new Blob(["blob data"]));

  // No calls should have been made
  expect(onMessageCalls.length).toBe(0);
});

test("WebSocket onMessage provides getOwner that returns active owners", () => {
  const tracker = createMockWebSocketTracker();
  let capturedGetOwner: ((ownerId: OwnerId) => any) | null = null;

  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig({
      onMessage: (
        _message: Uint8Array,
        _send: (message: ProtocolMessage) => void,
        getOwner: (ownerId: OwnerId) => any,
      ) => {
        capturedGetOwner = getOwner;
      },
    }),
  );

  sync.useOwner(true, testOwner);

  const webSocket = tracker.createdWebSockets.get("ws://localhost:3000");

  // Trigger onMessage to capture the getOwner function
  const testMessage = new ArrayBuffer(1);
  webSocket?.onMessage?.(testMessage);

  // Test that getOwner returns the active owner
  expect(capturedGetOwner).not.toBeNull();
  expect(capturedGetOwner!(testOwner.id)).toBe(testOwner);

  // Test that getOwner returns null for inactive owner
  expect(capturedGetOwner!(testOwner2.id)).toBeNull();
});

test("send messages to all transports for an active owner", () => {
  const tracker = createMockWebSocketTracker();
  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig(),
  );

  // Add owner to activate transport
  sync.useOwner(true, testOwner);

  // Create a test protocol message
  const testMessage = new Uint8Array([1, 2, 3, 4, 5]) as ProtocolMessage;

  // Send message
  sync.send(testOwner.id, testMessage);

  // Verify message was sent to the transport
  tracker.expectMessagesSent("ws://localhost:3000", 1);
  const sentMessages = tracker.getSentMessages("ws://localhost:3000");
  expect(sentMessages[0]).toBe(testMessage);
});

test("send messages to multiple transports for owner with custom transports", () => {
  const tracker = createMockWebSocketTracker();
  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig({
      transports: [], // Empty config transports
    }),
  );

  // Owner with custom transports
  const ownerWithMultipleTransports = {
    ...testOwner,
    transports: [
      { type: "WebSocket" as const, url: "ws://server1.com" },
      { type: "WebSocket" as const, url: "ws://server2.com" },
    ],
  };

  // Add owner with multiple transports
  sync.useOwner(true, ownerWithMultipleTransports);

  // Create a test protocol message
  const testMessage = new Uint8Array([1, 2, 3, 4, 5]) as ProtocolMessage;

  // Send message
  sync.send(testOwner.id, testMessage);

  // Verify message was sent to both transports
  tracker.expectMessagesSent("ws://server1.com", 1);
  tracker.expectMessagesSent("ws://server2.com", 1);

  const messages1 = tracker.getSentMessages("ws://server1.com");
  const messages2 = tracker.getSentMessages("ws://server2.com");
  expect(messages1[0]).toBe(testMessage);
  expect(messages2[0]).toBe(testMessage);
});

test("send does not send messages for inactive owners", () => {
  const tracker = createMockWebSocketTracker();
  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig(),
  );

  // Don't add any owners - transport should not be created
  tracker.expectCreated(0);

  // Create a test protocol message
  const testMessage = new Uint8Array([1, 2, 3, 4, 5]) as ProtocolMessage;

  // Try to send message for inactive owner
  sync.send(testOwner.id, testMessage);

  // No transports should be created, no messages sent
  tracker.expectCreated(0);
});

test("send does not send messages for removed owners", () => {
  const tracker = createMockWebSocketTracker();
  const sync = createSync(createTestDeps(tracker.mockCreateWebSocket))(
    createTestConfig(),
  );

  // Add and then remove owner
  sync.useOwner(true, testOwner);
  sync.useOwner(false, testOwner);

  // Create a test protocol message
  const testMessage = new Uint8Array([1, 2, 3, 4, 5]) as ProtocolMessage;

  // Try to send message for removed owner
  sync.send(testOwner.id, testMessage);

  // No messages should be sent
  tracker.expectMessagesSent("ws://localhost:3000", 0);
});
