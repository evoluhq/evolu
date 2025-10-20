#!/usr/bin/env node

import { Command, Option } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { logger } from "./logger.js";
import { startNodeJsRelay } from "./nodejs.js";
import { cliParams } from "./params.js";

/**
 * Main entry point for the Evolu Relay CLI application.
 *
 * Sets up the command-line interface using Commander.js and handles the "start"
 * command to launch the Evolu Relay server with configurable options.
 *
 * @example
 *   ```bash
 *   # Start relay with default settings
 *   @evolu/relay start
 *
 *   # Start relay on custom port with logging enabled
 *   @evolu/relay start --port 3000 --enable-logging
 *
 *   # Start relay with custom database name
 *   @evolu/relay start --name my-relay-db
 *   ```;
 */
function main() {
  const program = new Command()
    .name("@evolu/relay")
    .description("Evolu Relay server")
    .version(
      packageJson.version || "1.0.0",
      "-v, --version",
      "display the version number",
    );

  program
    .command("start")
    .description("start the relay server")
    .addOption(
      new Option("-n, --name <name>", "database name").default("evolu-relay"),
    )
    .addOption(
      new Option("-l, --enable-logging", "enable logging").default(false),
    )
    .addOption(
      new Option("-p, --port <number>", "port to listen on")
        .default(4000)
        .argParser(Number),
    )
    // .addOption(
    //   new Option("--platform <platform>", "platform")
    //     .choices(["nodejs", "bun"])
    //     .default("nodejs"),
    // )
    .action(async (options: unknown) => {
      logger.enabled = true;
      const params = cliParams.fromUnknown(options);
      logger.log("Evolu Relay version:", packageJson.version);

      if (!params.ok) {
        logger.error(params.error.reason);
        process.exit(1);
      }

      try {
        await startNodeJsRelay(params.value);
      } catch (error: unknown) {
        logger.error(error);
        process.exit(1);
      }
    });

  program.parse();
}

main();
