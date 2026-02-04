import { createConsole, createConsoleEntryFormatter } from "@evolu/common";
import { createRelayDeps, createRun, startRelay } from "@evolu/nodejs";
import { mkdirSync } from "fs";

// Ensure the database is created in a predictable location for Docker.
mkdirSync("data", { recursive: true });
process.chdir("data");

const console = createConsole({
  // level: "debug",
  formatEntry: createConsoleEntryFormatter()({
    timestampFormat: "relative",
  }),
});

const deps = { ...createRelayDeps(), console };

await using run = createRun(deps);
await using stack = run.stack();

await stack.use(
  startRelay({
    port: 4000,

    // Note: Relay requires URL in format ws://host:port/<ownerId>
    // isOwnerAllowed: (_ownerId) => true,

    isOwnerWithinQuota: (_ownerId, requiredBytes) => {
      const maxBytes = 1024 * 1024; // 1MB
      return requiredBytes <= maxBytes;
    },
  }),
);

await run.deps.shutdown;
