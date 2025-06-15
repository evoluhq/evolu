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
  protocolVersion,
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
      name = getOrThrow(SimpleName.from("evolu-relay")),
      enableLogging = false,
    } = config;

    deps.console.enabled = true;
    deps.console.log(`Evolu Relay started on port ${port}`);
    deps.console.enabled = enableLogging;

    const versionedName = getOrThrow(
      SimpleName.from(`${name}-${protocolVersion}`),
    );

    const sqlite = getOrThrow(
      await createSqlite({
        ...deps,
        createSqliteDriver: createBetterSqliteDriver,
      })(versionedName),
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
      ws.on("error", deps.console.error);

      const options: ApplyProtocolMessageAsRelayOptions = {
        subscribe: (ownerId) => {
          ownerSocketsMap.add(ownerId, ws);
        },
        broadcast: (ownerId, message) => {
          const sockets = ownerSocketsMap.getValues(ownerId)!;
          for (const socket of sockets) {
            if (socket !== ws && socket.readyState === WebSocket.OPEN) {
              socket.send(message, { binary: true });
            }
          }
        },
      };

      ws.on("message", (message) => {
        if (!Uint8Array.is(message)) return;

        const response = applyProtocolMessageAsRelay({ storage })(
          message,
          options,
        );

        if (!response.ok) {
          deps.console.warn(response.error.type);
          return;
        }

        if (response.value) {
          ws.send(response.value, { binary: true });
        }
      });

      ws.on("close", () => {
        ownerSocketsMap.deleteValue(ws);
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
