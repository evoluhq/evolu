import { request, type ClientRequest, type IncomingMessage } from "http";

/**
 * A raw WebSocket upgrade request prepared for tests by
 * {@link testSetupWebSocketUpgradeRequest}.
 */
export interface TestSetupWebSocketUpgradeRequest extends AsyncDisposable {
  readonly req: ClientRequest;
}

/**
 * Creates a raw WebSocket upgrade request test setup for tests that need manual
 * request control.
 */
export const testSetupWebSocketUpgradeRequest = (
  port: number,
  path: string,
): TestSetupWebSocketUpgradeRequest => {
  const req = createWebSocketUpgradeRequest(port, path);
  req.on("error", () => undefined);

  return {
    req,
    [Symbol.asyncDispose]: () => {
      req.destroy();
      return Promise.resolve();
    },
  };
};

/**
 * Sends a raw WebSocket upgrade request and resolves with the rejection
 * response.
 */
export const testSendWebSocketUpgradeRequest = async (
  port: number,
  path: string,
): Promise<IncomingMessage> => {
  const req = createWebSocketUpgradeRequest(port, path);

  return new Promise((resolve, reject) => {
    req.once("response", (response) => {
      response.resume();
      resolve(response);
    });
    req.once("upgrade", (_response, socket) => {
      socket.destroy();
      reject(new Error("Expected HTTP upgrade rejection"));
    });
    req.once("error", reject);
    req.end();
  });
};

const createWebSocketUpgradeRequest = (
  port: number,
  path: string,
): ClientRequest =>
  request({
    host: "127.0.0.1",
    port,
    path,
    headers: {
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  });
