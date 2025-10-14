#!/usr/bin/env node

import { Command, Option } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { logger } from "./logger.js";
import { startNodeJsRelay } from "./nodejs.js";
import { cliParams } from "./params.js";

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
