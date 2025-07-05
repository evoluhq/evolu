/**
 * Web-specific WebSocket sync that includes visibility change detection.
 *
 * This extends the base WebSocket sync implementation to automatically trigger
 * sync when the browser tab becomes visible again, solving the common issue
 * where browsers (especially Safari) don't sync when reopened after being
 * closed.
 *
 * @module WebSocketSyncWithVisibility
 */

import { createWebSocket } from "@evolu/common";
import { CreateSync, ProtocolMessage } from "@evolu/common/evolu";

/**
 * Creates a WebSocket sync with automatic visibility change detection.
 *
 * This sync implementation:
 *
 * - Maintains a normal WebSocket connection for real-time sync
 * - Listens for page visibility changes and window focus events
 * - Triggers sync immediately when connected or when connection opens
 * - Automatically cleans up event listeners when disposed
 */
export const createWebSocketSyncWithVisibility: CreateSync =
  (deps) => (config) => {
    // Track when we need to sync due to visibility change
    let needsSyncOnConnection = false;
    let sendFunction: ((message: ProtocolMessage) => void) | null = null;

    const sync = {
      send: (message: ProtocolMessage) => {
        if (socket.getReadyState() !== "open") return;
        socket.send(message);
      },
    };

    const triggerSync = () => {
      needsSyncOnConnection = true;

      // If already connected, sync immediately
      if (sendFunction && socket.getReadyState() === "open") {
        deps.console.log("[visibility-sync]", "Triggering sync immediately");
        config.onOpen(sendFunction);
        needsSyncOnConnection = false;
      }
    };

    // Set up visibility detection (browser only)
    let cleanupVisibility: (() => void) | null = null;

    if (typeof document !== "undefined") {
      const handleVisibilityChange = () => {
        if (!document.hidden) triggerSync();
      };

      const handleFocus = () => {
        triggerSync();
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("focus", handleFocus);

      cleanupVisibility = () => {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
        window.removeEventListener("focus", handleFocus);
      };
    }

    const socket = createWebSocket(config.syncUrl, {
      binaryType: "arraybuffer",
      onOpen: () => {
        sendFunction = sync.send;
        config.onOpen(sync.send);

        // If sync was needed while disconnected, do it now
        if (needsSyncOnConnection) {
          deps.console.log(
            "[visibility-sync]",
            "Connection opened, triggering pending sync",
          );
          config.onOpen(sync.send);
          needsSyncOnConnection = false;
        }
      },
      onMessage: (data) => {
        if (data instanceof ArrayBuffer) {
          const messages = new Uint8Array(data);
          config.onMessage(messages, sync.send);
        }
      },
      onClose: () => {
        sendFunction = null;
        cleanupVisibility?.();
      },
    });

    return {
      ...sync,
      [Symbol.dispose]: () => {
        cleanupVisibility?.();
        socket[Symbol.dispose]();
      },
    };
  };
