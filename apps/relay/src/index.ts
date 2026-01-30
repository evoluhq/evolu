import {
  createConsole,
  createConsoleEntryFormatter,
  createTime,
  ok,
} from "@evolu/common";
import {
  createBetterSqliteDriver,
  createNodeJsRelay,
  createTimingSafeEqual,
  runMain,
} from "@evolu/nodejs";
import { mkdirSync } from "fs";

// Ensure the database is created in a predictable location for Docker.
mkdirSync("data", { recursive: true });
process.chdir("data");

const console = createConsole({
  formatEntry: createConsoleEntryFormatter({ time: createTime() })({
    timestampFormat: "relative",
  }),
});

const deps = {
  console,
  createSqliteDriver: createBetterSqliteDriver,
  timingSafeEqual: createTimingSafeEqual(),
};

runMain(deps)(async (run) => {
  await using stack = run.stack();

  const relay = await stack.use(
    createNodeJsRelay({
      port: 4000,

      // Note: Relay requires URL in format ws://host:port/<ownerId>
      // isOwnerAllowed: (_ownerId) => true,

      isOwnerWithinQuota: (_ownerId, requiredBytes) => {
        const maxBytes = 1024 * 1024; // 1MB
        return requiredBytes <= maxBytes;
      },
    }),
  );

  if (!relay.ok) {
    run.console.error(relay.error);
    return ok();
  }

  return ok(stack.move());
});
