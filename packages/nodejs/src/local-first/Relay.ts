import {
  callback,
  createRandom,
  createRelation,
  createSqlite,
  type CreateSqliteDriverDep,
  isPromiseLike,
  Name,
  ok,
  OwnerId,
  type RandomDep,
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
import { createTimingSafeEqual } from "../Crypto.js";
import { createBetterSqliteDriver } from "../Sqlite.js";

export interface NodeJsRelayConfig extends RelayConfig {
  /** The port number for the HTTP server. */
  readonly port?: number;
}

export type RelayDeps = CreateSqliteDriverDep & RandomDep & TimingSafeEqualDep;

/** Dependencies for {@link startRelay} using better-sqlite3. */
export const createRelayDeps = (): RelayDeps => ({
  createSqliteDriver: createBetterSqliteDriver,
  random: createRandom(),
  timingSafeEqual: createTimingSafeEqual(),
});

/**
 * Starts an Evolu relay server using Node.js.
 *
 * Use {@link createRelayDeps} to create dependencies for better-sqlite3, or
 * provide a custom SQLite driver implementation.
 *
 * ### Example
 *
 * ```ts
 * const deps = { ...createRelayDeps(), console };
 *
 * await using run = createRun(deps);
 * await using stack = run.stack();
 *
 * await stack.use(startRelay({ port: 4000 }));
 *
 * await run.deps.shutdown;
 * ```
 */
export const startRelay =
  ({
    port = 443,
    name = Name.orThrow("evolu-relay"),
    isOwnerAllowed,
    isOwnerWithinQuota,
  }: NodeJsRelayConfig): Task<Relay, never, RelayDeps> =>
  async (run) => {
    await using stack = run.stack();
    const console = run.deps.console.child("relay");

    const dbFileExists = existsSync(`${name}.db`);

    const sqliteResult = await stack.use(createSqlite(name));
    if (!sqliteResult.ok) return sqliteResult;

    const deps = { ...run.deps, sqlite: sqliteResult.value };

    if (!dbFileExists) {
      createBaseSqliteStorageTables(deps);
      createRelayStorageTables(deps);
    }

    const runWithStorage = run.addDeps({
      storage: createRelaySqliteStorage(deps)({
        isOwnerWithinQuota,
      }),
    });

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
        const isAllowed = isPromiseLike(result) ? await result : result;
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
            ownerSocketRelation.bCountForA(ownerId),
          );
        },

        unsubscribe: (ownerId) => {
          ownerSocketRelation.remove(ownerId, ws);
          console.debug(
            "unsubscribe",
            ownerId,
            ownerSocketRelation.bCountForA(ownerId),
          );
        },

        broadcast: (ownerId, message) => {
          for (const socket of ownerSocketRelation.iterateB(ownerId)) {
            if (socket !== ws && socket.readyState === WebSocket.OPEN) {
              socket.send(message, { binary: true });
            }
          }

          console.debug(
            "broadcast",
            ownerId,
            ownerSocketRelation.bCountForA(ownerId),
          );
        },
      };

      ws.on("message", (message) => {
        if (!Uint8Array.is(message)) return;

        void (async () => {
          const response = await runWithStorage(
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
        ownerSocketRelation.removeByB(ws);
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
