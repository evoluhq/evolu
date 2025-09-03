import {
  ConsoleDep,
  createManyToManyMap,
  createRandom,
  createSqlite,
  getOrThrow,
  OwnerId,
  SimpleName,
  Uint8Array,
} from "@evolu/common";
import {
  applyProtocolMessageAsRelay,
  ApplyProtocolMessageAsRelayOptions,
  createRelayStorage,
  maxProtocolMessageSize,
  Relay,
  RelayConfig,
  RelaySqliteStorageDeps,
} from "@evolu/common/evolu";
import { WebSocket, WebSocketServer } from "ws";
import { createBetterSqliteDriver } from "../BetterSqliteDriver.js";
import { createTimingSafeEqual } from "../Crypto.js";

export interface NodeJsRelayConfig extends RelayConfig {
  readonly port?: number;
}

export const createNodeJsRelay =
  (deps: ConsoleDep) =>
  async (config: NodeJsRelayConfig): Promise<Relay> => {
    const {
      port = 443,
      name = SimpleName.fromOrThrow("evolu-relay"),
      enableLogging = false,
    } = config;

    deps.console.enabled = true;
    deps.console.log(`Evolu Relay started on port ${port}`);
    deps.console.enabled = enableLogging;

    const sqlite = getOrThrow(
      await createSqlite({
        ...deps,
        createSqliteDriver: createBetterSqliteDriver,
      })(name),
    );

    const relaySqliteStorageDeps: RelaySqliteStorageDeps = {
      sqlite,
      random: createRandom(),
      timingSafeEqual: createTimingSafeEqual(),
    };

    const storage = getOrThrow(
      createRelayStorage(relaySqliteStorageDeps)({
        onStorageError: (error) => {
          deps.console.error("[relay]", "[storage]", error);
        },
      }),
    );

    const wss = new WebSocketServer({
      maxPayload: maxProtocolMessageSize,
      port,
    });

    const ownerSocketsMap = createManyToManyMap<OwnerId, WebSocket>();

    wss.on("connection", (ws) => {
      deps.console.log("[relay]", "connection", {
        clientCount: wss.clients.size,
      });

      ws.on("error", (error) => {
        deps.console.warn("[relay]", "error", { error });
        deps.console.error(error);
      });

      const options: ApplyProtocolMessageAsRelayOptions = {
        subscribe: (ownerId) => {
          ownerSocketsMap.add(ownerId, ws);
          deps.console.log("[relay]", "subscribe", {
            ownerId,
            subscriberCount: ownerSocketsMap.getValues(ownerId)?.size ?? 0,
          });
        },
        unsubscribe: (ownerId) => {
          ownerSocketsMap.remove(ownerId, ws);
          deps.console.log("[relay]", "unsubscribe", {
            ownerId,
            subscriberCount: ownerSocketsMap.getValues(ownerId)?.size ?? 0,
          });
        },
        broadcast: (ownerId, message) => {
          const sockets = ownerSocketsMap.getValues(ownerId);
          if (!sockets) return;

          let broadcastCount = 0;
          for (const socket of sockets) {
            if (socket !== ws && socket.readyState === WebSocket.OPEN) {
              socket.send(message, { binary: true });
              broadcastCount++;
            }
          }

          deps.console.log("[relay]", "broadcast", {
            ownerId,
            broadcastCount,
            totalSubscribers: sockets.size,
          });
        },
      };

      ws.on("message", (message) => {
        if (!Uint8Array.is(message)) return;

        deps.console.log("[relay]", "on message", {
          messageSize: message.length,
        });

        const response = applyProtocolMessageAsRelay({ storage })(
          message,
          options,
        );

        if (!response.ok) {
          deps.console.error("[relay]", "protocol error", response.error);
          deps.console.error(response.error);
          return;
        }

        ws.send(response.value.message, { binary: true });
        deps.console.log("[relay]", "response", {
          responseSize: response.value.message.length,
        });
      });

      ws.on("close", () => {
        ownerSocketsMap.deleteValue(ws);
        deps.console.log("[relay]", "close", {
          clientCount: wss.clients.size,
        });
      });
    });

    const disposeWss = () => {
      deps.console.log("Shutting down Evolu Relay...");

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1000, "Evolu Relay shutting down");
        }
      });

      wss.close(() => {
        deps.console.log("Evolu Relay disposed");
      });
    };

    let isDisposed = false;

    return {
      [Symbol.dispose]: () => {
        if (isDisposed) return;
        isDisposed = true;
        sqlite[Symbol.dispose]();
        disposeWss();
      },
    };
  };
