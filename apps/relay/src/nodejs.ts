import { createNodeJsRelay } from "@evolu/nodejs";
import { mkdirSync } from "fs";
import { once } from "node:events";
import { logger } from "./logger.js";
import { CliParams } from "./params.js";

export async function startNodeJsRelay(options: CliParams): Promise<void> {
  if (!options.inMemory) {
    // Ensure the database directory exists
    mkdirSync("data", { recursive: true });
    process.chdir("data");
  }

  if (options.enableLogging) {
    logger.enabled = true;
  }

  const relay = await createNodeJsRelay({ console: logger })({
    port: options.port,
    enableLogging: options.enableLogging,
    memory: options.inMemory,
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
