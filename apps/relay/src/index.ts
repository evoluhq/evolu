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

  // Note: Relay requires URL in format ws://host:port/<ownerId>
  // isOwnerAllowed: (_ownerId) => true,

  isOwnerWithinQuota: (_ownerId, requiredBytes) => {
    const maxBytes = 1024 * 1024; // 1MB
    return requiredBytes <= maxBytes;
  },
});

if (relay.ok) {
  process.once("SIGINT", relay.value[Symbol.dispose]);
  process.once("SIGTERM", relay.value[Symbol.dispose]);
} else {
  // eslint-disable-next-line no-console
  console.error(relay.error);
}
