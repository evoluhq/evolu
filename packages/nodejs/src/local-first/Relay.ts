import {
  assert,
  createRandom,
  createRelation,
  createSqlite,
  type CreateSqliteDriverDep,
  daemon,
  Name,
  ok,
  OwnerId,
  type RandomDep,
  type Task,
  type TimingSafeEqualDep,
  tryAsync,
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
import { once } from "events";
import { existsSync } from "fs";
import { createServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { createTimingSafeEqual } from "../Crypto.ts";
import { createBetterSqliteDriver } from "../Sqlite.ts";

export interface NodeJsRelayConfig extends RelayConfig {
  /** The port number for the HTTP server. */
  readonly port?: number;
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
 * ### Example
 *
 * ```ts
 * // Ensure the database is created in a predictable location for Docker.
 * mkdirSync("data", { recursive: true });
 * process.chdir("data");
 *
 * const console = createConsole({
 *   // level: "debug",
 *   formatter: createConsoleFormatter()({
 *     timestampFormat: "relative",
 *   }),
 * });
 *
 * const deps = { ...createRelayDeps(), console };
 *
 * await runMain(deps)(
 *   createRelay({
 *     port: 4000,
 *
 *     // Note: Relay requires URL in format ws://host:port?ownerId=<ownerId>
 *     // isOwnerAllowed: (_ownerId, { signal: _signal }) => true,
 *
 *     isOwnerWithinQuota: (_ownerId, requiredBytes) => {
 *       const maxBytes = 1024 * 1024; // 1MB
 *       return requiredBytes <= maxBytes;
 *     },
 *   }),
 * );
 * ```
 */
export const createRelay =
  ({
    port = 443,
    name = Name.orThrow("evolu-relay"),
    isOwnerAllowed,
    isOwnerWithinQuota,
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

    const server = disposer.use(createServer());
    server.once("close", () => {
      console.info("HTTP server closed");
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
        daemon(
          async (run) =>
            await tryAsync(
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
          const response = await relayRun.abortable(
            applyProtocolMessageAsRelay(message, options),
          );

          if (!response.ok) {
            if (response.error.type === "AbortError") return;
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

    disposer.defer(() => {
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1000, "Evolu Relay shutting down");
        }
      }
    });

    server.listen(port);
    await once(server, "listening");

    const address = server.address();
    assert(address && typeof address !== "string", "Expected TCP address");

    const disposables = disposer.move();

    console.info(`Started on port ${address.port}`);

    return ok({
      port: address.port,
      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    });
  };

const HttpStatusTextByCode = {
  400: "Bad Request",
  401: "Unauthorized",
  503: "Service Unavailable",
} as const;
