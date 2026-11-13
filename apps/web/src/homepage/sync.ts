import {
  AppName,
  createEvoluApp,
  NonEmptyTrimmedString100,
  sqliteTrue,
  WebSocketUrl,
} from "@evolu/common";
import { createEvoluDeps, createRun } from "@evolu/web";
import { AppSchema } from "./data.ts";

const run = createRun(createEvoluDeps());

const app = await run.orThrow(
  createEvoluApp(AppSchema, {
    appName: AppName.orThrow("todos"),
    auth: { type: "InstantStart" },
    // The first start creates the account and opens it.
    createFirstAppOwner: true,
    // Sync through one relay, several, or none.
    transports: [
      {
        type: "WebSocket",
        url: WebSocketUrl.orThrow("wss://relay.example.com/"),
      },
    ],
  }),
);

// The first start opens the AppOwner it created. A later start opens none if
// the user has removed them all.
const current = app.current.get();
if (current) {
  const evolu = await current.evolu;

  // Writes go to SQLite on this device, so they work offline, and sync through
  // the relays.
  const { id } = evolu.insert("todo", {
    title: NonEmptyTrimmedString100.orThrow("Buy milk"),
  });
  evolu.update("todo", { id, isCompleted: sqliteTrue });
}
