import { createConsoleWithTime } from "@evolu/common";
import { createNodeJsRelay } from "@evolu/nodejs";
import { mkdirSync } from "fs";
import { once } from "node:events";

const deps = {
  console: createConsoleWithTime(),
};

// Ensure the database is created in a predictable location for Docker.
mkdirSync("data", { recursive: true });
process.chdir("data");

const relay = await createNodeJsRelay(deps)({
  port: 4000,
  enableLogging: true,
});

deps.console.log("Relay server started on port 4000");

await Promise.race([
  once(process, "SIGINT"), // Ctrl-C
  once(process, "SIGTERM"), // OS/k8s/etc requested termination
]);

deps.console.log("Shutting down relay server");
relay[Symbol.dispose]();
