#!/usr/bin/env node

import {
  ByteSizeLiteral,
  byteSizeToByteLength,
  createConsole,
  createConsoleFormatter,
  env,
  optional,
  Port,
  PortFromString,
  withDefault,
} from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import { createRelay, createRelayDeps, runMain } from "@evolu/nodejs";
import { mkdirSync } from "node:fs";

installPolyfills();

/** Validated hosting and Evolu Relay environment settings. */
const RelayEnv = env({
  port: withDefault(optional(PortFromString), Port.orThrow(4000)),
  EVOLU_RELAY: {
    maxOwnerBytes: optional(ByteSizeLiteral),
  },
});

const deps = {
  ...createRelayDeps(),
  console: createConsole({
    // level: "debug",
    formatter: createConsoleFormatter()({
      timestampFormat: "relative",
    }),
  }),
};

await runMain(deps)((run) => {
  const config = RelayEnv.orThrow(process.env, { errors: "all" });
  const maxOwnerBytes =
    config.maxOwnerBytes === undefined
      ? undefined
      : byteSizeToByteLength(config.maxOwnerBytes);

  // Ensure the database is created in a predictable location for Docker.
  mkdirSync("data", { recursive: true });
  process.chdir("data");

  return run(
    createRelay({
      port: config.port,

      // Note: Relay requires URL in format ws://host:port/<ownerId>
      // isOwnerAllowed: (_ownerId) => true,

      isOwnerWithinQuota: (_ownerId, requiredBytes) =>
        maxOwnerBytes === undefined || requiredBytes <= maxOwnerBytes,
    }),
  );
});
