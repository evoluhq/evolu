import { createNodeJsRelay } from "@evolu/nodejs";
import { mkdirSync } from "fs";
import { once } from "node:events";
import { logger } from "./logger.js";
import { CliParams } from "./params.js";

export async function startNodeJsRelay(options: CliParams): Promise<void> {
  // Ensure the database is created in a predictable location for Docker.
  mkdirSync("data", { recursive: true });
  process.chdir("data");

  if (options.enableLogging) {
    logger.enabled = true;
  }

  const relay = await createNodeJsRelay({ console: logger })({
    port: options.port,
    enableLogging: options.enableLogging,
    name: options.name,
  });

  await Promise.race([
    once(process, "SIGINT"), // Ctrl-C
    once(process, "SIGTERM"), // OS/k8s/etc requested termination
  ]);

  logger.enabled = true;
  logger.log("Shutting down relay server");
  relay[Symbol.dispose]();
}
