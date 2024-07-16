import { Config } from "./Config.js";
import { Owner } from "./Owner.js";

let syncTimeout: number | NodeJS.Timeout | undefined;
let lockTimeout: number | NodeJS.Timeout | undefined;
let socketTimeout: number | NodeJS.Timeout | undefined;
let isLocked = false;
const SocketTimeout = 3000;
const SyncTimeout = 500;
const SyncLockTimeout = 500;
let socket: WebSocket;

type ForceSyncMethod = ({
  refreshQueries,
}: {
  refreshQueries: boolean;
}) => () => void;

const processWebsocketEvent = (
  sync: ForceSyncMethod,
  event: MessageEvent<any>,
) => {
  if (typeof event.data === "string" || isLocked === true) return;
  clearTimeout(syncTimeout);
  syncTimeout = undefined;
  syncTimeout = setTimeout(() => {
    isLocked = true;
    sync({ refreshQueries: true })();
    clearTimeout(syncTimeout);
    clearTimeout(lockTimeout);
    lockTimeout = setTimeout(() => {
      isLocked = false;
    }, SyncLockTimeout);
  }, SyncTimeout);
};

export const createSocket = (
  sync: ForceSyncMethod,
  config: Config,
  owner: Owner,
): WebSocket | undefined => {
  if (config.externalWebsocketConnection) {
    // Hook up to an external WebSocket connection
    config.externalWebsocketConnection.send(
      JSON.stringify({ message: "subscribe", channelId: owner.id }),
    );
    config.externalWebsocketConnection.addEventListener("message", (event) =>
      processWebsocketEvent(sync, event),
    );
    return config.externalWebsocketConnection;
  }

  if (config.enableWebsocketConnection) {
    // Create a WebSocket connection
    socket = new WebSocket(config.syncUrl?.replace("http", "ws"));
    // Handle incoming WebSocket messages
    socket.addEventListener("message", (event) =>
      processWebsocketEvent(sync, event),
    );

    // Handle WebSocket errors
    socket.onerror = (error) => {
      // eslint-disable-next-line no-console
      console.error("WebSocket error:", error);
    };

    // Handle WebSocket closure
    socket.onclose = () => {
      socketTimeout = setTimeout(
        () => createSocket(sync, config, owner),
        SocketTimeout,
      );
    };

    socket.onopen = () => {
      socket.send(
        JSON.stringify({ message: "subscribe", channelId: owner.id }),
      );
      clearTimeout(socketTimeout);
    };
    return socket;
  }
};
