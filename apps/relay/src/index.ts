import { createConsole } from "@evolu/common";
import { createNodeJsRelay } from "@evolu/nodejs";
import { mkdirSync } from "fs";
import { once } from "node:events";

// Ensure the database is created in a predictable location for Docker.
mkdirSync("data", { recursive: true });
process.chdir("data");

const deps = {
  console: createConsole(),
};

const relay = await createNodeJsRelay(deps)({
  port: 4000,
  enableLogging: false,

  // Note: Relay requires URL in format ws://host:port/<ownerId>
  // isOwnerAllowed: (_ownerId) => true,

  isOwnerWithinQuota: (_ownerId, requiredBytes) => {
    const maxBytes = 1024 * 1024; // 1MB
    return requiredBytes <= maxBytes;
  },
});

if (!relay.ok) {
  deps.console.error(relay.error);
} else {
  // The `using` declaration ensures `relay.value[Symbol.dispose]()` is called
  // automatically when the block exits.
  using _ = relay.value;
  await Promise.race([once(process, "SIGINT"), once(process, "SIGTERM")]);
}
