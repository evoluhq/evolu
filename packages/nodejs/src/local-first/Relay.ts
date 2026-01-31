import {
  allResult,
  callback,
  createRandom,
  createRelation,
  createSqlite,
  type CreateSqliteDriverDep,
  isAsync,
  ok,
  OwnerId,
  type RandomDep,
  SimpleName,
  type SqliteError,
  type Task,
  type TimingSafeEqualDep,
  Uint8Array,
} from "@evolu/common";
import {
  applyProtocolMessageAsRelay,
  type ApplyProtocolMessageAsRelayOptions,
  createBaseSqliteStorageTables,
  createRelaySqliteStorage,
  createRelayStorageTables,
  defaultProtocolMessageMaxSize,
  parseOwnerIdFromOwnerWebSocketTransportUrl,
  type Relay,
  type RelayConfig,
} from "@evolu/common/local-first";
import { existsSync } from "fs";
import { createServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { createBetterSqliteDriver } from "../BetterSqliteDriver.js";
import { createTimingSafeEqual } from "../Crypto.js";

export interface NodeJsRelayConfig extends RelayConfig {
  /** The port number for the HTTP server. */
  readonly port?: number;
}

/** Dependencies for {@link createNodeJsRelay} using better-sqlite3. */
export const createNodeJsRelayBetterSqliteDeps = (): CreateSqliteDriverDep &
  RandomDep &
  TimingSafeEqualDep => ({
  createSqliteDriver: createBetterSqliteDriver,
  random: createRandom(),
  timingSafeEqual: createTimingSafeEqual(),
});

/**
 * Creates an Evolu relay server using Node.js.
 *
 * Use {@link createNodeJsRelayBetterSqliteDeps} to create dependencies for
 * better-sqlite3, or provide a custom SQLite driver implementation.
 *
 * ### Example
 *
 * ```ts
 * const deps = {
 *   console: createConsole(),
 *   ...createNodeJsRelayBetterSqliteDeps(),
 * };
 *
 * runMain(deps)(async (run) => {
 *   await using stack = run.stack();
 *
 *   const relay = await stack.use(createNodeJsRelay({ port: 4000 }));
 *   if (!relay.ok) {
 *     run.deps.console.error(relay.error);
 *     return ok();
 *   }
 *
 *   return ok(stack.move());
 * });
 * ```
 */
export const createNodeJsRelay =
  ({
    port = 443,
    name = SimpleName.orThrow("evolu-relay"),
    isOwnerAllowed,
    isOwnerWithinQuota,
  }: NodeJsRelayConfig): Task<
    Relay,
    SqliteError,
    CreateSqliteDriverDep & RandomDep & TimingSafeEqualDep
  > =>
  async (_run) => {
    await using stack = _run.stack();
    const console = _run.deps.console.child("relay");

    const dbFileExists = existsSync(`${name}.db`);

    const sqlite = await stack.use(createSqlite(name));
    if (!sqlite.ok) return sqlite;
    const deps = { ..._run.deps, sqlite: sqlite.value };

    if (!dbFileExists) {
      const result = allResult([
        createBaseSqliteStorageTables(deps),
        createRelayStorageTables(deps),
      ]);
      if (!result.ok) return result;
    }

    const storage = createRelaySqliteStorage(deps)({
      onStorageError: console.error,
      isOwnerWithinQuota,
    });

    const run = _run.addDeps({ storage });

    const server = createServer();
    const wss = new WebSocketServer({
      maxPayload: defaultProtocolMessageMaxSize,
      noServer: true,
    });
    const ownerSocketRelation = createRelation<OwnerId, WebSocket>();

    server.on("upgrade", (request, socket, head) => {
      socket.on("error", console.debug);

      const completeUpgrade = () => {
        socket.removeListener("error", console.debug);

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      };

      if (!isOwnerAllowed) {
        completeUpgrade();
        return;
      }

      const ownerId = parseOwnerIdFromOwnerWebSocketTransportUrl(
        request.url ?? "",
      );

      if (!ownerId) {
        console.debug("invalid or missing ownerId in URL", request.url);
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }

      void (async () => {
        const result = isOwnerAllowed(ownerId);
        const isAllowed = isAsync(result) ? await result : result;
        if (!isAllowed) {
          console.debug("unauthorized owner", ownerId);
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        completeUpgrade();
      })();
    });

    wss.on("connection", (ws) => {
      console.debug("on connection", wss.clients.size);

      const options: ApplyProtocolMessageAsRelayOptions = {
        subscribe: (ownerId) => {
          ownerSocketRelation.add(ownerId, ws);
          console.debug(
            "subscribe",
            ownerId,
            ownerSocketRelation.getB(ownerId)?.size ?? 0,
          );
        },

        unsubscribe: (ownerId) => {
          ownerSocketRelation.remove(ownerId, ws);
          console.debug(
            "unsubscribe",
            ownerId,
            ownerSocketRelation.getB(ownerId)?.size ?? 0,
          );
        },

        broadcast: (ownerId, message) => {
          const sockets = ownerSocketRelation.getB(ownerId);
          if (!sockets) return;

          let broadcastCount = 0;
          for (const socket of sockets) {
            if (socket !== ws && socket.readyState === WebSocket.OPEN) {
              socket.send(message, { binary: true });
              broadcastCount++;
            }
          }

          console.debug("broadcast", ownerId, broadcastCount, sockets.size);
        },
      };

      ws.on("message", (message) => {
        if (!Uint8Array.is(message)) return;

        void (async () => {
          const response = await run(
            applyProtocolMessageAsRelay(message, options),
          );
          if (!response.ok) {
            console.error(response);
            return;
          }
          ws.send(response.value.message, { binary: true });
        })();
      });

      ws.on("close", () => {
        ownerSocketRelation.deleteB(ws);
        console.debug("ws close", wss.clients.size);
      });
    });

    // Cleanup runs in LIFO order: clients → WebSocketServer → HTTP server
    stack.defer(() => {
      console.info("Shutdown complete");
      return ok();
    });

    stack.defer(
      callback(({ ok }) => {
        server.close(() => {
          console.info("HTTP server closed");
          ok();
        });
      }),
    );

    stack.defer(
      callback(({ ok }) => {
        // wss.close() emits 'close' when all clients have disconnected
        // https://github.com/websockets/ws/blob/master/doc/ws.md#serverclosecallback
        wss.close(() => {
          console.info("WebSocketServer closed");
          ok();
        });
      }),
    );

    stack.defer(
      callback(({ ok }) => {
        console.info("Shutting down...");
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.close(1000, "Evolu Relay shutting down");
          }
        }
        ok();
      }),
    );

    server.listen(port);
    console.info(`Started on port ${port}`);

    return ok(stack.move());
  };
