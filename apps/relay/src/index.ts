import { createConsole } from "@evolu/common";
import { createNodeJsRelay } from "@evolu/nodejs";
import { mkdirSync } from "fs";

const deps = {
  console: createConsole(),
};

// Ensure the database is created in a predictable location for Docker.
mkdirSync("data", { recursive: true });
process.chdir("data");

const relay = await createNodeJsRelay(deps)({
  port: 4000,
  enableLogging: false,
});

process.on("SIGINT", relay[Symbol.dispose]);
process.on("SIGTERM", relay[Symbol.dispose]);
