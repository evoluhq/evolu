import { NonEmptyReadonlyArray } from "../Array.js";
import { ConsoleDep } from "../Console.js";
import { EncryptionKey } from "../Crypto.js";
import {
  OwnerId,
  WriteKey,
  ShardOwner,
  SharedOwner,
  SharedReadonlyOwner,
} from "./Owner.js";
import { ProtocolMessage } from "./Protocol.js";
import { Millis } from "./Timestamp.js";
import { TransportConfig } from "./Transport.js";

export interface Sync {
  readonly send: (message: ProtocolMessage) => void;

  readonly getOwner: (ownerId: OwnerId) => SyncOwner | null;

  readonly addOwner: (owner: SyncOwner) => void;

  readonly removeOwner: (owner: SyncOwner) => void;
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

export interface SyncDep {
  readonly sync: Sync;
}

export interface SyncConfig {
  readonly onOpen: (
    ownerIds: NonEmptyReadonlyArray<OwnerId>,
    send: Sync["send"],
  ) => void;

  readonly onMessage: (message: Uint8Array, send: Sync["send"]) => void;
}

export const createSync =
  (_deps: ConsoleDep) =>
  (_config: SyncConfig): Sync => {
    return {
      send: (message) => {
        // eslint-disable-next-line no-console
        console.log(message);
      },

      getOwner: () => {
        throw new Error("todo");
      },

      addOwner: (_owner) => {
        // throw new Error("todo");
      },

      removeOwner: (_owner) => {
        // throw new Error("todo");
      },
    };
  };

// // tohle je spatne
// export const createWebSocketSync: CreateSync = (_deps) => (config) => {
//   const webSocketTransports = config.transports;

//   const sockets = new Map<string, ReturnType<typeof createWebSocket>>();

//   const sync: Sync = {
//     send: (message) => {
//       /**
//        * Evolu don't need an in-memory queue; apps can be offline for a long
//        * time, and mutations are stored in SQLite. Dropped CRDT messages are
//        * synced when the web socket connection is open.
//        *
//        * Send the message to all connected WebSocket transports simultaneously.
//        */
//       for (const socket of sockets.values()) {
//         if (socket.getReadyState() === "open") {
//           socket.send(message);
//         }
//       }
//     },
//   };

//   for (const transport of webSocketTransports) {
//     const socket = createWebSocket(transport.url, {
//       binaryType: "arraybuffer",
//       onOpen: () => {
//         // console.log("sync onOpen");
//         config.onOpen(sync.send);
//       },
//       onMessage: (data) => {
//         if (data instanceof ArrayBuffer) {
//           const messages = new Uint8Array(data);
//           config.onMessage(messages, sync.send);
//         }
//       },
//     });

//     sockets.set(transport.url, socket);
//   }

//   return sync;
// };

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
