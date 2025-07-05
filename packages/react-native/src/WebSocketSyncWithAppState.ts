/**
 * React Native WebSocket sync with AppState detection.
 *
 * This extends the base WebSocket sync implementation to automatically trigger
 * sync when the app becomes active again, solving the common issue where React
 * Native apps don't sync when reopened after being backgrounded.
 *
 * @module WebSocketSyncWithAppState
 */

import type { ConsoleDep } from "@evolu/common";
import { createWebSocket } from "@evolu/common";
import { CreateSync, Sync } from "@evolu/common/evolu";
import { AppState, AppStateStatus } from "react-native";

/**
 * Creates a WebSocket sync with automatic AppState detection.
 *
 * This sync implementation:
 *
 * - Maintains a normal WebSocket connection for real-time sync
 * - Listens for AppState changes (active/inactive/background)
 * - Triggers sync immediately when connected or when connection opens
 * - Handles cleanup of event listeners
 *
 * @param {ConsoleDep} _deps - Console dependency (unused, but kept for parity
 *   with other sync factories)
 * @returns {Sync} Sync implementation that handles AppState-based auto sync
 */
export const createWebSocketSyncWithAppState: CreateSync =
  (_deps) => (config) => {
    // Track when we need to sync due to app becoming active
    let needsSyncOnConnection = false;
    let sendFunction: ((message: any) => void) | null = null;

    const sync: Sync = {
      send: (message) => {
        if (socket.getReadyState() !== "open") return;
        socket.send(message);
      },
    };

    const triggerSync = () => {
      needsSyncOnConnection = true;

      // If already connected, sync immediately
      if (sendFunction && socket.getReadyState() === "open") {
        config.onOpen(sendFunction);
        needsSyncOnConnection = false;
      }
    };

    // Set up AppState listener
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        triggerSync();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    const socket = createWebSocket(config.syncUrl, {
      binaryType: "arraybuffer",
      onOpen: () => {
        sendFunction = sync.send;
        config.onOpen(sync.send);

        // If sync was needed while disconnected, do it now
        if (needsSyncOnConnection) {
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
        subscription.remove();
      },
    });

    return {
      ...sync,
      [Symbol.dispose]: () => {
        subscription.remove();
        socket[Symbol.dispose]();
      },
    };
  };
