import {
  constVoid,
  createRun,
  id,
  ok,
  type CreateSqliteDriver,
  type EvoluDeps,
  type SqliteRow,
} from "@evolu/common";
import {
  AppName,
  createEvolu,
  createOwnerWebSocketTransport,
  testAppOwner,
} from "@evolu/common/local-first";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { createEvoluDeps } from "./shared.ts";

/** Resolves once the deps' worker has connected and published sync state. */
const waitForSyncState = (deps: EvoluDeps): Promise<void> =>
  new Promise((resolve) => {
    const unsubscribe = deps.syncState.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });

describe("createEvoluDeps", () => {
  it("connects deps created again to the running shared worker", async () => {
    const createDeps = () =>
      createEvoluDeps({
        reloadApp: constVoid,
        createSqliteDriver: () => {
          throw new Error("No database is opened.");
        },
      });

    const first = createDeps();
    await waitForSyncState(first);
    first[Symbol.dispose]();

    // A second in-process worker would wait for the build lock forever.
    using second = createDeps();
    await waitForSyncState(second);
  });

  it("starts another shared worker after the running one panics", async (t) => {
    // The in-process worker reports its panic by throwing from a microtask.
    const panicked = Promise.withResolvers<void>();
    process.setUncaughtExceptionCaptureCallback(() => {
      panicked.resolve();
    });
    t.after(() => {
      process.setUncaughtExceptionCaptureCallback(null);
    });
    const createSqliteDriver: CreateSqliteDriver = () => () => {
      const db = new DatabaseSync(":memory:");
      return ok({
        exec: ({ sql, parameters }) => {
          const statement = db.prepare(sql);
          if (statement.columns().length === 0) {
            const { changes } = statement.run(...parameters);
            return { rows: [], changes: Number(changes) };
          }
          const rows = statement.all(...parameters) as Array<SqliteRow>;
          return { rows, changes: 0 };
        },
        export: () => new Uint8Array(),
        deleteDatabase: constVoid,
        [Symbol.dispose]: () => {
          db.close();
        },
      });
    };
    const createDeps = () =>
      createEvoluDeps({ reloadApp: constVoid, createSqliteDriver });

    using first = createDeps();
    await using run = createRun(first);
    await using evolu = await run.ok(
      createEvolu(
        { todo: { id: id("Todo") } },
        {
          appName: AppName.orThrow("panic"),
          appOwner: testAppOwner,
          transports: [],
          memoryOnly: true,
        },
      ),
    );
    // The WebSocket constructor throws a SyntaxError for a URL with a
    // fragment, which panics the worker's root Run.
    evolu.useOwner(testAppOwner, [
      createOwnerWebSocketTransport({
        url: "wss://panic.example/#",
        ownerId: testAppOwner.id,
      }),
    ]);
    await panicked.promise;

    // Deps connected to the failed worker would never get sync state.
    using second = createDeps();
    await waitForSyncState(second);
  });
});
