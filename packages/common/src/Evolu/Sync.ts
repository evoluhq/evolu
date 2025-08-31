import { NonEmptyReadonlyArray } from "../Array.js";
import { assert, assertNonEmptyReadonlyArray } from "../Assert.js";
import { ConsoleDep } from "../Console.js";
import { EncryptionKey } from "../Crypto.js";
import { brand, PositiveInt, String } from "../Type.js";
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
    const transportOwnerIdRefCounts = new Map<
      TransportId,
      Map<OwnerId, PositiveInt>
    >();
    const ownersById = new Map<OwnerId, SyncOwner>();
    const transports = new Map<TransportId, WebSocket>();
    const disposalTimeouts = new Map<
      TransportId,
      ReturnType<typeof setTimeout>
    >();

    let isDisposed = false;
    const disposalDelayMs = config.disposalDelayMs ?? 100;

    const handleWebSocketOpen = (transportId: TransportId) => () => {
      if (isDisposed) return;

      const webSocket = transports.get(transportId);
      if (!webSocket) return;

      const ownerIdRefCounts = transportOwnerIdRefCounts.get(transportId);
      if (!ownerIdRefCounts?.size) return;

      const ownerIds = Array.from(ownerIdRefCounts.keys());
      assertNonEmptyReadonlyArray(ownerIds);

      deps.console.log("[sync]", "onOpen", { ownerIds });

      config.onOpen(ownerIds, (message) => {
        deps.console.log("[sync]", "onOpen", "send", { message });
        // Ignore send errors - WebSocket auto-reconnection handles retry
        void webSocket.send(message);
      });
    };

    const handleWebSocketMessage =
      (transportId: TransportId) => (data: string | ArrayBuffer | Blob) => {
        if (isDisposed) return;

        const webSocket = transports.get(transportId);
        if (!webSocket) return;

        // Only handle ArrayBuffer data for sync messages
        if (!(data instanceof ArrayBuffer)) return;
        const message = new Uint8Array(data);

        deps.console.log("[sync]", "onMessage", { transportId, message });

        config.onMessage(
          message,
          (message) => {
            // Ignore send errors - WebSocket auto-reconnection handles retry
            void webSocket.send(message);
          },
          sync.getOwner,
        );
      };

    /**
     * Schedules delayed disposal of a transport to avoid connection churn.
     *
     * Instead of immediately closing WebSocket connections when no owners are
     * using them, we wait briefly in case new owners are added soon. This
     * prevents expensive reconnection cycles in scenarios like React component
     * remounts or rapid owner assignment changes.
     */
    const scheduleTransportDisposal = (transportId: TransportId) => {
      const timeoutId = setTimeout(() => {
        if (isDisposed) return;

        const webSocket = transports.get(transportId);
        if (!webSocket) return;

        webSocket[Symbol.dispose]();
        transports.delete(transportId);
      }, disposalDelayMs);
      disposalTimeouts.set(transportId, timeoutId);
    };

    /**
     * Checks if an owner is assigned to at least one transport.
     *
     * NOTE: This is O(transports) which is fast enough for typical usage (few
     * transports, early break on first match). If needed, we can optimize it.
     */
    const hasOwnerAnyTransport = (ownerId: OwnerId): boolean => {
      for (const [, ownerIdRefCounts] of transportOwnerIdRefCounts) {
        if (ownerIdRefCounts.has(ownerId)) return true;
      }
      return false;
    };

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

        // If no transports available, owner cannot be used.
        if (transportsToUse.length === 0) return;

        if (use) {
          // Store owner data (last added owner for this ID)
          ownersById.set(owner.id, owner);

          // Add owner to each transport and increment reference count
          for (const transportConfig of transportsToUse) {
            const transportId = createTransportId(transportConfig);

            let ownerIdRefCounts = transportOwnerIdRefCounts.get(transportId);
            if (!ownerIdRefCounts) {
              ownerIdRefCounts = new Map<OwnerId, PositiveInt>();
              transportOwnerIdRefCounts.set(transportId, ownerIdRefCounts);

              const timeoutId = disposalTimeouts.get(transportId);
              if (timeoutId) {
                clearTimeout(timeoutId);
                disposalTimeouts.delete(transportId);
              }

              if (!transports.has(transportId)) {
                const webSocket = deps.createWebSocket(transportConfig.url, {
                  binaryType: "arraybuffer",
                  onOpen: handleWebSocketOpen(transportId),
                  onMessage: handleWebSocketMessage(transportId),
                });
                transports.set(transportId, webSocket);
              }
            }

            const currentRefCount = ownerIdRefCounts.get(owner.id) ?? 0;
            ownerIdRefCounts.set(
              owner.id,
              PositiveInt.fromOrThrow(currentRefCount + 1),
            );
          }
        } else {
          for (const transportConfig of transportsToUse) {
            const transportId = createTransportId(transportConfig);
            const ownerIdRefCounts = transportOwnerIdRefCounts.get(transportId);

            assert(
              ownerIdRefCounts,
              `Transport ${transportId} should exist when removing owner ${owner.id}`,
            );

            const currentRefCount = ownerIdRefCounts.get(owner.id) ?? 0;

            if (currentRefCount <= 1) {
              ownerIdRefCounts.delete(owner.id);
              if (ownerIdRefCounts.size === 0) {
                transportOwnerIdRefCounts.delete(transportId);
                scheduleTransportDisposal(transportId);
              }
            } else {
              ownerIdRefCounts.set(
                owner.id,
                PositiveInt.fromOrThrow(currentRefCount - 1),
              );
            }
          }

          if (!hasOwnerAnyTransport(owner.id)) {
            ownersById.delete(owner.id);
          }
        }
      },

      getOwner: (ownerId) => {
        if (isDisposed || !hasOwnerAnyTransport(ownerId)) return null;
        return ownersById.get(ownerId) ?? null;
      },

      send: (ownerId, message) => {
        if (isDisposed) {
          deps.console.warn("[sync]", "send called on disposed Sync instance", {
            ownerId,
            message,
          });
          return;
        }

        const owner = ownersById.get(ownerId);
        if (!owner) return;

        const transportsToUse = owner.transports ?? config.transports;

        // Send message to all transports for this owner
        for (const transportConfig of transportsToUse) {
          const transportId = createTransportId(transportConfig);
          const webSocket = transports.get(transportId);
          if (!webSocket) continue;
          deps.console.log("[sync]", "send", { transportId, message });
          // Ignore send errors - WebSocket auto-reconnection handles retry
          void webSocket.send(message);
        }
      },

      [Symbol.dispose]: () => {
        if (isDisposed) return;
        isDisposed = true;

        for (const timeoutId of disposalTimeouts.values()) {
          clearTimeout(timeoutId);
        }
        disposalTimeouts.clear();

        for (const webSocket of transports.values()) {
          webSocket[Symbol.dispose]();
        }
        transports.clear();

        transportOwnerIdRefCounts.clear();
        ownersById.clear();
      },
    };

    return sync;
  };

/** Unique identifier for a transport configuration used for deduplication. */
const TransportId = brand("TransportId", String);
type TransportId = typeof TransportId.Type;

/** Creates a unique identifier for a transport configuration. */
const createTransportId = (transportConfig: TransportConfig): TransportId => {
  return `ws:${transportConfig.url}` as TransportId;
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
