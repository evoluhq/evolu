import { createConsole } from "@evolu/common";
import { createNodeJsRelay } from "@evolu/nodejs";

const deps = {
  console: createConsole(),
};

const relay = await createNodeJsRelay(deps)({
  port: 4000,
  enableLogging: false,
});

process.on("SIGINT", relay[Symbol.dispose]);
process.on("SIGTERM", relay[Symbol.dispose]);
