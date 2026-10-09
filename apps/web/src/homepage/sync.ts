import {
  AppName,
  createAppOwner,
  createEvolu,
  createOwnerSecret,
  createRandomBytes,
  NonEmptyTrimmedString100,
} from "@evolu/common";
import { createEvoluDeps, createRun } from "@evolu/web";
import { Schema, todosQuery } from "./data.ts";

// First run only: create the owner's secret on this device and store it
// securely. Every key, including the local database's, is derived from it.
const appOwner = createAppOwner(
  createOwnerSecret({ randomBytes: createRandomBytes() }),
);

const run = createRun(createEvoluDeps());

const evolu = await run.ok(
  createEvolu(Schema, {
    appName: AppName.orThrow("todos"),
    appOwner,
    // Sync through one relay, several, or none.
    transports: [
      { type: "WebSocket", url: "wss://relay.example.com" },
      { type: "WebSocket", url: "wss://free.evoluhq.com" },
    ],
  }),
);

// Writes go to SQLite on this device, so they work offline.
evolu.insert("todo", { title: NonEmptyTrimmedString100.orThrow("Buy milk") });

// Load the rows, then get notified when local or synced changes affect them.
console.log(await evolu.loadQuery(todosQuery));
evolu.subscribeQuery(todosQuery)(() => {
  console.log(evolu.getQueryRows(todosQuery));
});
