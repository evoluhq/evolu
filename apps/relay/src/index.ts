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

  // Click to `isOwnerAllowed` to read the docs.
  // isOwnerAllowed: (_ownerId) => true,

  // Click to `isOwnerWithinQuota` to read the docs.
  // isOwnerWithinQuota: (ownerId, requiredBytes) => {
  //   console.log(ownerId, requiredBytes);
  //   // Check error via evolu.subscribeError
  //   return true;
  // },
});

if (relay.ok) {
  process.once("SIGINT", relay.value[Symbol.dispose]);
  process.once("SIGTERM", relay.value[Symbol.dispose]);
} else {
  // eslint-disable-next-line no-console
  console.error(relay.error);
}
