import {
  ConsoleDep,
  createManyToManyMap,
  createRandom,
  createSqlite,
  CreateSqliteDriverDep,
  ok,
  OwnerId,
  RandomDep,
  Result,
  SimpleName,
  SqliteError,
  TimingSafeEqualDep,
  Uint8Array,
} from "@evolu/common";
import {
  applyProtocolMessageAsRelay,
  ApplyProtocolMessageAsRelayOptions,
  createRelayLogger,
  createRelaySqliteStorage,
  defaultProtocolMessageMaxSize,
  parseOwnerIdFromOwnerWebSocketTransportUrl,
  Relay,
  RelayConfig,
} from "@evolu/common/evolu";
import { createServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { createBetterSqliteDriver } from "../BetterSqliteDriver.js";
import { createTimingSafeEqual } from "../Crypto.js";

export interface NodeJsRelayConfig extends RelayConfig {
  /** The port number for the HTTP server. */
  readonly port?: number;
}

/**
 * Creates an Evolu relay server.
 *
 * This implementation uses Node.js and better-sqlite3. Additional relay
 * implementations will be provided for other platforms (Bun, Deno, Cloudflare
 * Workers, Vercel Edge, etc.).
 */
export const createNodeJsRelay =
  (deps: ConsoleDep) =>
  (config: NodeJsRelayConfig): Promise<Result<Relay, SqliteError>> =>
    createNodeJsRelayWithSqliteDriver({
      ...deps,
      createSqliteDriver: createBetterSqliteDriver,
    })(config);

/**
 * Creates an Evolu relay server with a custom SQLite driver.
 *
 * Use this when you need to provide a different SQLite driver implementation
 * (e.g., using alternative SQLite libraries).
 */
export const createNodeJsRelayWithSqliteDriver =
  (deps: ConsoleDep & CreateSqliteDriverDep) =>
  (config: NodeJsRelayConfig): Promise<Result<Relay, SqliteError>> =>
    createNodeJsRelayWithDeps({
      ...deps,
      random: createRandom(),
      timingSafeEqual: createTimingSafeEqual(),
    })(config);

const createNodeJsRelayWithDeps =
  (deps: ConsoleDep & CreateSqliteDriverDep & RandomDep & TimingSafeEqualDep) =>
  async ({
    port = 443,
    name = SimpleName.orThrow("evolu-relay"),
    enableLogging = false,
    authenticateOwner,
  }: NodeJsRelayConfig): Promise<Result<Relay, SqliteError>> => {
    const log = createRelayLogger(deps);
    log.started(enableLogging, port);

    const sqliteResult = await createSqlite(deps)(name);
    if (!sqliteResult.ok) return sqliteResult;
    const sqlite = sqliteResult.value;

    const storageResult = createRelaySqliteStorage({ ...deps, sqlite })({
      onStorageError: log.storageError,
    });

    if (!storageResult.ok) return storageResult;
    const storage = storageResult.value;

    const server = createServer();
    const wss = new WebSocketServer({
      maxPayload: defaultProtocolMessageMaxSize,
      noServer: true,
    });

    const ownerSocketsMap = createManyToManyMap<OwnerId, WebSocket>();

    server.on("upgrade", (request, socket, head) => {
      socket.on("error", log.upgradeSocketError);

      const completeUpgrade = () => {
        socket.removeListener("error", log.upgradeSocketError);
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      };

      if (!authenticateOwner) {
        completeUpgrade();
        return;
      }

      const ownerId = parseOwnerIdFromOwnerWebSocketTransportUrl(
        request.url ?? "",
      );
      if (!ownerId) {
        log.invalidOrMissingOwnerIdInUrl(request.url);
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }

      authenticateOwner(ownerId)
        .then((isAuthenticated) => {
          if (!isAuthenticated) {
            log.unauthorizedOwner(ownerId);
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
          }
          completeUpgrade();
        })
        .catch((error: unknown) => {
          log.authenticateOwnerError(error);
          socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
          socket.destroy();
        });
    });

    wss.on("connection", (ws) => {
      log.connectionEstablished(wss.clients.size);

      ws.on("error", (error) => {
        log.connectionWebSocketError(error);
      });

      const options: ApplyProtocolMessageAsRelayOptions = {
        subscribe: (ownerId) => {
          ownerSocketsMap.add(ownerId, ws);
          log.relayOptionSubscribe(
            ownerId,
            () => ownerSocketsMap.getValues(ownerId)?.size ?? 0,
          );
        },

        unsubscribe: (ownerId) => {
          ownerSocketsMap.remove(ownerId, ws);
          log.relayOptionUnsubscribe(
            ownerId,
            () => ownerSocketsMap.getValues(ownerId)?.size ?? 0,
          );
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

          log.relayOptionBroadcast(ownerId, broadcastCount, sockets.size);
        },
      };

      ws.on("message", (message) => {
        if (!Uint8Array.is(message)) return;
        log.messageLength(message.length);

        applyProtocolMessageAsRelay({ storage })(message, options)
          .then((response) => {
            if (!response.ok) {
              log.applyProtocolMessageAsRelayError(response.error);
              return;
            }
            ws.send(response.value.message, { binary: true });
            log.responseLength(response.value.message.length);
          })
          .catch(log.applyProtocolMessageAsRelayUnknownError);
      });

      ws.on("close", () => {
        ownerSocketsMap.deleteValue(ws);
        log.connectionClosed(wss.clients.size);
      });
    });

    server.listen(port);

    const dispose = () => {
      log.shuttingDown();

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1000, "Evolu Relay shutting down");
        }
      });

      wss.close(() => {
        log.webSocketServerDisposed();
      });

      server.close(() => {
        log.httpServerDisposed();
      });
    };

    let isDisposed = false;

    const relay: Relay = {
      [Symbol.dispose]: () => {
        if (isDisposed) return;
        isDisposed = true;
        sqlite[Symbol.dispose]();
        dispose();
      },
    };

    return ok(relay);
  };
