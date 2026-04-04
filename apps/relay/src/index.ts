import { createConsole, createConsoleFormatter } from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import { createRelayDeps, createRun, startRelay } from "@evolu/nodejs";
import { mkdirSync } from "fs";

installPolyfills();

// Ensure the database is created in a predictable location for Docker.
mkdirSync("data", { recursive: true });
process.chdir("data");

const console = createConsole({
  // level: "debug",
  formatter: createConsoleFormatter()({
    timestampFormat: "relative",
  }),
});

const deps = { ...createRelayDeps(), console };

await using run = createRun(deps);
await using stack = new AsyncDisposableStack();

stack.use(
  await run.orThrow(
    startRelay({
      port: 4000,

      // Note: Relay requires URL in format ws://host:port/<ownerId>
      // isOwnerAllowed: (_ownerId) => true,

      isOwnerWithinQuota: (_ownerId, requiredBytes) => {
        const maxBytes = 1024 * 1024; // 1MB
        return requiredBytes <= maxBytes;
      },
    }),
  ),
);

await run.deps.shutdown;
