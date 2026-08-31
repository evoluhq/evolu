import { createServer } from "http";
import type { AddressInfo } from "net";
import { describe, it } from "node:test";
import {
  assertEqual,
  assertFalse,
  assertRejectsInstanceOf,
  assertTrue,
} from "../../../../packages/common/src/Assert.ts";
import {
  testSendWebSocketUpgradeRequest,
  testSetupWebSocketUpgradeRequest,
} from "../../../../packages/nodejs/src/WebSocket.ts";

const websocketAccept = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";

describe("WebSocket test helpers", () => {
  it("testSetupWebSocketUpgradeRequest destroys the request on disposal", async () => {
    let req: { readonly destroyed: boolean } | undefined;

    {
      await using setup = testSetupWebSocketUpgradeRequest(1, "/");
      req = setup.req;
      assertFalse(req.destroyed);
    }

    assertTrue(req.destroyed);
  });

  it("testSendWebSocketUpgradeRequest rejects request errors", async () => {
    await assertRejectsInstanceOf(
      testSendWebSocketUpgradeRequest(1, "/"),
      Error,
    );
  });

  it("testSendWebSocketUpgradeRequest resolves HTTP rejection responses", async () => {
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

      assertEqual(response.statusCode, 400);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it("testSendWebSocketUpgradeRequest rejects successful upgrades", async () => {
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
      const error = await assertRejectsInstanceOf(
        testSendWebSocketUpgradeRequest(port, "/"),
        Error,
      );
      assertEqual(error.message, "Expected HTTP upgrade rejection");
    } finally {
      upgradedSocket?.destroy();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });
});
