import { NonEmptyReadonlyArray } from "../Array.js";
import { assertNonEmptyReadonlyArray } from "../Assert.js";
import type { Brand } from "../Brand.js";
import { ConsoleDep } from "../Console.js";
import { EncryptionKey } from "../Crypto.js";
import { createRefCountedResourceManager } from "../RefCountedResourceManager.js";
import { CreateWebSocketDep, WebSocket } from "../WebSocket.js";
import { TransportConfig } from "./Config.js";
import {
  OwnerId,
  ShardOwner,
  SharedOwner,
  SharedReadonlyOwner,
  WriteKey,
} from "./Owner.js";
import { ProtocolMessage } from "./Protocol.js";
import { Millis } from "./Timestamp.js";

export interface Sync extends Disposable {
  /**
   * Assigns or removes an owner to/from transports with reference counting.
   *
   * Owners are only "active" if assigned to at least one transport. Uses
   * `owner.transports` or falls back to config transports. Multiple calls
   * increment/decrement reference counts (useful for React Hooks).
   */
  readonly useOwner: (use: boolean, owner: SyncOwner) => void;

  /** Returns owner data only if actively assigned to at least one transport. */
  readonly getOwner: (ownerId: OwnerId) => SyncOwner | null;

  readonly send: (ownerId: OwnerId, message: ProtocolMessage) => void;
}

export interface SyncDep {
  readonly sync: Sync;
}

/**
 * Internal representation of an owner for sync operations. This is a unified
 * interface that abstracts over the specific owner types ({@link ShardOwner},
 * {@link SharedOwner}, {@link SharedReadonlyOwner}) for the sync layer.
 *
 * The sync layer only needs the essential data for synchronization and doesn't
 * need to distinguish between different owner types.
 */
export interface SyncOwner {
  readonly id: OwnerId;
  readonly encryptionKey: EncryptionKey;
  /** Optional for read-only owners like {@link SharedReadonlyOwner}. */
  readonly writeKey?: WriteKey;
  readonly transports?: ReadonlyArray<TransportConfig>;
}

export interface SyncConfig {
  readonly transports: ReadonlyArray<TransportConfig>;

  /**
   * Delay in milliseconds before disposing unused WebSocket connections.
   * Defaults to 100ms.
   */
  readonly disposalDelayMs?: number;

  readonly onOpen: (
    ownerIds: NonEmptyReadonlyArray<OwnerId>,
    send: (message: ProtocolMessage) => void,
  ) => void;

  readonly onMessage: (
    message: Uint8Array,
    send: (message: ProtocolMessage) => void,
    getOwner: Sync["getOwner"],
  ) => void;
}

export const createSync =
  (deps: ConsoleDep & CreateWebSocketDep) =>
  (config: SyncConfig): Sync => {
    let isDisposed = false;

    const createResource = (transportConfig: TransportConfig): WebSocket => {
      const transportKey = createTransportKey(transportConfig);
      return deps.createWebSocket(transportConfig.url, {
        binaryType: "arraybuffer",

        onOpen: () => {
          if (isDisposed) return;

          const webSocket = transports.getResource(transportKey);
          if (!webSocket) return;

          const ownerIds = transports.getConsumersForResource(transportKey);
          if (ownerIds.length === 0) return;

          assertNonEmptyReadonlyArray(ownerIds);

          deps.console.log("[sync]", "onOpen", { ownerIds });

          config.onOpen(ownerIds, (message) => {
            deps.console.log("[sync]", "onOpen", "send", { message });
            // Ignore send errors - WebSocket auto-reconnection handles retry
            void webSocket.send(message);
          });
        },

        onMessage: (data: string | ArrayBuffer | Blob) => {
          if (isDisposed) return;

          const webSocket = transports.getResource(transportKey);
          if (!webSocket) return;

          // Only handle ArrayBuffer data for sync messages
          if (!(data instanceof ArrayBuffer)) return;
          const message = new Uint8Array(data);

          deps.console.log("[sync]", "onMessage", { transportKey, message });

          config.onMessage(
            message,
            (message) => {
              // Ignore send errors - WebSocket auto-reconnection handles retry
              void webSocket.send(message);
            },
            sync.getOwner,
          );
        },
      });
    };

    const transports = createRefCountedResourceManager<
      WebSocket,
      TransportKey,
      TransportConfig,
      SyncOwner,
      OwnerId
    >({
      createResource,
      getResourceKey: createTransportKey,
      getConsumerId: (owner) => owner.id,
      disposalDelay: config.disposalDelayMs ?? 100,
    });

    // Create sync object first so handlers can reference it
    const sync: Sync = {
      useOwner: (use, owner) => {
        if (isDisposed) {
          deps.console.warn(
            "[sync]",
            "useOwner called on disposed Sync instance",
            { owner },
          );
          return;
        }

        deps.console.log("[sync]", "useOwner", { use, owner });
        const transportsToUse = owner.transports ?? config.transports;

        if (use) {
          transports.addConsumer(owner, transportsToUse);
        } else {
          const result = transports.removeConsumer(owner, transportsToUse);

          if (!result.ok) {
            deps.console.warn("[sync]", "Failed to remove consumer", {
              transportsToUse,
              ownerId: owner.id,
              error: result.error,
            });
          }
        }
      },

      getOwner: (ownerId) => {
        if (isDisposed) return null;
        return transports.getConsumer(ownerId);
      },

      send: (ownerId, message) => {
        if (isDisposed) {
          deps.console.warn("[sync]", "send called on disposed Sync instance", {
            ownerId,
            message,
          });
          return;
        }

        const owner = transports.getConsumer(ownerId);
        if (!owner) return;

        const transportsToUse = owner.transports ?? config.transports;

        // Send message to all transports for this owner
        for (const transportConfig of transportsToUse) {
          const transportKey = createTransportKey(transportConfig);
          const webSocket = transports.getResource(transportKey);
          if (!webSocket) continue;

          deps.console.log("[sync]", "send", { transportKey, message });
          // Ignore send errors - WebSocket auto-reconnection handles retry
          void webSocket.send(message);
        }
      },

      [Symbol.dispose]: () => {
        if (isDisposed) return;
        isDisposed = true;
        transports[Symbol.dispose]();
      },
    };

    return sync;
  };

type TransportKey = string & Brand<"TransportKey">;

/** Creates a unique identifier for a transport configuration. */
const createTransportKey = (transportConfig: TransportConfig): TransportKey => {
  return `ws:${transportConfig.url}` as TransportKey;
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
