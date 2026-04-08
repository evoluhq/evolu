import { createServer } from "http";
import type { AddressInfo } from "net";
import { describe, expect, test } from "vitest";
import {
  testSendWebSocketUpgradeRequest,
  testSetupWebSocketUpgradeRequest,
} from "../src/index.js";

const websocketAccept = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";

describe("WebSocket test helpers", () => {
  test("testSetupWebSocketUpgradeRequest destroys the request on disposal", async () => {
    let req: { readonly destroyed: boolean } | undefined;

    {
      await using setup = testSetupWebSocketUpgradeRequest(1, "/");
      req = setup.req;
      expect(req.destroyed).toBe(false);
    }

    expect(req.destroyed).toBe(true);
  });

  test("testSendWebSocketUpgradeRequest rejects request errors", async () => {
    await expect(
      testSendWebSocketUpgradeRequest(1, "/"),
    ).rejects.toBeInstanceOf(Error);
  });

  test("testSendWebSocketUpgradeRequest resolves HTTP rejection responses", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(400);
      response.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const { port } = server.address() as AddressInfo;

    try {
      const response = await testSendWebSocketUpgradeRequest(port, "/");

      expect(response.statusCode).toBe(400);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  test("testSendWebSocketUpgradeRequest rejects successful upgrades", async () => {
    const server = createServer();
    let upgradedSocket: { destroy(): void } | undefined;

    server.on("upgrade", (_request, socket) => {
      upgradedSocket = socket;
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Connection: Upgrade\r\n" +
          "Upgrade: websocket\r\n" +
          `Sec-WebSocket-Accept: ${websocketAccept}\r\n\r\n`,
      );
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const { port } = server.address() as AddressInfo;

    try {
      await expect(testSendWebSocketUpgradeRequest(port, "/")).rejects.toThrow(
        "Expected HTTP upgrade rejection",
      );
    } finally {
      upgradedSocket?.destroy();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });
});
