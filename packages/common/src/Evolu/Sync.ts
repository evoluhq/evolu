import { ConsoleConfig, ConsoleDep } from "../Console.js";
import { createWebSocket } from "../WebSocket.js";
import { ProtocolMessage } from "./Protocol.js";
import { Millis } from "./Timestamp.js";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type Transport = { readonly type: "WebSocket"; readonly url: string };
// Future transport types (not yet implemented):
// | { readonly type: "FetchRelay"; readonly url: string }    // HTTP-based polling/push
// | { readonly type: "Bluetooth" }                           // P2P Bluetooth
// | { readonly type: "LocalNetwork"; readonly host: string } // LAN/mesh sync

export interface Sync {
  readonly send: (message: ProtocolMessage) => void;
}

export interface SyncDep {
  readonly sync: Sync;
}

export type CreateSync = (deps: ConsoleDep) => (config: SyncConfig) => Sync;

export interface CreateSyncDep {
  readonly createSync: CreateSync;
}

export interface SyncConfig extends ConsoleConfig {
  readonly transport: Transport | ReadonlyArray<Transport>;
  readonly onOpen: (send: Sync["send"]) => void;
  readonly onMessage: (message: Uint8Array, send: Sync["send"]) => void;
}

export const createWebSocketSync: CreateSync = (_deps) => (config) => {
  const allTransports = Array.isArray(config.transport)
    ? config.transport
    : [config.transport];

  // Currently only WebSocket transports are supported
  // Future: Add support for other transport types here
  const webSocketTransports = allTransports as ReadonlyArray<
    Extract<Transport, { type: "WebSocket" }>
  >;

  const sockets = new Map<string, ReturnType<typeof createWebSocket>>();

  const sync: Sync = {
    send: (message) => {
      /**
       * We don't need an in-memory queue; apps can be offline for a long time,
       * and mutations are stored in SQLite. Dropped CRDT messages are synced
       * when the web socket connection is open.
       *
       * Send the message to all connected WebSocket transports simultaneously.
       */
      for (const socket of sockets.values()) {
        if (socket.getReadyState() === "open") {
          socket.send(message);
        }
      }
    },
  };

  for (const transport of webSocketTransports) {
    const socket = createWebSocket(transport.url, {
      binaryType: "arraybuffer",
      onOpen: () => {
        config.onOpen(sync.send);
      },
      onMessage: (data) => {
        if (data instanceof ArrayBuffer) {
          const messages = new Uint8Array(data);
          config.onMessage(messages, sync.send);
        }
      },
    });

    sockets.set(transport.url, socket);
  }

  return sync;
};

/**
 * The possible states of a synchronization process. The `SyncState` can be one
 * of the following:
 *
 * - {@link SyncStateInitial}
 * - {@link SyncStateIsSyncing}
 * - {@link SyncStateIsSynced}
 * - {@link SyncStateIsNotSynced}
 */
export type SyncState =
  | SyncStateInitial
  | SyncStateIsSyncing
  | SyncStateIsSynced
  | SyncStateIsNotSynced;

/**
 * The initial synchronization state when the app starts. In this state, the app
 * needs to determine whether the data is synced.
 */
export interface SyncStateInitial {
  readonly type: "SyncStateInitial";
}

export interface SyncStateIsSyncing {
  readonly type: "SyncStateIsSyncing";
}

export interface SyncStateIsSynced {
  readonly type: "SyncStateIsSynced";
  readonly time: Millis;
}

export interface SyncStateIsNotSynced {
  readonly type: "SyncStateIsNotSynced";
  readonly error: NetworkError | ServerError | PaymentRequiredError;
}

export interface NetworkError {
  readonly type: "NetworkError";
}

export interface ServerError {
  readonly type: "ServerError";
  readonly status: number;
}

export interface PaymentRequiredError {
  readonly type: "PaymentRequiredError";
}

export const initialSyncState: SyncStateInitial = { type: "SyncStateInitial" };
