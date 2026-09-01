import {
  assertEqual,
  assertFalse,
  assertInstanceOf,
  assertLength,
  assertNotNull,
  assertNotUndefined,
  assertSame,
  assertTrue,
} from "../../../../packages/common/src/Assert.ts";
import { describe, it, test } from "node:test";
import {
  createConsoleStoreOutput,
  testCreateConsole,
  type ConsoleEntry,
  type ConsoleStoreOutput,
} from "../../../../packages/common/src/Console.ts";
import { constVoid } from "../../../../packages/common/src/Function.ts";
import {
  startDbWorker,
  type DbWorkerInit,
} from "../../../../packages/common/src/local-first/Db.ts";
import {
  createAppOwner,
  createOwnerSecret,
  ownerIdToOwnerIdBytes,
  testAppOwner,
} from "../../../../packages/common/src/local-first/Owner.ts";
import {
  applyProtocolMessageAsRelay,
  createProtocolMessageFromCrdtMessages,
  decryptAndDecodeDbChange,
} from "../../../../packages/common/src/local-first/Protocol.ts";
import { createQueryBuilder } from "../../../../packages/common/src/local-first/Schema.ts";
import type {
  ConsoleEntryOrError,
  DbWorkerInput,
  DbWorkerOutput,
  DbWorkerRequest,
  EvoluInstanceId,
} from "../../../../packages/common/src/local-first/Shared.ts";
import { consoleEntryOrErrorBroadcastChannelName } from "../../../../packages/common/src/local-first/Shared.ts";
import { DbChange } from "../../../../packages/common/src/local-first/Storage.ts";
import {
  createTimestamp,
  TimestampBytes,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "../../../../packages/common/src/local-first/Timestamp.ts";
import {
  acquireLeaderLock,
  testCreateLockManager,
  type LockManagerDep,
} from "../../../../packages/common/src/LockManager.ts";
import { installPolyfills } from "../../../../packages/common/src/Polyfills.ts";
import { err, ok } from "../../../../packages/common/src/Result.ts";
import { createSet, emptySet } from "../../../../packages/common/src/Set.ts";
import {
  createSqlite,
  getSqliteSnapshot,
  sql,
  type CreateSqliteDriver,
  type Sqlite,
  type SqliteSchema,
  type SqliteValue,
} from "../../../../packages/common/src/Sqlite.ts";
import {
  testCreateDeps,
  testCreateRun,
} from "../../../../packages/common/src/Task.ts";
import { testCreateId } from "../../../../packages/common/src/Test.ts";
import {
  Millis,
  testCreateTime,
  type TestTime,
} from "../../../../packages/common/src/Time.ts";
import {
  id,
  String,
  testName,
  type Id,
  type Name,
} from "../../../../packages/common/src/Type.ts";
import type { ExtractTyped } from "../../../../packages/common/src/Type.ts";
import {
  createMessagePort,
  createWorker,
  testCreateBroadcastChannel,
  testCreateMessageChannel,
  testWaitForWorkerMessage,
  type MessagePort,
  type WorkerSelf,
} from "../../../../packages/common/src/Worker.ts";
import { setupSqliteAndRelayStorage, testCreateSqliteDep } from "../_deps.ts";

installPolyfills();

const testDbAppOwner2 = createAppOwner(
  createOwnerSecret(testCreateDeps({ seed: "nodejs-db-owner-2" })),
);
const testAppOwnerIdBytes = ownerIdToOwnerIdBytes(testAppOwner.id);

const TestSchema = {
  testTable: {
    id: id("TestTable"),
    name: String,
    note: String,
  },
  _localTable: {
    id: id("_LocalTable"),
    value: String,
  },
};

const createQuery = createQueryBuilder(TestSchema);

const testTableQuery = createQuery((db) =>
  db.selectFrom("testTable").select(["id", "name"]),
);

const testTableWithNoteQuery = createQuery((db) =>
  db.selectFrom("testTable").select(["id", "name", "note"]),
);

const localTableQuery = createQuery((db) =>
  db.selectFrom("_localTable").select(["id", "value"]),
);

const createTestSqliteSchema = (
  testTableColumns: ReadonlyArray<string>,
): SqliteSchema => ({
  indexes: [],
  tables: {
    testTable: new Set(testTableColumns),
    _localTable: new Set(["value"]),
  },
});

const defaultSqliteSchema = createTestSqliteSchema(["name"]);

const createMutationChange = ({
  ownerId = testAppOwner.id,
  table,
  id,
  values,
  isInsert,
  isDelete,
}: {
  ownerId?: typeof testAppOwner.id;
  table: string;
  id: Id;
  values: Readonly<Record<string, SqliteValue>>;
  isInsert: boolean;
  isDelete: boolean | null;
}) => ({
  ownerId,
  ...DbChange.orThrow({ table, id, values, isInsert, isDelete }),
});

const createBroadcastProtocolMessage = async (
  messages: Parameters<
    ReturnType<typeof createProtocolMessageFromCrdtMessages>
  >[1],
): Promise<Uint8Array> => {
  const requestMessage = createProtocolMessageFromCrdtMessages(
    testCreateDeps(),
  )(testAppOwner, messages);

  await using relay = await setupSqliteAndRelayStorage();
  const broadcastMessages: Array<Uint8Array> = [];

  await relay.run.orThrow(
    applyProtocolMessageAsRelay(requestMessage, {
      broadcast: (_ownerId, message) => {
        broadcastMessages.push(message);
      },
    }),
  );

  const broadcastMessage = broadcastMessages.at(0);
  assertNotUndefined(broadcastMessage);
  return broadcastMessage;
};

interface DbSetup extends AsyncDisposable {
  readonly consoleStoreOutput: ConsoleStoreOutput;
  readonly createId: ReturnType<typeof testCreateId>;
  readonly createSqliteDriver: CreateSqliteDriver;
  readonly evoluInstanceId: EvoluInstanceId;
  readonly name: Name;
  readonly sqlite: Sqlite;
  readonly time: TestTime;
}

const setupDb = async ({
  time = testCreateTime(),
}: {
  time?: TestTime;
} = {}): Promise<DbSetup> => {
  await using disposer = new AsyncDisposableStack();

  const createId = testCreateId();
  const evoluInstanceId = createId<"EvoluInstance">();
  const consoleStoreOutput = createConsoleStoreOutput();
  const name = testName;
  const run = disposer.use(
    testCreateRun({
      console: testCreateConsole({ level: "silent" }),
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      time,
    }),
  );

  const driver = disposer.use(
    await run.ok(testCreateSqliteDep.createSqliteDriver(name)),
  );

  // Tests need a stable handle to the lazily created SQLite driver.
  const createSqliteDriver: CreateSqliteDriver = (_name, _options) => () =>
    ok({
      exec: (query) => driver.exec(query),
      export: () => driver.export(),
      deleteDatabase: () => driver.deleteDatabase(),
      [Symbol.dispose]: constVoid,
    });

  const sqlite = disposer.use(
    await run.ok(createSqlite(name, { mode: "memory" }), {
      createSqliteDriver,
    }),
  );
  const disposables = disposer.move();

  return {
    consoleStoreOutput,
    createId,
    createSqliteDriver,
    evoluInstanceId,
    name,
    sqlite,
    time,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

interface DbWorkerSetup extends DbSetup {
  readonly initOutputs: ReadonlyArray<DbWorkerOutput>;
  readonly lockManager: LockManagerDep["lockManager"];
  readonly outputs: Array<DbWorkerOutput>;
  readonly port: MessagePort<DbWorkerInput, DbWorkerOutput>;
  readonly consoleEntryOrErrors: Array<ConsoleEntryOrError>;
  readonly waitForActivity: () => Promise<void>;
  readonly waitForResponse: (callbackId: Id) => Promise<void>;
  readonly workerName: Name;
}

const setupDbWorker = async ({
  dbSetup: providedDbSetup,
  sqliteSchema = defaultSqliteSchema,
  memoryOnly = true,
  time,
}: {
  dbSetup?: DbSetup;
  memoryOnly?: boolean;
  sqliteSchema?: SqliteSchema;
  time?: TestTime;
} = {}): Promise<DbWorkerSetup> => {
  await using disposer = new AsyncDisposableStack();

  const dbSetup =
    providedDbSetup ??
    disposer.use(await setupDb(time == null ? undefined : { time }));
  const lockManager = testCreateLockManager();
  const workerName = dbSetup.name;

  const run = disposer.use(
    testCreateRun({
      console: testCreateConsole({ level: "silent" }),
      consoleStoreOutputEntry: dbSetup.consoleStoreOutput.entry,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessagePort,
      lockManager,
      createSqliteDriver: dbSetup.createSqliteDriver,
      time: dbSetup.time,
    }),
  );
  const worker = disposer.use(
    createWorker<DbWorkerInit>((self) => {
      void run(startDbWorker(self));
    }),
  );
  const channel = disposer.use(
    testCreateMessageChannel<DbWorkerOutput, DbWorkerInput>(),
  );
  const outputs: Array<DbWorkerOutput> = [];
  const consoleEntryOrErrors: Array<ConsoleEntryOrError> = [];
  const responseWaitersByCallbackId = new Map<Id, () => void>();
  let activity = Promise.withResolvers<void>();
  const waitForActivity = (): Promise<void> => activity.promise;
  const waitForResponse = (callbackId: Id): Promise<void> => {
    const response = Promise.withResolvers<void>();
    responseWaitersByCallbackId.set(callbackId, response.resolve);
    return response.promise;
  };
  const notifyActivity = (): void => {
    activity.resolve();
    activity = Promise.withResolvers<void>();
  };
  const consoleEntryOrErrorBroadcastChannel = disposer.use(
    testCreateBroadcastChannel<ConsoleEntryOrError>(
      consoleEntryOrErrorBroadcastChannelName,
    ),
  );

  consoleEntryOrErrorBroadcastChannel.onMessage = (output) => {
    consoleEntryOrErrors.push(output);
    notifyActivity();
  };

  channel.port2.onMessage = (output) => {
    outputs.push(output);
    if (output.type === "OnQueuedResponse") {
      responseWaitersByCallbackId.get(output.callbackId)?.();
      responseWaitersByCallbackId.delete(output.callbackId);
    }
    notifyActivity();
  };

  const initActivity = waitForActivity();
  worker.postMessage({
    type: "DbWorkerInit",
    name: workerName,
    consoleLevel: "silent",
    sqliteSchema,
    encryptionKey: testAppOwner.encryptionKey,
    memoryOnly,
    port: channel.port1.native,
  });

  await initActivity;

  const initOutputs = outputs.splice(0);
  assertEqual(initOutputs, [{ type: "LeaderAcquired", name: workerName }]);

  const disposables = disposer.move();

  return {
    ...dbSetup,
    initOutputs,
    lockManager,
    outputs,
    port: channel.port2,
    consoleEntryOrErrors,
    waitForActivity,
    waitForResponse,
    workerName,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};

const postRequest = async (
  setup: DbWorkerSetup,
  request: DbWorkerRequest,
  callbackId = setup.createId(),
  waitFor: "activity" | "response" = "response",
): Promise<ReadonlyArray<DbWorkerOutput>> => {
  const completion =
    waitFor === "response"
      ? setup.waitForResponse(callbackId)
      : setup.waitForActivity();
  setup.port.postMessage({ type: "Request", callbackId, request });
  await completion;
  return setup.outputs.splice(0);
};

type QueuedResponse = ExtractTyped<DbWorkerOutput, "OnQueuedResponse">;
type SharedWorkerResponse = ExtractTyped<
  QueuedResponse["response"],
  "ForSharedWorker"
>;
type SharedWorkerResponseMessage = SharedWorkerResponse["message"];

const getQueuedSharedWorkerMessage = <
  TType extends SharedWorkerResponseMessage["type"],
>(
  outputs: ReadonlyArray<DbWorkerOutput>,
  type: TType,
): ExtractTyped<SharedWorkerResponseMessage, TType> => {
  const firstOutput = outputs.at(0);
  assertNotUndefined(firstOutput);
  assertSame(firstOutput.type, "OnQueuedResponse");

  const response = firstOutput.response;
  assertSame(response.type, "ForSharedWorker");

  const message = response.message;
  assertSame(message.type, type);

  return message as ExtractTyped<SharedWorkerResponseMessage, TType>;
};

describe("worker startup", () => {
  it("startDbWorker waits for initialization and disposes self when aborted", async () => {
    await using dbSetup = await setupDb();
    let workerSelfDisposeCount = 0;
    const self: WorkerSelf<DbWorkerInit> = {
      postMessage: constVoid,
      onMessage: null,
      native: {} as WorkerSelf<DbWorkerInit>["native"],
      [Symbol.dispose]: () => {
        workerSelfDisposeCount += 1;
      },
    };

    await using run = testCreateRun({
      consoleStoreOutputEntry: dbSetup.consoleStoreOutput.entry,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessagePort,
      lockManager: testCreateLockManager(),
      createSqliteDriver: dbSetup.createSqliteDriver,
      time: dbSetup.time,
    });

    const fiber = run.abortable(startDbWorker(self));
    await testWaitForWorkerMessage();

    assertNotNull(self.onMessage);
    assertSame(fiber.run.getState().type, "Running");

    const reason = { type: "TestAbort" } as const;
    fiber.abort(reason);

    assertEqual(await fiber, err({ type: "AbortError", reason }));
    assertEqual(workerSelfDisposeCount, 1);
  });

  it("forwards console store entries to the worker port", async () => {
    await using setup = await setupDbWorker();

    const writeEntry = setup.consoleStoreOutput.write as (
      entry: ConsoleEntry | null,
    ) => void;

    writeEntry(null);
    await testWaitForWorkerMessage();
    assertEqual(setup.outputs, []);

    const entry: ConsoleEntry = {
      method: "info",
      path: ["DbWorker"],
      args: ["console-entry"],
    };

    writeEntry(entry);
    await testWaitForWorkerMessage();
    assertEqual(setup.consoleEntryOrErrors, [{ type: "ConsoleEntry", entry }]);

    writeEntry(null);
    await testWaitForWorkerMessage();
    assertEqual(setup.consoleEntryOrErrors, [{ type: "ConsoleEntry", entry }]);
  });

  it("acquires leadership and initializes SQLite", async () => {
    await using setup = await setupDbWorker();

    assertEqual(setup.initOutputs, [
      { type: "LeaderAcquired", name: setup.workerName },
    ]);
    assertEqual(getSqliteSnapshot(setup), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 0, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        { name: "evolu_history", rows: [] },
        { name: "evolu_message_quarantine", rows: [] },
        { name: "evolu_timestamp", rows: [] },
        { name: "evolu_usage", rows: [] },
        { name: "testTable", rows: [] },
        { name: "_localTable", rows: [] },
      ],
    });
  });

  it("releases leadership after dispose message", async () => {
    await using setup = await setupDbWorker();
    await using run = testCreateRun({ lockManager: setup.lockManager });

    setup.port.postMessage({ type: "Dispose" });

    await using lock = await run.ok(acquireLeaderLock(setup.workerName));
    assertNotUndefined(lock);
  });

  it("disposes worker self after dispose message", async () => {
    await using disposer = new AsyncDisposableStack();
    const dbSetup = disposer.use(await setupDb());
    const lockManager = testCreateLockManager();
    const workerSelfDisposed = Promise.withResolvers<void>();
    let workerSelfDisposeCount = 0;
    const self: WorkerSelf<DbWorkerInit> = {
      postMessage: constVoid,
      onMessage: null,
      native: {} as WorkerSelf<DbWorkerInit>["native"],
      [Symbol.dispose]: () => {
        workerSelfDisposeCount += 1;
        workerSelfDisposed.resolve();
      },
    };

    const run = disposer.use(
      testCreateRun({
        console: testCreateConsole({ level: "silent" }),
        consoleStoreOutputEntry: dbSetup.consoleStoreOutput.entry,
        createBroadcastChannel: testCreateBroadcastChannel,
        createMessagePort,
        lockManager,
        createSqliteDriver: dbSetup.createSqliteDriver,
        time: dbSetup.time,
      }),
    );
    void run(startDbWorker(self));

    using channel = testCreateMessageChannel<DbWorkerOutput, DbWorkerInput>();
    const outputs: Array<DbWorkerOutput> = [];
    channel.port2.onMessage = (output) => {
      outputs.push(output);
    };

    while (!self.onMessage) await testWaitForWorkerMessage();
    self.onMessage({
      type: "DbWorkerInit",
      name: dbSetup.name,
      consoleLevel: "silent",
      sqliteSchema: defaultSqliteSchema,
      encryptionKey: testAppOwner.encryptionKey,
      memoryOnly: true,
      port: channel.port1.native,
    });

    while (outputs.length === 0) await testWaitForWorkerMessage();

    channel.port2.postMessage({ type: "Dispose" });

    await workerSelfDisposed.promise;

    assertEqual(workerSelfDisposeCount, 1);
  });

  it("passes encrypted SQLite options when memoryOnly is false", async () => {
    await using dbSetup = await setupDb();

    const sqliteDriverOptions: Array<Parameters<CreateSqliteDriver>[1]> = [];
    const spiedDbSetup: DbSetup = {
      ...dbSetup,
      createSqliteDriver: (name, options) => {
        sqliteDriverOptions.push(options);
        return dbSetup.createSqliteDriver(name, options);
      },
    };

    await using setup = await setupDbWorker({
      dbSetup: spiedDbSetup,
      memoryOnly: false,
    });

    assertEqual(setup.initOutputs, [
      { type: "LeaderAcquired", name: setup.workerName },
    ]);
    assertEqual(sqliteDriverOptions, [
      { mode: "encrypted", encryptionKey: testAppOwner.encryptionKey },
    ]);
  });
});

describe("query and mutation flow", () => {
  it("local-only mutation stores an explicit null value", async () => {
    await using setup = await setupDbWorker();

    const rowId = setup.createId();

    await postRequest(setup, {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Mutate",
        changes: [
          createMutationChange({
            table: "_localTable",
            id: rowId,
            values: { value: null },
            isInsert: true,
            isDelete: null,
          }),
        ],
        onCompleteIds: [],
        subscribedQueries: emptySet,
      },
    });

    assertEqual(
      setup.sqlite.exec<{ readonly value: SqliteValue }>(sql`
        select "value"
        from "_localTable"
        where "id" = ${rowId};
      `).rows,
      [{ value: null }],
    );
  });

  it("local-only mutation updates query rows and SQLite state", async () => {
    await using setup = await setupDbWorker();

    const rowId = setup.createId();

    assertEqual(
      await postRequest(setup, {
        type: "ForEvolu",
        id: setup.evoluInstanceId,
        message: {
          type: "Mutate",
          changes: [
            createMutationChange({
              table: "_localTable",
              id: rowId,
              values: { value: "local only" },
              isInsert: true,
              isDelete: null,
            }),
          ],
          onCompleteIds: [],
          subscribedQueries: createSet([localTableQuery]),
        },
      }),
      [
        {
          callbackId: "in2khoBFZNo9ESZlzuacxA",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              messagesByOwnerId: new Map([]),
              rowsByQuery: new Map([
                [
                  '["select \\"id\\", \\"value\\" from \\"_localTable\\"",[],[]]',
                  [{ id: "ofZXw_hAfJ8fIcpFxi6nag", value: "local only" }],
                ],
              ]),
              type: "Mutate",
            },
            type: "ForEvolu",
          },
          type: "OnQueuedResponse",
        },
      ],
    );

    assertEqual(getSqliteSnapshot(setup), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 0, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        { name: "evolu_history", rows: [] },
        { name: "evolu_message_quarantine", rows: [] },
        { name: "evolu_timestamp", rows: [] },
        { name: "evolu_usage", rows: [] },
        { name: "testTable", rows: [] },
        {
          name: "_localTable",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.000Z",
              id: "ofZXw_hAfJ8fIcpFxi6nag",
              isDeleted: null,
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: null,
              value: "local only",
            },
          ],
        },
      ],
    });

    assertEqual(
      await postRequest(setup, {
        type: "ForEvolu",
        id: setup.evoluInstanceId,
        message: {
          type: "Mutate",
          changes: [
            createMutationChange({
              table: "_localTable",
              id: rowId,
              values: { value: "local only updated" },
              isInsert: false,
              isDelete: null,
            }),
          ],
          onCompleteIds: [],
          subscribedQueries: createSet([localTableQuery]),
        },
      }),
      [
        {
          callbackId: "dXpWgmgRSqCJV_tQPAS7Ug",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              messagesByOwnerId: new Map([]),
              rowsByQuery: new Map([
                [
                  '["select \\"id\\", \\"value\\" from \\"_localTable\\"",[],[]]',
                  [
                    {
                      id: "ofZXw_hAfJ8fIcpFxi6nag",
                      value: "local only updated",
                    },
                  ],
                ],
              ]),
              type: "Mutate",
            },
            type: "ForEvolu",
          },
          type: "OnQueuedResponse",
        },
      ],
    );

    assertEqual(getSqliteSnapshot(setup), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 0, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        { name: "evolu_history", rows: [] },
        { name: "evolu_message_quarantine", rows: [] },
        { name: "evolu_timestamp", rows: [] },
        { name: "evolu_usage", rows: [] },
        { name: "testTable", rows: [] },
        {
          name: "_localTable",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.000Z",
              id: "ofZXw_hAfJ8fIcpFxi6nag",
              isDeleted: null,
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: "1970-01-01T00:00:00.000Z",
              value: "local only updated",
            },
          ],
        },
      ],
    });

    assertEqual(
      await postRequest(setup, {
        type: "ForEvolu",
        id: setup.evoluInstanceId,
        message: {
          type: "Mutate",
          changes: [
            createMutationChange({
              table: "_localTable",
              id: rowId,
              values: {},
              isInsert: false,
              isDelete: true,
            }),
          ],
          onCompleteIds: [],
          subscribedQueries: createSet([localTableQuery]),
        },
      }),
      [
        {
          callbackId: "uOCPavv1rW_A-VrpXIfUZA",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              messagesByOwnerId: new Map([]),
              rowsByQuery: new Map([
                [
                  '["select \\"id\\", \\"value\\" from \\"_localTable\\"",[],[]]',
                  [],
                ],
              ]),
              type: "Mutate",
            },
            type: "ForEvolu",
          },
          type: "OnQueuedResponse",
        },
      ],
    );

    assertEqual(getSqliteSnapshot(setup), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 0, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        { name: "evolu_history", rows: [] },
        { name: "evolu_message_quarantine", rows: [] },
        { name: "evolu_timestamp", rows: [] },
        { name: "evolu_usage", rows: [] },
        { name: "testTable", rows: [] },
        { name: "_localTable", rows: [] },
      ],
    });
  });

  it("local-only delete only removes the matching owner row", async () => {
    await using setup = await setupDbWorker();

    const rowId = setup.createId();

    await postRequest(setup, {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Mutate",
        changes: [
          createMutationChange({
            table: "_localTable",
            id: rowId,
            ownerId: testAppOwner.id,
            values: { value: "first owner" },
            isInsert: true,
            isDelete: null,
          }),
          createMutationChange({
            table: "_localTable",
            id: rowId,
            ownerId: testDbAppOwner2.id,
            values: { value: "second owner" },
            isInsert: true,
            isDelete: null,
          }),
        ],
        onCompleteIds: [],
        subscribedQueries: emptySet,
      },
    });

    assertEqual(
      setup.sqlite.exec<{
        readonly id: string;
        readonly ownerId: string;
        readonly value: string;
      }>(sql`
        select "id", "ownerId", "value"
        from "_localTable"
        where "id" = ${rowId}
        order by "ownerId";
      `).rows,
      [
        { id: rowId, ownerId: testAppOwner.id, value: "first owner" },
        { id: rowId, ownerId: testDbAppOwner2.id, value: "second owner" },
      ],
    );

    await postRequest(setup, {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Mutate",
        changes: [
          createMutationChange({
            table: "_localTable",
            id: rowId,
            ownerId: testAppOwner.id,
            values: {},
            isInsert: false,
            isDelete: true,
          }),
        ],
        onCompleteIds: [],
        subscribedQueries: emptySet,
      },
    });

    assertEqual(
      setup.sqlite.exec<{
        readonly id: string;
        readonly ownerId: string;
        readonly value: string;
      }>(sql`
        select "id", "ownerId", "value"
        from "_localTable"
        where "id" = ${rowId}
        order by "ownerId";
      `).rows,
      [{ id: rowId, ownerId: testDbAppOwner2.id, value: "second owner" }],
    );
  });

  it("mixed local-only and sync mutate preserves order", async () => {
    await using setup = await setupDbWorker({
      time: testCreateTime({ autoIncrement: "sync" }),
    });

    await postRequest(
      setup,
      {
        type: "ForEvolu",
        id: setup.evoluInstanceId,
        message: {
          type: "Mutate",
          changes: [
            createMutationChange({
              table: "_localTable",
              id: setup.createId(),
              values: { value: "first local" },
              isInsert: true,
              isDelete: null,
            }),
            createMutationChange({
              table: "testTable",
              id: setup.createId(),
              values: { name: "synced" },
              isInsert: true,
              isDelete: null,
            }),
            createMutationChange({
              table: "_localTable",
              id: setup.createId(),
              values: { value: "second local" },
              isInsert: true,
              isDelete: null,
            }),
          ],
          onCompleteIds: [],
          subscribedQueries: emptySet,
        },
      },
      setup.createId(),
    );

    assertEqual(getSqliteSnapshot(setup), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 1, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_history",
          rows: [
            {
              column: "name",
              id: new Uint8Array([
                138, 125, 164, 134, 128, 69, 100, 218, 61, 17, 38, 101, 206,
                230, 156, 196,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
              value: "synced",
            },
            {
              column: "createdAt",
              id: new Uint8Array([
                138, 125, 164, 134, 128, 69, 100, 218, 61, 17, 38, 101, 206,
                230, 156, 196,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
              value: "1970-01-01T00:00:00.001Z",
            },
          ],
        },
        { name: "evolu_message_quarantine", rows: [] },
        {
          name: "evolu_timestamp",
          rows: [
            {
              c: 1,
              h1: 239229796330191,
              h2: 206460782245569,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_usage",
          rows: [
            {
              firstTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
              lastTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
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
          name: "testTable",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.001Z",
              id: "in2khoBFZNo9ESZlzuacxA",
              isDeleted: null,
              name: "synced",
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: null,
            },
          ],
        },
        {
          name: "_localTable",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.002Z",
              id: "dXpWgmgRSqCJV_tQPAS7Ug",
              isDeleted: null,
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: null,
              value: "second local",
            },
            {
              createdAt: "1970-01-01T00:00:00.000Z",
              id: "ofZXw_hAfJ8fIcpFxi6nag",
              isDeleted: null,
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: null,
              value: "first local",
            },
          ],
        },
      ],
    });
  });

  it("query returns current state", async () => {
    await using setup = await setupDbWorker();

    await postRequest(setup, {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Mutate",
        changes: [
          createMutationChange({
            table: "testTable",
            id: setup.createId(),
            values: { name: "queryable" },
            isInsert: true,
            isDelete: null,
          }),
        ],
        onCompleteIds: [],
        subscribedQueries: emptySet,
      },
    });

    assertEqual(
      await postRequest(setup, {
        type: "ForEvolu",
        id: setup.evoluInstanceId,
        message: {
          type: "Query",
          queries: createSet([testTableQuery]),
        },
      }),
      [
        {
          callbackId: "dXpWgmgRSqCJV_tQPAS7Ug",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              rowsByQuery: new Map([
                [
                  '["select \\"id\\", \\"name\\" from \\"testTable\\"",[],[]]',
                  [{ id: "ofZXw_hAfJ8fIcpFxi6nag", name: "queryable" }],
                ],
              ]),
              type: "Query",
            },
            type: "ForEvolu",
          },
          type: "OnQueuedResponse",
        },
      ],
    );
  });

  it("export returns current state", async () => {
    await using setup = await setupDbWorker();

    await postRequest(setup, {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Mutate",
        changes: [
          createMutationChange({
            table: "testTable",
            id: setup.createId(),
            values: { name: "queryable" },
            isInsert: true,
            isDelete: null,
          }),
        ],
        onCompleteIds: [],
        subscribedQueries: emptySet,
      },
    });

    const exportCallbackId = setup.createId();
    const exportOutputs = await postRequest(
      setup,
      {
        type: "ForEvolu",
        id: setup.evoluInstanceId,
        message: { type: "Export" },
      },
      exportCallbackId,
    );

    assertLength(exportOutputs, 1);
    const exportOutput = exportOutputs[0];
    assertSame(exportOutput.type, "OnQueuedResponse");
    assertSame(exportOutput.response.type, "ForEvolu");
    assertSame(exportOutput.response.message.type, "Export");
    const file = exportOutput.response.message.file;
    assertEqual(file.byteLength, setup.sqlite.export().byteLength);
    assertEqual(exportOutputs, [
      {
        callbackId: exportCallbackId,
        response: {
          id: setup.evoluInstanceId,
          message: {
            file,
            type: "Export",
          },
          type: "ForEvolu",
        },
        type: "OnQueuedResponse",
      },
    ]);

    assertEqual(getSqliteSnapshot(setup), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_history",
          rows: [
            {
              column: "name",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
              value: "queryable",
            },
            {
              column: "createdAt",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
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
              h1: 185843381343203,
              h2: 137893834435770,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_usage",
          rows: [
            {
              firstTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
              lastTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
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
          name: "testTable",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.000Z",
              id: "ofZXw_hAfJ8fIcpFxi6nag",
              isDeleted: null,
              name: "queryable",
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: null,
            },
          ],
        },
        { name: "_localTable", rows: [] },
      ],
    });
  });
});

describe("sync message flow", () => {
  it("CreateSyncMessages returns a protocol message for synced owners", async () => {
    await using setup = await setupDbWorker();

    assertEqual(
      await postRequest(setup, {
        type: "ForEvolu",
        id: setup.evoluInstanceId,
        message: {
          type: "Mutate",
          changes: [
            createMutationChange({
              table: "testTable",
              id: setup.createId(),
              values: { name: "synced" },
              isInsert: true,
              isDelete: null,
            }),
          ],
          onCompleteIds: [],
          subscribedQueries: emptySet,
        },
      }),
      [
        {
          callbackId: "in2khoBFZNo9ESZlzuacxA",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              messagesByOwnerId: new Map([
                [
                  "BSf-8mxNjgk72yD-D7rr1A",
                  [
                    {
                      change: {
                        id: "ofZXw_hAfJ8fIcpFxi6nag",
                        isDelete: null,
                        isInsert: true,
                        table: "testTable",
                        values: { name: "synced" },
                      },
                      timestamp: {
                        counter: 1,
                        millis: 0,
                        nodeId: "c52bc79b95390c57",
                      },
                    },
                  ],
                ],
              ]),
              rowsByQuery: new Map([]),
              type: "Mutate",
            },
            type: "ForEvolu",
          },
          type: "OnQueuedResponse",
        },
      ],
    );

    assertEqual(
      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "CreateSyncMessages",
          owners: [testAppOwner],
        },
      }),
      [
        {
          callbackId: "dXpWgmgRSqCJV_tQPAS7Ug",
          response: {
            message: {
              protocolMessagesByOwnerId: new Map([
                [
                  "BSf-8mxNjgk72yD-D7rr1A",
                  new Uint8Array([
                    1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15,
                    186, 235, 212, 0, 0, 1, 0, 1, 2, 1, 0, 1, 1, 197, 43, 199,
                    155, 149, 57, 12, 87, 1,
                  ]),
                ],
              ]),
              type: "CreateSyncMessages",
            },
            type: "ForSharedWorker",
          },
          type: "OnQueuedResponse",
        },
      ],
    );

    assertEqual(getSqliteSnapshot(setup), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_history",
          rows: [
            {
              column: "name",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
              value: "synced",
            },
            {
              column: "createdAt",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
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
              h1: 185843381343203,
              h2: 137893834435770,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_usage",
          rows: [
            {
              firstTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
              lastTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
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
          name: "testTable",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.000Z",
              id: "ofZXw_hAfJ8fIcpFxi6nag",
              isDeleted: null,
              name: "synced",
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: null,
            },
          ],
        },
        { name: "_localTable", rows: [] },
      ],
    });
  });

  it("CreateSyncMessages isolates owner state across multiple owners", async () => {
    await using setup = await setupDbWorker();

    await postRequest(setup, {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Mutate",
        changes: [
          createMutationChange({
            table: "testTable",
            id: setup.createId(),
            ownerId: testAppOwner.id,
            values: { name: "first owner" },
            isInsert: true,
            isDelete: null,
          }),
          createMutationChange({
            table: "testTable",
            id: setup.createId(),
            ownerId: testDbAppOwner2.id,
            values: { name: "second owner" },
            isInsert: true,
            isDelete: null,
          }),
        ],
        onCompleteIds: [],
        subscribedQueries: emptySet,
      },
    });

    const outputs = await postRequest(setup, {
      type: "ForSharedWorker",
      message: {
        type: "CreateSyncMessages",
        owners: [testAppOwner, testDbAppOwner2],
      },
    });

    assertEqual(outputs, [
      {
        callbackId: "uOCPavv1rW_A-VrpXIfUZA",
        response: {
          message: {
            protocolMessagesByOwnerId: new Map([
              [
                "BSf-8mxNjgk72yD-D7rr1A",
                new Uint8Array([
                  1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15,
                  186, 235, 212, 0, 0, 1, 0, 1, 2, 1, 0, 1, 1, 197, 43, 199,
                  155, 149, 57, 12, 87, 1,
                ]),
              ],
              [
                "xGMZcTCfF5kWP0I08eWYQw",
                new Uint8Array([
                  1, 196, 99, 25, 113, 48, 159, 23, 153, 22, 63, 66, 52, 241,
                  229, 152, 67, 0, 0, 1, 0, 1, 2, 1, 0, 2, 1, 197, 43, 199, 155,
                  149, 57, 12, 87, 1,
                ]),
              ],
            ]),
            type: "CreateSyncMessages",
          },
          type: "ForSharedWorker",
        },
        type: "OnQueuedResponse",
      },
    ]);
  });

  it("sync mutate batches same-owner changes and updates updatedAt", async () => {
    await using setup = await setupDbWorker();

    const rowId = setup.createId();
    assertEqual(
      await postRequest(setup, {
        type: "ForEvolu",
        id: setup.evoluInstanceId,
        message: {
          type: "Mutate",
          changes: [
            createMutationChange({
              table: "testTable",
              id: rowId,
              values: { name: "before" },
              isInsert: true,
              isDelete: null,
            }),
            createMutationChange({
              table: "testTable",
              id: rowId,
              values: { name: "after" },
              isInsert: false,
              isDelete: null,
            }),
          ],
          onCompleteIds: [],
          subscribedQueries: createSet([testTableQuery]),
        },
      }),
      [
        {
          callbackId: "in2khoBFZNo9ESZlzuacxA",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              messagesByOwnerId: new Map([
                [
                  "BSf-8mxNjgk72yD-D7rr1A",
                  [
                    {
                      change: {
                        id: "ofZXw_hAfJ8fIcpFxi6nag",
                        isDelete: null,
                        isInsert: true,
                        table: "testTable",
                        values: { name: "before" },
                      },
                      timestamp: {
                        counter: 1,
                        millis: 0,
                        nodeId: "c52bc79b95390c57",
                      },
                    },
                    {
                      change: {
                        id: "ofZXw_hAfJ8fIcpFxi6nag",
                        isDelete: null,
                        isInsert: false,
                        table: "testTable",
                        values: { name: "after" },
                      },
                      timestamp: {
                        counter: 2,
                        millis: 0,
                        nodeId: "c52bc79b95390c57",
                      },
                    },
                  ],
                ],
              ]),
              rowsByQuery: new Map([
                [
                  '["select \\"id\\", \\"name\\" from \\"testTable\\"",[],[]]',
                  [{ id: "ofZXw_hAfJ8fIcpFxi6nag", name: "after" }],
                ],
              ]),
              type: "Mutate",
            },
            type: "ForEvolu",
          },
          type: "OnQueuedResponse",
        },
      ],
    );

    assertEqual(getSqliteSnapshot(setup), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 0, 0, 2, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_history",
          rows: [
            {
              column: "name",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
              value: "before",
            },
            {
              column: "createdAt",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
              value: "1970-01-01T00:00:00.000Z",
            },
            {
              column: "name",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 2, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
              value: "after",
            },
            {
              column: "updatedAt",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 2, 197, 43, 199, 155, 149, 57, 12, 87,
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
              h1: 185843381343203,
              h2: 137893834435770,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
            {
              c: 1,
              h1: 169477223441834,
              h2: 244670917634708,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 2, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_usage",
          rows: [
            {
              firstTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
              lastTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 2, 197, 43, 199, 155, 149, 57, 12, 87,
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
          name: "testTable",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.000Z",
              id: "ofZXw_hAfJ8fIcpFxi6nag",
              isDeleted: null,
              name: "after",
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
          ],
        },
        { name: "_localTable", rows: [] },
      ],
    });
  });

  it("ApplySyncMessage writes received rows and queries them", async () => {
    await using setup = await setupDbWorker();

    assertEqual(
      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: await createBroadcastProtocolMessage([
            {
              timestamp: createTimestamp({
                millis: Millis.orThrow(1),
                counter: 0 as never,
              }),
              change: DbChange.orThrow({
                table: "testTable",
                id: setup.createId(),
                values: { name: "synced" },
                isInsert: true,
                isDelete: null,
              }),
            },
          ]),
        },
      }),
      [
        {
          callbackId: "in2khoBFZNo9ESZlzuacxA",
          response: {
            message: {
              didWriteMessages: true,
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              result: { ok: true, value: { type: "Broadcast" } },
              type: "ApplySyncMessage",
            },
            type: "ForSharedWorker",
          },
          type: "OnQueuedResponse",
        },
      ],
    );

    assertEqual(
      await postRequest(setup, {
        type: "ForEvolu",
        id: setup.evoluInstanceId,
        message: {
          type: "Query",
          queries: createSet([testTableQuery]),
        },
      }),
      [
        {
          callbackId: "dXpWgmgRSqCJV_tQPAS7Ug",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              rowsByQuery: new Map([
                [
                  '["select \\"id\\", \\"name\\" from \\"testTable\\"",[],[]]',
                  [{ id: "ofZXw_hAfJ8fIcpFxi6nag", name: "synced" }],
                ],
              ]),
              type: "Query",
            },
            type: "ForEvolu",
          },
          type: "OnQueuedResponse",
        },
      ],
    );

    assertEqual(getSqliteSnapshot({ sqlite: setup.sqlite }), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 1, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_history",
          rows: [
            {
              column: "name",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: "synced",
            },
            {
              column: "createdAt",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: "1970-01-01T00:00:00.001Z",
            },
          ],
        },
        { name: "evolu_message_quarantine", rows: [] },
        {
          name: "evolu_timestamp",
          rows: [
            {
              c: 1,
              h1: 233868751958873,
              h2: 133743750684856,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
            },
          ],
        },
        {
          name: "evolu_usage",
          rows: [
            {
              firstTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              lastTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
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
          name: "testTable",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.001Z",
              id: "ofZXw_hAfJ8fIcpFxi6nag",
              isDeleted: null,
              name: "synced",
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: null,
            },
          ],
        },
        { name: "_localTable", rows: [] },
      ],
    });
  });

  it("ApplySyncMessage emits Error for corrupted messages", async () => {
    await using setup = await setupDbWorker();

    const validMessage = await createBroadcastProtocolMessage([
      {
        timestamp: createTimestamp({
          millis: Millis.orThrow(1),
          counter: 0 as never,
        }),
        change: DbChange.orThrow({
          table: "testTable",
          id: setup.createId(),
          values: { name: "corrupted" },
          isInsert: true,
          isDelete: null,
        }),
      },
    ]);
    const corruptedMessage = Uint8Array.from(validMessage);
    corruptedMessage[corruptedMessage.length - 1] ^= 0xff;

    const outputs = await postRequest(setup, {
      type: "ForSharedWorker",
      message: {
        type: "ApplySyncMessage",
        owner: testAppOwner,
        inputMessage: corruptedMessage,
      },
    });

    assertLength(setup.consoleEntryOrErrors, 1);
    const consoleEntryOrError = setup.consoleEntryOrErrors[0];
    assertSame(consoleEntryOrError.type, "Error");
    assertSame(
      consoleEntryOrError.error.type,
      "DecryptWithXChaCha20Poly1305Error",
    );
    assertInstanceOf(consoleEntryOrError.error.error, Error);
    assertEqual(outputs, [
      {
        callbackId: "in2khoBFZNo9ESZlzuacxA",
        response: {
          message: {
            didWriteMessages: false,
            ownerId: "BSf-8mxNjgk72yD-D7rr1A",
            result: { ok: true, value: { type: "Broadcast" } },
            type: "ApplySyncMessage",
          },
          type: "ForSharedWorker",
        },
        type: "OnQueuedResponse",
      },
    ]);

    assertEqual(getSqliteSnapshot(setup), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 0, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        { name: "evolu_history", rows: [] },
        { name: "evolu_message_quarantine", rows: [] },
        { name: "evolu_timestamp", rows: [] },
        { name: "evolu_usage", rows: [] },
        { name: "testTable", rows: [] },
        { name: "_localTable", rows: [] },
      ],
    });
  });

  it("ApplySyncMessage emits Error for timestamps beyond max drift", async () => {
    await using setup = await setupDbWorker();

    const farFutureMessage = await createBroadcastProtocolMessage([
      {
        timestamp: createTimestamp({
          millis: Millis.orThrow(10 * 60 * 1000),
          counter: 0 as never,
        }),
        change: DbChange.orThrow({
          table: "testTable",
          id: setup.createId(),
          values: { name: "future" },
          isInsert: true,
          isDelete: null,
        }),
      },
    ]);

    const outputs = await postRequest(setup, {
      type: "ForSharedWorker",
      message: {
        type: "ApplySyncMessage",
        owner: testAppOwner,
        inputMessage: farFutureMessage,
      },
    });

    assertEqual(setup.consoleEntryOrErrors, [
      {
        type: "Error",
        error: {
          type: "TimestampDriftError",
          now: 0,
          next: 600000,
        },
      },
    ]);
    assertEqual(outputs, [
      {
        callbackId: "in2khoBFZNo9ESZlzuacxA",
        response: {
          message: {
            didWriteMessages: false,
            ownerId: "BSf-8mxNjgk72yD-D7rr1A",
            result: { ok: true, value: { type: "Broadcast" } },
            type: "ApplySyncMessage",
          },
          type: "ForSharedWorker",
        },
        type: "OnQueuedResponse",
      },
    ]);

    assertEqual(getSqliteSnapshot(setup), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 0, 0, 0, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        { name: "evolu_history", rows: [] },
        { name: "evolu_message_quarantine", rows: [] },
        { name: "evolu_timestamp", rows: [] },
        { name: "evolu_usage", rows: [] },
        { name: "testTable", rows: [] },
        { name: "_localTable", rows: [] },
      ],
    });
  });

  describe("CRDT", () => {
    const queryRows = async (
      setup: DbWorkerSetup,
      query: typeof testTableQuery | typeof testTableWithNoteQuery,
    ): Promise<ReadonlyArray<Record<string, unknown>>> => {
      const output = (
        await postRequest(
          setup,
          {
            type: "ForEvolu",
            id: setup.evoluInstanceId,
            message: {
              type: "Query",
              queries: createSet([query]),
            },
          },
          setup.createId(),
        )
      ).at(0);

      assertNotUndefined(output);
      assertSame(output.type, "OnQueuedResponse");

      const response = output.response;
      assertSame(response.type, "ForEvolu");
      assertSame(response.message.type, "Query");

      const rows = response.message.rowsByQuery.get(query);
      assertNotUndefined(rows);
      return rows;
    };

    const selectHistoryRows = (setup: DbWorkerSetup) =>
      setup.sqlite.exec<{
        readonly column: string;
        readonly timestamp: Uint8Array;
        readonly value: SqliteValue;
      }>(sql`
        select "column", "timestamp", "value"
        from evolu_history
        order by "column", "timestamp";
      `).rows;

    const selectTestTableRows = (setup: DbWorkerSetup) =>
      setup.sqlite.exec<{
        readonly createdAt: string | null;
        readonly id: string;
        readonly isDeleted: number | null;
        readonly name: string | null;
        readonly note: string | null;
        readonly updatedAt: string | null;
      }>(sql`
        select "createdAt", "id", "isDeleted", "name", "note", "updatedAt"
        from testTable
        order by "id";
      `).rows;

    it("Duplicate remote delivery is idempotent", async () => {
      await using setup = await setupDbWorker();

      const rowId = setup.createId();
      const protocolMessage = await createBroadcastProtocolMessage([
        {
          timestamp: createTimestamp({
            millis: Millis.orThrow(1),
            counter: 0 as never,
          }),
          change: DbChange.orThrow({
            table: "testTable",
            id: rowId,
            values: { name: "synced" },
            isInsert: true,
            isDelete: null,
          }),
        },
      ]);

      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: protocolMessage,
        },
      });

      const rowsAfterFirstApply = await queryRows(setup, testTableQuery);
      const historyAfterFirstApply = selectHistoryRows(setup);

      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: protocolMessage,
        },
      });

      const rowsAfterSecondApply = await queryRows(setup, testTableQuery);
      const historyAfterSecondApply = selectHistoryRows(setup);

      assertEqual(rowsAfterSecondApply, rowsAfterFirstApply);
      assertEqual(rowsAfterSecondApply, [{ id: rowId, name: "synced" }]);
      assertEqual(historyAfterSecondApply, historyAfterFirstApply);
      assertEqual(
        historyAfterSecondApply.map(({ column, value }) => ({ column, value })),
        [
          {
            column: "createdAt",
            value: "1970-01-01T00:00:00.001Z",
          },
          {
            column: "name",
            value: "synced",
          },
        ],
      );
    });

    it("Newer message wins even when delivered first", async () => {
      await using setup = await setupDbWorker();

      const rowId = setup.createId();

      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: await createBroadcastProtocolMessage([
            {
              timestamp: createTimestamp({
                millis: Millis.orThrow(2),
                counter: 0 as never,
              }),
              change: DbChange.orThrow({
                table: "testTable",
                id: rowId,
                values: { name: "new" },
                isInsert: true,
                isDelete: null,
              }),
            },
          ]),
        },
      });

      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: await createBroadcastProtocolMessage([
            {
              timestamp: createTimestamp({
                millis: Millis.orThrow(1),
                counter: 0 as never,
              }),
              change: DbChange.orThrow({
                table: "testTable",
                id: rowId,
                values: { name: "old" },
                isInsert: true,
                isDelete: null,
              }),
            },
          ]),
        },
      });

      assertEqual(await queryRows(setup, testTableQuery), [
        { id: rowId, name: "new" },
      ]);
    });

    it("LWW is per-column, not per-row", async () => {
      await using setup = await setupDbWorker({
        sqliteSchema: createTestSqliteSchema(["name", "note"]),
      });

      const rowId = setup.createId();

      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: await createBroadcastProtocolMessage([
            {
              timestamp: createTimestamp({
                millis: Millis.orThrow(2),
                counter: 0 as never,
              }),
              change: DbChange.orThrow({
                table: "testTable",
                id: rowId,
                values: { name: "new" },
                isInsert: false,
                isDelete: null,
              }),
            },
          ]),
        },
      });

      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: await createBroadcastProtocolMessage([
            {
              timestamp: createTimestamp({
                millis: Millis.orThrow(1),
                counter: 0 as never,
              }),
              change: DbChange.orThrow({
                table: "testTable",
                id: rowId,
                values: { name: "old", note: "later" },
                isInsert: true,
                isDelete: null,
              }),
            },
          ]),
        },
      });

      assertEqual(await queryRows(setup, testTableWithNoteQuery), [
        { id: rowId, name: "new", note: "later" },
      ]);

      assertEqual(selectTestTableRows(setup), [
        {
          createdAt: "1970-01-01T00:00:00.001Z",
          id: rowId,
          isDeleted: null,
          name: "new",
          note: "later",
          updatedAt: "1970-01-01T00:00:00.002Z",
        },
      ]);
    });

    it("Newer tombstone wins over an older explicit undelete", async () => {
      await using setup = await setupDbWorker({
        sqliteSchema: createTestSqliteSchema(["name", "note"]),
      });

      const rowId = setup.createId();

      await postRequest(
        setup,
        {
          type: "ForSharedWorker",
          message: {
            type: "ApplySyncMessage",
            owner: testAppOwner,
            inputMessage: await createBroadcastProtocolMessage([
              {
                timestamp: createTimestamp({
                  millis: Millis.orThrow(1),
                  counter: 0 as never,
                }),
                change: DbChange.orThrow({
                  table: "testTable",
                  id: rowId,
                  values: { name: "restored" },
                  isInsert: true,
                  isDelete: false,
                }),
              },
            ]),
          },
        },
        setup.createId(),
      );

      await postRequest(
        setup,
        {
          type: "ForSharedWorker",
          message: {
            type: "ApplySyncMessage",
            owner: testAppOwner,
            inputMessage: await createBroadcastProtocolMessage([
              {
                timestamp: createTimestamp({
                  millis: Millis.orThrow(2),
                  counter: 0 as never,
                }),
                change: DbChange.orThrow({
                  table: "testTable",
                  id: rowId,
                  values: {},
                  isInsert: false,
                  isDelete: true,
                }),
              },
            ]),
          },
        },
        setup.createId(),
      );

      assertEqual(selectTestTableRows(setup), [
        {
          createdAt: "1970-01-01T00:00:00.001Z",
          id: rowId,
          isDeleted: 1,
          name: "restored",
          note: null,
          updatedAt: "1970-01-01T00:00:00.002Z",
        },
      ]);
    });

    it("Older tombstone delivered later still marks the row deleted", async () => {
      await using setup = await setupDbWorker({
        sqliteSchema: createTestSqliteSchema(["name", "note"]),
      });

      const rowId = setup.createId();

      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: await createBroadcastProtocolMessage([
            {
              timestamp: createTimestamp({
                millis: Millis.orThrow(2),
                counter: 0 as never,
              }),
              change: DbChange.orThrow({
                table: "testTable",
                id: rowId,
                values: { name: "new" },
                isInsert: true,
                isDelete: null,
              }),
            },
          ]),
        },
      });

      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: await createBroadcastProtocolMessage([
            {
              timestamp: createTimestamp({
                millis: Millis.orThrow(1),
                counter: 0 as never,
              }),
              change: DbChange.orThrow({
                table: "testTable",
                id: rowId,
                values: {},
                isInsert: false,
                isDelete: true,
              }),
            },
          ]),
        },
      });

      assertEqual(selectTestTableRows(setup), [
        {
          createdAt: "1970-01-01T00:00:00.002Z",
          id: rowId,
          isDeleted: 1,
          name: "new",
          note: null,
          updatedAt: "1970-01-01T00:00:00.001Z",
        },
      ]);
    });

    it("Newer explicit undelete wins over an older tombstone", async () => {
      await using setup = await setupDbWorker({
        sqliteSchema: createTestSqliteSchema(["name", "note"]),
      });

      const rowId = setup.createId();

      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: await createBroadcastProtocolMessage([
            {
              timestamp: createTimestamp({
                millis: Millis.orThrow(2),
                counter: 0 as never,
              }),
              change: DbChange.orThrow({
                table: "testTable",
                id: rowId,
                values: { name: "restored" },
                isInsert: true,
                isDelete: false,
              }),
            },
          ]),
        },
      });

      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: await createBroadcastProtocolMessage([
            {
              timestamp: createTimestamp({
                millis: Millis.orThrow(1),
                counter: 0 as never,
              }),
              change: DbChange.orThrow({
                table: "testTable",
                id: rowId,
                values: {},
                isInsert: false,
                isDelete: true,
              }),
            },
          ]),
        },
      });

      assertEqual(selectTestTableRows(setup), [
        {
          createdAt: "1970-01-01T00:00:00.002Z",
          id: rowId,
          isDeleted: 0,
          name: "restored",
          note: null,
          updatedAt: "1970-01-01T00:00:00.001Z",
        },
      ]);
    });
  });

  it("persisted delete changes survive a sync roundtrip", async () => {
    await using setup = await setupDbWorker();
    const rowId = setup.createId();
    const createSyncMessagesCallbackId = setup.createId();
    const applySyncMessageCallbackId = setup.createId();

    await postRequest(setup, {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Mutate",
        changes: [
          createMutationChange({
            table: "testTable",
            id: rowId,
            values: { name: "synced" },
            isInsert: true,
            isDelete: null,
          }),
        ],
        onCompleteIds: [],
        subscribedQueries: emptySet,
      },
    });

    await postRequest(setup, {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Mutate",
        changes: [
          createMutationChange({
            table: "testTable",
            id: rowId,
            values: {},
            isInsert: false,
            isDelete: true,
          }),
        ],
        onCompleteIds: [],
        subscribedQueries: emptySet,
      },
    });

    const syncResponses = await postRequest(
      setup,
      {
        type: "ForSharedWorker",
        message: {
          type: "CreateSyncMessages",
          owners: [testAppOwner],
        },
      },
      createSyncMessagesCallbackId,
    );

    assertEqual(syncResponses, [
      {
        callbackId: "in2khoBFZNo9ESZlzuacxA",
        response: {
          message: {
            protocolMessagesByOwnerId: new Map([
              [
                "BSf-8mxNjgk72yD-D7rr1A",
                new Uint8Array([
                  1, 5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15,
                  186, 235, 212, 0, 0, 1, 0, 1, 2, 2, 0, 0, 1, 1, 2, 1, 197, 43,
                  199, 155, 149, 57, 12, 87, 2,
                ]),
              ],
            ]),
            type: "CreateSyncMessages",
          },
          type: "ForSharedWorker",
        },
        type: "OnQueuedResponse",
      },
    ]);

    const protocolMessage = getQueuedSharedWorkerMessage(
      syncResponses,
      "CreateSyncMessages",
    ).protocolMessagesByOwnerId.get(testAppOwner.id);
    assertNotUndefined(protocolMessage);

    await using relay = await setupSqliteAndRelayStorage();

    const relayResponse = await relay.run.orThrow(
      applyProtocolMessageAsRelay(protocolMessage),
    );

    const applySyncResponses = await postRequest(
      setup,
      {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: relayResponse.message,
        },
      },
      applySyncMessageCallbackId,
    );

    assertEqual(
      applySyncResponses.map((output) => {
        if (
          output.type === "OnQueuedResponse" &&
          output.response.type === "ForSharedWorker" &&
          output.response.message.type === "ApplySyncMessage" &&
          output.response.message.result.ok &&
          output.response.message.result.value.type === "Response"
        ) {
          return {
            ...output,
            response: {
              ...output.response,
              message: {
                ...output.response.message,
                result: {
                  ...output.response.message.result,
                  value: {
                    ...output.response.message.result.value,
                    message: "<dynamic>",
                  },
                },
              },
            },
          };
        }

        return output;
      }),
      [
        {
          callbackId: "dXpWgmgRSqCJV_tQPAS7Ug",
          response: {
            message: {
              didWriteMessages: false,
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              result: {
                ok: true,
                value: { message: "<dynamic>", type: "Response" },
              },
              type: "ApplySyncMessage",
            },
            type: "ForSharedWorker",
          },
          type: "OnQueuedResponse",
        },
      ],
    );

    const applySyncMessage = getQueuedSharedWorkerMessage(
      applySyncResponses,
      "ApplySyncMessage",
    );
    const clientFollowUpMessage =
      applySyncMessage.result.ok &&
      applySyncMessage.result.value.type === "Response"
        ? applySyncMessage.result.value.message
        : null;
    assertNotNull(clientFollowUpMessage);

    await relay.run.orThrow(applyProtocolMessageAsRelay(clientFollowUpMessage));

    const relayRows = relay.sqlite.exec<{
      readonly timestamp: Uint8Array;
    }>(sql`
      select "timestamp"
      from evolu_message
      where "ownerId" = ${testAppOwnerIdBytes}
      order by "timestamp";
    `).rows;

    const decodedRelayChanges = relayRows.map(({ timestamp }) => {
      const timestampBytes = TimestampBytes.orThrow(timestamp);

      return decryptAndDecodeDbChange(
        {
          timestamp: timestampBytesToTimestamp(timestampBytes),
          change: relay.storage.readDbChange(
            testAppOwnerIdBytes,
            timestampBytes,
          ),
        },
        testAppOwner.encryptionKey,
      );
    });

    assertEqual(
      decodedRelayChanges.map((result) =>
        result.ok
          ? {
              ...result,
              value: { ...result.value, id: "<dynamic>" },
            }
          : result,
      ),
      [
        {
          ok: true,
          value: {
            id: "<dynamic>",
            isDelete: null,
            isInsert: true,
            table: "testTable",
            values: { name: "synced" },
          },
        },
        {
          ok: true,
          value: {
            id: "<dynamic>",
            isDelete: true,
            isInsert: false,
            table: "testTable",
            values: {},
          },
        },
      ],
    );
  });
});

test("sync mutate posts Error when persisted clock exceeds drift", async () => {
  await using dbSetup = await setupDb();

  {
    await using setup = await setupDbWorker({ dbSetup });
    assertEqual(setup.outputs, []);
  }

  dbSetup.sqlite.exec(sql.prepared`
    update evolu_config
    set "clock" = ${timestampToTimestampBytes(
      createTimestamp({
        millis: Millis.orThrow(10 * 60 * 1000),
        counter: 0 as never,
      }),
    )};
  `);

  await using setup = await setupDbWorker({ dbSetup });

  const outputs = await postRequest(
    setup,
    {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Mutate",
        changes: [
          createMutationChange({
            table: "testTable",
            id: setup.createId(),
            values: { name: "drift" },
            isInsert: true,
            isDelete: null,
          }),
        ],
        onCompleteIds: [],
        subscribedQueries: emptySet,
      },
    },
    setup.createId(),
    "activity",
  );

  assertEqual(outputs, []);
  assertEqual(setup.consoleEntryOrErrors, [
    {
      type: "Error",
      error: {
        type: "TimestampDriftError",
        now: 0,
        next: 600000,
      },
    },
  ]);

  assertEqual(getSqliteSnapshot({ sqlite: dbSetup.sqlite }), {
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
        _localTable: new Set([
          "id",
          "createdAt",
          "updatedAt",
          "isDeleted",
          "ownerId",
          "value",
        ]),
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
        testTable: new Set([
          "id",
          "createdAt",
          "updatedAt",
          "isDeleted",
          "ownerId",
          "name",
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
              0, 0, 0, 9, 39, 192, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            ]),
          },
        ],
      },
      { name: "evolu_history", rows: [] },
      { name: "evolu_message_quarantine", rows: [] },
      { name: "evolu_timestamp", rows: [] },
      { name: "evolu_usage", rows: [] },
      { name: "testTable", rows: [] },
      { name: "_localTable", rows: [] },
    ],
  });
});

describe("quarantine replay", () => {
  it("applies quarantined columns after schema expansion", async () => {
    await using dbSetup = await setupDb();

    const expandedSqliteSchema = createTestSqliteSchema(["name", "note"]);

    const protocolMessage = await createBroadcastProtocolMessage([
      {
        timestamp: createTimestamp({
          millis: Millis.orThrow(1),
          counter: 0 as never,
        }),
        change: DbChange.orThrow({
          table: "testTable",
          id: dbSetup.createId(),
          values: { name: "known", note: "later" },
          isInsert: true,
          isDelete: false,
        }),
      },
    ]);

    {
      await using setup = await setupDbWorker({ dbSetup });

      assertEqual(
        await postRequest(setup, {
          type: "ForSharedWorker",
          message: {
            type: "ApplySyncMessage",
            owner: testAppOwner,
            inputMessage: protocolMessage,
          },
        }),
        [
          {
            callbackId: "in2khoBFZNo9ESZlzuacxA",
            response: {
              message: {
                didWriteMessages: true,
                ownerId: "BSf-8mxNjgk72yD-D7rr1A",
                result: { ok: true, value: { type: "Broadcast" } },
                type: "ApplySyncMessage",
              },
              type: "ForSharedWorker",
            },
            type: "OnQueuedResponse",
          },
        ],
      );
    }

    assertEqual(getSqliteSnapshot({ sqlite: dbSetup.sqlite }), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 1, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_history",
          rows: [
            {
              column: "name",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: "known",
            },
            {
              column: "createdAt",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: "1970-01-01T00:00:00.001Z",
            },
            {
              column: "isDeleted",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: 0,
            },
          ],
        },
        {
          name: "evolu_message_quarantine",
          rows: [
            {
              column: "note",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: "later",
            },
          ],
        },
        {
          name: "evolu_timestamp",
          rows: [
            {
              c: 1,
              h1: 233868751958873,
              h2: 133743750684856,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
            },
          ],
        },
        {
          name: "evolu_usage",
          rows: [
            {
              firstTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              lastTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
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
          name: "testTable",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.001Z",
              id: "ofZXw_hAfJ8fIcpFxi6nag",
              isDeleted: 0,
              name: "known",
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: null,
            },
          ],
        },
        { name: "_localTable", rows: [] },
      ],
    });

    {
      await using setup = await setupDbWorker({ dbSetup });
      assertEqual(setup.outputs, []);
    }

    assertEqual(getSqliteSnapshot({ sqlite: dbSetup.sqlite }), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
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
                0, 0, 0, 0, 0, 1, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_history",
          rows: [
            {
              column: "name",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: "known",
            },
            {
              column: "createdAt",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: "1970-01-01T00:00:00.001Z",
            },
            {
              column: "isDeleted",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: 0,
            },
          ],
        },
        {
          name: "evolu_message_quarantine",
          rows: [
            {
              column: "note",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: "later",
            },
          ],
        },
        {
          name: "evolu_timestamp",
          rows: [
            {
              c: 1,
              h1: 233868751958873,
              h2: 133743750684856,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
            },
          ],
        },
        {
          name: "evolu_usage",
          rows: [
            {
              firstTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              lastTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
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
          name: "testTable",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.001Z",
              id: "ofZXw_hAfJ8fIcpFxi6nag",
              isDeleted: 0,
              name: "known",
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: null,
            },
          ],
        },
        { name: "_localTable", rows: [] },
      ],
    });

    {
      await using setup = await setupDbWorker({
        dbSetup,
        sqliteSchema: expandedSqliteSchema,
      });

      assertEqual(
        await postRequest(setup, {
          type: "ForEvolu",
          id: setup.evoluInstanceId,
          message: {
            type: "Query",
            queries: createSet([testTableWithNoteQuery]),
          },
        }),
        [
          {
            callbackId: "dXpWgmgRSqCJV_tQPAS7Ug",
            response: {
              id: "ncqMQ1uwd5-zf5YKUbT3VA",
              message: {
                rowsByQuery: new Map([
                  [
                    '["select \\"id\\", \\"name\\", \\"note\\" from \\"testTable\\"",[],[]]',
                    [
                      {
                        id: "ofZXw_hAfJ8fIcpFxi6nag",
                        name: "known",
                        note: "later",
                      },
                    ],
                  ],
                ]),
                type: "Query",
              },
              type: "ForEvolu",
            },
            type: "OnQueuedResponse",
          },
        ],
      );
    }

    assertEqual(getSqliteSnapshot({ sqlite: dbSetup.sqlite }), {
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
          _localTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "value",
          ]),
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
          testTable: new Set([
            "id",
            "createdAt",
            "updatedAt",
            "isDeleted",
            "ownerId",
            "name",
            "note",
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
                0, 0, 0, 0, 0, 1, 0, 1, 197, 43, 199, 155, 149, 57, 12, 87,
              ]),
            },
          ],
        },
        {
          name: "evolu_history",
          rows: [
            {
              column: "name",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: "known",
            },
            {
              column: "createdAt",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: "1970-01-01T00:00:00.001Z",
            },
            {
              column: "isDeleted",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: 0,
            },
            {
              column: "note",
              id: new Uint8Array([
                161, 246, 87, 195, 248, 64, 124, 159, 31, 33, 202, 69, 198, 46,
                167, 106,
              ]),
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              table: "testTable",
              timestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              value: "later",
            },
          ],
        },
        { name: "evolu_message_quarantine", rows: [] },
        {
          name: "evolu_timestamp",
          rows: [
            {
              c: 1,
              h1: 233868751958873,
              h2: 133743750684856,
              l: 1,
              ownerId: new Uint8Array([
                5, 39, 254, 242, 108, 77, 142, 9, 59, 219, 32, 254, 15, 186,
                235, 212,
              ]),
              t: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
            },
          ],
        },
        {
          name: "evolu_usage",
          rows: [
            {
              firstTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ]),
              lastTimestamp: new Uint8Array([
                0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
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
          name: "testTable",
          rows: [
            {
              createdAt: "1970-01-01T00:00:00.001Z",
              id: "ofZXw_hAfJ8fIcpFxi6nag",
              isDeleted: 0,
              name: "known",
              note: "later",
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              updatedAt: null,
            },
          ],
        },
        { name: "_localTable", rows: [] },
      ],
    });
  });

  it("quarantined column replay respects LWW", async () => {
    await using dbSetup = await setupDb();

    const rowId = dbSetup.createId();

    {
      await using setup = await setupDbWorker({ dbSetup });

      await postRequest(
        setup,
        {
          type: "ForSharedWorker",
          message: {
            type: "ApplySyncMessage",
            owner: testAppOwner,
            inputMessage: await createBroadcastProtocolMessage([
              {
                timestamp: createTimestamp({
                  millis: Millis.orThrow(2),
                  counter: 0 as never,
                }),
                change: DbChange.orThrow({
                  table: "testTable",
                  id: rowId,
                  values: { name: "known", note: "newer" },
                  isInsert: true,
                  isDelete: false,
                }),
              },
            ]),
          },
        },
        setup.createId(),
      );

      await postRequest(
        setup,
        {
          type: "ForSharedWorker",
          message: {
            type: "ApplySyncMessage",
            owner: testAppOwner,
            inputMessage: await createBroadcastProtocolMessage([
              {
                timestamp: createTimestamp({
                  millis: Millis.orThrow(1),
                  counter: 0 as never,
                }),
                change: DbChange.orThrow({
                  table: "testTable",
                  id: rowId,
                  values: { note: "older" },
                  isInsert: false,
                  isDelete: null,
                }),
              },
            ]),
          },
        },
        setup.createId(),
      );
    }

    assertEqual(
      dbSetup.sqlite.exec<{
        readonly column: string;
        readonly value: SqliteValue;
      }>(sql`
        select "column", "value"
        from evolu_message_quarantine
        where "table" = ${"testTable"}
        order by "timestamp" desc;
      `).rows,
      [
        { column: "note", value: "newer" },
        { column: "note", value: "older" },
      ],
    );

    {
      await using setup = await setupDbWorker({
        dbSetup,
        sqliteSchema: createTestSqliteSchema(["name", "note"]),
      });

      const output = (
        await postRequest(
          setup,
          {
            type: "ForEvolu",
            id: setup.evoluInstanceId,
            message: {
              type: "Query",
              queries: createSet([testTableWithNoteQuery]),
            },
          },
          setup.createId(),
        )
      ).at(0);

      assertNotUndefined(output);
      assertSame(output.type, "OnQueuedResponse");
      assertSame(output.response.type, "ForEvolu");
      assertSame(output.response.message.type, "Query");

      assertEqual(
        output.response.message.rowsByQuery.get(testTableWithNoteQuery),
        [{ id: rowId, name: "known", note: "newer" }],
      );
    }

    assertEqual(
      dbSetup.sqlite.exec<{
        readonly value: SqliteValue;
      }>(sql`
        select "value"
        from evolu_message_quarantine
        where "table" = ${"testTable"} and "column" = ${"note"};
      `).rows,
      [],
    );
    assertEqual(
      dbSetup.sqlite.exec<{
        readonly note: string;
      }>(sql`
        select "note"
        from testTable
        where "id" = ${rowId};
      `).rows,
      [{ note: "newer" }],
    );
  });

  it("applies quarantined tables after schema expansion", async () => {
    await using dbSetup = await setupDb();

    const futureTableQuery = createQueryBuilder({
      futureTable: {
        id: id("FutureTable"),
        name: String,
      },
    })((db) => db.selectFrom("futureTable").select(["id", "name"]));
    const expandedSqliteSchema: SqliteSchema = {
      indexes: [],
      tables: {
        ...createTestSqliteSchema(["name"]).tables,
        futureTable: new Set(["name"]),
      },
    };
    const futureRowId = dbSetup.createId();
    const applySyncCallbackId = dbSetup.createId();
    const queryCallbackId = dbSetup.createId();

    const protocolMessage = await createBroadcastProtocolMessage([
      {
        timestamp: createTimestamp({
          millis: Millis.orThrow(1),
          counter: 0 as never,
        }),
        change: DbChange.orThrow({
          table: "futureTable",
          id: futureRowId,
          values: { name: "future row" },
          isInsert: true,
          isDelete: false,
        }),
      },
    ]);

    {
      await using setup = await setupDbWorker({ dbSetup });

      assertEqual(
        await postRequest(
          setup,
          {
            type: "ForSharedWorker",
            message: {
              type: "ApplySyncMessage",
              owner: testAppOwner,
              inputMessage: protocolMessage,
            },
          },
          applySyncCallbackId,
        ),
        [
          {
            callbackId: applySyncCallbackId,
            response: {
              message: {
                didWriteMessages: true,
                ownerId: testAppOwner.id,
                result: {
                  ok: true,
                  value: { type: "Broadcast" },
                },
                type: "ApplySyncMessage",
              },
              type: "ForSharedWorker",
            },
            type: "OnQueuedResponse",
          },
        ],
      );
    }

    assertFalse(
      "futureTable" in
        getSqliteSnapshot({ sqlite: dbSetup.sqlite }).schema.tables,
    );
    assertEqual(
      dbSetup.sqlite.exec<{
        readonly column: string;
        readonly value: SqliteValue;
      }>(sql`
        select "column", "value"
        from evolu_message_quarantine
        where "table" = ${"futureTable"}
        order by "column";
      `).rows,
      [
        { column: "createdAt", value: "1970-01-01T00:00:00.001Z" },
        { column: "isDeleted", value: 0 },
        { column: "name", value: "future row" },
      ],
    );

    {
      await using setup = await setupDbWorker({ dbSetup });
      assertEqual(setup.outputs, []);
    }

    assertEqual(
      dbSetup.sqlite.exec<{
        readonly column: string;
        readonly value: SqliteValue;
      }>(sql`
        select "column", "value"
        from evolu_message_quarantine
        where "table" = ${"futureTable"}
        order by "column";
      `).rows,
      [
        { column: "createdAt", value: "1970-01-01T00:00:00.001Z" },
        { column: "isDeleted", value: 0 },
        { column: "name", value: "future row" },
      ],
    );

    {
      await using setup = await setupDbWorker({
        dbSetup,
        sqliteSchema: expandedSqliteSchema,
      });

      assertEqual(
        await postRequest(
          setup,
          {
            type: "ForEvolu",
            id: setup.evoluInstanceId,
            message: {
              type: "Query",
              queries: createSet([futureTableQuery]),
            },
          },
          queryCallbackId,
        ),
        [
          {
            callbackId: queryCallbackId,
            response: {
              id: setup.evoluInstanceId,
              message: {
                rowsByQuery: new Map([
                  [futureTableQuery, [{ id: futureRowId, name: "future row" }]],
                ]),
                type: "Query",
              },
              type: "ForEvolu",
            },
            type: "OnQueuedResponse",
          },
        ],
      );
    }

    assertTrue(
      "futureTable" in
        getSqliteSnapshot({ sqlite: dbSetup.sqlite }).schema.tables,
    );
    assertEqual(
      dbSetup.sqlite.exec<{
        readonly column: string;
        readonly value: SqliteValue;
      }>(sql`
        select "column", "value"
        from evolu_message_quarantine
        where "table" = ${"futureTable"};
      `).rows,
      [],
    );
    assertEqual(
      dbSetup.sqlite.exec<{
        readonly column: string;
        readonly value: SqliteValue;
      }>(sql`
        select "column", "value"
        from evolu_history
        where "table" = ${"futureTable"}
        order by "column";
      `).rows,
      [
        { column: "createdAt", value: "1970-01-01T00:00:00.001Z" },
        { column: "isDeleted", value: 0 },
        { column: "name", value: "future row" },
      ],
    );
    assertEqual(
      dbSetup.sqlite.exec<{
        readonly createdAt: string;
        readonly id: Id;
        readonly isDeleted: SqliteValue;
        readonly name: string;
        readonly ownerId: typeof testAppOwner.id;
        readonly updatedAt: string | null;
      }>(sql`
        select "createdAt", "id", "isDeleted", "name", "ownerId", "updatedAt"
        from "futureTable";
      `).rows,
      [
        {
          createdAt: "1970-01-01T00:00:00.001Z",
          id: futureRowId,
          isDeleted: 0,
          name: "future row",
          ownerId: testAppOwner.id,
          updatedAt: null,
        },
      ],
    );
  });
});
