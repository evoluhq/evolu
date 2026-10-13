import {
  assert,
  callback,
  createRandom,
  createRelation,
  createSqlite,
  type CreateSqliteDriverDep,
  daemon,
  type Name,
  ok,
  OwnerId,
  type Port,
  type PositiveDuration,
  type RandomDep,
  type Task,
  type TimeoutId,
  type TimingSafeEqualDep,
  sql,
  tryAsync,
  trySync,
  Uint8Array,
  yieldNow,
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
  type StorageDep,
} from "@evolu/common/local-first";
import { once } from "events";
import { existsSync } from "fs";
import { createServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { createTimingSafeEqual } from "../Crypto.ts";
import { createBetterSqliteDriver } from "../Sqlite.ts";

export interface NodeJsRelayConfig extends RelayConfig {
  /**
   * The HTTP server's {@link Port}. Zero requests an automatically assigned
   * port.
   */
  readonly port?: Port;

  /**
   * How often the relay pings every connection with a WebSocket ping frame,
   * which browsers answer automatically. A connection from which nothing has
   * arrived since the previous ping is terminated, so an idle dead path is
   * detected within two intervals. Any incoming data counts, so a slow upload
   * that delays the answer keeps its connection. A connection with data still
   * queued in the relay for it, such as a large reply on a slow link, is not
   * pinged or terminated until the operating system takes the data, because the
   * answer waits behind it; TCP ends such a connection if its path is dead. Nor
   * is a connection whose requests the relay is serving, because it does not
   * read the connection meanwhile; it is pinged again once they are served. A
   * connection is terminated instead of queuing a broadcast that would leave
   * more than 16 MB of broadcasts unsent to it, whether its client stopped
   * reading or reads more slowly than its owners' traffic arrives; the client
   * reconciles after it reconnects. Replies to a client's own requests do not
   * count, because the relay writes them one at a time; see {@link createRelay}.
   * Data the operating system already holds still delays the answer, so a link
   * too slow to send it within an interval reconnects once, after the data
   * ahead of the ping arrives. The traffic also keeps NAT mappings alive.
   * Defaults to thirty seconds.
   */
  readonly pingInterval?: PositiveDuration;
}

export type RelayDeps = CreateSqliteDriverDep & RandomDep & TimingSafeEqualDep;

/** Dependencies for {@link createRelay} using better-sqlite3. */
export const createRelayDeps = (): RelayDeps => ({
  createSqliteDriver: createBetterSqliteDriver,
  random: createRandom(),
  timingSafeEqual: createTimingSafeEqual(),
});

/**
 * Creates an Evolu Relay server resource using Node.js.
 *
 * Use {@link createRelayDeps} to create dependencies for better-sqlite3, or
 * provide a custom SQLite driver implementation.
 *
 * The relay serves each connection's requests one at a time, in order, and
 * serves other connections between them. It does not read a connection while
 * its requests wait, and it serves a request only after the previous reply is
 * written to the connection, so a client that sends requests faster than it
 * reads the replies is slowed down instead of growing the relay's memory. A
 * request waiting for an asynchronous `isOwnerWithinQuota` holds the later
 * requests of its connection, which the relay meanwhile neither reads nor
 * pings, so the callback should settle quickly. One answer makes a bounded
 * number of storage reads, so one request holds the relay only briefly. Limit
 * connections per IP address in a reverse proxy in front of the relay.
 *
 * For uptime monitors and container health checks, the relay answers `GET` and
 * `HEAD` requests for `/health` with status 200 and `{"status":"ok"}` while its
 * database file can be read, and with status 503 and `{"status":"error"}`
 * otherwise. Other plain HTTP requests get status 426, because the relay serves
 * only WebSocket connections.
 *
 * ### Example
 *
 * ```ts
 * import { assertType, Port, type Task } from "@evolu/common";
 * import type { Relay } from "@evolu/common/local-first";
 * import { createRelay, type RelayDeps } from "@evolu/nodejs";
 *
 * const main = createRelay({
 *   port: Port.orThrow(4000),
 *   isOwnerWithinQuota: (_ownerId, requiredBytes) =>
 *     requiredBytes <= 1024 * 1024,
 * });
 *
 * assertType<typeof main, Task<Relay, never, RelayDeps>>();
 * ```
 */
export const createRelay =
  ({
    port = 443 as Port,
    name = "evolu-relay" as Name,
    isOwnerAllowed,
    isOwnerWithinQuota,
    pingInterval = "30s",
  }: NodeJsRelayConfig): Task<Relay, never, RelayDeps> =>
  async (run) => {
    await using disposer = new AsyncDisposableStack();
    const console = run.deps.console.child("relay");

    const dbFileExists = existsSync(`${name}.db`);
    const sqlite = disposer.use(await run.ok(createSqlite(name)));
    const deps = { ...run.deps, sqlite };

    if (!dbFileExists) {
      createBaseSqliteStorageTables(deps);
      createRelayStorageTables(deps);
    }

    // Connections that sent anything since the previous ping, or connected
    // since.
    const activeSockets = new WeakSet<WebSocket>();
    // Broadcast bytes queued for each connection and not yet written to it.
    // Replies are not counted: their total follows the client's own requests.
    const unsentBroadcastBytesBySocket = new WeakMap<WebSocket, number>();
    let pingTimeoutId: TimeoutId | null = null;
    // Disposal closes the connections first and disposes relayRun while they
    // finish closing, so once it starts, handlers must not use relayRun.
    let isDisposing = false;

    const server = disposer.use(createServer());
    server.once("close", () => {
      console.info("HTTP server closed");
    });

    // Without this handler, a plain HTTP request would get no response.
    server.on("request", (request, response) => {
      const path = request.url?.split("?")[0];
      if (
        path === "/health" &&
        (request.method === "GET" || request.method === "HEAD")
      ) {
        // A running process is not enough; the database file must be
        // readable. Unlike `select 1`, reading the schema reads the file.
        const check = trySync(() =>
          sqlite.exec(sql`select count(*) from sqlite_schema;`),
        );
        if (!check.ok) console.error("health check failed", check.error);
        response.writeHead(check.ok ? 200 : 503, {
          "content-type": "application/json",
        });
        response.end(JSON.stringify({ status: check.ok ? "ok" : "error" }));
        return;
      }
      response.writeHead(426, { connection: "Upgrade", upgrade: "websocket" });
      response.end();
    });

    const wss = disposer.adopt(
      new WebSocketServer({
        maxPayload: defaultProtocolMessageMaxSize,
        noServer: true,
      }),
      (wss) =>
        new Promise<void>((resolve) => {
          wss.close(() => {
            console.info("WebSocketServer closed");
            resolve();
          });
        }),
    );

    const ownerSocketRelation = createRelation<OwnerId, WebSocket>();

    const storage = createRelaySqliteStorage(deps)({ isOwnerWithinQuota });
    const relayRun = disposer.use(run.create({ storage }));

    const pingClients = (): void => {
      for (const client of wss.clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        // A client cannot answer before it receives the data queued ahead of
        // the ping, such as a large reply on a slow link, and its answer is
        // not read while its requests are served. The relay cannot see that
        // data move, so it leaves the connection to TCP, which ends it if the
        // path is dead.
        if (client.bufferedAmount > 0 || client.isPaused) continue;
        if (!activeSockets.has(client)) {
          console.debug("terminating unresponsive connection");
          client.terminate();
          continue;
        }
        activeSockets.delete(client);
        client.ping();
      }
      pingTimeoutId = run.deps.time.setTimeout(pingClients, pingInterval);
    };
    pingTimeoutId = run.deps.time.setTimeout(pingClients, pingInterval);
    disposer.defer(() => {
      if (pingTimeoutId !== null) run.deps.time.clearTimeout(pingTimeoutId);
    });

    server.on("upgrade", (request, socket, head) => {
      socket.on("error", console.debug);

      // A connection accepted now would be neither served nor closed.
      if (isDisposing) {
        socket.destroy();
        return;
      }

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

      const respondAndDestroy = (
        statusCode: keyof typeof HttpStatusTextByCode,
      ) => {
        if (socket.destroyed) return;
        socket.write(
          `HTTP/1.1 ${statusCode} ${HttpStatusTextByCode[statusCode]}\r\n\r\n`,
        );
        socket.destroy();
      };

      const requestUrl = request.url;
      const ownerId = requestUrl
        ? parseOwnerIdFromOwnerWebSocketTransportUrl(requestUrl)
        : undefined;

      if (!ownerId) {
        console.debug("invalid or missing ownerId in URL", requestUrl);
        respondAndDestroy(400);
        return;
      }

      const authorizationFiber = relayRun.abortable(
        // Use daemon because authorization can call an external service that
        // ignores abort. The daemon runs in the root Run, so aborting the
        // current Run does not make its Fiber wait for the service Promise to
        // settle.
        daemon(async (run) =>
          tryAsync(
            () => isOwnerAllowed(ownerId, { signal: run.signal }),
            (error) => ({ type: "OwnerAuthorizationError", error }) as const,
          ),
        ),
      );

      const abortAuthorization = () => {
        authorizationFiber.abort({
          type: "WebSocketUpgradeSocketClosed",
        });
      };

      socket.once("close", abortAuthorization);
      socket.once("error", abortAuthorization);

      void (async () => {
        const result = await authorizationFiber;

        socket.removeListener("close", abortAuthorization);
        socket.removeListener("error", abortAuthorization);

        if (!result.ok) {
          if (result.error.type === "AbortError") {
            socket.destroy();
            return;
          }

          console.error(result.error.error);
          respondAndDestroy(503);
          return;
        }

        if (!result.value) {
          console.debug("unauthorized owner", ownerId);
          respondAndDestroy(401);
          return;
        }

        completeUpgrade();
      })();
    });

    wss.on("connection", (ws, request) => {
      console.debug("on connection", wss.clients.size);
      activeSockets.add(ws);
      // Any incoming bytes count, not only pongs: a client's pong waits
      // behind an upload it is still sending over a slow link.
      request.socket.on("data", () => {
        activeSockets.add(ws);
      });

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
            if (socket === ws || socket.readyState !== WebSocket.OPEN) continue;
            // A client that stopped reading would hold every broadcast for it
            // forever, and one reading more slowly than its owners' traffic
            // arrives never catches up. Either reconciles after it reconnects.
            const unsent =
              (unsentBroadcastBytesBySocket.get(socket) ?? 0) +
              message.byteLength;
            if (unsent > maxUnsentBroadcastBytes) {
              console.debug("terminating connection behind on broadcasts");
              socket.terminate();
              continue;
            }
            unsentBroadcastBytesBySocket.set(socket, unsent);
            socket.send(message, { binary: true }, () => {
              unsentBroadcastBytesBySocket.set(
                socket,
                (unsentBroadcastBytesBySocket.get(socket) ?? 0) -
                  message.byteLength,
              );
            });
          }

          console.debug(
            "broadcast",
            ownerId,
            ownerSocketRelation.bCountForA(ownerId),
          );
        },
      };

      // The connection's requests are served one at a time, in order, and the
      // connection is not read while they wait, so further requests wait in
      // TCP instead of in the relay. Each request first yields to the event
      // loop, so other connections are served between them, and waits until
      // the previous reply is written to the socket, so a client that stops
      // reading stops being served.
      const requests: Array<Uint8Array> = [];

      const serveRequests: Task<void, never, StorageDep> = async (run) => {
        try {
          while (requests.length > 0) {
            await run.ok(yieldNow);
            // A close during the yield empties the queue, so a request taken
            // before it would subscribe the closed connection again.
            const request = requests.shift();
            if (request === undefined) break;

            const response = await run.abortable(
              applyProtocolMessageAsRelay(request, options),
            );
            if (!response.ok) {
              if (response.error.type === "AbortError") break;
              console.error("invalid protocol request", {
                byteLength: request.length,
                error: response.error.error,
              });
              continue;
            }

            await run.ok(
              callback<void>(({ resolve }) => {
                ws.send(response.value.message, { binary: true }, () => {
                  resolve(ok());
                });
              }),
            );
          }
        } finally {
          ws.resume();
        }
        return ok();
      };

      ws.on("message", (message) => {
        if (isDisposing || !Uint8Array.is(message)) return;

        requests.push(message);
        // ws still emits the messages of the read it is parsing.
        if (ws.isPaused) return;
        ws.pause();
        void relayRun.abortable(serveRequests);
      });

      ws.on("close", () => {
        ownerSocketRelation.removeByB(ws);
        // A closed connection's replies have nowhere to go.
        requests.length = 0;
        console.debug("ws close", wss.clients.size);
      });

      // ws closes the connection itself after a frame it rejects, such as one
      // over maxPayload. Without a listener, the error would crash the relay.
      ws.on("error", console.debug);
    });

    disposer.defer(() => {
      isDisposing = true;
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1000, "Evolu Relay shutting down");
        }
      }
    });

    server.listen(port);
    await once(server, "listening");

    const address = server.address();
    assert(
      address !== null && typeof address !== "string",
      "Expected TCP address",
    );

    const disposables = disposer.move();

    console.info(`Started on port ${address.port}`);

    return ok({
      port: address.port,
      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    });
  };

/**
 * Broadcast bytes a connection can have queued and unsent before the relay
 * terminates it instead of queuing another, which bounds the memory a client
 * that stopped reading holds.
 */
const maxUnsentBroadcastBytes = 16 * defaultProtocolMessageMaxSize;

const HttpStatusTextByCode = {
  400: "Bad Request",
  401: "Unauthorized",
  503: "Service Unavailable",
} as const;
