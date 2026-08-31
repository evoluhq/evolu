import {
  assertEqual,
  assertLength,
  assertNotNull,
  assertNotUndefined,
} from "../../../../packages/common/src/Assert.ts";
import { describe, it } from "node:test";
import { createConsoleStoreOutput } from "../../../../packages/common/src/Console.ts";
import { constVoid } from "../../../../packages/common/src/Function.ts";
import type { DbWorkerInit } from "../../../../packages/common/src/local-first/Db.ts";
import { startDbWorker } from "../../../../packages/common/src/local-first/Db.ts";
import {
  createEvolu,
  testAppName,
} from "../../../../packages/common/src/local-first/Evolu.ts";
import { testAppOwner } from "../../../../packages/common/src/local-first/Owner.ts";
import { createQueryBuilder } from "../../../../packages/common/src/local-first/Schema.ts";
import {
  initSharedWorker,
  type SharedWorkerInput,
  type SharedWorkerOutput,
} from "../../../../packages/common/src/local-first/Shared.ts";
import { testCreateLockManager } from "../../../../packages/common/src/LockManager.ts";
import { installPolyfills } from "../../../../packages/common/src/Polyfills.ts";
import { ok } from "../../../../packages/common/src/Result.ts";
import {
  createSqlite,
  getSqliteSnapshot,
  SqliteBoolean,
  type CreateSqliteDriver,
  type SqliteDriverOptions,
} from "../../../../packages/common/src/Sqlite.ts";
import { testCreateRun } from "../../../../packages/common/src/Task.ts";
import {
  createIdFromString,
  id,
  NonEmptyTrimmedString100,
  nullOr,
  testName,
} from "../../../../packages/common/src/Type.ts";
import { testCreateWebSocket } from "../../../../packages/common/src/WebSocket.ts";
import {
  createBroadcastChannel,
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
  createWorker,
  testWaitForWorkerMessage,
} from "../../../../packages/common/src/Worker.ts";
import { testCreateSqliteDep } from "../_deps.ts";

installPolyfills();

const TodoId = id("Todo");
type TodoId = typeof TodoId.Output;

const Schema = {
  todo: {
    id: TodoId,
    title: NonEmptyTrimmedString100,
    isCompleted: nullOr(SqliteBoolean),
  },
};

const createQuery = createQueryBuilder(Schema);

const todoByCreatedAtQuery = createQuery((db) =>
  db.selectFrom("todo").select(["id", "title"]).orderBy("createdAt"),
);

const todosWithIsCompletedQuery = createQuery((db) =>
  db.selectFrom("todo").select(["id", "title", "isCompleted"]),
);

describe("Evolu integration", () => {
  const setupRunWithEvoluDeps = async () => {
    await using disposer = new AsyncDisposableStack();

    const consoleStoreOutput = createConsoleStoreOutput();

    const run = disposer.use(
      testCreateRun({
        // console: createConsole({ level: "debug" }),
        consoleStoreOutputEntry: consoleStoreOutput.entry,
        createBroadcastChannel,
        createMessageChannel,
        createMessagePort,
        createWebSocket: testCreateWebSocket({ throwOnCreate: true }),
        lockManager: testCreateLockManager(),
      }),
    );

    const driver = await run.ok(
      testCreateSqliteDep.createSqliteDriver(testName),
    );

    const workerRun = disposer.use(
      testCreateRun({
        consoleStoreOutputEntry: consoleStoreOutput.entry,
        createBroadcastChannel,
        createMessagePort,
        lockManager: testCreateLockManager(),
        createSqliteDriver: () => () => ok(driver),
      }),
    );

    const createDbWorker = () =>
      createWorker<DbWorkerInit>((self) => {
        void workerRun(startDbWorker(self));
      });

    const sharedWorker = disposer.use(
      createSharedWorker<SharedWorkerInput, SharedWorkerOutput>((self) => {
        void run(initSharedWorker(self));
      }),
    );
    sharedWorker.port.onMessage = (message) => {
      createDbWorker().postMessage(message, [message.port]);
    };
    sharedWorker.port.postMessage({
      type: "AnnounceTabLeader",
      consoleLevel: "debug",
    });
    await testWaitForWorkerMessage();

    const sqlite = disposer.use(await workerRun.ok(createSqlite(testName)));
    const createIntegrationEvolu = createEvolu(Schema, {
      appName: testAppName,
      appOwner: testAppOwner,
      transports: [],
    });
    const runWithEvoluDeps = disposer.use(
      run.create({
        ...run.deps,
        createDbWorker,
        reloadApp: constVoid,
        sharedWorker,
      }),
    );
    const disposables = disposer.move();

    return {
      createIntegrationEvolu,
      run: runWithEvoluDeps,
      sqlite,
      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    };
  };

  it("createEvolu", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run, sqlite } = setup;

    const evolu = await run.ok(createIntegrationEvolu);

    assertEqual(await evolu.loadQuery(todoByCreatedAtQuery), []);

    let completed = 0;
    const mutationCompleted = Promise.withResolvers<void>();

    evolu.insert(
      "todo",
      {
        title: NonEmptyTrimmedString100.orThrow("Integration todo"),
      },
      {
        onComplete: () => {
          completed += 1;
          mutationCompleted.resolve();
        },
      },
    );

    await mutationCompleted.promise;
    assertEqual(completed, 1);

    const rowsAfterInsert = await evolu.loadQuery(todoByCreatedAtQuery);
    const insertedId = rowsAfterInsert[0]?.id;
    assertNotUndefined(insertedId);
    assertEqual(rowsAfterInsert, [
      { id: insertedId, title: "Integration todo" },
    ]);

    const snapshot = getSqliteSnapshot({ sqlite });

    assertEqual(snapshot, {
      schema: {
        indexes: [
          {
            name: "evolu_history_ownerId_timestamp",
            sql: 'create index evolu_history_ownerId_timestamp on evolu_history (\n          "ownerId",\n          "timestamp"\n        )',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (\n          "ownerId",\n          "table",\n          "id",\n          "column",\n          "timestamp" desc\n        )',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index on evolu_timestamp (\n        "ownerId",\n        "l",\n        "t",\n        "h1",\n        "h2",\n        "c"\n      )',
          },
        ],
        tables: {
          evolu_config: new Set(["clock"]),
          evolu_history: new Set([
            "ownerId",
            "table",
            "id",
            "column",
            "timestamp",
            "value",
          ]),
          evolu_message_quarantine: new Set([
            "ownerId",
            "timestamp",
            "table",
            "id",
            "column",
            "value",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["protocolVersion"]),
          todo: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "title",
            "isCompleted",
          ]),
        },
      },
      tables: [
        { name: "evolu_version", rows: [{ protocolVersion: 1 }] },
        {
          name: "evolu_config",
          rows: [
            {
              clock: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
            },
          ],
        },
        {
          name: "evolu_history",
          rows: [
            {
              column: "title",
              id: new Uint8Array([
                50, 31, 231, 180, 49, 214, 154, 211, 212, 81, 200, 67, 99, 120,
                205, 142,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "todo",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
              value: "Integration todo",
            },
            {
              column: "createdAt",
              id: new Uint8Array([
                50, 31, 231, 180, 49, 214, 154, 211, 212, 81, 200, 67, 99, 120,
                205, 142,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "todo",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
              value: "1970-01-01T00:00:00.000Z",
            },
          ],
        },
        { name: "evolu_message_quarantine", rows: [] },
        {
          name: "evolu_timestamp",
          rows: [
            {
              c: 1,
              h1: 203560577542550,
              h2: 200327465842175,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
            },
          ],
        },
        {
          name: "evolu_usage",
          rows: [
            {
              firstTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
              lastTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 10, 107, 242, 21, 194, 198, 154, 76,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              storedBytes: 1,
            },
          ],
        },
        {
          name: "todo",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.000Z",
              id: "Mh_ntDHWmtPUUchDY3jNjg",
              isCompleted: null,
              isDeleted: null,
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              title: "Integration todo",
              updatedAt: null,
            },
          ],
        },
      ],
    });
  });

  it("insert, update, and upsert store explicit null values", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run } = setup;

    const evolu = await run.ok(createIntegrationEvolu);
    const mutationsCompleted = Promise.withResolvers<void>();
    let pendingMutations = 4;
    const onComplete = () => {
      pendingMutations -= 1;
      if (pendingMutations === 0) mutationsCompleted.resolve();
    };

    const insertedId = evolu.insert(
      "todo",
      {
        title: NonEmptyTrimmedString100.orThrow("Inserted null"),
        isCompleted: null,
      },
      { onComplete },
    ).id;
    const updatedId = evolu.insert(
      "todo",
      {
        title: NonEmptyTrimmedString100.orThrow("Updated null"),
        isCompleted: SqliteBoolean.orThrow(1),
      },
      { onComplete },
    ).id;
    evolu.update("todo", { id: updatedId, isCompleted: null }, { onComplete });
    const upsertedId = TodoId.orThrow(createIdFromString("upserted-null"));
    evolu.upsert(
      "todo",
      {
        id: upsertedId,
        title: NonEmptyTrimmedString100.orThrow("Upserted null"),
        isCompleted: null,
      },
      { onComplete },
    );

    await mutationsCompleted.promise;

    const rows = await evolu.loadQuery(todosWithIsCompletedQuery);
    assertLength(rows, 3);
    assertEqual(
      rows.toSorted((a, b) => {
        assertNotNull(a.title);
        assertNotNull(b.title);
        return a.title.localeCompare(b.title);
      }),
      [
        { id: insertedId, title: "Inserted null", isCompleted: null },
        { id: updatedId, title: "Updated null", isCompleted: null },
        { id: upsertedId, title: "Upserted null", isCompleted: null },
      ],
    );
  });

  it("dispose and recreate keeps loadQuery working", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run } = setup;

    const evolu1 = await run.ok(createIntegrationEvolu);
    assertEqual(await evolu1.loadQuery(todoByCreatedAtQuery), []);

    await evolu1[Symbol.asyncDispose]();

    const evolu2 = await run.ok(createIntegrationEvolu);
    assertEqual(await evolu2.loadQuery(todoByCreatedAtQuery), []);
  });

  it("dispose and recreate keeps subscribed query loading persisted rows", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run } = setup;

    const evolu1 = await run.ok(createIntegrationEvolu);

    let completed = 0;
    const mutationCompleted = Promise.withResolvers<void>();

    evolu1.insert(
      "todo",
      {
        title: NonEmptyTrimmedString100.orThrow("Persisted after recreate"),
      },
      {
        onComplete: () => {
          completed += 1;
          mutationCompleted.resolve();
        },
      },
    );

    await mutationCompleted.promise;
    assertEqual(completed, 1);

    await evolu1[Symbol.asyncDispose]();

    const evolu2 = await run.ok(createIntegrationEvolu);
    const unsubscribe = evolu2.subscribeQuery(todoByCreatedAtQuery)(constVoid);

    const rows = await evolu2.loadQuery(todoByCreatedAtQuery);
    const persistedId = rows[0]?.id;
    assertNotUndefined(persistedId);
    assertEqual(rows, [{ id: persistedId, title: "Persisted after recreate" }]);

    unsubscribe();
  });

  it("memoryOnly opens SQLite in memory mode", async () => {
    const consoleStoreOutput = createConsoleStoreOutput();
    const sqliteDriverOptions: Array<SqliteDriverOptions | undefined> = [];
    const sqliteDriverOptionsCalled = Promise.withResolvers<void>();
    const createSqliteDriver: CreateSqliteDriver = (name, options) => {
      sqliteDriverOptions.push(options);
      sqliteDriverOptionsCalled.resolve();
      return testCreateSqliteDep.createSqliteDriver(name, options);
    };

    const run = testCreateRun({
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel,
      createMessageChannel,
      createMessagePort,
      createWebSocket: testCreateWebSocket({ throwOnCreate: true }),
      lockManager: testCreateLockManager(),
    });

    const workerRun = testCreateRun({
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createBroadcastChannel,
      createMessagePort,
      lockManager: testCreateLockManager(),
      createSqliteDriver,
    });

    const createDbWorker = () =>
      createWorker<DbWorkerInit>((self) => {
        void workerRun(startDbWorker(self));
      });

    const sharedWorker = createSharedWorker<
      SharedWorkerInput,
      SharedWorkerOutput
    >((self) => {
      void run(initSharedWorker(self));
    });
    sharedWorker.port.onMessage = (message) => {
      createDbWorker().postMessage(message, [message.port]);
    };
    sharedWorker.port.postMessage({
      type: "AnnounceTabLeader",
      consoleLevel: "debug",
    });
    await testWaitForWorkerMessage();

    await run.ok(
      createEvolu(Schema, {
        appName: testAppName,
        appOwner: testAppOwner,
        transports: [],
        memoryOnly: true,
      }),
      {
        ...run.deps,
        createDbWorker,
        reloadApp: constVoid,
        sharedWorker,
      },
    );

    await sqliteDriverOptionsCalled.promise;

    assertEqual(sqliteDriverOptions, [{ mode: "memory" }]);
  });
});
