import { expect, test } from "vitest";
import { createConsole } from "../../src/Console.js";
import { createSync } from "../../src/Evolu/Sync.js";
import { testCreateDummyWebSocket, testOwner, testOwner2 } from "../_deps.js";
import { ok } from "../../src/Result.js";
import { constFalse } from "../../src/Function.js";
import { OwnerId } from "../../src/Evolu/Owner.js";
import { ProtocolMessage } from "../../src/Evolu/Protocol.js";

const testConfig = {
  transports: [
    {
      type: "WebSocket",
      url: "ws://localhost:3000",
    },
  ],
  onOpen: () => {
    // TODO: implement
  },
  onMessage: () => {
    // TODO: implement
  },
} as const;

const testConfigWithEmptyTransports = {
  transports: [],
  onOpen: () => {
    // TODO: implement
  },
  onMessage: () => {
    // TODO: implement
  },
} as const;

// Create test owner without transports (will use config transports)
const testOwnerWithoutTransports = {
  id: testOwner.id,
  encryptionKey: testOwner.encryptionKey,
  writeKey: testOwner.writeKey,
  // No transports property - should use config transports
};

const createTestDeps = () => ({
  console: createConsole(),
  createWebSocket: testCreateDummyWebSocket,
});

test("useOwner stores and removes owners correctly", () => {
  const sync = createSync(createTestDeps())(testConfig);

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
  const sync = createSync(createTestDeps())(testConfig);

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
  const sync = createSync(createTestDeps())(testConfigWithEmptyTransports);

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
  const sync = createSync(createTestDeps())(testConfig);

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
  const createdWebSockets = new Map<string, any>();
  const disposedWebSockets = new Set<string>();

  const mockCreateWebSocket = (url: string) => {
    const webSocket = {
      send: () => ok(),
      getReadyState: () => "connecting" as const,
      isOpen: constFalse,
      [Symbol.dispose]: () => {
        disposedWebSockets.add(url);
      },
    };
    createdWebSockets.set(url, webSocket);
    return webSocket;
  };

  const sync = createSync({
    console: createConsole(),
    createWebSocket: mockCreateWebSocket,
  })(testConfig);

  // Initially no WebSockets created
  expect(createdWebSockets.size).toBe(0);

  // Add first owner - should create WebSocket
  sync.useOwner(true, testOwner);
  expect(createdWebSockets.size).toBe(1);
  expect(createdWebSockets.has("ws://localhost:3000")).toBe(true);
  expect(disposedWebSockets.size).toBe(0);

  // Remove owner - should dispose WebSocket (after delay)
  sync.useOwner(false, testOwner);

  // Wait for delayed disposal to complete
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(disposedWebSockets.size).toBe(1);
  expect(disposedWebSockets.has("ws://localhost:3000")).toBe(true);
});

test("WebSocket lifecycle - reuses connection for multiple owners", async () => {
  const createdWebSockets = new Map<string, any>();
  const disposedWebSockets = new Set<string>();

  const mockCreateWebSocket = (url: string) => {
    const webSocket = {
      send: () => ok(),
      getReadyState: () => "connecting" as const,
      isOpen: constFalse,
      [Symbol.dispose]: () => {
        disposedWebSockets.add(url);
      },
    };
    createdWebSockets.set(url, webSocket);
    return webSocket;
  };

  const sync = createSync({
    console: createConsole(),
    createWebSocket: mockCreateWebSocket,
  })(testConfig);

  // Add first owner - creates WebSocket
  sync.useOwner(true, testOwner);
  expect(createdWebSockets.size).toBe(1);

  // Add second owner - reuses WebSocket
  sync.useOwner(true, testOwner2);
  expect(createdWebSockets.size).toBe(1); // Still only one WebSocket
  expect(disposedWebSockets.size).toBe(0);

  // Remove first owner - WebSocket should remain
  sync.useOwner(false, testOwner);
  expect(disposedWebSockets.size).toBe(0);

  // Remove second owner - now WebSocket should be disposed (after delay)
  sync.useOwner(false, testOwner2);

  // Wait for delayed disposal to complete
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(disposedWebSockets.size).toBe(1);
  expect(disposedWebSockets.has("ws://localhost:3000")).toBe(true);
});

test("WebSocket lifecycle - handles multiple transports", async () => {
  const createdWebSockets = new Map<string, any>();
  const disposedWebSockets = new Set<string>();

  const mockCreateWebSocket = (url: string) => {
    const webSocket = {
      send: () => ok(),
      getReadyState: () => "connecting" as const,
      isOpen: constFalse,
      [Symbol.dispose]: () => {
        disposedWebSockets.add(url);
      },
    };
    createdWebSockets.set(url, webSocket);
    return webSocket;
  };

  const multiTransportConfig = {
    transports: [
      { type: "WebSocket", url: "ws://server1.com" },
      { type: "WebSocket", url: "ws://server2.com" },
    ],
    onOpen: () => {
      // TODO: implement WebSocket onOpen
    },
    onMessage: () => {
      // TODO: implement WebSocket onMessage
    },
  } as const;

  const sync = createSync({
    console: createConsole(),
    createWebSocket: mockCreateWebSocket,
  })(multiTransportConfig);

  // Add owner - should create WebSockets for both transports
  sync.useOwner(true, testOwner);
  expect(createdWebSockets.size).toBe(2);
  expect(createdWebSockets.has("ws://server1.com")).toBe(true);
  expect(createdWebSockets.has("ws://server2.com")).toBe(true);

  // Remove owner - should dispose both WebSockets (after delay)
  sync.useOwner(false, testOwner);

  // Wait for delayed disposal to complete
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(disposedWebSockets.size).toBe(2);
  expect(disposedWebSockets.has("ws://server1.com")).toBe(true);
  expect(disposedWebSockets.has("ws://server2.com")).toBe(true);
});

test("WebSocket lifecycle - avoids unnecessary disposal and recreation", () => {
  const createdWebSockets = new Map<string, unknown>();
  const disposedWebSockets = new Set<string>();

  const mockCreateWebSocket = (url: string) => {
    const webSocket = {
      send: () => ok(),
      getReadyState: () => "connecting" as const,
      isOpen: constFalse,
      [Symbol.dispose]: () => {
        disposedWebSockets.add(url);
      },
    };
    createdWebSockets.set(url, webSocket);
    return webSocket;
  };

  const sync = createSync({
    console: createConsole(),
    createWebSocket: mockCreateWebSocket,
  })(testConfig);

  // Add owner - creates WebSocket
  sync.useOwner(true, testOwner);
  expect(createdWebSockets.size).toBe(1);
  expect(disposedWebSockets.size).toBe(0);

  const originalWebSocket = createdWebSockets.get("ws://localhost:3000");

  // Remove owner - should NOT immediately dispose WebSocket
  sync.useOwner(false, testOwner);
  expect(disposedWebSockets.size).toBe(0); // Should not dispose yet

  // Re-add same owner quickly (simulating React re-render)
  sync.useOwner(true, testOwner);

  // Should reuse the same WebSocket, not create a new one
  expect(createdWebSockets.size).toBe(1); // Still only one WebSocket
  expect(disposedWebSockets.size).toBe(0); // Should not have disposed
  expect(createdWebSockets.get("ws://localhost:3000")).toBe(originalWebSocket); // Same instance

  // Clean up
  sync.useOwner(false, testOwner);
});

test("Sync dispose - cancels pending timeouts and disposes all WebSockets", () => {
  const createdWebSockets = new Map<string, unknown>();
  const disposedWebSockets = new Set<string>();

  const mockCreateWebSocket = (url: string) => {
    const webSocket = {
      send: () => ok(),
      getReadyState: () => "connecting" as const,
      isOpen: constFalse,
      [Symbol.dispose]: () => {
        disposedWebSockets.add(url);
      },
    };
    createdWebSockets.set(url, webSocket);
    return webSocket;
  };

  const sync = createSync({
    console: createConsole(),
    createWebSocket: mockCreateWebSocket,
  })(testConfig);

  // Add owner - creates WebSocket
  sync.useOwner(true, testOwner);
  expect(createdWebSockets.size).toBe(1);
  expect(disposedWebSockets.size).toBe(0);

  // Remove owner - schedules delayed disposal
  sync.useOwner(false, testOwner);
  expect(disposedWebSockets.size).toBe(0); // Not disposed yet due to delay

  // Dispose sync - should immediately dispose WebSocket and cancel timeout
  sync[Symbol.dispose]();
  expect(disposedWebSockets.size).toBe(1);
  expect(disposedWebSockets.has("ws://localhost:3000")).toBe(true);
});

test("Sync dispose - cancels pending timeouts preventing delayed disposal", async () => {
  const createdWebSockets = new Map<string, unknown>();
  const disposedWebSockets = new Set<string>();

  const mockCreateWebSocket = (url: string) => {
    const webSocket = {
      send: () => ok(),
      getReadyState: () => "connecting" as const,
      isOpen: constFalse,
      [Symbol.dispose]: () => {
        disposedWebSockets.add(url);
      },
    };
    createdWebSockets.set(url, webSocket);
    return webSocket;
  };

  const sync = createSync({
    console: createConsole(),
    createWebSocket: mockCreateWebSocket,
  })(testConfig);

  // Add and remove owner to schedule delayed disposal
  sync.useOwner(true, testOwner);
  sync.useOwner(false, testOwner);
  expect(disposedWebSockets.size).toBe(0); // Not disposed yet

  // Dispose sync immediately - should cancel pending timeout
  sync[Symbol.dispose]();
  expect(disposedWebSockets.size).toBe(1); // Disposed by sync.dispose()

  // Wait longer than the timeout delay to ensure timeout was canceled
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(disposedWebSockets.size).toBe(1); // Should still be 1, not 2
});

test("Sync dispose - prevents operations after disposal", () => {
  const createdWebSockets = new Map<string, unknown>();
  const disposedWebSockets = new Set<string>();

  const mockCreateWebSocket = (url: string) => {
    const webSocket = {
      send: () => ok(),
      getReadyState: () => "connecting" as const,
      isOpen: constFalse,
      [Symbol.dispose]: () => {
        disposedWebSockets.add(url);
      },
    };
    createdWebSockets.set(url, webSocket);
    return webSocket;
  };

  const sync = createSync({
    console: createConsole(),
    createWebSocket: mockCreateWebSocket,
  })(testConfig);

  // Add owner before disposal
  sync.useOwner(true, testOwner);
  expect(createdWebSockets.size).toBe(1);

  // Dispose sync
  sync[Symbol.dispose]();

  // Operations after disposal should be no-ops
  sync.useOwner(true, testOwner); // Should be ignored
  expect(createdWebSockets.size).toBe(1); // No new WebSocket created

  expect(sync.getOwner(testOwner.id)).toBeNull(); // Should return null

  // Multiple dispose calls should be safe
  sync[Symbol.dispose]();
  sync[Symbol.dispose]();
});

test("Sync configurable disposal delay", async () => {
  const createdWebSockets = new Map<string, unknown>();
  const disposedWebSockets = new Set<string>();

  const mockCreateWebSocket = (url: string) => {
    const webSocket = {
      send: () => ok(),
      getReadyState: () => "connecting" as const,
      isOpen: constFalse,
      [Symbol.dispose]: () => {
        disposedWebSockets.add(url);
      },
    };
    createdWebSockets.set(url, webSocket);
    return webSocket;
  };

  const customConfig = {
    ...testConfig,
    disposalDelayMs: 50, // Custom 50ms delay
  };

  const sync = createSync({
    console: createConsole(),
    createWebSocket: mockCreateWebSocket,
  })(customConfig);

  // Add and remove owner
  sync.useOwner(true, testOwner);
  sync.useOwner(false, testOwner);
  expect(disposedWebSockets.size).toBe(0);

  // Wait for less than the delay - should not be disposed yet
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(disposedWebSockets.size).toBe(0);

  // Wait for the full delay - should now be disposed
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(disposedWebSockets.size).toBe(1);
});

test("WebSocket onOpen calls sync config onOpen with owner IDs", () => {
  const createdWebSockets = new Map<string, { onOpen: (() => void) | null }>();
  const onOpenCalls: Array<{ ownerIds: ReadonlyArray<OwnerId> }> = [];

  const mockCreateWebSocket = (
    url: string,
    options?: { onOpen?: () => void },
  ) => {
    const webSocket = {
      send: () => ok(),
      getReadyState: () => "connecting" as const,
      isOpen: constFalse,
      onOpen: options?.onOpen ?? null, // Store the onOpen callback from options
      [Symbol.dispose]: () => {
        // No-op for testing
      },
    };
    createdWebSockets.set(url, webSocket);
    return webSocket;
  };

  const sync = createSync({
    console: createConsole(),
    createWebSocket: mockCreateWebSocket,
  })({
    ...testConfig,
    onOpen: (
      ownerIds: ReadonlyArray<OwnerId>,
      _send: (message: ProtocolMessage) => void,
    ) => {
      onOpenCalls.push({ ownerIds });
    },
  });

  // Add owner - creates WebSocket
  sync.useOwner(true, testOwner);

  const webSocket = createdWebSockets.get("ws://localhost:3000");

  // Simulate WebSocket opening
  webSocket?.onOpen?.();

  // Should have called config.onOpen with the owner ID
  expect(onOpenCalls.length).toBe(1);
  expect(onOpenCalls[0].ownerIds).toEqual([testOwner.id]);
});
