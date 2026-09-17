import {
  assertEqual,
  assertFalse,
  assertTrue,
  assertLength,
  assertNotNull,
  assertNotUndefined,
  assertSame,
} from "../../../../packages/common/src/Assert.ts";
import { describe, it } from "node:test";
import { createConsoleStoreOutput } from "../../../../packages/common/src/Console.ts";
import {
  constVoid,
  exhaustiveCheck,
} from "../../../../packages/common/src/Function.ts";
import type { EvoluError } from "../../../../packages/common/src/local-first/Error.ts";
import type { DbWorkerInit } from "../../../../packages/common/src/local-first/Db.ts";
import { startDbWorker } from "../../../../packages/common/src/local-first/Db.ts";
import {
  createEvolu,
  createEvoluDeps,
  testAppName,
} from "../../../../packages/common/src/local-first/Evolu.ts";
import { testAppOwner } from "../../../../packages/common/src/local-first/Owner.ts";
import { createQueryBuilder } from "../../../../packages/common/src/local-first/Schema.ts";
import {
  consoleEntryOrErrorBroadcastChannelName,
  initSharedWorker,
  type ConsoleEntryOrError,
  type SharedWorker,
  type SharedWorkerInput,
  type SharedWorkerOutput,
} from "../../../../packages/common/src/local-first/Shared.ts";
import {
  acquireLeaderLock,
  testCreateLockManager,
} from "../../../../packages/common/src/LockManager.ts";
import { installPolyfills } from "../../../../packages/common/src/Polyfills.ts";
import { ok } from "../../../../packages/common/src/Result.ts";
import {
  createSqlite,
  getSqliteSnapshot,
  sql,
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
  PositiveInt,
  testName,
} from "../../../../packages/common/src/Type.ts";
import { testCreateWebSocket } from "../../../../packages/common/src/WebSocket.ts";
import {
  createBroadcastChannel,
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
  createWorker,
  testCreateMessageChannel,
  testCreateSharedWorker,
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

    const driver = disposer.use(
      await run.ok(testCreateSqliteDep.createSqliteDriver(testName)),
    );
    // DbWorkers share one driver whose lifetime belongs to this setup, so a
    // worker that exits early must not dispose it.
    const createSqliteDriver: CreateSqliteDriver = () => () =>
      ok({
        exec: (query) => driver.exec(query),
        export: () => driver.export(),
        deleteDatabase: () => driver.deleteDatabase(),
        [Symbol.dispose]: constVoid,
      });

    const workerRun = disposer.use(
      testCreateRun({
        consoleStoreOutputEntry: consoleStoreOutput.entry,
        createBroadcastChannel,
        createMessagePort,
        lockManager: testCreateLockManager(),
        createSqliteDriver,
      }),
    );

    const createDbWorker = () =>
      createWorker<DbWorkerInit>((self) => {
        void workerRun(startDbWorker(self));
      });

    const sharedWorker = disposer.use(
      testCreateSharedWorker<SharedWorkerInput, SharedWorkerOutput>(),
    );
    void run(initSharedWorker(sharedWorker.self));
    sharedWorker.connect();
    // Errors the SharedWorker sends to this tab only.
    const tabErrors: Array<EvoluError> = [];
    let tabErrorReported = Promise.withResolvers<void>();
    sharedWorker.port.onMessage = (message) => {
      switch (message.type) {
        case "DbWorkerInit":
          createDbWorker().postMessage(message, [message.port]);
          break;
        case "Error":
          tabErrors.push(message.error);
          tabErrorReported.resolve();
          tabErrorReported = Promise.withResolvers<void>();
          break;
        default:
          exhaustiveCheck(message);
      }
    };
    sharedWorker.port.postMessage({
      type: "AnnounceTabLeader",
      consoleLevel: "debug",
    });
    await testWaitForWorkerMessage();

    /** Connects another tab to the same SharedWorker. */
    const connectLaterTab = (): SharedWorker => {
      const channel = testCreateMessageChannel<
        SharedWorkerInput,
        SharedWorkerOutput
      >();
      assertNotNull(sharedWorker.self.onConnect);
      sharedWorker.self.onConnect(channel.port2);
      return {
        port: channel.port1,
        [Symbol.dispose]: () => {
          channel[Symbol.dispose]();
        },
      };
    };

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
      connectLaterTab,
      createIntegrationEvolu,
      run: runWithEvoluDeps,
      sqlite,
      tabErrors,
      waitForTabError: () => tabErrorReported.promise,
      [Symbol.asyncDispose]: () => disposables.disposeAsync(),
    };
  };

  it("local tables share reactive data across instances without sync history", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { run, sqlite } = setup;
    const LocalSchema = {
      _note: { id: id("Note"), title: NonEmptyTrimmedString100 },
    };
    const createLocalQuery = createQueryBuilder(LocalSchema);
    const notesQuery = createLocalQuery((db) =>
      db.selectFrom("_note").select(["id", "title"]),
    );
    const createLocal = createEvolu(LocalSchema, {
      appName: testAppName,
      appOwner: testAppOwner,
      transports: [],
    });
    const writer = await run.ok(createLocal);
    const reader = await run.ok(createLocal);
    assertTrue(typeof writer.useOwner === "function");
    assertEqual(await reader.loadQuery(notesQuery), []);
    const observed = Promise.withResolvers<void>();
    const unsubscribe = reader.subscribeQuery(notesQuery)(() => {
      if (reader.getQueryRows(notesQuery).length > 0) observed.resolve();
    });
    const inserted = Promise.withResolvers<void>();
    const { id: noteId } = writer.insert(
      "_note",
      {
        title: NonEmptyTrimmedString100.orThrow("Local note"),
      },
      { onComplete: inserted.resolve },
    );
    await inserted.promise;
    await observed.promise;
    assertEqual(reader.getQueryRows(notesQuery), [
      { id: noteId, title: "Local note" },
    ]);
    unsubscribe();

    const updated = Promise.withResolvers<void>();
    writer.update(
      "_note",
      { id: noteId, title: NonEmptyTrimmedString100.orThrow("Updated") },
      { onComplete: updated.resolve },
    );
    await updated.promise;
    assertEqual(await writer.loadQuery(notesQuery), [
      { id: noteId, title: "Updated" },
    ]);
    const snapshot = getSqliteSnapshot({ sqlite });
    assertEqual(
      snapshot.tables.find((table) => table.name === "evolu_history")?.rows,
      [],
    );
    assertEqual(
      snapshot.tables.find((table) => table.name === "evolu_timestamp")?.rows,
      [],
    );
    assertTrue((await writer.exportDatabase()).length > 0);

    await writer[Symbol.asyncDispose]();
    const reopened = await run.ok(createLocal);
    assertEqual(await reopened.loadQuery(notesQuery), [
      { id: noteId, title: "Updated" },
    ]);
    const deleted = Promise.withResolvers<void>();
    reopened.update(
      "_note",
      { id: noteId, isDeleted: SqliteBoolean.orThrow(1) },
      { onComplete: deleted.resolve },
    );
    await deleted.promise;
    assertEqual(await reopened.loadQuery(notesQuery), []);
    assertEqual(
      getSqliteSnapshot({ sqlite }).tables.find(
        (table) => table.name === "_note",
      )?.rows,
      [],
    );
    await reopened[Symbol.asyncDispose]();
    await reader[Symbol.asyncDispose]();
  });

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
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 1 }] },
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
      if (message.type === "DbWorkerInit")
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

  it("keeps refused work pending until disposal and never completes mutations", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run, sqlite } = setup;
    using errors = createBroadcastChannel<ConsoleEntryOrError>(
      consoleEntryOrErrorBroadcastChannelName,
    );
    const broadcasts: Array<ConsoleEntryOrError> = [];
    errors.onMessage = (message) => {
      broadcasts.push(message);
    };
    // A database created by newer code.
    sqlite.exec(sql`
      create table evolu_version ("dbVersion" integer not null) strict;
    `);
    sqlite.exec(sql`insert into evolu_version ("dbVersion") values (2);`);
    const before = getSqliteSnapshot({ sqlite });

    const reported = setup.waitForTabError();
    const evolu = await run.ok(createIntegrationEvolu);
    const pending = evolu.loadQuery(todoByCreatedAtQuery);
    const exported = evolu.exportDatabase();
    let exportSettled = false;
    const exportResult = exported.then(
      () => {
        exportSettled = true;
      },
      (reason: unknown) => {
        exportSettled = true;
        return reason;
      },
    );
    let completed = false;
    evolu.insert(
      "todo",
      { title: NonEmptyTrimmedString100.orThrow("Lost") },
      {
        onComplete: () => {
          completed = true;
        },
      },
    );

    const error = {
      type: "UnsupportedDbVersionError",
      storedVersion: PositiveInt.orThrow(2),
      supportedVersion: PositiveInt.orThrow(1),
    };
    await reported;
    await testWaitForWorkerMessage();
    // The tab is told once, through its own connection.
    assertEqual(setup.tabErrors, [error]);
    assertEqual(broadcasts, []);
    // React `use` keeps suspending while the application shows the error.
    const thenable = pending as Promise<unknown> & {
      status?: string;
    };
    assertSame(thenable.status, "pending");
    const later = evolu.loadQuery(todosWithIsCompletedQuery);
    let laterSettled = false;
    void later.then(() => {
      laterSettled = true;
    });
    assertSame(evolu.exportDatabase(), exported);
    // Another instance in the same tab does not repeat the message.
    const second = await run.ok(createIntegrationEvolu);
    await testWaitForWorkerMessage();
    assertEqual(setup.tabErrors, [error]);
    assertFalse(laterSettled);
    assertFalse(exportSettled);
    assertFalse(completed);
    assertEqual(getSqliteSnapshot({ sqlite }), before);

    await second[Symbol.asyncDispose]();
    await evolu[Symbol.asyncDispose]();
    assertEqual(await pending, []);
    assertEqual(await later, []);
    assertEqual(await exportResult, { type: "EvoluDisposedError" });
    assertFalse(completed);
  });

  it("reports refusal once to the error store of a later tab", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { createIntegrationEvolu, run, sqlite } = setup;
    sqlite.exec(sql`
      create table evolu_version ("dbVersion" integer not null) strict;
    `);
    sqlite.exec(sql`insert into evolu_version ("dbVersion") values (2);`);
    const error = {
      type: "UnsupportedDbVersionError",
      storedVersion: PositiveInt.orThrow(2),
      supportedVersion: PositiveInt.orThrow(1),
    };

    const firstReported = setup.waitForTabError();
    const first = await run.ok(createIntegrationEvolu);
    const firstLoad = first.loadQuery(todoByCreatedAtQuery);
    await firstReported;
    assertEqual(setup.tabErrors, [error]);

    // The existing tab hosts the leader; the later tab only joins its tenant.
    await using _leaderLock = await run.ok(acquireLeaderLock("tab"));
    using lateDeps = createEvoluDeps({
      ...run.deps,
      sharedWorker: setup.connectLaterTab(),
    });
    assertSame(lateDeps.evoluError.get(), null);
    const reported = Promise.withResolvers<void>();
    lateDeps.evoluError.subscribe(reported.resolve);
    await using lateRun = run.create(lateDeps);
    const second = await lateRun.ok(createIntegrationEvolu);
    const secondLoad = second.loadQuery(todoByCreatedAtQuery);
    await reported.promise;
    assertEqual(lateDeps.evoluError.get(), error);
    // The first tab was not told again.
    assertEqual(setup.tabErrors, [error]);

    await second[Symbol.asyncDispose]();
    await first[Symbol.asyncDispose]();
    assertEqual(await secondLoad, []);
    assertEqual(await firstLoad, []);
  });
});
