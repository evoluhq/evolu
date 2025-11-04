import { createConsole } from "@evolu/common";
import { createNodeJsRelay } from "@evolu/nodejs";
import { mkdirSync } from "fs";

// Ensure the database is created in a predictable location for Docker.
mkdirSync("data", { recursive: true });
process.chdir("data");

const relay = await createNodeJsRelay({
  console: createConsole(),
})({
  port: 4000,
  enableLogging: false,

  /**
   * ### Example
   *
   * ```ts
   * Evolu.createOwnerWebSocketTransport({
   *   url: "ws://localhost:4000",
   *   ownerId: "6jy_2F4RT5qqeLgJ14_dnQ" as Evolu.OwnerId,
   * });
   * ```
   */
  // authenticateOwner: (ownerId) => {
  //   return Promise.resolve(ownerId === "6jy_2F4RT5qqeLgJ14_dnQ");
  // },
});

if (relay.ok) {
  process.once("SIGINT", relay.value[Symbol.dispose]);
  process.once("SIGTERM", relay.value[Symbol.dispose]);
} else {
  // eslint-disable-next-line no-console
  console.error(relay.error);
}
