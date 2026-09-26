import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import type { NonEmptyReadonlyArray } from "../../../../packages/common/src/Array.ts";
import {
  assert,
  assertEqual,
  assertErr,
  assertFalse,
  assertInstanceOf,
  assertLength,
  assertNonEmptyReadonlyArray,
  assertNotNull,
  assertNotUndefined,
  assertOk,
  assertSame,
  assertTrue,
} from "../../../../packages/common/src/Assert.ts";
import {
  createConsoleStoreOutput,
  testCreateConsole,
  type ConsoleEntry,
  type ConsoleStoreOutput,
  type TestConsole,
} from "../../../../packages/common/src/Console.ts";
import {
  constVoid,
  disposable,
} from "../../../../packages/common/src/Function.ts";
import {
  startDbWorker,
  type DbWorkerInit,
} from "../../../../packages/common/src/local-first/Db.ts";
import {
  createAppOwner,
  createOwnerSecret,
  ownerIdToOwnerIdBytes,
  testAppOwner,
  type Owner,
} from "../../../../packages/common/src/local-first/Owner.ts";
import {
  applyProtocolMessageAsRelay,
  createProtocolMessageBuffer,
  createProtocolMessageFromCrdtMessages,
  decryptAndDecodeDbChange,
  encodeAndEncryptDbChange,
  MessageType,
  ProtocolErrorCode,
} from "../../../../packages/common/src/local-first/Protocol.ts";
import type { Query } from "../../../../packages/common/src/local-first/Query.ts";
import {
  createQueryBuilder,
  QuarantineOrigin,
  QuarantineReason,
  type MutationChange,
} from "../../../../packages/common/src/local-first/Schema.ts";
import type {
  ConsoleEntryOrError,
  DbWorkerInput,
  DbWorkerOutput,
  DbWorkerRequest,
  DbWorkerWriteRequest,
  EvoluInstanceId,
} from "../../../../packages/common/src/local-first/Shared.ts";
import { consoleEntryOrErrorBroadcastChannelName } from "../../../../packages/common/src/local-first/Shared.ts";
import { DbChange } from "../../../../packages/common/src/local-first/Storage.ts";
import {
  createTimestamp,
  Counter,
  defaultTimestampMaxDrift,
  maxCounter,
  maxNodeId,
  type Timestamp,
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
  sqliteQueryStringToSqliteQuery,
  type CreateSqliteDriver,
  type Sqlite,
  type SqliteQuery,
  type SqliteSchema,
  type SqliteValue,
} from "../../../../packages/common/src/Sqlite.ts";
import {
  testCreateDeps,
  testCreateRun,
} from "../../../../packages/common/src/Task.ts";
import { testCreateId } from "../../../../packages/common/src/Test.ts";
import {
  maxMillis,
  Millis,
  millisToDateIso,
  testCreateTime,
  type TestTime,
} from "../../../../packages/common/src/Time.ts";
import {
  id,
  Name,
  PositiveInt,
  String,
  testName,
  type ExtractTyped,
  type Id,
} from "../../../../packages/common/src/Type.ts";
import {
  createMessagePort,
  createWorker,
  testCreateBroadcastChannel,
  testCreateMessageChannel,
  testWaitForWorkerMessage,
  type MessagePort,
  type WorkerSelf,
} from "../../../../packages/common/src/Worker.ts";
import { createBetterSqliteDriver } from "../../../../packages/nodejs/src/Sqlite.ts";
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

const quarantineIndex = {
  name: "evolu_message_quarantine_reason_timestamp",
  sql: 'create index evolu_message_quarantine_reason_timestamp on evolu_message_quarantine (\n        "reason",\n        "timestamp"\n      )',
};

const quarantineQuery = createQuery((db) =>
  db
    .selectFrom("evolu_message_quarantine")
    .select(["column", "value", "reason", "origin", "quarantinedAt"])
    .orderBy("column"),
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
  owner = testAppOwner,
): Promise<Uint8Array> => {
  const requestMessage = createProtocolMessageFromCrdtMessages(
    testCreateDeps(),
  )(owner, messages);

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
  createSqliteDriver: suppliedDriver = testCreateSqliteDep.createSqliteDriver,
  onExec,
}: {
  time?: TestTime;
  createSqliteDriver?: CreateSqliteDriver;
  onExec?: (query: SqliteQuery) => void;
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

  const driver = disposer.use(await run.ok(suppliedDriver(name)));

  // Tests need a stable handle to the lazily created SQLite driver.
  const createSqliteDriver: CreateSqliteDriver = (_name, _options) => () =>
    ok({
      exec: (query) => {
        onExec?.(query);
        return driver.exec(query);
      },
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
  readonly getClock: () => Timestamp;
  readonly initOutputs: ReadonlyArray<DbWorkerOutput>;
  readonly lockManager: LockManagerDep["lockManager"];
  readonly outputs: Array<DbWorkerOutput>;
  readonly port: MessagePort<DbWorkerInput, DbWorkerOutput>;
  readonly consoleEntryOrErrors: Array<ConsoleEntryOrError>;
  readonly waitForActivity: () => Promise<void>;
  readonly waitForResponse: (attemptId: Id) => Promise<void>;
  readonly workerName: Name;
}

const setupDbWorker = async ({
  dbSetup: providedDbSetup,
  sqliteSchema = defaultSqliteSchema,
  memoryOnly = true,
  time,
  console = testCreateConsole({ level: "silent" }),
  onThrown,
  expectRefused = false,
}: {
  dbSetup?: DbSetup;
  memoryOnly?: boolean;
  sqliteSchema?: SqliteSchema;
  time?: TestTime;
  console?: TestConsole;
  onThrown?: (error: unknown) => void;
  /** The worker is expected to post LeaderRefused instead of LeaderAcquired. */
  expectRefused?: boolean;
} = {}): Promise<DbWorkerSetup> => {
  await using disposer = new AsyncDisposableStack();

  const dbSetup =
    providedDbSetup ??
    disposer.use(await setupDb(time == null ? undefined : { time }));
  const lockManager = testCreateLockManager();
  const workerName = dbSetup.name;

  const run = disposer.use(
    testCreateRun({
      console,
      consoleStoreOutputEntry: dbSetup.consoleStoreOutput.entry,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessagePort:
        onThrown === undefined
          ? createMessagePort
          : (native) => {
              const port = createMessagePort(native);
              return {
                ...port,
                get onMessage() {
                  return port.onMessage;
                },
                set onMessage(handler) {
                  port.onMessage =
                    handler === null
                      ? null
                      : (input) => {
                          try {
                            handler(input);
                          } catch (error) {
                            onThrown(error);
                          }
                        };
                },
              };
            },
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
  const responseWaitersByAttemptId = new Map<Id, () => void>();
  let activity = Promise.withResolvers<void>();
  const waitForActivity = (): Promise<void> => activity.promise;
  const waitForResponse = (attemptId: Id): Promise<void> => {
    const response = Promise.withResolvers<void>();
    responseWaitersByAttemptId.set(attemptId, response.resolve);
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

  let clock: Timestamp | undefined;
  channel.port2.onMessage = (output) => {
    if (output.type === "LeaderAcquired") clock = output.clock;
    else if (
      output.type === "OnQueuedResponse" &&
      (output.response.message.type === "Mutate" ||
        output.response.message.type === "ApplySyncMessage")
    )
      clock = output.response.message.clock;
    outputs.push(output);
    if (output.type === "OnQueuedResponse") {
      responseWaitersByAttemptId.get(output.attemptId)?.();
      responseWaitersByAttemptId.delete(output.attemptId);
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

  const getClock = (): Timestamp => {
    assertNotUndefined(clock);
    return clock;
  };
  const initOutputs = outputs.splice(0);
  if (expectRefused) {
    assertLength(initOutputs, 1);
    assertSame(initOutputs[0].type, "LeaderRefused");
  } else {
    assertEqual(initOutputs, [
      { clock: getClock(), type: "LeaderAcquired", name: workerName },
    ]);
  }

  const disposables = disposer.move();

  return {
    ...dbSetup,
    getClock,
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

/** Starts a DbWorker on `dbSetup` and returns how its run ends. */
const startDbWorkerUntilDone = async (dbSetup: DbSetup) => {
  const self: WorkerSelf<DbWorkerInit> = {
    postMessage: constVoid,
    onMessage: null,
    native: {} as WorkerSelf<DbWorkerInit>["native"],
    [Symbol.dispose]: constVoid,
  };
  await using run = testCreateRun({
    console: testCreateConsole({ level: "silent" }),
    consoleStoreOutputEntry: dbSetup.consoleStoreOutput.entry,
    createBroadcastChannel: testCreateBroadcastChannel,
    createMessagePort,
    lockManager: testCreateLockManager(),
    createSqliteDriver: dbSetup.createSqliteDriver,
    time: dbSetup.time,
  });
  // Returns a panic as an Err instead of rejecting.
  const done = run.abortable(startDbWorker(self));
  using channel = testCreateMessageChannel<DbWorkerOutput, DbWorkerInput>();
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
  return await done;
};

const readStoredClock = (setup: DbWorkerSetup): Timestamp => {
  const { rows } = setup.sqlite.exec<{ clock: TimestampBytes }>(sql`
    select clock from evolu_config;
  `);
  assertLength(rows, 1);
  return timestampBytesToTimestamp(rows[0].clock);
};

const readQuarantineRows = (setup: DbSetup) =>
  setup.sqlite.exec<typeof quarantineQuery.Row>(
    sqliteQueryStringToSqliteQuery(quarantineQuery),
  ).rows;

const postRequest = async (
  setup: DbWorkerSetup,
  request: DbWorkerRequest,
  attemptId = setup.createId(),
  waitFor: "activity" | "response" = "response",
  context?: { clock: Timestamp; now: Millis },
): Promise<ReadonlyArray<DbWorkerOutput>> => {
  const completion =
    waitFor === "response"
      ? setup.waitForResponse(attemptId)
      : setup.waitForActivity();
  const envelope = { type: "Request" as const, attemptId };
  if (request.type === "ForEvolu") {
    const { id, message } = request;
    if (message.type === "Mutate") {
      setup.port.postMessage({
        ...envelope,
        request: { type: "ForEvolu", id, message },
        clock: context?.clock ?? setup.getClock(),
        now: context?.now ?? setup.time.now(),
      });
    } else {
      setup.port.postMessage({
        ...envelope,
        request: { type: "ForEvolu", id, message },
      });
    }
  } else {
    const { message } = request;
    if (message.type === "ApplySyncMessage") {
      setup.port.postMessage({
        ...envelope,
        request: { type: "ForSharedWorker", message },
        clock: context?.clock ?? setup.getClock(),
        now: context?.now ?? setup.time.now(),
      });
    } else {
      setup.port.postMessage({
        ...envelope,
        request: { type: "ForSharedWorker", message },
      });
    }
  }
  await completion;
  return setup.outputs.splice(0);
};

const setupMutateRequest = (
  id: EvoluInstanceId,
  changes: NonEmptyReadonlyArray<MutationChange>,
  {
    onCompleteIds = [],
    subscribedQueries = emptySet,
  }: {
    onCompleteIds?: ReadonlyArray<Id>;
    subscribedQueries?: ReadonlySet<Query>;
  } = {},
): ExtractTyped<DbWorkerWriteRequest, "ForEvolu"> => ({
  type: "ForEvolu",
  id,
  message: { type: "Mutate", changes, onCompleteIds, subscribedQueries },
});

const setupApplySyncRequest = (
  inputMessage: Uint8Array,
  owner: Owner = testAppOwner,
): ExtractTyped<DbWorkerWriteRequest, "ForSharedWorker"> => ({
  type: "ForSharedWorker",
  message: { type: "ApplySyncMessage", owner, inputMessage },
});

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
      {
        clock: setup.getClock(),
        type: "LeaderAcquired",
        name: setup.workerName,
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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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
      {
        clock: setup.getClock(),
        type: "LeaderAcquired",
        name: setup.workerName,
      },
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
          attemptId: "in2khoBFZNo9ESZlzuacxA",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              clock: setup.getClock(),
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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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
          attemptId: "dXpWgmgRSqCJV_tQPAS7Ug",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              clock: setup.getClock(),
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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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
          attemptId: "uOCPavv1rW_A-VrpXIfUZA",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              clock: setup.getClock(),
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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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

  it("mixed local-only and sync mutate uses one captured time", async () => {
    await using setup = await setupDbWorker({
      time: testCreateTime({
        startAt: Millis.orThrow(100),
        autoIncrement: "sync",
      }),
    });
    const context = { clock: setup.getClock(), now: setup.time.now() };
    const createdAt = millisToDateIso(context.now);

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
      "response",
      context,
    );

    assertEqual(
      setup.sqlite.exec(sql`
        select value, createdAt from "_localTable" order by value;
      `).rows,
      [
        { value: "first local", createdAt },
        { value: "second local", createdAt },
      ],
    );
    assertEqual(
      setup.sqlite.exec(sql`select name, createdAt from testTable;`).rows,
      [{ name: "synced", createdAt }],
    );
    assertSame(setup.getClock().millis, context.now);
    assertSame(setup.getClock().counter, 0);
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
          attemptId: "dXpWgmgRSqCJV_tQPAS7Ug",
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

    const exportAttemptId = setup.createId();
    const exportOutputs = await postRequest(
      setup,
      {
        type: "ForEvolu",
        id: setup.evoluInstanceId,
        message: { type: "Export" },
      },
      exportAttemptId,
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
        attemptId: exportAttemptId,
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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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
          attemptId: "in2khoBFZNo9ESZlzuacxA",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              clock: setup.getClock(),
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
          attemptId: "dXpWgmgRSqCJV_tQPAS7Ug",
          response: {
            message: {
              failedOwnerIds: new Set(),
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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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
        attemptId: "uOCPavv1rW_A-VrpXIfUZA",
        response: {
          message: {
            failedOwnerIds: new Set(),
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

  it("CreateSyncMessages logs and reports an owner whose message creation throws", async () => {
    const injected = new Error("injected sync creation failure");
    let armed = false;
    await using dbSetup = await setupDb({
      onExec: () => {
        if (!armed) return;
        armed = false;
        throw injected;
      },
    });
    const console = testCreateConsole({ level: "error" });
    const thrown: Array<unknown> = [];
    await using setup = await setupDbWorker({
      dbSetup,
      console,
      onThrown: (error) => {
        thrown.push(error);
      },
    });

    // The first owner's first query fails.
    armed = true;
    setup.port.postMessage({
      type: "Request",
      attemptId: setup.createId(),
      request: {
        type: "ForSharedWorker",
        message: {
          type: "CreateSyncMessages",
          owners: [testAppOwner, testDbAppOwner2],
        },
      },
    });
    await testWaitForWorkerMessage();
    await testWaitForWorkerMessage();

    // The attempt is answered, so the shared worker's queue keeps running.
    assertEqual(thrown, []);
    assertLength(setup.outputs, 1);
    const response = getQueuedSharedWorkerMessage(
      setup.outputs,
      "CreateSyncMessages",
    );
    assertEqual(response.failedOwnerIds, new Set([testAppOwner.id]));
    assertEqual(
      [...response.protocolMessagesByOwnerId.keys()],
      [testDbAppOwner2.id],
    );
    const entries = console.getEntriesSnapshot();
    assertLength(entries, 1);
    assertSame(entries[0].method, "error");
    assertEqual(entries[0].args, [injected]);
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
          attemptId: "in2khoBFZNo9ESZlzuacxA",
          response: {
            id: "ncqMQ1uwd5-zf5YKUbT3VA",
            message: {
              clock: setup.getClock(),
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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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
          attemptId: "in2khoBFZNo9ESZlzuacxA",
          response: {
            message: {
              clock: setup.getClock(),
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
          attemptId: "dXpWgmgRSqCJV_tQPAS7Ug",
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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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

  it("ApplySyncMessage returns the decryption error without storing a partially valid batch", async () => {
    await using setup = await setupDbWorker();
    const clock = setup.getClock();

    const validMessage = await createBroadcastProtocolMessage([
      {
        timestamp: createTimestamp({ millis: Millis.orThrow(1) }),
        change: DbChange.orThrow({
          table: "testTable",
          id: setup.createId(),
          values: { name: "valid before corruption" },
          isInsert: true,
          isDelete: null,
        }),
      },
      {
        timestamp: createTimestamp({
          millis: Millis.orThrow(2),
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

    await testWaitForWorkerMessage();
    assertEqual(setup.consoleEntryOrErrors, []);
    assertLength(outputs, 1);
    const response = getQueuedSharedWorkerMessage(outputs, "ApplySyncMessage");
    assertErr(response.result);
    assertSame(response.result.error.type, "DecryptWithXChaCha20Poly1305Error");
    assertInstanceOf(response.result.error.error, Error);
    assertSame(response.ownerId, testAppOwner.id);
    assertFalse(response.didWriteMessages);
    assertEqual(response.clock, clock);

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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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
    const createSyncMessagesAttemptId = setup.createId();
    const applySyncMessageAttemptId = setup.createId();

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
      createSyncMessagesAttemptId,
    );

    assertEqual(syncResponses, [
      {
        attemptId: "in2khoBFZNo9ESZlzuacxA",
        response: {
          message: {
            failedOwnerIds: new Set(),
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
      applySyncMessageAttemptId,
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
                    broadcast: "<dynamic>",
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
          attemptId: "dXpWgmgRSqCJV_tQPAS7Ug",
          response: {
            message: {
              clock: setup.getClock(),
              didWriteMessages: false,
              ownerId: "BSf-8mxNjgk72yD-D7rr1A",
              result: {
                ok: true,
                value: {
                  broadcast: "<dynamic>",
                  message: "<dynamic>",
                  type: "Response",
                },
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
    assertOk(applySyncMessage.result);
    assertSame(applySyncMessage.result.value.type, "Response");
    const { message: clientFollowUpMessage, broadcast } =
      applySyncMessage.result.value;
    assertNotUndefined(broadcast);

    let didBroadcast = false;
    await relay.run.orThrow(
      applyProtocolMessageAsRelay(clientFollowUpMessage, {
        broadcast: (ownerId, relayBroadcast) => {
          assertSame(ownerId, testAppOwner.id);
          assertEqual(relayBroadcast, broadcast);
          didBroadcast = true;
        },
      }),
    );
    assertTrue(didBroadcast);

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

describe("quarantine replay", () => {
  it("keeps a received change to a local-only table in quarantine", async () => {
    await using dbSetup = await setupDb();
    const protocolMessage = await createBroadcastProtocolMessage([
      {
        timestamp: createTimestamp({ millis: Millis.orThrow(1) }),
        change: DbChange.orThrow({
          table: "_localTable",
          id: dbSetup.createId(),
          values: { value: "remote" },
          isInsert: true,
          isDelete: false,
        }),
      },
    ]);
    const expectedQuarantine = [
      { column: "createdAt", value: new Date(1).toISOString() },
      { column: "isDeleted", value: 0 },
      { column: "value", value: "remote" },
    ].map((row) => ({
      ...row,
      reason: QuarantineReason.Schema,
      origin: QuarantineOrigin.ReceivedMessage,
      quarantinedAt: 0,
    }));

    {
      await using setup = await setupDbWorker({ dbSetup });
      await postRequest(setup, setupApplySyncRequest(protocolMessage));
      assertEqual(
        setup.sqlite.exec(sql`select * from "_localTable";`).rows,
        [],
      );
      assertEqual(readQuarantineRows(setup), expectedQuarantine);
    }
    {
      // Startup replays schema quarantine and still does not apply it.
      await using restarted = await setupDbWorker({ dbSetup });
      assertEqual(
        restarted.sqlite.exec(sql`select * from "_localTable";`).rows,
        [],
      );
      assertEqual(readQuarantineRows(restarted), expectedQuarantine);
    }
  });

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
            attemptId: "in2khoBFZNo9ESZlzuacxA",
            response: {
              message: {
                clock: setup.getClock(),
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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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
              reason: QuarantineReason.Schema,
              origin: QuarantineOrigin.ReceivedMessage,
              quarantinedAt: 0,
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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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
              reason: QuarantineReason.Schema,
              origin: QuarantineOrigin.ReceivedMessage,
              quarantinedAt: 0,
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
            attemptId: "dXpWgmgRSqCJV_tQPAS7Ug",
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
          quarantineIndex,
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
            "reason",
            "origin",
            "quarantinedAt",
          ]),
          evolu_timestamp: new Set(["ownerId", "t", "h1", "h2", "c", "l"]),
          evolu_usage: new Set([
            "ownerId",
            "storedBytes",
            "firstTimestamp",
            "lastTimestamp",
          ]),
          evolu_version: new Set(["dbVersion"]),
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
        { name: "evolu_version", rows: [{ dbVersion: 2 }] },
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
    const applySyncAttemptId = dbSetup.createId();
    const queryAttemptId = dbSetup.createId();

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
          applySyncAttemptId,
        ),
        [
          {
            attemptId: applySyncAttemptId,
            response: {
              message: {
                clock: setup.getClock(),
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
          queryAttemptId,
        ),
        [
          {
            attemptId: queryAttemptId,
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

const setupReplayDatabase = () => {
  const name = Name.orThrow(`evolu-retry-${randomUUID()}`);
  const connections: Array<{ disposed: boolean }> = [];
  let deleteDatabase = constVoid;
  using disposer = new DisposableStack();
  disposer.defer(() => deleteDatabase());
  const createSqliteDriver: CreateSqliteDriver = () => async (run) => {
    const driver = await run.ok(createBetterSqliteDriver(name));
    const connection = { disposed: false };
    connections.push(connection);
    deleteDatabase = driver.deleteDatabase;
    return ok({
      ...driver,
      [Symbol.dispose]: () => {
        driver[Symbol.dispose]();
        connection.disposed = true;
      },
    });
  };
  return disposable({ createSqliteDriver, connections }, disposer);
};

type ReplayKind = "local" | "broadcast" | "response" | "malformed-ranges";

const createReplayRequest = (
  setup: DbWorkerSetup,
  kind: ReplayKind,
  rowId: Id,
): DbWorkerWriteRequest => {
  if (kind === "local") {
    const localId = setup.createId();
    return {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Mutate",
        onCompleteIds: [],
        subscribedQueries: createSet([testTableQuery]),
        changes: [
          createMutationChange({
            table: "testTable",
            id: rowId,
            values: { name: "before", note: "quarantined" },
            isInsert: true,
            isDelete: null,
          }),
          createMutationChange({
            table: "_localTable",
            id: localId,
            values: { value: "insert" },
            isInsert: true,
            isDelete: null,
          }),
          createMutationChange({
            table: "_localTable",
            id: localId,
            values: { value: "update" },
            isInsert: false,
            isDelete: null,
          }),
          createMutationChange({
            table: "_localTable",
            id: localId,
            values: {},
            isInsert: false,
            isDelete: true,
          }),
          createMutationChange({
            table: "_localTable",
            id: setup.createId(),
            values: { value: "kept" },
            isInsert: true,
            isDelete: null,
          }),
        ],
      },
    };
  }
  const buffer = createProtocolMessageBuffer(
    testAppOwner.id,
    kind === "broadcast"
      ? { messageType: MessageType.Broadcast }
      : {
          messageType: MessageType.Response,
          errorCode: ProtocolErrorCode.NoError,
        },
  );
  const message = {
    timestamp: createTimestamp({ millis: Millis.orThrow(100) }),
    change: DbChange.orThrow({
      table: "testTable",
      id: rowId,
      values: { name: "before", note: "quarantined" },
      isInsert: true,
      isDelete: null,
    }),
  };
  buffer.addMessage({
    timestamp: message.timestamp,
    change: encodeAndEncryptDbChange(testCreateDeps())(
      message,
      testAppOwner.encryptionKey,
    ),
  });
  const encoded = buffer.unwrap();
  // One range with an invalid range type: message decoding and commit precede it.
  const inputMessage =
    kind === "malformed-ranges"
      ? new Uint8Array([...encoded, 1, 127])
      : encoded;
  return {
    type: "ForSharedWorker",
    message: { type: "ApplySyncMessage", owner: testAppOwner, inputMessage },
  };
};

const sqliteSnapshotToLogicalSnapshot = (
  snapshot: ReturnType<typeof getSqliteSnapshot>,
) => ({
  ...snapshot,
  tables: snapshot.tables.map((table) =>
    table.name === "evolu_timestamp"
      ? {
          name: table.name,
          rows: table.rows.map(({ ownerId, t }) => ({ ownerId, t })),
        }
      : table,
  ),
});

describe("write replay", () => {
  it("replays local-only inserts, updates, and deletes without advancing the clock", async () => {
    await using setup = await setupDbWorker();
    const mixed = createReplayRequest(setup, "local", setup.createId());
    assertSame(mixed.type, "ForEvolu");
    const changes = mixed.message.changes.filter((change) =>
      change.table.startsWith("_"),
    );
    assertNonEmptyReadonlyArray(changes);
    const request: DbWorkerWriteRequest = {
      ...mixed,
      message: { ...mixed.message, changes },
    };
    const context = { clock: setup.getClock(), now: Millis.orThrow(100) };
    await postRequest(setup, request, setup.createId(), "response", context);
    const snapshot = getSqliteSnapshot(setup);
    assertEqual(setup.getClock(), context.clock);
    setup.time.advance("10s");
    await postRequest(setup, request, setup.createId(), "response", context);
    assertEqual(getSqliteSnapshot(setup), snapshot);
    assertEqual(setup.getClock(), context.clock);
  });

  for (const [kind, rollover] of [
    ["local", false],
    ["broadcast", false],
    ["response", false],
    ["malformed-ranges", false],
    ["local", true],
    ["broadcast", true],
  ] as const) {
    it(`replays ${kind}${rollover ? " across counter rollover" : ""} after closing SQLite and accepts a fresh write at the same time`, async () => {
      using file = setupReplayDatabase();
      let request: DbWorkerWriteRequest | undefined;
      let context: { clock: Timestamp; now: Millis } | undefined;
      let snapshot: ReturnType<typeof getSqliteSnapshot> | undefined;
      let committedClock: Timestamp | undefined;
      const rowId = testCreateId()();
      {
        await using dbSetup = await setupDb({
          createSqliteDriver: file.createSqliteDriver,
        });
        await using setup = await setupDbWorker({ dbSetup, memoryOnly: false });
        request = createReplayRequest(setup, kind, rowId);
        context = { clock: setup.getClock(), now: Millis.orThrow(100) };
        if (rollover) {
          context = {
            ...context,
            clock: {
              ...context.clock,
              millis: context.now,
              counter: maxCounter,
            },
          };
          // Seed the preceding committed clock at the rollover boundary.
          setup.sqlite.exec(sql`
            update evolu_config
            set clock = ${timestampToTimestampBytes(context.clock)};
          `);
        }
        const output = (
          await postRequest(
            setup,
            request,
            setup.createId(),
            "response",
            context,
          )
        )[0];
        assertSame(output.type, "OnQueuedResponse");
        if (kind === "malformed-ranges") {
          assertSame(output.response.message.type, "ApplySyncMessage");
          const { result } = output.response.message;
          assertErr(result);
          assertSame(result.error.type, "ProtocolInvalidDataError");
          assertSame(request.type, "ForSharedWorker");
          assertEqual(result.error.data, request.message.inputMessage);
          assertInstanceOf(result.error.error, Error);
          assertSame(result.error.error.message, "Invalid RangeType: 127");
          assertTrue(output.response.message.didWriteMessages);
        }
        snapshot = getSqliteSnapshot(setup);
        committedClock = setup.getClock();
        if (rollover) {
          assertEqual(committedClock, {
            ...context.clock,
            millis: Millis.orThrow(101),
            counter: 0,
          });
        }
        assertTrue(
          committedClock.counter > context.clock.counter ||
            committedClock.millis > context.clock.millis,
        );
      }
      assertTrue(file.connections[0].disposed);
      assertNotUndefined(request);
      assertNotUndefined(context);
      assertNotUndefined(snapshot);
      assertNotUndefined(committedClock);
      {
        await using dbSetup = await setupDb({
          createSqliteDriver: file.createSqliteDriver,
        });
        await using setup = await setupDbWorker({ dbSetup, memoryOnly: false });
        assertEqual(setup.getClock(), committedClock);
        setup.time.advance("1m");
        await postRequest(
          setup,
          request,
          setup.createId(),
          "response",
          context,
        );
        assertEqual(setup.getClock(), committedClock);
        assertEqual(getSqliteSnapshot(setup), snapshot);
        // Replay again to exercise duplicate insertion after random draws have advanced.
        await postRequest(
          setup,
          request,
          setup.createId(),
          "response",
          context,
        );
        assertEqual(getSqliteSnapshot(setup), snapshot);
        await postRequest(
          setup,
          {
            type: "ForEvolu",
            id: setup.evoluInstanceId,
            message: {
              type: "Mutate",
              onCompleteIds: [],
              subscribedQueries: emptySet,
              changes: [
                createMutationChange({
                  table: "testTable",
                  id: rowId,
                  values: { name: "after" },
                  isInsert: false,
                  isDelete: null,
                }),
              ],
            },
          },
          setup.createId(),
          "response",
          { clock: committedClock, now: context.now },
        );
        assertSame(setup.getClock().millis, committedClock.millis);
        assertSame(setup.getClock().counter, committedClock.counter + 1);
        assertEqual(
          setup.sqlite.exec(sql`
            select name from testTable where id = ${rowId};
          `).rows,
          [{ name: "after" }],
        );
        const bytes = timestampToTimestampBytes(setup.getClock());
        assertEqual(
          setup.sqlite.exec(sql`
            select value
            from evolu_history
            where timestamp = ${bytes} and "column" = ${"name"};
          `).rows,
          [{ value: "after" }],
        );
        assertLength(
          setup.sqlite.exec(sql`
            select t from evolu_timestamp where t = ${bytes};
          `).rows,
          1,
        );
      }
      assertLength(file.connections, 2);
      assertTrue(file.connections[1].disposed);
    });
  }

  for (const kind of ["local", "broadcast"] as const) {
    for (const failure of kind === "local"
      ? ["update", "query", "commit"]
      : ["update", "commit"]) {
      it(`rolls back ${kind} on ${failure} failure and replays after reopen`, async () => {
        using file = setupReplayDatabase();
        let armed = false;
        let failed = false;
        const injected = new Error(`injected ${failure} failure`);
        const thrown: Array<unknown> = [];
        let request: DbWorkerWriteRequest | undefined;
        let context: { clock: Timestamp; now: Millis } | undefined;
        const rowId = testCreateId()();
        {
          await using dbSetup = await setupDb({
            createSqliteDriver: file.createSqliteDriver,
            onExec: (query) => {
              const sqlText = query.sql.trim().toLowerCase();
              const matches =
                failure === "update"
                  ? sqlText.startsWith("update evolu_config")
                  : failure === "commit"
                    ? sqlText === "commit;"
                    : sqlText.startsWith(
                        'select "id", "name" from "testtable"',
                      );
              if (armed && matches) {
                armed = false;
                failed = true;
                throw injected;
              }
            },
          });
          await using setup = await setupDbWorker({
            dbSetup,
            memoryOnly: false,
            onThrown: (error) => {
              thrown.push(error);
            },
          });
          request = createReplayRequest(setup, kind, rowId);
          context = { clock: setup.getClock(), now: Millis.orThrow(100) };
          const before = getSqliteSnapshot(setup);
          armed = true;
          setup.port.postMessage({
            type: "Request",
            attemptId: setup.createId(),
            request,
            ...context,
          });
          await testWaitForWorkerMessage();
          await testWaitForWorkerMessage();
          assertTrue(failed);
          assertEqual(getSqliteSnapshot(setup), before);
          assertEqual(setup.getClock(), context.clock);
          if (kind === "local") {
            assertEqual(thrown, [injected]);
            assertEqual(setup.outputs, []);
            assertEqual(setup.consoleEntryOrErrors, []);
          } else {
            assertEqual(thrown, []);
            assertLength(setup.outputs, 1);
            const output = setup.outputs[0];
            assertSame(output.type, "OnQueuedResponse");
            assertSame(output.response.message.type, "ApplySyncMessage");
            assertFalse(output.response.message.didWriteMessages);
            assertEqual(output.response.message.clock, context.clock);
            assertEqual(output.response.message.result, {
              ok: false,
              error: {
                type: "AbortError",
                reason: { type: "PanicAbortReason", defect: injected },
              },
            });
          }
        }
        assertTrue(file.connections[0].disposed);
        assertNotUndefined(request);
        assertNotUndefined(context);
        {
          await using dbSetup = await setupDb({
            createSqliteDriver: file.createSqliteDriver,
          });
          await using setup = await setupDbWorker({
            dbSetup,
            memoryOnly: false,
          });
          setup.time.advance("1m");
          await postRequest(
            setup,
            request,
            setup.createId(),
            "response",
            context,
          );
          assertSame(setup.getClock().millis, context.now);
          assertEqual(
            setup.sqlite.exec(sql`
              select name from testTable where id = ${rowId};
            `).rows,
            [{ name: "before" }],
          );
          const committed = getSqliteSnapshot(setup);
          await postRequest(
            setup,
            request,
            setup.createId(),
            "response",
            context,
          );
          assertEqual(getSqliteSnapshot(setup), committed);
          await using once = await setupDbWorker();
          await postRequest(
            once,
            request,
            once.createId(),
            "response",
            context,
          );
          assertEqual(
            sqliteSnapshotToLogicalSnapshot(getSqliteSnapshot(setup)),
            sqliteSnapshotToLogicalSnapshot(getSqliteSnapshot(once)),
          );
        }
      });
    }
  }
});

/**
 * Removes `evolu_config` from a snapshot. Any receipt within the drift limit
 * advances the persisted clock, which these comparisons do not cover.
 */
const snapshotWithoutConfig = (
  snapshot: ReturnType<typeof getSqliteSnapshot>,
) => ({
  ...snapshot,
  tables: snapshot.tables.filter((table) => table.name !== "evolu_config"),
});

describe("clock drift quarantine", () => {
  for (const origin of ["local", "incoming"] as const) {
    it(`stores and forwards ${origin} drift, preserves retries, and releases it on restart once system time catches up`, async () => {
      await using dbSetup = await setupDb();
      const rowId = dbSetup.createId();
      const change = DbChange.orThrow({
        table: "testTable",
        id: rowId,
        values: { name: "preserved", note: "unknown" },
        isInsert: true,
        isDelete: false,
      });
      let quarantinedTimestamp: Timestamp | undefined;
      let originalRequest: DbWorkerWriteRequest | undefined;
      let originalContext: { clock: Timestamp; now: Millis } | undefined;
      {
        await using setup = await setupDbWorker({ dbSetup });
        const context = { clock: setup.getClock(), now: setup.time.now() };
        const future = createTimestamp({
          millis: Millis.orThrow(600000),
          counter: maxCounter,
        });
        if (origin === "local") {
          context.clock = { ...future, nodeId: context.clock.nodeId };
          setup.sqlite.exec(sql`
            update evolu_config
            set clock = ${timestampToTimestampBytes(context.clock)};
          `);
        }
        const request: DbWorkerWriteRequest =
          origin === "local"
            ? setupMutateRequest(
                setup.evoluInstanceId,
                [{ ...change, ownerId: testAppOwner.id }],
                {
                  subscribedQueries: createSet([
                    testTableQuery,
                    quarantineQuery,
                  ]),
                  onCompleteIds: [setup.createId()],
                },
              )
            : setupApplySyncRequest(
                await createBroadcastProtocolMessage([
                  { timestamp: future, change },
                ]),
              );
        const outputs = await postRequest(
          setup,
          request,
          setup.createId(),
          "response",
          context,
        );
        originalRequest = request;
        originalContext = context;
        await testWaitForWorkerMessage();
        assertLength(outputs, 1);
        // Quarantine is recorded in the table, not reported as an error.
        assertEqual(setup.consoleEntryOrErrors, []);
        const quarantinedRows = (timestamp: Timestamp) => {
          const row = {
            reason: QuarantineReason.TimestampDrift,
            origin:
              origin === "local"
                ? QuarantineOrigin.LocalMutation
                : QuarantineOrigin.ReceivedMessage,
            quarantinedAt: context.now,
          };
          return [
            {
              column: "createdAt",
              value: new Date(timestamp.millis).toISOString(),
              ...row,
            },
            { column: "isDeleted", value: 0, ...row },
            { column: "name", value: "preserved", ...row },
            { column: "note", value: "unknown", ...row },
          ];
        };
        if (origin === "incoming") {
          const response = getQueuedSharedWorkerMessage(
            outputs,
            "ApplySyncMessage",
          );
          assertTrue(response.didWriteMessages);
          assertOk(response.result, { type: "Broadcast" });
          assertEqual(setup.getClock(), context.clock);
          quarantinedTimestamp = future;
        } else {
          const output = outputs[0];
          assertSame(output.type, "OnQueuedResponse");
          assertSame(output.response.type, "ForEvolu");
          assertSame(output.response.message.type, "Mutate");
          assertEqual(
            output.response.message.rowsByQuery.get(testTableQuery),
            [],
          );
          assertEqual(setup.getClock(), {
            ...context.clock,
            millis: 600001,
            counter: 0,
          });
          quarantinedTimestamp = setup.getClock();
          assertEqual(
            output.response.message.messagesByOwnerId.get(testAppOwner.id),
            [{ timestamp: quarantinedTimestamp, change }],
          );
          // The subscribed quarantine query is loaded with the mutation, so
          // the instance sees the quarantined rows before it runs onComplete.
          assertEqual(
            output.response.message.rowsByQuery.get(quarantineQuery),
            quarantinedRows(quarantinedTimestamp),
          );
        }
        assertEqual(setup.sqlite.exec(sql`select * from testTable;`).rows, []);
        assertEqual(
          setup.sqlite.exec(sql`select * from evolu_history;`).rows,
          [],
        );
        assertEqual(
          readQuarantineRows(setup),
          quarantinedRows(quarantinedTimestamp),
        );
        const snapshot = getSqliteSnapshot(setup);
        const clock = setup.getClock();
        setup.time.advance("1s");
        await postRequest(
          setup,
          request,
          setup.createId(),
          "response",
          context,
        );
        assertEqual(getSqliteSnapshot(setup), snapshot);
        assertEqual(setup.getClock(), clock);

        // Range reconciliation must upload quarantine to a fresh relay and finish.
        await using relay = await setupSqliteAndRelayStorage();
        const sync = getQueuedSharedWorkerMessage(
          await postRequest(setup, {
            type: "ForSharedWorker",
            message: { type: "CreateSyncMessages", owners: [testAppOwner] },
          }),
          "CreateSyncMessages",
        ).protocolMessagesByOwnerId.get(testAppOwner.id);
        assertNotUndefined(sync);
        let message = sync;
        let completed = false;
        for (let round = 0; round < 10; round++) {
          const relayResponse = await relay.run.orThrow(
            applyProtocolMessageAsRelay(message),
          );
          const response = getQueuedSharedWorkerMessage(
            await postRequest(
              setup,
              setupApplySyncRequest(relayResponse.message),
            ),
            "ApplySyncMessage",
          );
          assertOk(response.result);
          if (response.result.value.type === "Converged") {
            completed = true;
            break;
          }
          assertSame(response.result.value.type, "Response");
          message = response.result.value.message;
        }
        assertTrue(completed);
        const timestampBytes = timestampToTimestampBytes(quarantinedTimestamp);
        assertOk(
          decryptAndDecodeDbChange(
            {
              timestamp: quarantinedTimestamp,
              change: relay.storage.readDbChange(
                testAppOwnerIdBytes,
                timestampBytes,
              ),
            },
            testAppOwner.encryptionKey,
          ),
          change,
        );
        assertLength(
          relay.sqlite.exec(sql`select * from evolu_message;`).rows,
          1,
        );
      }
      assertNotUndefined(quarantinedTimestamp);
      assertNotUndefined(originalRequest);
      assertNotUndefined(originalContext);
      const expectedOrigin =
        origin === "local"
          ? QuarantineOrigin.LocalMutation
          : QuarantineOrigin.ReceivedMessage;
      dbSetup.time.advance("1h");
      {
        // Startup releases drift quarantine once system time is within the
        // limit of its timestamp: known columns are applied, the unknown one
        // moves to schema quarantine, and the clock advances as for a receipt.
        await using restarted = await setupDbWorker({ dbSetup });
        const startupClock = restarted.getClock();
        assertEqual(startupClock, {
          millis: restarted.time.now(),
          counter: Counter.orThrow(0),
          nodeId: originalContext.clock.nodeId,
        });
        assertEqual(
          restarted.sqlite.exec(sql`select name from testTable;`).rows,
          [{ name: "preserved" }],
        );
        assertEqual(readQuarantineRows(restarted), [
          {
            column: "note",
            value: "unknown",
            reason: QuarantineReason.Schema,
            origin: expectedOrigin,
            quarantinedAt: originalContext.now,
          },
        ]);
        // The replay writes nothing and reports its computed clock. A local
        // replay reproduces its timestamp; an incoming replay is still fully
        // quarantined at its captured time and leaves its clock untouched.
        const before = getSqliteSnapshot(restarted);
        await postRequest(
          restarted,
          originalRequest,
          restarted.createId(),
          "response",
          originalContext,
        );
        assertEqual(getSqliteSnapshot(restarted), before);
        assertEqual(
          restarted.getClock(),
          origin === "local" ? quarantinedTimestamp : originalContext.clock,
        );
        const duplicate = await createBroadcastProtocolMessage([
          { timestamp: quarantinedTimestamp, change },
        ]);
        await postRequest(
          restarted,
          setupApplySyncRequest(duplicate),
          restarted.createId(),
          "response",
          { clock: startupClock, now: restarted.time.now() },
        );
        // The duplicate is neither applied nor written again. Its timestamp is
        // within the drift limit by now, so receipt advances the clock as usual.
        assertEqual(
          snapshotWithoutConfig(getSqliteSnapshot(restarted)),
          snapshotWithoutConfig(before),
        );
        assertEqual(restarted.getClock(), {
          ...startupClock,
          counter: Counter.orThrow(1),
        });
        // New operations work again.
        await postRequest(
          restarted,
          setupMutateRequest(restarted.evoluInstanceId, [
            createMutationChange({
              ...change,
              id: restarted.createId(),
              ownerId: testAppOwner.id,
              values: { name: "later" },
            }),
          ]),
        );
        assertEqual(
          restarted.sqlite.exec(sql`select name from testTable order by name;`)
            .rows,
          [{ name: "later" }, { name: "preserved" }],
        );
        assertLength(readQuarantineRows(restarted), 1);
      }
      // A schema update applies the column that release moved to schema
      // quarantine.
      await using expanded = await setupDbWorker({
        dbSetup,
        sqliteSchema: createTestSqliteSchema(["name", "note"]),
      });
      assertEqual(
        expanded.sqlite.exec(sql`
          select name, note from testTable order by name;
        `).rows,
        [
          { name: "later", note: null },
          { name: "preserved", note: "unknown" },
        ],
      );
      assertEqual(readQuarantineRows(expanded), []);
    });
  }

  it("applies healthy messages in a mixed batch without adopting the future clock", async () => {
    await using setup = await setupDbWorker();
    const clock = setup.getClock();
    const messages = [1, 2, 600000].map((millis) => ({
      timestamp: createTimestamp({ millis: Millis.orThrow(millis) }),
      change: DbChange.orThrow({
        table: "testTable",
        id: setup.createId(),
        values: { name: `${millis}` },
        isInsert: true,
        isDelete: null,
      }),
    }));
    assertNonEmptyReadonlyArray(messages);
    const inputMessage = await createBroadcastProtocolMessage(messages);
    const response = getQueuedSharedWorkerMessage(
      await postRequest(setup, setupApplySyncRequest(inputMessage)),
      "ApplySyncMessage",
    );
    assertOk(response.result, { type: "Broadcast" });
    assertEqual(setup.getClock(), { ...clock, millis: 2, counter: 1 });
    assertEqual(
      setup.sqlite.exec(sql`select name from testTable order by name;`).rows,
      [{ name: "1" }, { name: "2" }],
    );
    assertLength(
      setup.sqlite.exec(sql`select * from evolu_timestamp;`).rows,
      3,
    );
    assertEqual(
      setup.sqlite.exec(sql`
        select "value", "reason", "origin", "quarantinedAt"
        from evolu_message_quarantine
        where "column" = 'name';
      `).rows,
      [
        {
          value: "600000",
          reason: QuarantineReason.TimestampDrift,
          origin: QuarantineOrigin.ReceivedMessage,
          quarantinedAt: setup.time.now(),
        },
      ],
    );
    assertEqual(setup.consoleEntryOrErrors, []);
  });

  it("applies incoming messages within the drift limit when the local clock is ahead", async () => {
    await using setup = await setupDbWorker();
    const clock = { ...setup.getClock(), millis: Millis.orThrow(600000) };
    setup.sqlite.exec(sql`
      update evolu_config set clock = ${timestampToTimestampBytes(clock)};
    `);
    const inputMessage = await createBroadcastProtocolMessage([
      {
        timestamp: createTimestamp({ millis: Millis.orThrow(1) }),
        change: DbChange.orThrow({
          table: "testTable",
          id: setup.createId(),
          values: { name: "healthy sender" },
          isInsert: true,
          isDelete: null,
        }),
      },
    ]);
    const response = getQueuedSharedWorkerMessage(
      await postRequest(
        setup,
        setupApplySyncRequest(inputMessage),
        setup.createId(),
        "response",
        { clock, now: setup.time.now() },
      ),
      "ApplySyncMessage",
    );
    await testWaitForWorkerMessage();
    assertOk(response.result, { type: "Broadcast" });
    // The drift candidate advances the counter of the already-ahead clock.
    assertEqual(setup.getClock(), {
      ...clock,
      counter: Counter.orThrow(clock.counter + 1),
    });
    assertEqual(setup.sqlite.exec(sql`select name from testTable;`).rows, [
      { name: "healthy sender" },
    ]);
    assertEqual(readQuarantineRows(setup), []);
    assertEqual(setup.consoleEntryOrErrors, []);
  });

  it("applies an incoming message at the drift limit whose counter rolls over past it", async () => {
    await using setup = await setupDbWorker();
    const clock = setup.getClock();
    const inputMessage = await createBroadcastProtocolMessage([
      {
        timestamp: createTimestamp({
          millis: Millis.orThrow(defaultTimestampMaxDrift),
          counter: maxCounter,
        }),
        change: DbChange.orThrow({
          table: "testTable",
          id: setup.createId(),
          values: { name: "at the limit" },
          isInsert: true,
          isDelete: null,
        }),
      },
    ]);
    const response = getQueuedSharedWorkerMessage(
      await postRequest(setup, setupApplySyncRequest(inputMessage)),
      "ApplySyncMessage",
    );
    await testWaitForWorkerMessage();
    assertOk(response.result, { type: "Broadcast" });
    // Rollover moves the candidate one millisecond past the limit.
    assertEqual(setup.getClock(), {
      ...clock,
      millis: Millis.orThrow(defaultTimestampMaxDrift + 1),
      counter: Counter.orThrow(0),
    });
    assertEqual(setup.sqlite.exec(sql`select name from testTable;`).rows, [
      { name: "at the limit" },
    ]);
    assertEqual(readQuarantineRows(setup), []);
    assertEqual(setup.consoleEntryOrErrors, []);
  });

  it("quarantines a received timestamp at the range ceiling instead of failing the batch", async () => {
    await using setup = await setupDbWorker();
    const clock = setup.getClock();
    // The counter cannot roll over past maxMillis. The message's own timestamp
    // is checked first, so the message is quarantined rather than refused.
    const inputMessage = await createBroadcastProtocolMessage([
      {
        timestamp: createTimestamp({ millis: maxMillis, counter: maxCounter }),
        change: DbChange.orThrow({
          table: "testTable",
          id: setup.createId(),
          values: { name: "ceiling" },
          isInsert: true,
          isDelete: null,
        }),
      },
    ]);
    const response = getQueuedSharedWorkerMessage(
      await postRequest(setup, setupApplySyncRequest(inputMessage)),
      "ApplySyncMessage",
    );
    await testWaitForWorkerMessage();
    assertOk(response.result, { type: "Broadcast" });
    assertTrue(response.didWriteMessages);
    assertEqual(setup.getClock(), clock);
    assertEqual(setup.sqlite.exec(sql`select * from testTable;`).rows, []);
    assertLength(
      setup.sqlite.exec(sql`select * from evolu_timestamp;`).rows,
      1,
    );
    assertEqual(
      setup.sqlite.exec(sql`
        select "value", "reason", "origin", "quarantinedAt"
        from evolu_message_quarantine
        where "column" = 'name';
      `).rows,
      [
        {
          value: "ceiling",
          reason: QuarantineReason.TimestampDrift,
          origin: QuarantineOrigin.ReceivedMessage,
          quarantinedAt: setup.time.now(),
        },
      ],
    );
    assertEqual(setup.consoleEntryOrErrors, []);
  });

  for (const exhaustedCounter of [false, true]) {
    it(
      exhaustedCounter
        ? "throws at startup and keeps quarantine when release would overflow the timestamp range"
        : "releases quarantine at maxMillis when the drift limit extends beyond it",
      async () => {
        await using dbSetup = await setupDb();
        let initialClock: Timestamp;
        {
          await using setup = await setupDbWorker({ dbSetup });
          initialClock = setup.getClock();
          const messages = [
            ...(exhaustedCounter
              ? [
                  {
                    timestamp: createTimestamp({
                      millis: Millis.orThrow(maxMillis - 2),
                    }),
                    change: DbChange.orThrow({
                      table: "testTable",
                      id: setup.createId(),
                      values: { name: "releasable prefix" },
                      isInsert: true,
                      isDelete: null,
                    }),
                  },
                ]
              : []),
            {
              timestamp: createTimestamp({
                millis: maxMillis,
                counter: exhaustedCounter ? maxCounter : Counter.orThrow(0),
              }),
              change: DbChange.orThrow({
                table: "testTable",
                id: setup.createId(),
                values: { name: "ceiling" },
                isInsert: true,
                isDelete: null,
              }),
            },
          ];
          assertNonEmptyReadonlyArray(messages);
          const inputMessage = await createBroadcastProtocolMessage(messages);
          const response = getQueuedSharedWorkerMessage(
            await postRequest(setup, setupApplySyncRequest(inputMessage)),
            "ApplySyncMessage",
          );
          assertOk(response.result, { type: "Broadcast" });
          assertEqual(setup.getClock(), initialClock);
          assertEqual(
            setup.sqlite.exec(sql`select name from testTable;`).rows,
            [],
          );
        }

        // Valid system time plus the drift allowance exceeds maxMillis.
        dbSetup.time.advance(Millis.orThrow(maxMillis - 1));

        if (exhaustedCounter) {
          // Releasing would roll the counter past the ceiling, which only a
          // clock this broken reaches, so startup throws and rolls back.
          const before = getSqliteSnapshot(dbSetup);
          const result = await startDbWorkerUntilDone(dbSetup);
          assert(!result.ok, "Startup should fail.");
          assertSame(result.error.type, "AbortError");
          assertSame(result.error.reason.type, "PanicAbortReason");
          assertEqual(getSqliteSnapshot(dbSetup), before);
          assertEqual(
            dbSetup.sqlite.exec(sql`
              select "value", "reason"
              from evolu_message_quarantine
              where "column" = 'name'
              order by "timestamp";
            `).rows,
            [
              {
                value: "releasable prefix",
                reason: QuarantineReason.TimestampDrift,
              },
              { value: "ceiling", reason: QuarantineReason.TimestampDrift },
            ],
          );
          return;
        }

        await using restarted = await setupDbWorker({ dbSetup });
        const expectedClock = {
          ...initialClock,
          millis: maxMillis,
          counter: Counter.orThrow(1),
        };
        assertEqual(restarted.getClock(), expectedClock);
        assertEqual(readStoredClock(restarted), expectedClock);
        assertEqual(
          restarted.sqlite.exec(sql`select name from testTable;`).rows,
          [{ name: "ceiling" }],
        );
        assertEqual(
          restarted.sqlite.exec(sql`
            select "value", "reason"
            from evolu_message_quarantine
            where "column" = 'name'
            order by "timestamp";
          `).rows,
          [],
        );
        assertEqual(restarted.consoleEntryOrErrors, []);
      },
    );
  }

  it("releases drift quarantine under last-writer-wins against edits applied before release", async () => {
    await using dbSetup = await setupDb();
    const rowId = dbSetup.createId();
    const nameAt = (millis: number, name: string, isInsert = false) => ({
      timestamp: createTimestamp({ millis: Millis.orThrow(millis) }),
      change: DbChange.orThrow({
        table: "testTable",
        id: rowId,
        values: { name },
        isInsert,
        isDelete: false,
      }),
    });
    const readName = (setup: DbSetup) =>
      setup.sqlite.exec(sql`select name from testTable;`).rows;
    const readQuarantinedTimestamps = (setup: DbSetup) =>
      setup.sqlite.exec(sql`
        select distinct timestamp from evolu_message_quarantine;
      `).rows.length;

    {
      await using setup = await setupDbWorker({ dbSetup });
      // At 0, "earlier" applies and "released", 600 s ahead, is quarantined.
      await postRequest(
        setup,
        setupApplySyncRequest(
          await createBroadcastProtocolMessage([
            nameAt(1000, "earlier", true),
            nameAt(600_000, "released"),
          ]),
        ),
      );
      assertEqual(readName(setup), [{ name: "earlier" }]);

      // At 700 s, without a restart, "later" at 900 s is within the limit and
      // applies, while "last" at 1500 s is quarantined.
      setup.time.advance(Millis.orThrow(700_000));
      await postRequest(
        setup,
        setupApplySyncRequest(
          await createBroadcastProtocolMessage([
            nameAt(900_000, "later"),
            nameAt(1_500_000, "last"),
          ]),
        ),
      );
      assertEqual(readName(setup), [{ name: "later" }]);
      assertSame(readQuarantinedTimestamps(setup), 2);
    }

    dbSetup.time.advance(Millis.orThrow(100_000));
    {
      // At 800 s, "released" is within the limit and is released, but "later"
      // is newer, so it keeps the column. "last" is still ahead.
      await using restarted = await setupDbWorker({ dbSetup });
      assertEqual(readName(restarted), [{ name: "later" }]);
      assertSame(readQuarantinedTimestamps(restarted), 1);
    }

    dbSetup.time.advance(Millis.orThrow(500_000));
    {
      // At 1300 s, "last" is released and, being newest, wins.
      await using restarted = await setupDbWorker({ dbSetup });
      assertEqual(readName(restarted), [{ name: "last" }]);
      assertSame(readQuarantinedTimestamps(restarted), 0);
    }
  });

  it("uses one startup time sample to release the exact drift boundary and retain the next timestamp", async () => {
    await using dbSetup = await setupDb();
    {
      await using setup = await setupDbWorker({ dbSetup });
      const messages = [600000, 600001].map((millis) => ({
        timestamp: createTimestamp({
          millis: Millis.orThrow(millis),
          counter: maxCounter,
          nodeId: maxNodeId,
        }),
        change: DbChange.orThrow({
          table: "testTable",
          id: setup.createId(),
          values: { name: `${millis}`, note: `${millis}` },
          isInsert: true,
          isDelete: null,
        }),
      }));
      assertNonEmptyReadonlyArray(messages);
      const inputMessage = await createBroadcastProtocolMessage(messages);
      await postRequest(setup, setupApplySyncRequest(inputMessage));
    }
    const startAt = Millis.orThrow(600000 - defaultTimestampMaxDrift);
    const time = testCreateTime({ startAt, autoIncrement: "sync" });
    await using restarted = await setupDbWorker({
      dbSetup: { ...dbSetup, time },
    });
    assertSame(time.now(), startAt + 1);
    assertEqual(restarted.sqlite.exec(sql`select name from testTable;`).rows, [
      { name: "600000" },
    ]);
    assertEqual(
      restarted.sqlite.exec(sql`
        select "value", "reason"
        from evolu_message_quarantine
        where "column" = 'note'
        order by "value";
      `).rows,
      [
        { value: "600000", reason: QuarantineReason.Schema },
        { value: "600001", reason: QuarantineReason.TimestampDrift },
      ],
    );
    // Receiving the last timestamp at the boundary rolls the local clock past
    // the drift limit, but must still release this accepted remote timestamp.
    assertSame(restarted.getClock().millis, 600001);
    assertSame(restarted.getClock().counter, 0);
    assertEqual(restarted.consoleEntryOrErrors, []);
  });

  it("does not load future drift timestamps and uses the index for both quarantine stages", async () => {
    const reads: Array<SqliteQuery> = [];
    let captureReads = false;
    await using dbSetup = await setupDb({
      onExec: (query) => {
        if (captureReads && query.sql.includes("from evolu_message_quarantine"))
          reads.push(query);
      },
    });
    {
      await using setup = await setupDbWorker({ dbSetup });
      setup.sqlite.transaction(() => {
        for (let index = 0; index < 1000; index++) {
          const timestamp = timestampToTimestampBytes(
            createTimestamp({ millis: Millis.orThrow(600000 + index) }),
          );
          setup.sqlite.exec(sql.prepared`
            insert into evolu_message_quarantine
              (
                "ownerId",
                "timestamp",
                "table",
                "id",
                "column",
                "value",
                "reason"
              )
            values
              (
                ${testAppOwnerIdBytes},
                ${timestamp},
                'testTable',
                ${timestamp},
                'name',
                'future',
                ${QuarantineReason.TimestampDrift}
              );
          `);
        }
      });
    }

    captureReads = true;
    await using restarted = await setupDbWorker({ dbSetup });
    captureReads = false;
    assertLength(reads, 2);
    for (const query of reads) {
      // Nothing was released, so rerunning the captured startup read sees the
      // same rows. Future timestamps must never be materialized in JavaScript.
      assertLength(restarted.sqlite.exec(query).rows, 0);
      const plan = restarted.sqlite.exec<{ detail: string }>({
        ...query,
        // prettier-ignore
        sql: sql`explain query plan ${sql.raw(query.sql)}`.sql,
      }).rows;
      assertTrue(
        plan.some(({ detail }) =>
          detail.includes("evolu_message_quarantine_reason_timestamp"),
        ),
      );
      assertFalse(plan.some(({ detail }) => /SCAN|TEMP B-TREE/u.test(detail)));
    }
    assertEqual(restarted.consoleEntryOrErrors, []);
  });

  it("advances the startup clock once per timestamp across owners in timestamp order", async () => {
    await using dbSetup = await setupDb();
    {
      await using setup = await setupDbWorker({ dbSetup });
      for (const [index, owner] of [testAppOwner, testDbAppOwner2].entries()) {
        // Both owners have the final timestamp. Owner-first iteration would
        // revisit it after receiving an earlier timestamp from the next owner.
        const messages = [600000 + index, 600002].map((millis) => ({
          timestamp: createTimestamp({ millis: Millis.orThrow(millis) }),
          change: DbChange.orThrow({
            table: "testTable",
            id: setup.createId(),
            values: { name: `${millis}` },
            isInsert: true,
            isDelete: null,
          }),
        }));
        assertNonEmptyReadonlyArray(messages);
        const inputMessage = await createBroadcastProtocolMessage(
          messages,
          owner,
        );
        await postRequest(setup, setupApplySyncRequest(inputMessage, owner));
      }
    }
    dbSetup.time.advance(Millis.orThrow(600002 - defaultTimestampMaxDrift));
    await using restarted = await setupDbWorker({ dbSetup });
    assertSame(restarted.getClock().millis, 600002);
    assertSame(restarted.getClock().counter, 1);
    assertEqual(
      restarted.sqlite.exec(sql`select name from testTable order by name;`)
        .rows,
      [
        { name: "600000" },
        { name: "600001" },
        { name: "600002" },
        { name: "600002" },
      ],
    );
    assertEqual(readQuarantineRows(restarted), []);
    assertEqual(restarted.consoleEntryOrErrors, []);
  });

  it("commits mixed local and synced changes when timestamp assignment crosses the drift boundary", async () => {
    await using setup = await setupDbWorker();
    const clock = {
      ...setup.getClock(),
      millis: Millis.orThrow(defaultTimestampMaxDrift),
      counter: Counter.orThrow(maxCounter - 1),
    };
    setup.sqlite.exec(sql`
      update evolu_config set clock = ${timestampToTimestampBytes(clock)};
    `);
    const changes = ["accepted", "quarantined", "also quarantined"].map(
      (name) =>
        createMutationChange({
          table: "testTable",
          id: setup.createId(),
          values: { name },
          isInsert: true,
          isDelete: null,
        }),
    );
    assertNonEmptyReadonlyArray(changes);
    const context = { clock, now: setup.time.now() };
    const request: DbWorkerWriteRequest = setupMutateRequest(
      setup.evoluInstanceId,
      [
        createMutationChange({
          table: "_localTable",
          id: setup.createId(),
          values: { value: "local" },
          isInsert: true,
          isDelete: null,
        }),
        ...changes,
      ],
    );
    // Processing may happen after live time has moved past the drift boundary.
    setup.time.advance("10s");
    await postRequest(setup, request, setup.createId(), "response", context);
    assertEqual(setup.sqlite.exec(sql`select name from testTable;`).rows, [
      { name: "accepted" },
    ]);
    assertEqual(
      setup.sqlite.exec(sql`select "createdAt", "value" from _localTable;`)
        .rows,
      [{ createdAt: new Date(context.now).toISOString(), value: "local" }],
    );
    const quarantinedRow = {
      reason: QuarantineReason.TimestampDrift,
      origin: QuarantineOrigin.LocalMutation,
      quarantinedAt: context.now,
    };
    assertEqual(
      setup.sqlite.exec(sql`
        select "value", "reason", "origin", "quarantinedAt"
        from evolu_message_quarantine
        where "column" = 'name'
        order by "value";
      `).rows,
      [
        { value: "also quarantined", ...quarantinedRow },
        { value: "quarantined", ...quarantinedRow },
      ],
    );
    assertEqual(setup.consoleEntryOrErrors, []);
    assertEqual(setup.getClock(), {
      ...clock,
      millis: defaultTimestampMaxDrift + 1,
      counter: 1,
    });
    const snapshot = getSqliteSnapshot(setup);
    await postRequest(setup, request, setup.createId(), "response", context);
    assertEqual(getSqliteSnapshot(setup), snapshot);
  });

  it("migrates a legacy database to version 2 before replaying schema quarantine", async () => {
    await using dbSetup = await setupDb();
    {
      await using setup = await setupDbWorker({ dbSetup });
      await postRequest(
        setup,
        setupMutateRequest(setup.evoluInstanceId, [
          createMutationChange({
            table: "testTable",
            id: setup.createId(),
            values: { name: "known", note: "schema quarantine" },
            isInsert: true,
            isDelete: null,
          }),
        ]),
      );
      setup.sqlite.exec(sql`
        drop index if exists evolu_message_quarantine_reason_timestamp;
      `);
      for (const column of ["reason", "origin", "quarantinedAt"]) {
        setup.sqlite.exec(sql`
          alter table evolu_message_quarantine
          drop column ${sql.identifier(column)};
        `);
      }
      // Databases created before the version record hold one protocolVersion row.
      setup.sqlite.exec(sql`
        alter table evolu_version
        rename column "dbVersion" to "protocolVersion";
      `);
      setup.sqlite.exec(sql`update evolu_version set "protocolVersion" = 1;`);
    }
    {
      await using setup = await setupDbWorker({ dbSetup });
      assertEqual(setup.sqlite.exec(sql`select * from evolu_version;`).rows, [
        { dbVersion: 2 },
      ]);
      assertEqual(
        setup.sqlite.exec(sql`
          select "name"
          from pragma_index_info('evolu_message_quarantine_reason_timestamp')
          order by "seqno";
        `).rows,
        [{ name: "reason" }, { name: "timestamp" }],
      );
      // Rows from before the columns existed get the defaults.
      assertEqual(
        setup.sqlite.exec(sql`
          select "reason", "origin", "quarantinedAt", "value"
          from evolu_message_quarantine;
        `).rows,
        [
          {
            reason: QuarantineReason.Schema,
            origin: QuarantineOrigin.ReceivedMessage,
            quarantinedAt: null,
            value: "schema quarantine",
          },
        ],
      );
    }
    await using expanded = await setupDbWorker({
      dbSetup,
      sqliteSchema: createTestSqliteSchema(["name", "note"]),
    });
    assertEqual(expanded.sqlite.exec(sql`select note from testTable;`).rows, [
      { note: "schema quarantine" },
    ]);
    assertEqual(readQuarantineRows(expanded), []);
  });
});

describe("quarantine transactions", () => {
  for (const origin of ["local", "incoming"] as const) {
    it(`rolls back ${origin} quarantine and clock together without reporting preservation before commit`, async () => {
      let failCommit = false;
      const injected = new Error("quarantine commit failed");
      await using dbSetup = await setupDb({
        onExec: (query) => {
          if (failCommit && query.sql.trim().toLowerCase() === "commit;") {
            failCommit = false;
            throw injected;
          }
        },
      });
      const thrown: Array<unknown> = [];
      await using setup = await setupDbWorker({
        dbSetup,
        onThrown: (error) => {
          thrown.push(error);
        },
      });
      const clock =
        origin === "local"
          ? { ...setup.getClock(), millis: Millis.orThrow(600000) }
          : setup.getClock();
      setup.sqlite.exec(sql`
        update evolu_config set clock = ${timestampToTimestampBytes(clock)};
      `);
      const change = DbChange.orThrow({
        table: "testTable",
        id: setup.createId(),
        values: { name: "preserved only on commit" },
        isInsert: true,
        isDelete: null,
      });
      const request: DbWorkerWriteRequest =
        origin === "local"
          ? setupMutateRequest(setup.evoluInstanceId, [
              { ...change, ownerId: testAppOwner.id },
            ])
          : setupApplySyncRequest(
              await createBroadcastProtocolMessage([
                {
                  timestamp: createTimestamp({
                    millis: Millis.orThrow(600000),
                  }),
                  change,
                },
              ]),
            );
      const before = getSqliteSnapshot(setup);
      failCommit = true;
      setup.port.postMessage({
        type: "Request",
        attemptId: setup.createId(),
        request,
        clock,
        now: setup.time.now(),
      });
      await testWaitForWorkerMessage();
      await testWaitForWorkerMessage();
      assertFalse(failCommit);
      assertEqual(getSqliteSnapshot(setup), before);
      assertEqual(setup.consoleEntryOrErrors, []);
      if (origin === "local") {
        assertEqual(thrown, [injected]);
        assertEqual(setup.outputs, []);
      } else {
        const response = getQueuedSharedWorkerMessage(
          setup.outputs,
          "ApplySyncMessage",
        );
        assertFalse(response.didWriteMessages);
        assertEqual(response.clock, clock);
        assertErr(response.result);
      }
    });
  }

  it("does not reclassify accepted messages as drift quarantine on duplicate delivery", async () => {
    await using setup = await setupDbWorker();
    const inputMessage = await createBroadcastProtocolMessage([
      {
        timestamp: createTimestamp({ millis: Millis.orThrow(1) }),
        change: DbChange.orThrow({
          table: "testTable",
          id: setup.createId(),
          values: { name: "accepted", note: "schema quarantine" },
          isInsert: true,
          isDelete: null,
        }),
      },
    ]);
    const request: DbWorkerWriteRequest = setupApplySyncRequest(inputMessage);
    await postRequest(setup, request);
    const clock = { ...setup.getClock(), millis: Millis.orThrow(600000) };
    setup.sqlite.exec(sql`
      update evolu_config set clock = ${timestampToTimestampBytes(clock)};
    `);
    const before = getSqliteSnapshot(setup);
    const response = getQueuedSharedWorkerMessage(
      await postRequest(setup, request, setup.createId(), "response", {
        clock,
        now: setup.time.now(),
      }),
      "ApplySyncMessage",
    );
    // Nothing is written for the duplicate, so queries need no refresh. The
    // clock still adopts the drift candidate, because the message's own
    // timestamp is within the limit.
    assertFalse(response.didWriteMessages);
    assertEqual(
      snapshotWithoutConfig(getSqliteSnapshot(setup)),
      snapshotWithoutConfig(before),
    );
    assertEqual(setup.getClock(), {
      ...clock,
      counter: Counter.orThrow(clock.counter + 1),
    });
  });
});

describe("owner usage", () => {
  it("updates usage for new messages and skips duplicate-only batches", async () => {
    let usageWrites = 0;
    await using dbSetup = await setupDb({
      onExec: (query) => {
        if (
          query.sql.includes("evolu_usage") &&
          /^\s*(insert|update|delete)\b/iu.test(query.sql)
        ) {
          usageWrites += 1;
        }
      },
    });
    await using setup = await setupDbWorker({ dbSetup });
    const createMessage = (millis: number) => ({
      timestamp: createTimestamp({ millis: Millis.orThrow(millis) }),
      change: DbChange.orThrow({
        table: "testTable",
        id: setup.createId(),
        values: { name: `${millis}` },
        isInsert: true,
        isDelete: null,
      }),
    });
    const initial = createMessage(10);
    const earlier = createMessage(1);
    const drifted = createMessage(600000);
    const furtherDrifted = createMessage(900000);

    for (const { messages, writes, first, last } of [
      { messages: [initial], writes: 1, first: initial, last: initial },
      { messages: [initial], writes: 0, first: initial, last: initial },
      {
        messages: [earlier, initial, drifted],
        writes: 1,
        first: earlier,
        last: drifted,
      },
      {
        messages: [earlier, initial, drifted],
        writes: 0,
        first: earlier,
        last: drifted,
      },
      {
        messages: [furtherDrifted],
        writes: 1,
        first: earlier,
        last: furtherDrifted,
      },
      {
        messages: [furtherDrifted],
        writes: 0,
        first: earlier,
        last: furtherDrifted,
      },
    ] as const) {
      usageWrites = 0;
      const response = getQueuedSharedWorkerMessage(
        await postRequest(
          setup,
          setupApplySyncRequest(await createBroadcastProtocolMessage(messages)),
        ),
        "ApplySyncMessage",
      );
      assertOk(response.result, { type: "Broadcast" });
      assertSame(usageWrites, writes);
      assertEqual(
        setup.sqlite.exec(sql`
          select "firstTimestamp", "lastTimestamp"
          from evolu_usage
          where "ownerId" = ${testAppOwnerIdBytes};
        `).rows,
        [
          {
            firstTimestamp: timestampToTimestampBytes(first.timestamp),
            lastTimestamp: timestampToTimestampBytes(last.timestamp),
          },
        ],
      );
    }

    assertEqual(
      setup.sqlite.exec(sql`select name from testTable order by name;`).rows,
      [{ name: "1" }, { name: "10" }],
    );
    assertEqual(
      setup.sqlite.exec(sql`
        select "value", "reason"
        from evolu_message_quarantine
        where "column" = 'name'
        order by "value";
      `).rows,
      [
        { value: "600000", reason: QuarantineReason.TimestampDrift },
        { value: "900000", reason: QuarantineReason.TimestampDrift },
      ],
    );
  });
});

describe("clock persistence", () => {
  const createLocalOnlyMutation = (
    setup: DbWorkerSetup,
  ): DbWorkerWriteRequest =>
    setupMutateRequest(setup.evoluInstanceId, [
      createMutationChange({
        table: "_localTable",
        id: setup.createId(),
        values: { value: "local" },
        isInsert: true,
        isDelete: null,
      }),
    ]);

  const createQuarantinedBatch = async (
    setup: DbWorkerSetup,
  ): Promise<DbWorkerWriteRequest> =>
    setupApplySyncRequest(
      await createBroadcastProtocolMessage([
        {
          timestamp: createTimestamp({ millis: Millis.orThrow(600000) }),
          change: DbChange.orThrow({
            table: "testTable",
            id: setup.createId(),
            values: { name: "future" },
            isInsert: true,
            isDelete: null,
          }),
        },
      ]),
    );

  it("skips local-only clock statements and uses one for synced mutations and batches", async () => {
    let clockStatements = 0;
    await using dbSetup = await setupDb({
      onExec: (query) => {
        if (query.sql.includes("evolu_config")) clockStatements += 1;
      },
    });
    await using setup = await setupDbWorker({ dbSetup });
    const context = { clock: setup.getClock(), now: setup.time.now() };
    const localOnly = createLocalOnlyMutation(setup);
    const quarantined = await createQuarantinedBatch(setup);
    clockStatements = 0;

    await postRequest(setup, localOnly, setup.createId(), "response", context);
    assertSame(clockStatements, 0);
    assertEqual(setup.getClock(), context.clock);
    assertEqual(readStoredClock(setup), context.clock);

    clockStatements = 0;
    await postRequest(
      setup,
      quarantined,
      setup.createId(),
      "response",
      context,
    );
    assertSame(clockStatements, 1);
    assertEqual(setup.getClock(), context.clock);
    assertEqual(readStoredClock(setup), context.clock);
    assertLength(
      setup.sqlite.exec(sql`
        select * from evolu_message_quarantine where "column" = 'name';
      `).rows,
      1,
    );

    // Advancing the clock is one guarded update.
    clockStatements = 0;
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        createMutationChange({
          table: "testTable",
          id: setup.createId(),
          values: { name: "synced" },
          isInsert: true,
          isDelete: null,
        }),
      ]),
      setup.createId(),
      "response",
      context,
    );
    assertSame(clockStatements, 1);
    const advanced = { ...context.clock, counter: Counter.orThrow(1) };
    assertEqual(setup.getClock(), advanced);
    assertEqual(readStoredClock(setup), advanced);

    // A stale batch needs only the guarded update; its response can be older
    // than the stored clock.
    clockStatements = 0;
    await postRequest(
      setup,
      quarantined,
      setup.createId(),
      "response",
      context,
    );
    assertSame(clockStatements, 1);
    assertEqual(setup.getClock(), context.clock);
    assertEqual(readStoredClock(setup), advanced);

    // A stale local-only replay reports its captured clock without reading or
    // changing the newer clock stored by the synced mutation.
    clockStatements = 0;
    await postRequest(setup, localOnly, setup.createId(), "response", context);
    assertSame(clockStatements, 0);
    assertEqual(setup.getClock(), context.clock);
    assertEqual(readStoredClock(setup), advanced);
  });

  it("preserves the stored clock when a stale local-only mutation or fully quarantined batch is replayed", async () => {
    await using setup = await setupDbWorker();
    const stale = { clock: setup.getClock(), now: setup.time.now() };
    const quarantined = await createQuarantinedBatch(setup);
    const localOnly = createLocalOnlyMutation(setup);
    await postRequest(setup, quarantined, setup.createId(), "response", stale);
    await postRequest(setup, localOnly, setup.createId(), "response", stale);

    // A later synced mutation advances the clock.
    setup.time.advance("1m");
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        createMutationChange({
          table: "testTable",
          id: setup.createId(),
          values: { name: "fresh" },
          isInsert: true,
          isDelete: null,
        }),
      ]),
      setup.createId(),
      "response",
      { clock: stale.clock, now: setup.time.now() },
    );
    const committed = setup.getClock();
    assertEqual(committed, {
      ...stale.clock,
      millis: setup.time.now(),
      counter: Counter.orThrow(0),
    });
    const snapshot = getSqliteSnapshot(setup);

    // A fully quarantined batch reports its captured clock.
    await postRequest(setup, quarantined, setup.createId(), "response", stale);
    assertEqual(setup.getClock(), stale.clock);
    assertEqual(getSqliteSnapshot(setup), snapshot);

    // A local-only replay reports its captured clock. The SharedWorker keeps
    // its newer session clock, while SQLite state remains unchanged.
    await postRequest(setup, localOnly, setup.createId(), "response", stale);
    assertEqual(setup.getClock(), stale.clock);
    assertEqual(getSqliteSnapshot(setup), snapshot);
    assertEqual(readStoredClock(setup), committed);
    assertEqual(setup.consoleEntryOrErrors, []);
  });
});

describe("database version", () => {
  it("migrates a version 1 database to version 2 once", async () => {
    await using dbSetup = await setupDb();
    {
      await using setup = await setupDbWorker({ dbSetup });
      await postRequest(
        setup,
        setupMutateRequest(setup.evoluInstanceId, [
          createMutationChange({
            table: "testTable",
            id: setup.createId(),
            values: { name: "kept" },
            isInsert: true,
            isDelete: null,
          }),
        ]),
      );
    }
    const expected = getSqliteSnapshot(dbSetup);
    // A version 1 database lacks the quarantine columns and their index.
    dbSetup.sqlite.exec(sql`
      drop index evolu_message_quarantine_reason_timestamp;
    `);
    for (const column of ["reason", "origin", "quarantinedAt"]) {
      dbSetup.sqlite.exec(sql`
        alter table evolu_message_quarantine
        drop column ${sql.identifier(column)};
      `);
    }
    dbSetup.sqlite.exec(sql`update evolu_version set "dbVersion" = 1;`);

    {
      await using migrated = await setupDbWorker({ dbSetup });
      assertEqual(getSqliteSnapshot(migrated), expected);
      assertEqual(migrated.sqlite.exec(sql`select name from testTable;`).rows, [
        { name: "kept" },
      ]);
      assertEqual(migrated.consoleEntryOrErrors, []);
    }
    // A second start finds the current version and changes nothing.
    await using restarted = await setupDbWorker({ dbSetup });
    assertEqual(getSqliteSnapshot(restarted), expected);
    assertEqual(restarted.consoleEntryOrErrors, []);
  });

  it("refuses a newer database unchanged and releases the leader lock", async () => {
    await using dbSetup = await setupDb();
    {
      await using setup = await setupDbWorker({ dbSetup });
      assertLength(setup.initOutputs, 1);
    }
    dbSetup.sqlite.exec(sql`update evolu_version set "dbVersion" = 3;`);
    const before = getSqliteSnapshot(dbSetup);

    await using refused = await setupDbWorker({ dbSetup, expectRefused: true });
    assertEqual(refused.initOutputs, [
      {
        type: "LeaderRefused",
        name: refused.workerName,
        error: {
          type: "UnsupportedDbVersionError",
          storedVersion: PositiveInt.orThrow(3),
          supportedVersion: PositiveInt.orThrow(2),
        },
      },
    ]);
    assertEqual(getSqliteSnapshot(refused), before);
    assertEqual(refused.consoleEntryOrErrors, []);

    // Wait for the refused worker to release its leader lock.
    await using run = testCreateRun({ lockManager: refused.lockManager });
    await using _lock = await run.ok(acquireLeaderLock(refused.workerName));
  });

  it("refuses a newer database whose other schema objects this code cannot read", async () => {
    await using dbSetup = await setupDb();
    {
      await using setup = await setupDbWorker({ dbSetup });
      assertLength(setup.initOutputs, 1);
    }
    dbSetup.sqlite.exec(sql`update evolu_version set "dbVersion" = 3;`);
    // A newer version can add a view that calls a function this code lacks.
    dbSetup.sqlite.exec(sql`
      create view evolu_future as
        select evolu_future_function(1) as x;
    `);

    await using refused = await setupDbWorker({ dbSetup, expectRefused: true });
    assertEqual(refused.initOutputs, [
      {
        type: "LeaderRefused",
        name: refused.workerName,
        error: {
          type: "UnsupportedDbVersionError",
          storedVersion: PositiveInt.orThrow(3),
          supportedVersion: PositiveInt.orThrow(2),
        },
      },
    ]);
    assertEqual(refused.consoleEntryOrErrors, []);
  });
});
