import { isServer } from "../src/Platform.js";

declare module "vitest/browser" {
  interface BrowserCommands {
    startWsServer: () => Promise<number>;
    stopWsServer: (port: number) => Promise<void>;
  }
}

export const startTestWebSocketServer = async (): Promise<number> => {
  if (isServer) {
    const { createServer } = await import("./_webSocketTestServer.js");
    return createServer();
  }

  const { commands } = await import("vitest/browser");
  return commands.startWsServer();
};

export const stopTestWebSocketServer = async (port: number): Promise<void> => {
  if (isServer) {
    const { closeServer } = await import("./_webSocketTestServer.js");
    await closeServer(port);
    return;
  }

  const { commands } = await import("vitest/browser");
  await commands.stopWsServer(port);
};
