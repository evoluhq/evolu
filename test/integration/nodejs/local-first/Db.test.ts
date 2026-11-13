import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  mapArray,
  type NonEmptyReadonlyArray,
} from "../../../../packages/common/src/Array.ts";
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
  type ConsoleLevel,
  type ConsoleStoreOutput,
  type TestConsole,
} from "../../../../packages/common/src/Console.ts";
import {
  createXChaCha20Poly1305,
  type XChaCha20Poly1305,
  type XChaCha20Poly1305Dep,
} from "../../../../packages/common/src/Crypto.ts";
import {
  createUnknownError,
  defectToError,
  type UnknownError,
} from "../../../../packages/common/src/Error.ts";
import {
  constVoid,
  disposable,
} from "../../../../packages/common/src/Function.ts";
import {
  startDbWorker,
  type DbWorkerInit,
  type OpenDbWorkerInit,
  type DeleteDatabaseFiles,
  type WaitForDatabaseRelease,
} from "../../../../packages/common/src/local-first/Db.ts";
import { deviceEvoluSchema } from "../../../../packages/common/src/local-first/Auth.ts";
import {
  createAppOwner,
  createOwnerSecret,
  ownerIdToOwnerIdBytes,
  testAppOwner,
  type Owner,
  type OwnerEncryptionKey,
  type OwnerId,
  type OwnerSecret,
} from "../../../../packages/common/src/local-first/Owner.ts";
import {
  applyProtocolMessageAsRelay,
  createProtocolMessageBuffer,
  createProtocolMessageFromCrdtMessages,
  decryptAndDecodeDbChange,
  defaultProtocolMessageMaxSize,
  encodeAndEncryptDbChange,
  MessageType,
  ProtocolErrorCode,
} from "../../../../packages/common/src/local-first/Protocol.ts";
import {
  kyselySql,
  type Query,
} from "../../../../packages/common/src/local-first/Query.ts";
import {
  createQueryBuilder,
  evoluSchemaToSqliteSchema,
  QuarantineOrigin,
  QuarantineReason,
  type ConditionalMutationChange,
  type MutationChange,
  type MutationChangeCondition,
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
import { databaseHeldTimeout } from "../../../../packages/common/src/Sqlite.ts";
import {
  type CrdtMessage,
  DbChange,
  type EncryptedCrdtMessage,
  type EncryptedDbChange,
} from "../../../../packages/common/src/local-first/Storage.ts";
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
  isLeaderLockHeld,
  testCreateLockManager,
  type LockManagerDep,
} from "../../../../packages/common/src/LockManager.ts";
import { installPolyfills } from "../../../../packages/common/src/Polyfills.ts";
import {
  err,
  ok,
  type Result,
} from "../../../../packages/common/src/Result.ts";
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
  type TestReportDefect,
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
  testCreateWorker,
  testWaitForWorkerMessage,
  type CreateBroadcastChannelDep,
  type MessagePort,
  type WorkerSelf,
} from "../../../../packages/common/src/Worker.ts";
import { buildNativeSqlite } from "../../../../packages/nodejs/scripts/build-native.mts";
import { createNodeJsSqliteDriver } from "../../../../packages/nodejs/src/Sqlite.ts";
import { lockManager as reactNativeLockManager } from "../../../../packages/react-native/src/LockManager.ts";
import {
  setupSqliteAndRelayStorage,
  testCreateSqliteDep,
  type TestSqliteAndRelayStorageSetup,
} from "../_deps.ts";

installPolyfills();

// The replay tests' file databases, on @evolu/nodejs's SQLite.
await buildNativeSqlite();

/** Adds the XChaCha20-Poly1305 that changes are encrypted with to `deps`. */
const setupCryptoDeps = <D extends object>(
  deps: D,
): D & XChaCha20Poly1305Dep => ({
  ...deps,
  xChaCha20Poly1305: createXChaCha20Poly1305(),
});

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
  sql: 'create index evolu_message_quarantine_reason_timestamp\n      on evolu_message_quarantine ("reason", "timestamp")',
};

const appIdIndexes = [
  {
    name: "evolu_testTable_id",
    sql: 'create index "evolu_testTable_id"\n        on "testTable" ("id")',
  },
  {
    name: "evolu__localTable_id",
    sql: 'create index "evolu__localTable_id"\n        on "_localTable" ("id")',
  },
];

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
    setupCryptoDeps(testCreateDeps()),
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
  onExport,
}: {
  time?: TestTime;
  createSqliteDriver?: CreateSqliteDriver;
  onExec?: (query: SqliteQuery) => void;
  onExport?: () => void;
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

  // Tests need a stable handle to the lazily created SQLite driver. A query
  // that a prepared statement runs reaches onExec with the prepare option.
  const createSqliteDriver: CreateSqliteDriver = (_name, _options) => () =>
    ok({
      exec: (query) => {
        onExec?.(query);
        return driver.exec(query);
      },
      prepare: (sql) => {
        const statement = driver.prepare(sql);
        return {
          exec: (parameters) => {
            onExec?.({ sql, parameters, options: { prepare: true } });
            return statement.exec(parameters);
          },
          [Symbol.dispose]: () => {
            statement[Symbol.dispose]();
          },
        };
      },
      iterate: (query, onRow) => {
        onExec?.(query);
        driver.iterate(query, onRow);
      },
      export: () => {
        onExport?.();
        return driver.export();
      },
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

const createTestId = testCreateId();
const testSharedWorkerId = createTestId<"SharedWorker">();
const testGateId = createTestId();
const testAttemptId = createTestId();

// The harness's databases are in memory, so there are no files to delete.
const deleteNoDatabaseFiles: DeleteDatabaseFiles = () => () => ok();

interface DbWorkerSetup extends DbSetup {
  /** The defects the DbWorker's Run reported. */
  readonly reportDefect: TestReportDefect;
  /** Ends the SharedWorker that requested the DbWorker. */
  readonly endSharedWorker: () => Promise<void>;
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
  createFirstAppOwner = null,
  time,
  console = testCreateConsole({ level: "silent" }),
  consoleLevel = console.getLevel(),
  consoleEntryOrErrorChannelName,
  createBroadcastChannel = testCreateBroadcastChannel,
  expectRefused = false,
  lockManager = testCreateLockManager(),
  deleteDatabaseFiles = deleteNoDatabaseFiles,
  waitForDatabaseRelease,
  xChaCha20Poly1305,
}: {
  dbSetup?: DbSetup;
  memoryOnly?: boolean;
  createFirstAppOwner?: OpenDbWorkerInit["createFirstAppOwner"];
  sqliteSchema?: SqliteSchema;
  time?: TestTime;
  console?: TestConsole;
  /** The app's level, which DbWorkerInit carries. */
  consoleLevel?: ConsoleLevel;
  consoleEntryOrErrorChannelName?: string;
  createBroadcastChannel?: CreateBroadcastChannelDep["createBroadcastChannel"];
  /** The worker is expected to post LeaderRefused instead of LeaderAcquired. */
  expectRefused?: boolean;
  lockManager?: LockManagerDep["lockManager"];
  deleteDatabaseFiles?: DeleteDatabaseFiles;
  waitForDatabaseRelease?: WaitForDatabaseRelease;
  xChaCha20Poly1305?: XChaCha20Poly1305;
} = {}): Promise<DbWorkerSetup> => {
  await using disposer = new AsyncDisposableStack();

  const dbSetup =
    providedDbSetup ??
    disposer.use(await setupDb(time == null ? undefined : { time }));
  const workerName = dbSetup.name;
  // As the SharedWorker that requested the DbWorker, which leads for its ID
  // while it runs.
  const sharedWorkerRun = disposer.use(testCreateRun({ lockManager }));
  const sharedWorkerLock = disposer.use(
    await sharedWorkerRun.ok(acquireLeaderLock(testSharedWorkerId)),
  );
  // As its tenant, which leads for the database's gate.
  disposer.use(await sharedWorkerRun.ok(acquireLeaderLock(testGateId)));

  const run = disposer.use(
    testCreateRun({
      console,
      consoleStoreOutputEntry: dbSetup.consoleStoreOutput.entry,
      createBroadcastChannel,
      createMessagePort,
      lockManager,
      createSqliteDriver: dbSetup.createSqliteDriver,
      time: dbSetup.time,
      deleteDatabaseFiles,
      ...(waitForDatabaseRelease && { waitForDatabaseRelease }),
      ...(xChaCha20Poly1305 && { xChaCha20Poly1305 }),
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
      consoleEntryOrErrorChannelName ?? consoleEntryOrErrorBroadcastChannelName,
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
    mode: "Open",
    name: workerName,
    consoleLevel,
    sqliteSchema,
    encryptionKey: testAppOwner.encryptionKey,
    memoryOnly,
    createFirstAppOwner,
    gateId: testGateId,
    consoleEntryOrErrorChannelName:
      consoleEntryOrErrorChannelName ?? consoleEntryOrErrorBroadcastChannelName,
    sharedWorkerId: testSharedWorkerId,
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
    assertEqual(initOutputs, [{ clock: getClock(), type: "LeaderAcquired" }]);
  }

  const disposables = disposer.move();

  return {
    ...dbSetup,
    endSharedWorker: async () => {
      await sharedWorkerLock[Symbol.asyncDispose]();
    },
    getClock,
    initOutputs,
    lockManager,
    outputs,
    port: channel.port2,
    reportDefect: run.deps.reportDefect,
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
  const lockManager = testCreateLockManager();
  await using run = testCreateRun({
    console: testCreateConsole({ level: "silent" }),
    consoleStoreOutputEntry: dbSetup.consoleStoreOutput.entry,
    createBroadcastChannel: testCreateBroadcastChannel,
    createMessagePort,
    lockManager,
    createSqliteDriver: dbSetup.createSqliteDriver,
    deleteDatabaseFiles: deleteNoDatabaseFiles,
    time: dbSetup.time,
  });
  await using _gate = await run.ok(acquireLeaderLock(testGateId));
  // Returns a panic as an Err instead of rejecting.
  const done = run.abortable(startDbWorker(self));
  using channel = testCreateMessageChannel<DbWorkerOutput, DbWorkerInput>();
  while (!self.onMessage) await testWaitForWorkerMessage();
  self.onMessage({
    type: "DbWorkerInit",
    mode: "Open",
    name: dbSetup.name,
    consoleLevel: "silent",
    sqliteSchema: defaultSqliteSchema,
    encryptionKey: testAppOwner.encryptionKey,
    memoryOnly: true,
    createFirstAppOwner: null,
    gateId: testGateId,
    consoleEntryOrErrorChannelName: consoleEntryOrErrorBroadcastChannelName,
    sharedWorkerId: testSharedWorkerId,
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
    callbackIds = [],
    subscribedQueries = emptySet,
  }: {
    callbackIds?: ReadonlyArray<Id>;
    subscribedQueries?: ReadonlySet<Query>;
  } = {},
): ExtractTyped<DbWorkerWriteRequest, "ForEvolu"> => ({
  type: "ForEvolu",
  id,
  message: { type: "Mutate", changes, callbackIds, subscribedQueries },
});

const setupApplySyncRequest = (
  inputMessage: Uint8Array,
  owner: Owner = testAppOwner,
): ExtractTyped<DbWorkerWriteRequest, "ForSharedWorker"> => ({
  type: "ForSharedWorker",
  message: { type: "ApplySyncMessage", owner, inputMessage, continues: true },
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
  it("logs at the console level of the app that started it", async () => {
    const console = testCreateConsole({ level: "silent" });
    await using _setup = await setupDbWorker({
      console,
      consoleLevel: "trace",
    });

    assertTrue(
      console
        .getEntriesSnapshot()
        .some(({ method, path }) => method === "trace" && path[0] === "sql"),
    );
  });

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
      deleteDatabaseFiles: deleteNoDatabaseFiles,
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

  it("forwards a console entry argument that cannot be cloned as a string", async () => {
    await using setup = await setupDbWorker();
    const writeEntry = setup.consoleStoreOutput.write as (
      entry: ConsoleEntry | null,
    ) => void;

    writeEntry({
      method: "info",
      path: ["DbWorker"],
      args: [{ attempt: 2, retry: () => undefined }],
    });
    await testWaitForWorkerMessage();

    assertEqual(setup.consoleEntryOrErrors, [
      {
        type: "ConsoleEntry",
        entry: { method: "info", path: ["DbWorker"], args: ['{"attempt":2}'] },
      },
    ]);
  });

  it("writes console entries to its memory instance private channel", async () => {
    const globalEntries: Array<ConsoleEntryOrError> = [];
    using globalChannel = testCreateBroadcastChannel<ConsoleEntryOrError>(
      consoleEntryOrErrorBroadcastChannelName,
    );
    globalChannel.onMessage = (output) => {
      globalEntries.push(output);
    };
    await using setup = await setupDbWorker({
      consoleEntryOrErrorChannelName: `${consoleEntryOrErrorBroadcastChannelName}:memory-instance`,
    });
    const entry: ConsoleEntry = {
      method: "info",
      path: ["DbWorker"],
      args: ["Only this memory instance receives the entry."],
    };

    setup.consoleStoreOutput.write(entry);
    await testWaitForWorkerMessage();

    assertEqual(setup.consoleEntryOrErrors, [{ type: "ConsoleEntry", entry }]);
    assertEqual(globalEntries, []);
  });

  it("acquires leadership and initializes SQLite", async () => {
    await using setup = await setupDbWorker();

    assertEqual(setup.initOutputs, [
      {
        clock: setup.getClock(),
        type: "LeaderAcquired",
      },
    ]);
    assertEqual(getSqliteSnapshot(setup), {
      schema: {
        indexes: [
          {
            name: "evolu_history_ownerId_timestamp",
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          quarantineIndex,
          ...appIdIndexes,
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

  describe("first AppOwner", () => {
    const deviceSqliteSchema = evoluSchemaToSqliteSchema(deviceEvoluSchema);
    const deviceOwnerId = testDbAppOwner2.id;

    const selectAppOwnerRows = (setup: DbSetup) =>
      setup.sqlite.exec<{
        readonly ownerId: OwnerId;
        readonly id: OwnerId;
        readonly secret: OwnerSecret;
        readonly name: SqliteValue;
        readonly lastOpenedAt: SqliteValue;
        readonly createdAt: SqliteValue;
        readonly updatedAt: SqliteValue;
        readonly isDeleted: SqliteValue;
      }>(sql`
        select
          "ownerId",
          "id",
          "secret",
          "name",
          "lastOpenedAt",
          "createdAt",
          "updatedAt",
          "isDeleted"
        from "_evolu_appOwner";
      `).rows;

    it("is created by the startup that creates the database", async () => {
      await using setup = await setupDbWorker({
        sqliteSchema: deviceSqliteSchema,
        createFirstAppOwner: { deviceOwnerId },
      });

      const rows = selectAppOwnerRows(setup);
      assertNonEmptyReadonlyArray(rows);
      const [row] = rows;
      assertEqual(rows, [
        {
          ownerId: deviceOwnerId,
          id: createAppOwner(row.secret).id,
          secret: row.secret,
          name: null,
          lastOpenedAt: null,
          createdAt: millisToDateIso(setup.time.now()),
          updatedAt: null,
          isDeleted: null,
        },
      ]);
      assertEqual(row.secret.length, 32);
    });

    it("is created in the startup's transaction, so an insert that fails leaves no database and the next startup creates it", async () => {
      let failInsert = true;
      let failed = 0;
      await using dbSetup = await setupDb({
        onExec: (query) => {
          if (
            !failInsert ||
            !query.sql.includes('insert into "_evolu_appOwner"')
          )
            return;
          failed++;
          throw new Error("database or disk is full");
        },
      });
      {
        await using _refused = await setupDbWorker({
          dbSetup,
          sqliteSchema: deviceSqliteSchema,
          createFirstAppOwner: { deviceOwnerId },
          expectRefused: true,
        });
      }
      assertSame(failed, 1);
      // A database committed without its first AppOwner would never get one.
      assertEqual(
        dbSetup.sqlite.exec(sql`select "name" from sqlite_master;`).rows,
        [],
      );

      failInsert = false;
      await using setup = await setupDbWorker({
        dbSetup,
        sqliteSchema: deviceSqliteSchema,
        createFirstAppOwner: { deviceOwnerId },
      });
      assertLength(selectAppOwnerRows(setup), 1);
    });

    it("is never created in an existing database", async () => {
      await using dbSetup = await setupDb();
      {
        await using _first = await setupDbWorker({
          dbSetup,
          sqliteSchema: deviceSqliteSchema,
          createFirstAppOwner: { deviceOwnerId },
        });
      }
      // As after the app deleted every AppOwner.
      dbSetup.sqlite.exec(sql`delete from "_evolu_appOwner";`);

      await using second = await setupDbWorker({
        dbSetup,
        sqliteSchema: deviceSqliteSchema,
        createFirstAppOwner: { deviceOwnerId },
      });

      assertEqual(selectAppOwnerRows(second), []);
    });

    it("is not created without createFirstAppOwner", async () => {
      await using setup = await setupDbWorker({
        sqliteSchema: deviceSqliteSchema,
      });

      assertEqual(selectAppOwnerRows(setup), []);
    });
  });

  it("releases leadership after dispose message", async () => {
    await using setup = await setupDbWorker();
    await using run = testCreateRun({ lockManager: setup.lockManager });

    setup.port.postMessage({ type: "Dispose" });

    await using lock = await run.ok(acquireLeaderLock(setup.workerName));
    assertNotUndefined(lock);
    await testWaitForWorkerMessage();
    assertEqual(setup.outputs, []);
  });

  it("releases leadership after its SharedWorker ends", async () => {
    await using setup = await setupDbWorker();
    await using run = testCreateRun({ lockManager: setup.lockManager });

    // As after a panic, which can lose the Dispose the SharedWorker posted.
    await setup.endSharedWorker();

    await using lock = await run.ok(acquireLeaderLock(setup.workerName));
    assertNotUndefined(lock);
    await testWaitForWorkerMessage();
    assertEqual(setup.outputs, []);
  });

  it("disposes worker self after dispose message", async () => {
    await using disposer = new AsyncDisposableStack();
    const dbSetup = disposer.use(await setupDb());
    const lockManager = testCreateLockManager();
    const sharedWorkerRun = disposer.use(testCreateRun({ lockManager }));
    disposer.use(
      await sharedWorkerRun.ok(acquireLeaderLock(testSharedWorkerId)),
    );
    disposer.use(await sharedWorkerRun.ok(acquireLeaderLock(testGateId)));
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
        deleteDatabaseFiles: deleteNoDatabaseFiles,
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
      mode: "Open",
      name: dbSetup.name,
      consoleLevel: "silent",
      sqliteSchema: defaultSqliteSchema,
      encryptionKey: testAppOwner.encryptionKey,
      memoryOnly: true,
      createFirstAppOwner: null,
      gateId: testGateId,
      consoleEntryOrErrorChannelName: consoleEntryOrErrorBroadcastChannelName,
      sharedWorkerId: testSharedWorkerId,
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
        callbackIds: [],
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

  it("local-only change with onlyIf applies only while its row is as given", async () => {
    await using setup = await setupDbWorker();

    const rowId = setup.createId();
    const missingId = setup.createId();
    const change = (
      id: Id,
      values: Readonly<Record<string, SqliteValue>>,
      isDelete: boolean | null,
      onlyIf: MutationChangeCondition,
    ): ConditionalMutationChange => ({
      ...createMutationChange({
        table: "_localTable",
        id,
        values,
        // An update changes only an existing row, so a change that creates one
        // is an upsert.
        isInsert: onlyIf.type === "RowAbsent",
        isDelete,
      }),
      onlyIf,
    });
    const rowMatches = (values: Readonly<Record<string, SqliteValue>>) =>
      ({ type: "RowMatches", values }) as const;
    const selectValues = () =>
      setup.sqlite.exec<{ readonly id: Id; readonly value: SqliteValue }>(sql`
        select "id", "value" from "_localTable";
      `).rows;

    // Only a missing row is inserted.
    for (const value of ["marked", "replaced"])
      await postRequest(
        setup,
        setupMutateRequest(setup.evoluInstanceId, [
          change(rowId, { value }, null, { type: "RowAbsent" }),
        ]),
      );
    assertEqual(selectValues(), [{ id: rowId, value: "marked" }]);

    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        change(
          rowId,
          { value: "changed" },
          null,
          rowMatches({ value: "other" }),
        ),
        change(rowId, {}, true, rowMatches({ value: "other" })),
        // Every column must have its value.
        change(
          rowId,
          {},
          true,
          rowMatches({ value: "marked", updatedAt: "never" }),
        ),
        // A missing row matches nothing, so the change creates nothing.
        change(missingId, { value: "created" }, null, rowMatches({})),
      ]),
    );
    assertEqual(selectValues(), [{ id: rowId, value: "marked" }]);

    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        change(rowId, {}, true, rowMatches({ value: "marked" })),
      ]),
    );
    assertEqual(selectValues(), []);

    // A null and a blob match only themselves, as a pending key's null
    // wrappedSecret and a stored one's bytes do.
    const blob = new Uint8Array([1, 2, 3]);
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        change(rowId, { value: null }, null, { type: "RowAbsent" }),
      ]),
    );
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        change(rowId, { value: "changed" }, null, rowMatches({ value: "" })),
        change(rowId, { value: "changed" }, null, rowMatches({ value: blob })),
      ]),
    );
    assertEqual(selectValues(), [{ id: rowId, value: null }]);
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        change(rowId, { value: blob }, null, rowMatches({ value: null })),
      ]),
    );
    assertEqual(selectValues(), [{ id: rowId, value: blob }]);
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        change(rowId, {}, true, rowMatches({ value: null })),
        change(
          rowId,
          {},
          true,
          rowMatches({ value: new Uint8Array([1, 2, 4]) }),
        ),
      ]),
    );
    assertEqual(selectValues(), [{ id: rowId, value: blob }]);
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        change(rowId, {}, true, rowMatches({ value: blob.slice() })),
      ]),
    );
    assertEqual(selectValues(), []);
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
          callbackIds: [],
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
                  ok([{ id: "ofZXw_hAfJ8fIcpFxi6nag", value: "local only" }]),
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
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          quarantineIndex,
          ...appIdIndexes,
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
                id: rowId,
                values: { value: "local only updated" },
                isInsert: false,
                isDelete: null,
              }),
            ],
            callbackIds: [],
            subscribedQueries: createSet([localTableQuery]),
          },
        },
        setup.createId(),
        "response",
        // A change at the creation time counts as a replay of the insert.
        { clock: setup.getClock(), now: Millis.orThrow(1) },
      ),
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
                  ok([
                    {
                      id: "ofZXw_hAfJ8fIcpFxi6nag",
                      value: "local only updated",
                    },
                  ]),
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
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          quarantineIndex,
          ...appIdIndexes,
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
              updatedAt: "1970-01-01T00:00:00.001Z",
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
          callbackIds: [],
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
                  ok([]),
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
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          quarantineIndex,
          ...appIdIndexes,
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

  it("local-only delete only removes the matching owner row, on a prepared statement", async () => {
    const deletes: Array<SqliteQuery> = [];
    await using dbSetup = await setupDb({
      onExec: (query) => {
        if (query.sql.startsWith('delete from "_localTable"'))
          deletes.push(query);
      },
    });
    await using setup = await setupDbWorker({ dbSetup });

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
        callbackIds: [],
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
        callbackIds: [],
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
    assertEqual(
      deletes.map((query) => query.options),
      [{ prepare: true }],
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
          callbackIds: [],
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

  for (const table of ["_localTable", "testTable"] as const) {
    it(`${table} mutations set createdAt from the first change and updatedAt from later ones`, async () => {
      await using setup = await setupDbWorker({
        time: testCreateTime({
          startAt: Millis.orThrow(100),
          autoIncrement: "sync",
        }),
      });
      const column = table === "_localTable" ? "value" : "name";
      const insertedId = setup.createId();
      const createdByUpdateId = setup.createId();

      const mutateAt = async (
        id: Id,
        value: string,
        isInsert: boolean,
      ): Promise<string> => {
        const now = setup.time.now();
        await postRequest(
          setup,
          setupMutateRequest(setup.evoluInstanceId, [
            createMutationChange({
              table,
              id,
              values: { [column]: value },
              isInsert,
              isDelete: null,
            }),
          ]),
          setup.createId(),
          "response",
          { clock: setup.getClock(), now },
        );
        return millisToDateIso(now);
      };
      const selectRows = () =>
        setup.sqlite.exec(sql`
          select ${sql.identifier(column)} as "value", "createdAt", "updatedAt"
          from ${sql.identifier(table)}
          order by "createdAt";
        `).rows;

      const insertedAt = await mutateAt(insertedId, "inserted", true);
      assertEqual(selectRows(), [
        { value: "inserted", createdAt: insertedAt, updatedAt: null },
      ]);

      // An upsert of an existing row changes it.
      const upsertedAt = await mutateAt(insertedId, "upserted", true);
      // An update of a missing row creates it, unless the table is local-only.
      const createdByUpdateAt = await mutateAt(
        createdByUpdateId,
        "updated",
        false,
      );

      assertEqual(selectRows(), [
        { value: "upserted", createdAt: insertedAt, updatedAt: upsertedAt },
        ...(table === "testTable"
          ? [
              {
                value: "updated",
                createdAt: createdByUpdateAt,
                updatedAt: null,
              },
            ]
          : []),
      ]);
    });
  }

  it("local-only update changes only an existing row, so an update after a delete leaves the row deleted", async () => {
    await using setup = await setupDbWorker();
    const missingId = setup.createId();
    const deletedId = setup.createId();
    const existingId = setup.createId();
    const upsertedId = setup.createId();
    const change = (
      id: Id,
      values: Readonly<Record<string, SqliteValue>>,
      isInsert: boolean,
      isDelete: boolean | null,
    ): MutationChange =>
      createMutationChange({
        table: "_localTable",
        id,
        values,
        isInsert,
        isDelete,
      });
    const selectValues = () =>
      setup.sqlite.exec<{ readonly id: Id; readonly value: SqliteValue }>(sql`
        select "id", "value" from "_localTable";
      `).rows;

    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        change(deletedId, { value: "deleted" }, true, null),
        change(existingId, { value: "existing" }, true, null),
      ]),
    );
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        change(deletedId, {}, false, true),
      ]),
    );
    // A stale tab's updates, which can't know of the delete.
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        change(missingId, { value: "created" }, false, null),
        change(deletedId, { value: "recreated" }, false, null),
        change(deletedId, {}, false, false),
        change(existingId, { value: "updated" }, false, null),
        change(upsertedId, { value: "upserted" }, true, null),
      ]),
    );

    assertEqual(
      selectValues().toSorted((a, b) => a.id.localeCompare(b.id)),
      [
        { id: existingId, value: "updated" },
        { id: upsertedId, value: "upserted" },
      ].toSorted((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it("local-only insert and update in one request leave updatedAt null", async () => {
    await using setup = await setupDbWorker();
    const rowId = setup.createId();

    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        createMutationChange({
          table: "_localTable",
          id: rowId,
          values: { value: "inserted" },
          isInsert: true,
          isDelete: null,
        }),
        createMutationChange({
          table: "_localTable",
          id: rowId,
          values: { value: "updated" },
          isInsert: false,
          isDelete: null,
        }),
      ]),
    );

    // Changes of one request share its time, and a change at the creation
    // time cannot be told apart from a replay of the insert.
    assertEqual(
      setup.sqlite.exec(sql`
        select "value", "createdAt", "updatedAt" from "_localTable";
      `).rows,
      [
        {
          value: "updated",
          createdAt: millisToDateIso(setup.time.now()),
          updatedAt: null,
        },
      ],
    );
  });

  it("local-only mutations fill a missing createdAt, count an undelete, and recreate a deleted row", async () => {
    await using setup = await setupDbWorker({
      time: testCreateTime({
        startAt: Millis.orThrow(100),
        autoIncrement: "sync",
      }),
    });
    const legacyId = setup.createId();
    const undeletedId = setup.createId();
    const recreatedId = setup.createId();

    const mutateAt = async (
      id: Id,
      values: Readonly<Record<string, SqliteValue>>,
      isInsert: boolean,
      isDelete: boolean | null,
    ): Promise<string> => {
      const now = setup.time.now();
      await postRequest(
        setup,
        setupMutateRequest(setup.evoluInstanceId, [
          createMutationChange({
            table: "_localTable",
            id,
            values,
            isInsert,
            isDelete,
          }),
        ]),
        setup.createId(),
        "response",
        { clock: setup.getClock(), now },
      );
      return millisToDateIso(now);
    };
    const selectRow = (id: Id) =>
      setup.sqlite.exec(sql`
        select "createdAt", "updatedAt", "isDeleted"
        from "_localTable"
        where "id" = ${id};
      `).rows;

    // Earlier releases left createdAt null on a row an update created.
    const legacyCreatedAt = millisToDateIso(Millis.orThrow(50));
    setup.sqlite.exec(sql`
      insert into "_localTable" ("ownerId", "id", "value", "updatedAt")
      values (${testAppOwner.id}, ${legacyId}, ${"legacy"}, ${legacyCreatedAt});
    `);
    const legacyChangedAt = await mutateAt(
      legacyId,
      { value: "changed" },
      false,
      null,
    );
    assertEqual(selectRow(legacyId), [
      {
        createdAt: legacyCreatedAt,
        updatedAt: legacyChangedAt,
        isDeleted: null,
      },
    ]);

    const undeletedCreatedAt = await mutateAt(
      undeletedId,
      { value: "row" },
      true,
      null,
    );
    const undeletedAt = await mutateAt(undeletedId, {}, false, false);
    assertEqual(selectRow(undeletedId), [
      { createdAt: undeletedCreatedAt, updatedAt: undeletedAt, isDeleted: 0 },
    ]);

    await mutateAt(recreatedId, { value: "row" }, true, null);
    await mutateAt(recreatedId, {}, false, true);
    assertEqual(selectRow(recreatedId), []);
    const recreatedAt = await mutateAt(
      recreatedId,
      { value: "again" },
      true,
      null,
    );
    assertEqual(selectRow(recreatedId), [
      { createdAt: recreatedAt, updatedAt: null, isDeleted: null },
    ]);
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
        callbackIds: [],
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
          callbackIds: [],
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
                  ok([{ id: "ofZXw_hAfJ8fIcpFxi6nag", name: "queryable" }]),
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

  it("query runs the queries of a request in one read transaction, on prepared begin and commit statements", async () => {
    const statements: Array<string> = [];
    await using dbSetup = await setupDb({
      onExec: (query) => {
        statements.push(
          query.options?.prepare === true ? `prepared ${query.sql}` : query.sql,
        );
      },
    });
    await using setup = await setupDbWorker({ dbSetup });
    statements.splice(0);

    const outputs = await postRequest(setup, {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Query",
        queries: createSet<Query>([testTableQuery, localTableQuery]),
        callbackIds: [],
      },
    });

    assertEqual(statements, [
      "prepared begin;",
      sqliteQueryStringToSqliteQuery(testTableQuery).sql,
      sqliteQueryStringToSqliteQuery(localTableQuery).sql,
      "prepared commit;",
    ]);
    assertLength(outputs, 1);
    assertSame(outputs[0].type, "OnQueuedResponse");
    assertEqual(outputs[0].response.message, {
      type: "Query",
      rowsByQuery: new Map<Query, Result<ReadonlyArray<never>, UnknownError>>([
        [testTableQuery, ok([])],
        [localTableQuery, ok([])],
      ]),
    });
  });

  it("a mutation runs every statement on a kept statement", async () => {
    let isRecording = false;
    const unprepared: Array<string> = [];
    await using dbSetup = await setupDb({
      onExec: (query) => {
        if (isRecording && query.options?.prepare !== true)
          unprepared.push(query.sql);
      },
    });
    await using setup = await setupDbWorker({ dbSetup });

    isRecording = true;
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
          createMutationChange({
            table: "_localTable",
            id: setup.createId(),
            values: { value: "local" },
            isInsert: true,
            isDelete: null,
          }),
        ],
        callbackIds: [],
        subscribedQueries: emptySet,
      },
    });
    isRecording = false;

    assertEqual(unprepared, []);
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
        callbackIds: [],
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
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          quarantineIndex,
          ...appIdIndexes,
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

describe("AppOwner row check", () => {
  it("answers whether the device database stores an AppOwner's row", async () => {
    await using setup = await setupDbWorker({
      sqliteSchema: {
        indexes: [],
        tables: { _evolu_appOwner: new Set(["secret"]) },
      },
    });
    setup.sqlite.exec(sql`
      insert into "_evolu_appOwner" ("ownerId", "id")
      values (${testAppOwner.id}, ${testDbAppOwner2.id});
    `);

    for (const [ownerId, exists] of [
      [testDbAppOwner2.id, true],
      [testAppOwner.id, false],
    ] as const) {
      const outputs = await postRequest(setup, {
        type: "ForSharedWorker",
        message: { type: "HasAppOwner", ownerId },
      });
      assertEqual(getQueuedSharedWorkerMessage(outputs, "HasAppOwner"), {
        type: "HasAppOwner",
        result: ok(exists),
      });
    }
  });

  it("answers SQLite's failure to read the row, not that no row exists, logs it, and keeps serving", async () => {
    const console = testCreateConsole({ level: "error" });
    // The database has no AppOwner table, so the read fails.
    await using setup = await setupDbWorker({ console });

    for (let i = 0; i < 2; i++) {
      const outputs = await postRequest(setup, {
        type: "ForSharedWorker",
        message: { type: "HasAppOwner", ownerId: testAppOwner.id },
      });
      const { result } = getQueuedSharedWorkerMessage(outputs, "HasAppOwner");
      assertErr(result);
      assertSame(result.error.type, "UnknownError");
    }
    const entries = console.getEntriesSnapshot();
    assertLength(entries, 2);
    assertSame(entries[0].method, "error");
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
          callbackIds: [],
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
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          quarantineIndex,
          ...appIdIndexes,
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
        callbackIds: [],
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

  // A silent app still gets the error, which its tab reports as UnknownError.
  for (const consoleLevel of ["error", "silent"] as const)
    it(`CreateSyncMessages logs and reports an owner whose message creation throws at ${consoleLevel}`, async () => {
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
      await using setup = await setupDbWorker({
        dbSetup,
        console,
        consoleLevel,
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
          callbackIds: [],
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
                  ok([{ id: "ofZXw_hAfJ8fIcpFxi6nag", name: "after" }]),
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
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          quarantineIndex,
          ...appIdIndexes,
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
          continues: true,
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
              skippedError: null,
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
          callbackIds: [],
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
                  ok([{ id: "ofZXw_hAfJ8fIcpFxi6nag", name: "synced" }]),
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
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          quarantineIndex,
          ...appIdIndexes,
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

  it("ApplySyncMessage that does not continue stores messages without reconciling", async () => {
    await using setup = await setupDbWorker();
    // The database and the relay each have a change the other lacks, so the
    // relay's answer asks for a continuation.
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        createMutationChange({
          table: "testTable",
          id: setup.createId(),
          values: { name: "local" },
          isInsert: true,
          isDelete: null,
        }),
      ]),
    );
    await using relay = await setupSqliteAndRelayStorage();
    await relay.run.orThrow(
      applyProtocolMessageAsRelay(
        createProtocolMessageFromCrdtMessages(
          setupCryptoDeps(testCreateDeps()),
        )(testAppOwner, [
          {
            timestamp: createTimestamp({
              millis: Millis.orThrow(1),
              counter: 0 as never,
            }),
            change: DbChange.orThrow({
              table: "testTable",
              id: setup.createId(),
              values: { name: "remote" },
              isInsert: true,
              isDelete: null,
            }),
          },
        ]),
      ),
    );
    const request = getQueuedSharedWorkerMessage(
      await postRequest(setup, {
        type: "ForSharedWorker",
        message: { type: "CreateSyncMessages", owners: [testAppOwner] },
      }),
      "CreateSyncMessages",
    ).protocolMessagesByOwnerId.get(testAppOwner.id);
    assertNotUndefined(request);
    const relayResponse = await relay.run.orThrow(
      applyProtocolMessageAsRelay(request),
    );
    const apply = async (continues: boolean) => {
      const { didWriteMessages, result } = getQueuedSharedWorkerMessage(
        await postRequest(setup, {
          type: "ForSharedWorker",
          message: {
            type: "ApplySyncMessage",
            owner: testAppOwner,
            inputMessage: relayResponse.message,
            continues,
          },
        }),
        "ApplySyncMessage",
      );
      assertOk(result);
      return { didWriteMessages, type: result.value.type };
    };

    assertEqual(await apply(false), {
      didWriteMessages: true,
      type: "Readonly",
    });
    assertEqual(
      setup.sqlite
        .exec<{ readonly name: string }>(sql`
          select name from testTable order by name;
        `)
        .rows.map(({ name }) => name),
      ["local", "remote"],
    );
    assertEqual(await apply(true), {
      didWriteMessages: false,
      type: "Response",
    });
  });

  it("ApplySyncMessage decrypts received changes and encrypts the changes it sends with the given XChaCha20Poly1305", async (t) => {
    const xChaCha20Poly1305 = createXChaCha20Poly1305();
    const encrypt = t.mock.method(xChaCha20Poly1305, "encrypt");
    const decrypt = t.mock.method(xChaCha20Poly1305, "decrypt");
    await using setup = await setupDbWorker({ xChaCha20Poly1305 });
    // The database and the relay each have a change the other lacks.
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        createMutationChange({
          table: "testTable",
          id: setup.createId(),
          values: { name: "local" },
          isInsert: true,
          isDelete: null,
        }),
      ]),
    );
    await using relay = await setupSqliteAndRelayStorage();
    await relay.run.orThrow(
      applyProtocolMessageAsRelay(
        createProtocolMessageFromCrdtMessages(
          setupCryptoDeps(testCreateDeps()),
        )(testAppOwner, [
          {
            timestamp: createTimestamp({ millis: Millis.orThrow(1) }),
            change: DbChange.orThrow({
              table: "testTable",
              id: setup.createId(),
              values: { name: "remote" },
              isInsert: true,
              isDelete: null,
            }),
          },
        ]),
      ),
    );
    const request = getQueuedSharedWorkerMessage(
      await postRequest(setup, {
        type: "ForSharedWorker",
        message: { type: "CreateSyncMessages", owners: [testAppOwner] },
      }),
      "CreateSyncMessages",
    ).protocolMessagesByOwnerId.get(testAppOwner.id);
    assertNotUndefined(request);
    const relayResponse = await relay.run.orThrow(
      applyProtocolMessageAsRelay(request),
    );

    const { didWriteMessages, result } = getQueuedSharedWorkerMessage(
      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: relayResponse.message,
          continues: true,
        },
      }),
      "ApplySyncMessage",
    );
    assertOk(result);
    assertTrue(didWriteMessages);
    assertSame(result.value.type, "Response");
    assertSame(decrypt.mock.callCount(), 1);
    assertSame(encrypt.mock.callCount(), 1);
  });

  it("ApplySyncMessage reads changes to send and reads and updates owner usage with prepared statements", async () => {
    const queries: Array<SqliteQuery> = [];
    let captureQueries = false;
    await using dbSetup = await setupDb({
      onExec: (query) => {
        if (captureQueries) queries.push(query);
      },
    });
    await using setup = await setupDbWorker({ dbSetup });
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        createMutationChange({
          table: "testTable",
          id: setup.createId(),
          values: { name: "local" },
          isInsert: true,
          isDelete: null,
        }),
      ]),
    );
    await using relay = await setupSqliteAndRelayStorage();
    await relay.run.orThrow(
      applyProtocolMessageAsRelay(
        createProtocolMessageFromCrdtMessages(
          setupCryptoDeps(testCreateDeps()),
        )(testAppOwner, [
          {
            timestamp: createTimestamp({ millis: Millis.orThrow(1) }),
            change: DbChange.orThrow({
              table: "testTable",
              id: setup.createId(),
              values: { name: "remote" },
              isInsert: true,
              isDelete: null,
            }),
          },
        ]),
      ),
    );
    const request = getQueuedSharedWorkerMessage(
      await postRequest(setup, {
        type: "ForSharedWorker",
        message: { type: "CreateSyncMessages", owners: [testAppOwner] },
      }),
      "CreateSyncMessages",
    ).protocolMessagesByOwnerId.get(testAppOwner.id);
    assertNotUndefined(request);
    const relayResponse = await relay.run.orThrow(
      applyProtocolMessageAsRelay(request),
    );

    captureQueries = true;
    const { result } = getQueuedSharedWorkerMessage(
      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: relayResponse.message,
          continues: true,
        },
      }),
      "ApplySyncMessage",
    );
    captureQueries = false;
    assertOk(result);
    assertSame(result.value.type, "Response");

    const changeReads = queries.filter((query) =>
      query.sql.startsWith('select "table", "id", "column", "value"'),
    );
    const usageQueries = queries.filter((query) =>
      query.sql.includes("evolu_usage"),
    );
    assertLength(changeReads, 1);
    assertLength(usageQueries, 2);
    for (const query of [...changeReads, ...usageQueries]) {
      assertEqual(query.options, { prepare: true });
    }
  });

  it("ApplySyncMessage reports a write SQLite fails and keeps serving", async () => {
    let failsCommit = false;
    const failure = new Error("database or disk is full");
    await using dbSetup = await setupDb({
      onExec: (query) => {
        if (failsCommit && query.sql.trim() === "commit;") {
          failsCommit = false;
          throw failure;
        }
      },
    });
    await using setup = await setupDbWorker({ dbSetup });
    const request = setupApplySyncRequest(
      await createBroadcastProtocolMessage([
        {
          timestamp: createTimestamp({ millis: Millis.orThrow(1) }),
          change: DbChange.orThrow({
            table: "testTable",
            id: setup.createId(),
            values: { name: "synced" },
            isInsert: true,
            isDelete: null,
          }),
        },
      ]),
    );
    const clock = setup.getClock();

    failsCommit = true;
    const failed = getQueuedSharedWorkerMessage(
      await postRequest(setup, request),
      "ApplySyncMessage",
    );
    assertFalse(failsCommit);
    assertEqual(failed.result, err(createUnknownError(failure)));
    assertFalse(failed.didWriteMessages);
    assertEqual(failed.clock, clock);

    const retried = getQueuedSharedWorkerMessage(
      await postRequest(setup, request),
      "ApplySyncMessage",
    );
    assertOk(retried.result, { type: "Broadcast" });
    assertTrue(retried.didWriteMessages);
  });

  describe("ApplySyncMessage with a change it skips", () => {
    const createMessage = (
      setup: DbWorkerSetup,
      millis: number,
      name: string,
    ): CrdtMessage => ({
      timestamp: createTimestamp({ millis: Millis.orThrow(millis) }),
      change: DbChange.orThrow({
        table: "testTable",
        id: setup.createId(),
        values: { name },
        isInsert: true,
        isDelete: null,
      }),
    });

    /**
     * Applies a Broadcast of messages, each encrypted with its own key and sent
     * under its own timestamp unless another is given, or already encrypted.
     */
    const applyBroadcast = async (
      setup: DbWorkerSetup,
      messages: ReadonlyArray<
        | readonly [CrdtMessage, OwnerEncryptionKey, Timestamp?]
        | EncryptedCrdtMessage
      >,
    ) => {
      const deps = testCreateDeps();
      const buffer = createProtocolMessageBuffer(testAppOwner.id, {
        messageType: MessageType.Broadcast,
      });
      for (const entry of messages) {
        if ("change" in entry) {
          buffer.addMessage(entry);
          continue;
        }
        const [message, key, timestamp = message.timestamp] = entry;
        buffer.addMessage({
          timestamp,
          change: encodeAndEncryptDbChange(setupCryptoDeps(deps))(message, key),
        });
      }
      const outputs = await postRequest(
        setup,
        setupApplySyncRequest(buffer.unwrap()),
      );
      await testWaitForWorkerMessage();
      assertEqual(setup.consoleEntryOrErrors, []);
      assertLength(outputs, 1);
      return getQueuedSharedWorkerMessage(outputs, "ApplySyncMessage");
    };

    it("stores the valid changes and skips the ones it cannot decrypt or verify", async () => {
      await using setup = await setupDbWorker();
      const before = createMessage(setup, 1, "before");
      const after = createMessage(setup, 3, "after");

      // The foreign change is encrypted with another owner's key, and the
      // newest one replays an authentic change under another timestamp, so
      // both fail while the changes around them do not.
      const response = await applyBroadcast(setup, [
        [before, testAppOwner.encryptionKey],
        [createMessage(setup, 2, "foreign"), testDbAppOwner2.encryptionKey],
        [after, testAppOwner.encryptionKey],
        [
          before,
          testAppOwner.encryptionKey,
          createTimestamp({ millis: Millis.orThrow(4) }),
        ],
      ]);

      // The first skipped change is reported beside a successful result, so
      // the round it came in continues.
      assertOk(response.result);
      const { skippedError } = response;
      assert(
        skippedError?.type === "DecryptWithXChaCha20Poly1305Error",
        "The foreign change should be reported first.",
      );
      assertInstanceOf(skippedError.error, Error);
      assertSame(response.ownerId, testAppOwner.id);
      assertTrue(response.didWriteMessages);
      // The newest change is skipped, so the clock stops at the newest valid
      // one.
      assertSame(response.clock.millis, after.timestamp.millis);

      const { tables } = getSqliteSnapshot(setup);
      const rowsOf = (name: string) =>
        tables.find((table) => table.name === name)?.rows;
      assertEqual(
        rowsOf("testTable")
          ?.map((row) => row.name)
          .toSorted(),
        ["after", "before"],
      );
      // Skipped changes leave no timestamp, so they never enter the owner's set
      // that sync reconciles and forwards.
      assertEqual(
        rowsOf("evolu_timestamp")?.map((row) => row.t),
        [
          timestampToTimestampBytes(before.timestamp),
          timestampToTimestampBytes(after.timestamp),
        ],
      );
      assertEqual(rowsOf("evolu_message_quarantine"), []);
    });

    it("stores the valid change and skips one it cannot decode", async () => {
      await using setup = await setupDbWorker();
      const valid = createMessage(setup, 1, "valid");

      // The malformed change is too short to hold even its nonce.
      const response = await applyBroadcast(setup, [
        [valid, testAppOwner.encryptionKey],
        {
          timestamp: createTimestamp({ millis: Millis.orThrow(2) }),
          change: Uint8Array.of(1) as EncryptedDbChange,
        },
      ]);

      assertOk(response.result);
      assertSame(response.skippedError?.type, "ProtocolInvalidDataError");
      assertTrue(response.didWriteMessages);
      assertEqual(
        getSqliteSnapshot(setup)
          .tables.find((table) => table.name === "evolu_timestamp")
          ?.rows.map((row) => row.t),
        [timestampToTimestampBytes(valid.timestamp)],
      );
    });

    it("changes nothing when it cannot decrypt any change", async () => {
      await using setup = await setupDbWorker();
      const clock = setup.getClock();
      const snapshot = getSqliteSnapshot(setup);

      const response = await applyBroadcast(setup, [
        [createMessage(setup, 1, "foreign"), testDbAppOwner2.encryptionKey],
      ]);

      assertOk(response.result);
      assertSame(
        response.skippedError?.type,
        "DecryptWithXChaCha20Poly1305Error",
      );
      assertFalse(response.didWriteMessages);
      assertEqual(response.clock, clock);
      assertEqual(getSqliteSnapshot(setup), snapshot);
    });

    it("reports a skipped change only for the request that skipped it", async () => {
      await using setup = await setupDbWorker();
      await applyBroadcast(setup, [
        [createMessage(setup, 1, "foreign"), testDbAppOwner2.encryptionKey],
      ]);

      const response = await applyBroadcast(setup, [
        [createMessage(setup, 2, "valid"), testAppOwner.encryptionKey],
      ]);

      assertOk(response.result);
      assertSame(response.skippedError, null);
      assertTrue(response.didWriteMessages);
    });

    /**
     * Stores the messages on the relay, each uploaded by a writer with the
     * owner's write key and the given encryption key.
     */
    const storeOnRelay = async (
      relay: TestSqliteAndRelayStorageSetup,
      messages: ReadonlyArray<readonly [CrdtMessage, OwnerEncryptionKey]>,
    ) => {
      const deps = testCreateDeps();
      for (const [message, encryptionKey] of messages) {
        await relay.run.orThrow(
          applyProtocolMessageAsRelay(
            createProtocolMessageFromCrdtMessages(setupCryptoDeps(deps))(
              { ...testAppOwner, encryptionKey },
              [message],
            ),
          ),
        );
      }
    };

    /**
     * Runs a round between the client and the relay until the client converges,
     * and returns the skipped error types and the relay's reply sizes.
     */
    const syncWithRelay = async (
      setup: DbWorkerSetup,
      relay: TestSqliteAndRelayStorageSetup,
    ) => {
      const sync = getQueuedSharedWorkerMessage(
        await postRequest(setup, {
          type: "ForSharedWorker",
          message: { type: "CreateSyncMessages", owners: [testAppOwner] },
        }),
        "CreateSyncMessages",
      ).protocolMessagesByOwnerId.get(testAppOwner.id);
      assertNotUndefined(sync);
      let message = sync;
      const skippedErrorTypes: Array<string> = [];
      const replySizes: Array<number> = [];
      for (let step = 0; step < 20; step++) {
        const relayResponse = await relay.run.orThrow(
          applyProtocolMessageAsRelay(message),
        );
        replySizes.push(relayResponse.message.byteLength);
        const response = getQueuedSharedWorkerMessage(
          await postRequest(
            setup,
            setupApplySyncRequest(relayResponse.message),
          ),
          "ApplySyncMessage",
        );
        assertOk(response.result);
        if (response.skippedError)
          skippedErrorTypes.push(response.skippedError.type);
        if (response.result.value.type === "Converged")
          return { skippedErrorTypes, replySizes };
        assertSame(response.result.value.type, "Response");
        message = response.result.value.message;
      }
      throw new Error("The round did not converge.");
    };

    /** Asserts that the relay holds the client's change. */
    const assertOnRelay = (
      relay: TestSqliteAndRelayStorageSetup,
      message: CrdtMessage,
    ) => {
      assertOk(
        decryptAndDecodeDbChange({
          xChaCha20Poly1305: createXChaCha20Poly1305(),
        })(
          {
            timestamp: message.timestamp,
            change: relay.storage.readDbChange(
              testAppOwnerIdBytes,
              timestampToTimestampBytes(message.timestamp),
            ),
          },
          testAppOwner.encryptionKey,
        ),
        message.change,
      );
    };

    it("finishes a round with a relay that keeps offering a change it cannot decrypt", async () => {
      await using setup = await setupDbWorker();
      await using relay = await setupSqliteAndRelayStorage();
      const local = createMessage(setup, 1, "local");
      await applyBroadcast(setup, [[local, testAppOwner.encryptionKey]]);

      // A writer with the owner's write key but another encryption key stored
      // a change on the relay beside a valid one.
      await storeOnRelay(relay, [
        [createMessage(setup, 2, "foreign"), testDbAppOwner2.encryptionKey],
        [createMessage(setup, 3, "remote"), testAppOwner.encryptionKey],
      ]);

      // The client skips the foreign change each time the relay offers it, yet
      // the round still converges instead of offering it forever.
      const { skippedErrorTypes } = await syncWithRelay(setup, relay);
      assertEqual(
        [...new Set(skippedErrorTypes)],
        ["DecryptWithXChaCha20Poly1305Error"],
      );

      // Everything else synced both ways.
      assertEqual(
        setup.sqlite
          .exec<{ name: string }>(sql`
            select name from testTable order by name;
          `)
          .rows.map((row) => row.name),
        ["local", "remote"],
      );
      assertOnRelay(relay, local);
      assertEqual(setup.consoleEntryOrErrors, []);
    });

    it("finishes a download split into several replies around changes it cannot decrypt", async () => {
      await using setup = await setupDbWorker();
      await using relay = await setupSqliteAndRelayStorage();
      const local = createMessage(setup, 1, "local");
      await applyBroadcast(setup, [[local, testAppOwner.encryptionKey]]);

      // The valid changes exceed one reply, and foreign changes precede and
      // follow them.
      const remoteCount = 12;
      const remoteName = "remote".padEnd(100_000, ".");
      await storeOnRelay(relay, [
        [createMessage(setup, 2, "foreign"), testDbAppOwner2.encryptionKey],
        ...Array.from(
          { length: remoteCount },
          (_, index) =>
            [
              createMessage(setup, 3 + index, remoteName),
              testAppOwner.encryptionKey,
            ] as const,
        ),
        [
          createMessage(setup, 3 + remoteCount, "foreign"),
          testDbAppOwner2.encryptionKey,
        ],
      ]);

      const { skippedErrorTypes, replySizes } = await syncWithRelay(
        setup,
        relay,
      );
      assert(
        replySizes.reduce((sum, size) => sum + size, 0) >
          defaultProtocolMessageMaxSize,
        "The download should need several replies.",
      );
      // The later reply offers the first foreign change again, before the
      // second, and each reply reports only its first skipped change.
      assertEqual(skippedErrorTypes, [
        "DecryptWithXChaCha20Poly1305Error",
        "DecryptWithXChaCha20Poly1305Error",
      ]);

      // Every valid change synced both ways.
      assertEqual(
        setup.sqlite
          .exec<{ name: string }>(sql`
            select name from testTable order by name;
          `)
          .rows.map((row) => (row.name === remoteName ? "remote" : row.name)),
        ["local", ...Array.from({ length: remoteCount }, () => "remote")],
      );
      assertOnRelay(relay, local);
      assertEqual(setup.consoleEntryOrErrors, []);
    });

    it("finishes a round around a stored change too large for any frame", async () => {
      await using setup = await setupDbWorker();
      await using relay = await setupSqliteAndRelayStorage();
      // Only the main thread limits a mutation's size, as clients up to 8.11
      // did not, so the database worker stores this blob, whose change
      // encrypts to 1,015,851 bytes.
      for (const name of [new Uint8Array(999_377), "local"])
        await postRequest(
          setup,
          setupMutateRequest(setup.evoluInstanceId, [
            createMutationChange({
              table: "testTable",
              id: setup.createId(),
              values: { name },
              isInsert: true,
              isDelete: null,
            }),
          ]),
        );

      const { skippedErrorTypes } = await syncWithRelay(setup, relay);

      assertEqual(
        [...new Set(skippedErrorTypes)],
        ["ProtocolChangeTooLargeError"],
      );
      assertSame(relay.storage.getSize(testAppOwnerIdBytes), 1);
      assertEqual(setup.consoleEntryOrErrors, []);
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
              callbackIds: [],
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
      assertOk(rows);
      return rows.value;
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
          continues: true,
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
          continues: true,
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

    it("createdAt is the earliest change and updatedAt the latest in every delivery order", async () => {
      const rowId = testCreateId()<"TestTable">();
      // Inserts and upserts mark a change as an insert, which does not decide
      // createdAt: the update at 1 is the row's first change.
      const changeAt = (millis: number, isInsert: boolean): CrdtMessage => ({
        timestamp: createTimestamp({
          millis: Millis.orThrow(millis),
          counter: 0 as never,
        }),
        change: DbChange.orThrow({
          table: "testTable",
          id: rowId,
          values: { name: `at ${millis}` },
          isInsert,
          isDelete: null,
        }),
      });
      const changes = [
        changeAt(1, false),
        changeAt(2, true),
        changeAt(3, false),
        changeAt(4, true),
      ];
      const broadcasts = await Promise.all(
        changes.map((change) => createBroadcastProtocolMessage([change])),
      );
      const permutations = (
        indexes: ReadonlyArray<number>,
      ): ReadonlyArray<ReadonlyArray<number>> =>
        indexes.length <= 1
          ? [indexes]
          : indexes.flatMap((index) =>
              permutations(indexes.filter((other) => other !== index)).map(
                (rest) => [index, ...rest],
              ),
            );
      const orders = permutations([0, 1, 2, 3]);
      assertLength(orders, 24);

      for (const order of orders) {
        await using setup = await setupDbWorker({
          sqliteSchema: createTestSqliteSchema(["name", "note"]),
        });
        for (const [delivered, index] of order.entries()) {
          await postRequest(setup, setupApplySyncRequest(broadcasts[index]));
          // A row with one change has no updatedAt yet.
          if (delivered === 0) {
            assertEqual(
              selectTestTableRows(setup).map(({ createdAt, updatedAt }) => ({
                createdAt,
                updatedAt,
              })),
              [
                {
                  createdAt: millisToDateIso(changes[index].timestamp.millis),
                  updatedAt: null,
                },
              ],
            );
          }
        }

        assertEqual(selectTestTableRows(setup), [
          {
            createdAt: "1970-01-01T00:00:00.001Z",
            id: rowId,
            isDeleted: null,
            name: "at 4",
            note: null,
            updatedAt: "1970-01-01T00:00:00.004Z",
          },
        ]);
        // Time rows keep isInsert in their names for readDbChange.
        assertEqual(
          selectHistoryRows(setup)
            .filter(({ column }) => column !== "name")
            .map(({ column, value }) => ({ column, value })),
          [
            { column: "createdAt", value: "1970-01-01T00:00:00.002Z" },
            { column: "createdAt", value: "1970-01-01T00:00:00.004Z" },
            { column: "updatedAt", value: "1970-01-01T00:00:00.001Z" },
            { column: "updatedAt", value: "1970-01-01T00:00:00.003Z" },
          ],
        );
      }
    });

    it("recomputes time columns from timestamps without reading stored values", async () => {
      const startAt = Millis.orThrow(Date.UTC(10000, 0, 1));
      await using setup = await setupDbWorker({
        sqliteSchema: createTestSqliteSchema(["name", "note"]),
        time: testCreateTime({ startAt }),
      });
      const rowId = setup.createId();
      const applyAt = async (offset: number, isInsert: boolean) => {
        await postRequest(
          setup,
          setupApplySyncRequest(
            await createBroadcastProtocolMessage([
              {
                timestamp: createTimestamp({
                  millis: Millis.orThrow(startAt + offset),
                }),
                change: DbChange.orThrow({
                  table: "testTable",
                  id: rowId,
                  values: { name: `at ${offset}` },
                  isInsert,
                  isDelete: null,
                }),
              },
            ]),
          ),
        );
      };

      await applyAt(1, true);
      assertEqual(
        selectTestTableRows(setup).map(({ createdAt, updatedAt }) => ({
          createdAt,
          updatedAt,
        })),
        [{ createdAt: "+010000-01-01T00:00:00.001Z", updatedAt: null }],
      );
      await applyAt(5, false);
      // Deliberately disagree with both timestamps so reading stored values
      // cannot produce the dates below.
      setup.sqlite.exec(sql`
        update evolu_history
        set "value" = ${"2000-01-01T00:00:00.000Z"}
        where "column" in ('createdAt', 'updatedAt');
      `);

      // An intermediate insert triggers recomputation without replacing the
      // earliest or latest time row.
      await applyAt(3, true);

      assertEqual(
        selectTestTableRows(setup).map(({ createdAt, updatedAt }) => ({
          createdAt,
          updatedAt,
        })),
        [
          {
            createdAt: "+010000-01-01T00:00:00.001Z",
            updatedAt: "+010000-01-01T00:00:00.005Z",
          },
        ],
      );
    });

    for (const origin of ["local", "incoming"] as const) {
      it(`applies an interleaved ${origin} batch like the same changes one by one`, async () => {
        const testSqliteSchema = createTestSqliteSchema(["name", "note"]);
        const sqliteSchema: SqliteSchema = {
          ...testSqliteSchema,
          tables: {
            ...testSqliteSchema.tables,
            anotherTable: new Set(["name", "note"]),
          },
        };
        await using batch = await setupDbWorker({ sqliteSchema });
        await using sequential = await setupDbWorker({ sqliteSchema });
        const createId = testCreateId();
        const firstId = createId();
        const secondId = createId();
        const thirdId = createId();
        const changes = (
          [
            ["testTable", firstId, "first", true, null],
            ["anotherTable", secondId, "second", true, null],
            ["testTable", thirdId, "third", false, null],
            ["testTable", firstId, "first updated", false, null],
            ["anotherTable", secondId, "second deleted", false, true],
            ["testTable", thirdId, "third upserted", true, null],
            ["testTable", firstId, "first upserted", true, null],
            ["anotherTable", secondId, "second restored", false, false],
          ] as const
        ).map(([table, id, name, isInsert, isDelete]) =>
          createMutationChange({
            table,
            id,
            values: { name },
            isInsert,
            isDelete,
          }),
        );
        assertNonEmptyReadonlyArray(changes);

        if (origin === "local") {
          await postRequest(
            batch,
            setupMutateRequest(batch.evoluInstanceId, changes),
          );
          for (const change of changes)
            await postRequest(
              sequential,
              setupMutateRequest(sequential.evoluInstanceId, [change]),
            );
        } else {
          const messages = changes.map((change, index): CrdtMessage => ({
            timestamp: createTimestamp({ millis: Millis.orThrow(index + 1) }),
            change,
          }));
          assertNonEmptyReadonlyArray(messages);
          await postRequest(
            batch,
            setupApplySyncRequest(
              await createBroadcastProtocolMessage(messages),
            ),
          );
          for (const message of messages)
            await postRequest(
              sequential,
              setupApplySyncRequest(
                await createBroadcastProtocolMessage([message]),
              ),
            );
        }

        // This equivalence also holds before sorting. It guards the order
        // independence sorting relies on; it does not measure its speed.
        for (const table of ["testTable", "anotherTable"])
          assertEqual(
            batch.sqlite.exec(sql`
              select * from ${sql.identifier(table)} order by "ownerId", "id";
            `).rows,
            sequential.sqlite.exec(sql`
              select * from ${sql.identifier(table)} order by "ownerId", "id";
            `).rows,
          );
        const historyQuery = sql`
          select *
          from evolu_history
          order by "ownerId", "table", "id", "column", "timestamp";
        `;
        assertEqual(
          batch.sqlite.exec(historyQuery).rows,
          sequential.sqlite.exec(historyQuery).rows,
        );
      });
    }

    it("creates a row from a change without values", async () => {
      await using setup = await setupDbWorker({
        sqliteSchema: createTestSqliteSchema(["name", "note"]),
      });
      const rowId = setup.createId();

      await postRequest(
        setup,
        setupApplySyncRequest(
          await createBroadcastProtocolMessage([
            {
              timestamp: createTimestamp({
                millis: Millis.orThrow(1),
                counter: 0 as never,
              }),
              change: DbChange.orThrow({
                table: "testTable",
                id: rowId,
                values: {},
                isInsert: true,
                isDelete: null,
              }),
            },
          ]),
        ),
      );

      assertEqual(selectTestTableRows(setup), [
        {
          createdAt: "1970-01-01T00:00:00.001Z",
          id: rowId,
          isDeleted: null,
          name: null,
          note: null,
          updatedAt: null,
        },
      ]);
    });

    it("recomputes a row stored by an earlier release on its next change", async () => {
      await using setup = await setupDbWorker({
        sqliteSchema: createTestSqliteSchema(["name", "note"]),
      });
      const rowId = setup.createId();
      const applyAt = async (millis: number, isInsert: boolean) => {
        await postRequest(
          setup,
          setupApplySyncRequest(
            await createBroadcastProtocolMessage([
              {
                timestamp: createTimestamp({
                  millis: Millis.orThrow(millis),
                  counter: 0 as never,
                }),
                change: DbChange.orThrow({
                  table: "testTable",
                  id: rowId,
                  values: { name: `at ${millis}` },
                  isInsert,
                  isDelete: null,
                }),
              },
            ]),
          ),
        );
      };

      await applyAt(1, true);
      await applyAt(3, true);
      // Earlier releases stored the latest insert or upsert as createdAt and
      // the latest update as updatedAt.
      setup.sqlite.exec(sql`
        update testTable
        set
          "createdAt" = ${"1970-01-01T00:00:00.003Z"},
          "updatedAt" = null;
      `);

      await applyAt(2, false);

      assertEqual(
        selectTestTableRows(setup).map(({ createdAt, updatedAt }) => ({
          createdAt,
          updatedAt,
        })),
        [
          {
            createdAt: "1970-01-01T00:00:00.001Z",
            updatedAt: "1970-01-01T00:00:00.003Z",
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
          continues: true,
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
          continues: true,
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
          continues: true,
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
          continues: true,
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
            continues: true,
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
            continues: true,
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
          continues: true,
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
          continues: true,
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
          createdAt: "1970-01-01T00:00:00.001Z",
          id: rowId,
          isDeleted: 1,
          name: "new",
          note: null,
          updatedAt: "1970-01-01T00:00:00.002Z",
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
          continues: true,
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
          continues: true,
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
          createdAt: "1970-01-01T00:00:00.001Z",
          id: rowId,
          isDeleted: 0,
          name: "restored",
          note: null,
          updatedAt: "1970-01-01T00:00:00.002Z",
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
        callbackIds: [],
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
        callbackIds: [],
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
          continues: true,
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
              skippedError: null,
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

      return decryptAndDecodeDbChange({
        xChaCha20Poly1305: createXChaCha20Poly1305(),
      })(
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
            continues: true,
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
                skippedError: null,
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
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          quarantineIndex,
          ...appIdIndexes,
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
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          quarantineIndex,
          ...appIdIndexes,
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
            callbackIds: [],
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
                    ok([
                      {
                        id: "ofZXw_hAfJ8fIcpFxi6nag",
                        name: "known",
                        note: "later",
                      },
                    ]),
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
            sql: 'create index evolu_history_ownerId_timestamp\n        on evolu_history ("ownerId", "timestamp")',
          },
          {
            name: "evolu_history_ownerId_table_id_column_timestampDesc",
            sql: 'create unique index evolu_history_ownerId_table_id_column_timestampDesc\n        on evolu_history ("ownerId", "table", "id", "column", "timestamp" desc)',
          },
          {
            name: "evolu_timestamp_index",
            sql: 'create index evolu_timestamp_index\n      on evolu_timestamp ("ownerId", "l", "t", "h1", "h2", "c")',
          },
          quarantineIndex,
          ...appIdIndexes,
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
            continues: true,
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
            continues: true,
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
              callbackIds: [],
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
        ok([{ id: rowId, name: "known", note: "newer" }]),
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
              continues: true,
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
                skippedError: null,
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
              callbackIds: [],
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
                  [
                    futureTableQuery,
                    ok([{ id: futureRowId, name: "future row" }]),
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
    const driver = await run.ok(createNodeJsSqliteDriver(name));
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
        callbackIds: [],
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
    change: encodeAndEncryptDbChange(setupCryptoDeps(testCreateDeps()))(
      message,
      testAppOwner.encryptionKey,
    ),
  });
  const encoded = buffer.unwrap();
  // One range with an invalid range type, which rejects the whole message.
  const inputMessage =
    kind === "malformed-ranges"
      ? new Uint8Array([...encoded, 1, 127])
      : encoded;
  return {
    type: "ForSharedWorker",
    message: {
      type: "ApplySyncMessage",
      owner: testAppOwner,
      inputMessage,
      continues: true,
    },
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

  it("rejects a response with malformed ranges before writing its messages", async () => {
    await using setup = await setupDbWorker();
    const request = createReplayRequest(
      setup,
      "malformed-ranges",
      setup.createId(),
    );
    assertSame(request.type, "ForSharedWorker");
    const context = { clock: setup.getClock(), now: Millis.orThrow(100) };
    const snapshot = getSqliteSnapshot(setup);

    const output = (
      await postRequest(setup, request, setup.createId(), "response", context)
    )[0];

    assertSame(output.type, "OnQueuedResponse");
    assertSame(output.response.message.type, "ApplySyncMessage");
    const { result, didWriteMessages, clock } = output.response.message;
    assertErr(result);
    assertSame(result.error.type, "ProtocolInvalidDataError");
    assertInstanceOf(result.error.error, Error);
    assertSame(result.error.error.message, "Invalid RangeType: 127");
    assertFalse(didWriteMessages);
    assertEqual(clock, context.clock);
    assertEqual(getSqliteSnapshot(setup), snapshot);
  });

  for (const [kind, rollover] of [
    ["local", false],
    ["broadcast", false],
    ["response", false],
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
              callbackIds: [],
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
                // A failed subscribed query is answered on its own, so it
                // fails the write only after an error, such as an I/O
                // error, made SQLite roll the transaction back.
                if (failure === "query") dbSetup.sqlite.exec(sql`rollback;`);
                throw injected;
              }
            },
          });
          await using setup = await setupDbWorker({
            dbSetup,
            memoryOnly: false,
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
          assertLength(setup.outputs, 1);
          const output = setup.outputs[0];
          assertSame(output.type, "OnQueuedResponse");
          if (kind === "local") {
            assertSame(output.response.type, "ForEvolu");
            assertSame(output.response.id, setup.evoluInstanceId);
            assertSame(output.response.message.type, "MutateFailed");
            // After SQLite's own rollback, the answer is the failed commit.
            if (failure !== "query")
              assertEqual(
                output.response.message.error,
                createUnknownError(injected),
              );
          } else {
            assertSame(output.response.message.type, "ApplySyncMessage");
            assertFalse(output.response.message.didWriteMessages);
            assertEqual(output.response.message.clock, context.clock);
            assertEqual(
              output.response.message.result,
              err(createUnknownError(injected)),
            );
          }
          assertEqual(setup.consoleEntryOrErrors, []);
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
                  callbackIds: [setup.createId()],
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
            ok([]),
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
          // the instance sees the quarantined rows before it runs onSuccess.
          assertEqual(
            output.response.message.rowsByQuery.get(quarantineQuery),
            ok(quarantinedRows(quarantinedTimestamp)),
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
          decryptAndDecodeDbChange({
            xChaCha20Poly1305: createXChaCha20Poly1305(),
          })(
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
          setup.sqlite.prepared`
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
          `;
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
      await using setup = await setupDbWorker({
        dbSetup,
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
        assertLength(setup.outputs, 1);
        const output = setup.outputs[0];
        assertSame(output.type, "OnQueuedResponse");
        assertEqual(output.response, {
          type: "ForEvolu",
          id: setup.evoluInstanceId,
          message: {
            type: "MutateFailed",
            error: createUnknownError(injected),
          },
        });
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
    // A version 1 database lacks the quarantine columns and their index, and
    // the id indexes of app tables.
    for (const { name } of [quarantineIndex, ...appIdIndexes]) {
      dbSetup.sqlite.exec(sql`drop index ${sql.identifier(name)};`);
    }
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

  it("waits for a persistent database's release while holding its leader lock, then opens it", async () => {
    await using dbSetup = await setupDb();
    const lockManager = testCreateLockManager();
    const events: Array<string> = [];

    await using _setup = await setupDbWorker({
      dbSetup: {
        ...dbSetup,
        createSqliteDriver: (name, options) => {
          events.push(`open ${name}`);
          return dbSetup.createSqliteDriver(name, options);
        },
      },
      lockManager,
      memoryOnly: false,
      waitForDatabaseRelease: (name) => async () => {
        const { held = [] } = await lockManager.query();
        const lockNames = held.map((lock) => lock.name);
        events.push(
          `wait ${name}, leader lock held: ${lockNames.includes(`evolu-leaderlock-${name}`)}`,
        );
        return ok();
      },
    });

    assertEqual(events, [
      `wait ${dbSetup.name}, leader lock held: true`,
      `open ${dbSetup.name}`,
    ]);
  });

  it("does not wait for the release of a memory-only database", async () => {
    const waitedNames: Array<Name> = [];

    await using _setup = await setupDbWorker({
      memoryOnly: true,
      waitForDatabaseRelease: (name) => () => {
        waitedNames.push(name);
        return err({ type: "DatabaseHeldError", name });
      },
    });

    assertEqual(waitedNames, []);
  });

  it("refuses a persistent database another context holds without opening it and releases the leader lock", async () => {
    await using dbSetup = await setupDb();
    const error = { type: "DatabaseHeldError", name: dbSetup.name } as const;
    const openedNames: Array<Name> = [];

    await using refused = await setupDbWorker({
      dbSetup: {
        ...dbSetup,
        createSqliteDriver: (name, options) => {
          openedNames.push(name);
          return dbSetup.createSqliteDriver(name, options);
        },
      },
      memoryOnly: false,
      waitForDatabaseRelease: () => () => err(error),
      expectRefused: true,
    });

    assertEqual(refused.initOutputs, [{ type: "LeaderRefused", error }]);
    assertEqual(openedNames, []);
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

describe("worker failure", () => {
  it("refuses nothing when aborted on purpose while it waits for the leader lock", async () => {
    await using dbSetup = await setupDb();
    const lockManager = testCreateLockManager();
    await using lockRun = testCreateRun({ lockManager });
    await using _heldLock = await lockRun.ok(acquireLeaderLock(dbSetup.name));
    using worker = testCreateWorker<DbWorkerInit>();
    await using run = testCreateRun({
      consoleStoreOutputEntry: dbSetup.consoleStoreOutput.entry,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessagePort,
      lockManager,
      createSqliteDriver: dbSetup.createSqliteDriver,
      deleteDatabaseFiles: deleteNoDatabaseFiles,
      time: dbSetup.time,
    });
    const fiber = run.abortable(startDbWorker(worker.self));
    using channel = testCreateMessageChannel<DbWorkerOutput, DbWorkerInput>();
    const outputs: Array<DbWorkerOutput> = [];
    channel.port2.onMessage = (output) => {
      outputs.push(output);
    };
    worker.postMessage({
      type: "DbWorkerInit",
      mode: "Open",
      name: dbSetup.name,
      consoleLevel: "silent",
      sqliteSchema: defaultSqliteSchema,
      encryptionKey: testAppOwner.encryptionKey,
      memoryOnly: true,
      createFirstAppOwner: null,
      gateId: testGateId,
      consoleEntryOrErrorChannelName: consoleEntryOrErrorBroadcastChannelName,
      sharedWorkerId: testSharedWorkerId,
      port: channel.port1.native,
    });
    while (
      (await lockManager.query()).pending?.some(
        (lock) => lock.name === `evolu-leaderlock-${dbSetup.name}`,
      ) !== true
    )
      await testWaitForWorkerMessage();

    const reason = { type: "TestAbort" } as const;
    fiber.abort(reason);

    assertEqual(await fiber, err({ type: "AbortError", reason }));
    await testWaitForWorkerMessage();
    assertEqual(outputs, []);
  });

  it("refuses with an UnknownError when the database does not open, and releases the leader lock", async () => {
    await using dbSetup = await setupDb();
    const error = new Error("No SQLCipher.");

    await using refused = await setupDbWorker({
      dbSetup: {
        ...dbSetup,
        createSqliteDriver: () => () => {
          throw error;
        },
      },
      expectRefused: true,
    });

    assertEqual(refused.initOutputs, [
      { type: "LeaderRefused", error: createUnknownError(error) },
    ]);
    assertEqual(refused.consoleEntryOrErrors, []);
    // Wait for the refused worker to release its leader lock.
    await using run = testCreateRun({ lockManager: refused.lockManager });
    await using _lock = await run.ok(acquireLeaderLock(refused.workerName));
  });

  it("refuses with an UnknownError when waiting for the database release throws", async () => {
    await using dbSetup = await setupDb();
    const error = new Error("Failed to load SQLite wasm.");

    await using refused = await setupDbWorker({
      dbSetup,
      memoryOnly: false,
      waitForDatabaseRelease: () => () => {
        throw error;
      },
      expectRefused: true,
    });

    assertEqual(refused.initOutputs, [
      { type: "LeaderRefused", error: createUnknownError(error) },
    ]);
  });

  it("refuses with an UnknownError when the startup transaction throws, which writes nothing", async () => {
    const error = new Error("database or disk is full");
    await using dbSetup = await setupDb({
      // Throws after the system tables are created, so the test also proves
      // that the startup transaction rolls back.
      onExec: (query) => {
        if (query.sql.includes('create table "testTable"')) throw error;
      },
    });
    const before = getSqliteSnapshot(dbSetup);

    await using refused = await setupDbWorker({ dbSetup, expectRefused: true });

    assertEqual(refused.initOutputs, [
      { type: "LeaderRefused", error: createUnknownError(error) },
    ]);
    assertEqual(getSqliteSnapshot(refused), before);
    assertEqual(refused.consoleEntryOrErrors, []);
  });

  it("refuses with an UnknownError when it fails before it opens the database", async () => {
    const error = new Error("BroadcastChannel is not supported.");

    await using refused = await setupDbWorker({
      createBroadcastChannel: () => {
        throw error;
      },
      expectRefused: true,
    });

    assertEqual(refused.initOutputs, [
      { type: "LeaderRefused", error: createUnknownError(error) },
    ]);
  });

  for (const endsTransaction of [false, true]) {
    it(`answers a query SQLite fails with an UnknownError, loads the other queries, and keeps serving${endsTransaction ? " after SQLite ends the read transaction" : ""}`, async () => {
      const error = new Error(
        endsTransaction ? "disk I/O error" : "no such column: note",
      );
      await using dbSetup = await setupDb({
        onExec: (query) => {
          if (!query.sql.includes('"note" from "testTable"')) return;
          // As after an I/O error, which makes SQLite roll the transaction
          // back itself.
          if (endsTransaction) dbSetup.sqlite.exec(sql`rollback;`);
          throw error;
        },
      });
      const console = testCreateConsole({ level: "error" });
      await using setup = await setupDbWorker({ dbSetup, console });
      const attemptId = setup.createId();

      const outputs = await postRequest(
        setup,
        {
          type: "ForEvolu",
          id: setup.evoluInstanceId,
          message: {
            type: "Query",
            queries: createSet([testTableWithNoteQuery, testTableQuery]),
            callbackIds: [],
          },
        },
        attemptId,
        "activity",
      );

      assertEqual(outputs, [
        {
          type: "OnQueuedResponse",
          attemptId,
          response: {
            type: "ForEvolu",
            id: setup.evoluInstanceId,
            message: {
              type: "Query",
              rowsByQuery: new Map<
                Query,
                Result<ReadonlyArray<never>, UnknownError>
              >([
                [testTableWithNoteQuery, err(createUnknownError(error))],
                [testTableQuery, ok([])],
              ]),
            },
          },
        },
      ]);
      assertEqual(setup.reportDefect.getDefects(), []);
      // Not logged, because tabs report a worker's logged errors as evoluError.
      assertEqual(console.getEntriesSnapshot(), []);

      // The mutation begins its own transaction, so the read one has ended.
      const id = setup.createId();
      const mutation = await postRequest(
        setup,
        setupMutateRequest(
          setup.evoluInstanceId,
          [
            createMutationChange({
              table: "testTable",
              id,
              values: { name: "stored" },
              isInsert: true,
              isDelete: null,
            }),
          ],
          { subscribedQueries: createSet([testTableQuery]) },
        ),
      );

      assertLength(mutation, 1);
      assertSame(mutation[0].type, "OnQueuedResponse");
      assertSame(mutation[0].response.message.type, "Mutate");
      assertEqual(
        mutation[0].response.message.rowsByQuery.get(testTableQuery),
        ok([{ id, name: "stored" }]),
      );
    });
  }

  it("answers each query with the error of a SQLite instance that fails every statement, without refusing the database", async () => {
    // As after a trap that broke SQLite's wasm instance.
    const error = new Error("unreachable");
    let broken = false;
    await using dbSetup = await setupDb({
      onExec: () => {
        if (broken) throw error;
      },
    });
    await using setup = await setupDbWorker({ dbSetup });
    const queryRequest: DbWorkerRequest = {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Query",
        queries: createSet<Query>([testTableQuery, localTableQuery]),
        callbackIds: [],
      },
    };
    broken = true;

    const outputs = await postRequest(
      setup,
      queryRequest,
      setup.createId(),
      "activity",
    );

    assertLength(outputs, 1);
    assertSame(outputs[0].type, "OnQueuedResponse");
    assertEqual(outputs[0].response.message, {
      type: "Query",
      rowsByQuery: new Map<Query, Result<ReadonlyArray<never>, UnknownError>>([
        [testTableQuery, err(createUnknownError(error))],
        [localTableQuery, err(createUnknownError(error))],
      ]),
    });
    assertEqual(setup.reportDefect.getDefects(), []);

    broken = false;
    const next = await postRequest(setup, queryRequest);
    assertLength(next, 1);
    assertSame(next[0].type, "OnQueuedResponse");
    assertEqual(next[0].response.message, {
      type: "Query",
      rowsByQuery: new Map<Query, Result<ReadonlyArray<never>, UnknownError>>([
        [testTableQuery, ok([])],
        [localTableQuery, ok([])],
      ]),
    });
  });

  it("stores a mutation whose subscribed query SQLite fails on the new data", async () => {
    const console = testCreateConsole({ level: "error" });
    await using setup = await setupDbWorker({ console });
    // Prepares, then fails for a row whose name is not JSON.
    const jsonQuery = createQuery((db) =>
      db
        .selectFrom("testTable")
        .select([
          "id",
          kyselySql<number | null>`json_extract("name", '$.a')`.as("a"),
        ]),
    );
    const id = setup.createId();

    const outputs = await postRequest(
      setup,
      setupMutateRequest(
        setup.evoluInstanceId,
        [
          createMutationChange({
            table: "testTable",
            id,
            values: { name: "not json" },
            isInsert: true,
            isDelete: null,
          }),
        ],
        { subscribedQueries: createSet([jsonQuery, testTableQuery]) },
      ),
    );

    assertLength(outputs, 1);
    const [output] = outputs;
    assertSame(output.type, "OnQueuedResponse");
    assertSame(output.response.message.type, "Mutate");
    const { rowsByQuery } = output.response.message;
    const jsonRows = rowsByQuery.get(jsonQuery);
    assertNotUndefined(jsonRows);
    assertErr(jsonRows);
    const { message, cause } = jsonRows.error.error as {
      readonly message: unknown;
      readonly cause: {
        readonly operation: unknown;
        readonly extendedCode: unknown;
      };
    };
    assertEqual(
      { message, operation: cause.operation, extendedCode: cause.extendedCode },
      // SQLITE_ERROR, which the step of its statement reports.
      { message: "malformed JSON", operation: "step", extendedCode: 1 },
    );
    assertEqual(
      rowsByQuery.get(testTableQuery),
      ok([{ id, name: "not json" }]),
    );
    assertEqual(
      setup.sqlite.exec(sql`select "id", "name" from "testTable";`).rows,
      [{ id, name: "not json" }],
    );
    assertEqual(readStoredClock(setup), setup.getClock());
    assertEqual(console.getEntriesSnapshot(), []);
  });

  it("answers an export SQLite fails with an UnknownError and keeps serving", async () => {
    const error = new Error("out of memory");
    let armed = false;
    await using dbSetup = await setupDb({
      onExport: () => {
        if (!armed) return;
        armed = false;
        throw error;
      },
    });
    await using setup = await setupDbWorker({ dbSetup });
    armed = true;
    const attemptId = setup.createId();
    const exportRequest: DbWorkerRequest = {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: { type: "Export" },
    };

    assertEqual(await postRequest(setup, exportRequest, attemptId), [
      {
        type: "OnQueuedResponse",
        attemptId,
        response: {
          type: "ForEvolu",
          id: setup.evoluInstanceId,
          message: { type: "ExportFailed", error: createUnknownError(error) },
        },
      },
    ]);
    assertEqual(setup.reportDefect.getDefects(), []);

    const next = await postRequest(setup, exportRequest);
    assertLength(next, 1);
    assertSame(next[0].type, "OnQueuedResponse");
    assertSame(next[0].response.message.type, "Export");
  });

  it("refuses with an UnknownError when handling a request throws, reports the panic once, and releases the leader lock", async () => {
    await using setup = await setupDbWorker();
    const defect = new Error("defect while handling a request");
    // Iterating the queries throws outside the per-query handling, as a
    // response that cannot be posted would.
    const queries = createSet([testTableQuery]);
    Object.defineProperty(queries, Symbol.iterator, {
      value: () => {
        throw defect;
      },
    });

    const outputs = await postRequest(
      setup,
      {
        type: "ForEvolu",
        id: setup.evoluInstanceId,
        message: { type: "Query", queries, callbackIds: [] },
      },
      setup.createId(),
      "activity",
    );

    assertEqual(outputs, [
      { type: "LeaderRefused", error: createUnknownError(defect) },
    ]);
    const defects = setup.reportDefect.getDefects();
    assertLength(defects, 1);
    assertSame(defectToError(defects[0]), defect);
    // Wait for the failed worker to release its leader lock.
    await using run = testCreateRun({ lockManager: setup.lockManager });
    await using _lock = await run.ok(acquireLeaderLock(setup.workerName));
    await testWaitForWorkerMessage();
    assertEqual(setup.outputs, []);
  });

  it("refuses with an UnknownError after a defect while applying sync, without answering the apply", async () => {
    await using setup = await setupDbWorker();
    const inputMessage = await createBroadcastProtocolMessage([
      {
        timestamp: createTimestamp({ millis: Millis.orThrow(1) }),
        change: DbChange.orThrow({
          table: "testTable",
          id: setup.createId(),
          values: { name: "applied" },
          isInsert: true,
          isDelete: null,
        }),
      },
    ]);
    const defect = new Error("defect while applying sync");
    // Reading the clock while storing the received change throws.
    const clock = Object.defineProperty({ ...setup.getClock() }, "millis", {
      get: () => {
        throw defect;
      },
    });

    const outputs = await postRequest(
      setup,
      setupApplySyncRequest(inputMessage),
      setup.createId(),
      "activity",
      { clock, now: setup.time.now() },
    );
    await testWaitForWorkerMessage();

    assertEqual(outputs, [
      { type: "LeaderRefused", error: createUnknownError(defect) },
    ]);
    assertEqual(setup.outputs, []);
  });
});

describe("database deletion", () => {
  /**
   * Starts a DbWorker that only deletes, with a database lock it shares with
   * the test, and collects what it posts. The test leads for the SharedWorker's
   * ID until it ends the SharedWorker.
   */
  const startDeletingOnlyDbWorker = async ({
    dbSetup,
    lockManager,
    deleteDatabaseFiles,
  }: {
    dbSetup: DbSetup;
    lockManager: LockManagerDep["lockManager"];
    deleteDatabaseFiles: DeleteDatabaseFiles;
  }) => {
    const sharedWorkerRun = testCreateRun({ lockManager });
    const attemptLock = await sharedWorkerRun.ok(
      acquireLeaderLock(testAttemptId),
    );
    const self: WorkerSelf<DbWorkerInit> = {
      postMessage: constVoid,
      onMessage: null,
      native: {} as WorkerSelf<DbWorkerInit>["native"],
      [Symbol.dispose]: constVoid,
    };
    let opened = false;
    const run = testCreateRun({
      console: testCreateConsole({ level: "silent" }),
      consoleStoreOutputEntry: dbSetup.consoleStoreOutput.entry,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessagePort,
      lockManager,
      createSqliteDriver: ((name, options) => {
        opened = true;
        return dbSetup.createSqliteDriver(name, options);
      }) satisfies CreateSqliteDriver,
      deleteDatabaseFiles,
      time: dbSetup.time,
    });
    const done = run(startDbWorker(self));
    const channel = testCreateMessageChannel<DbWorkerOutput, DbWorkerInput>();
    const outputs: Array<DbWorkerOutput> = [];
    channel.port2.onMessage = (output) => {
      outputs.push(output);
    };
    while (!self.onMessage) await testWaitForWorkerMessage();
    self.onMessage({
      type: "DbWorkerInit",
      mode: "Delete",
      name: dbSetup.name,
      consoleLevel: "silent",
      consoleEntryOrErrorChannelName: consoleEntryOrErrorBroadcastChannelName,
      attemptId: testAttemptId,
      port: channel.port1.native,
    });
    return {
      outputs,
      done,
      isOpened: () => opened,
      endAttempt: () => attemptLock[Symbol.asyncDispose](),
      [Symbol.asyncDispose]: async () => {
        await done;
        channel[Symbol.dispose]();
        await run[Symbol.asyncDispose]();
        await sharedWorkerRun[Symbol.asyncDispose]();
      },
    };
  };

  it("deletes the files without opening the database once it holds the database lock, then ends", async () => {
    await using dbSetup = await setupDb();
    const lockManager = testCreateLockManager();
    // An earlier DbWorker of the database holds its lock.
    await using lockRun = testCreateRun({ lockManager });
    const earlier = await lockRun.ok(acquireLeaderLock(dbSetup.name));
    const deletions: Array<string> = [];
    await using worker = await startDeletingOnlyDbWorker({
      dbSetup,
      lockManager,
      deleteDatabaseFiles: (name) => async () => {
        const { held = [] } = await lockManager.query();
        deletions.push(
          held.some((lock) => lock.name === `evolu-leaderlock-${name}`)
            ? "delete under lock"
            : "delete",
        );
        return ok();
      },
    });
    await testWaitForWorkerMessage();
    assertEqual(deletions, []);

    await earlier[Symbol.asyncDispose]();
    await worker.done;
    await testWaitForWorkerMessage();

    assertEqual(deletions, ["delete under lock"]);
    assertEqual(worker.outputs, [{ type: "DatabaseDeleted" }]);
    assertFalse(worker.isOpened());
  });

  it("stops waiting for the database lock after databaseHeldTimeout, answers DatabaseHeldError, and deletes nothing once the lock is released", async () => {
    await using dbSetup = await setupDb();
    const lockManager = testCreateLockManager();
    // A tab of another build keeps the database open.
    await using lockRun = testCreateRun({ lockManager });
    const other = await lockRun.ok(acquireLeaderLock(dbSetup.name));
    let deleted = false;
    await using worker = await startDeletingOnlyDbWorker({
      dbSetup,
      lockManager,
      deleteDatabaseFiles: () => () => {
        deleted = true;
        return ok();
      },
    });
    await testWaitForWorkerMessage();
    assertSame(databaseHeldTimeout, "10s");
    dbSetup.time.advance("9s");
    dbSetup.time.advance("999ms");
    await testWaitForWorkerMessage();
    assertEqual(worker.outputs, []);

    dbSetup.time.advance("1ms");
    await worker.done;
    await testWaitForWorkerMessage();
    assertEqual(worker.outputs, [
      {
        type: "DeleteFailed",
        error: { type: "DatabaseHeldError", name: dbSetup.name },
      },
    ]);

    // It aborted its request, so nothing takes the lock once it's released.
    await other[Symbol.asyncDispose]();
    await testWaitForWorkerMessage();
    assertFalse(deleted);
    assertFalse(await isLeaderLockHeld({ lockManager })(dbSetup.name));
  });

  it("releases a database lock the React Native lock manager grants as databaseHeldTimeout ends the wait", async () => {
    await using dbSetup = await setupDb();
    const offsets = Array.from({ length: 81 }, (_, i) => i - 40);
    const heldAfterEnd: Array<boolean> = [];
    // The lock manager grants through microtasks, so the grant and the
    // deadline can meet in one microtask checkpoint, at one of these offsets
    // in microtasks between releasing the lock and the deadline.
    for (const offset of offsets) {
      const lockManager = testCreateLockManager(reactNativeLockManager);
      await using lockRun = testCreateRun({ lockManager });
      const other = await lockRun.ok(acquireLeaderLock(dbSetup.name));
      await using worker = await startDeletingOnlyDbWorker({
        dbSetup,
        lockManager,
        deleteDatabaseFiles: deleteNoDatabaseFiles,
      });
      await testWaitForWorkerMessage();

      const [before, after] =
        offset < 0
          ? [
              () => dbSetup.time.advance("10s"),
              () => other[Symbol.asyncDispose](),
            ]
          : [
              () => other[Symbol.asyncDispose](),
              () => dbSetup.time.advance("10s"),
            ];
      void before();
      for (let i = 0; i < Math.abs(offset); i++) await Promise.resolve();
      void after();
      await worker.done;
      await testWaitForWorkerMessage();

      assertLength(worker.outputs, 1);
      heldAfterEnd.push(await isLeaderLockHeld({ lockManager })(dbSetup.name));
    }
    assertEqual(
      heldAfterEnd,
      offsets.map(() => false),
    );
  });

  it("opens nothing and posts nothing when its gate ended before it got the database lock", async () => {
    await using dbSetup = await setupDb();
    const lockManager = testCreateLockManager();
    await using lockRun = testCreateRun({ lockManager });
    await using _sharedWorker = await lockRun.ok(
      acquireLeaderLock(testSharedWorkerId),
    );
    const gate = await lockRun.ok(acquireLeaderLock(testGateId));
    // An earlier DbWorker of the database holds its lock.
    const earlier = await lockRun.ok(acquireLeaderLock(dbSetup.name));
    let opened = false;
    // On the web, waiting for the files opens the pool and creates its
    // directory.
    let waitedForFiles = false;
    using worker = testCreateWorker<DbWorkerInit>();
    await using run = testCreateRun({
      consoleStoreOutputEntry: dbSetup.consoleStoreOutput.entry,
      createBroadcastChannel: testCreateBroadcastChannel,
      createMessagePort,
      lockManager,
      createSqliteDriver: ((name, options) => {
        opened = true;
        return dbSetup.createSqliteDriver(name, options);
      }) satisfies CreateSqliteDriver,
      deleteDatabaseFiles: deleteNoDatabaseFiles,
      waitForDatabaseRelease: () => () => {
        waitedForFiles = true;
        return ok();
      },
      time: dbSetup.time,
    });
    const done = run(startDbWorker(worker.self));
    using channel = testCreateMessageChannel<DbWorkerOutput, DbWorkerInput>();
    const outputs: Array<DbWorkerOutput> = [];
    const posted = Promise.withResolvers<void>();
    channel.port2.onMessage = (output) => {
      outputs.push(output);
      posted.resolve();
    };
    worker.postMessage({
      type: "DbWorkerInit",
      mode: "Open",
      name: dbSetup.name,
      consoleLevel: "silent",
      sqliteSchema: defaultSqliteSchema,
      encryptionKey: testAppOwner.encryptionKey,
      memoryOnly: false,
      createFirstAppOwner: null,
      gateId: testGateId,
      consoleEntryOrErrorChannelName: consoleEntryOrErrorBroadcastChannelName,
      sharedWorkerId: testSharedWorkerId,
      port: channel.port1.native,
    });
    await testWaitForWorkerMessage();

    // The tenant deleted the database meanwhile, also for a removal.
    await gate[Symbol.asyncDispose]();
    await earlier[Symbol.asyncDispose]();
    await Promise.race([done, posted.promise]);
    await testWaitForWorkerMessage();

    assertFalse(waitedForFiles);
    assertFalse(opened);
    assertEqual(outputs, []);
    channel.port2.postMessage({ type: "Dispose" });
    await done;
  });

  it("deletes nothing and posts nothing when its attempt ended before it got the database lock", async () => {
    await using dbSetup = await setupDb();
    const lockManager = testCreateLockManager();
    await using lockRun = testCreateRun({ lockManager });
    const earlier = await lockRun.ok(acquireLeaderLock(dbSetup.name));
    let deleted = false;
    await using worker = await startDeletingOnlyDbWorker({
      dbSetup,
      lockManager,
      deleteDatabaseFiles: () => () => {
        deleted = true;
        return ok();
      },
    });

    // A later attempt or SharedWorker may open the database meanwhile.
    await worker.endAttempt();
    await earlier[Symbol.asyncDispose]();
    await worker.done;
    await testWaitForWorkerMessage();

    assertFalse(deleted);
    assertEqual(worker.outputs, []);
    assertFalse(worker.isOpened());
  });

  it("answers a failed deletion of the files with DeleteFailed", async () => {
    await using dbSetup = await setupDb();
    const error = { type: "DatabaseHeldError", name: dbSetup.name } as const;
    await using worker = await startDeletingOnlyDbWorker({
      dbSetup,
      lockManager: testCreateLockManager(),
      deleteDatabaseFiles: () => () => err(error),
    });
    await worker.done;
    await testWaitForWorkerMessage();

    assertEqual(worker.outputs, [{ type: "DeleteFailed", error }]);
    assertFalse(worker.isOpened());
  });

  it("deletes a database's files once its serving DbWorker got Dispose and released the lock", async () => {
    await using dbSetup = await setupDb();
    const lockManager = testCreateLockManager();
    await using serving = await setupDbWorker({ dbSetup, lockManager });
    const deletions: Array<string> = [];
    await using worker = await startDeletingOnlyDbWorker({
      dbSetup,
      lockManager,
      deleteDatabaseFiles: (name) => async () => {
        const { held = [] } = await lockManager.query();
        deletions.push(
          held.some((lock) => lock.name === `evolu-leaderlock-${name}`)
            ? "delete under lock"
            : "delete",
        );
        return ok();
      },
    });
    await testWaitForWorkerMessage();
    assertEqual(deletions, []);

    serving.port.postMessage({ type: "Dispose" });
    await worker.done;
    await testWaitForWorkerMessage();

    assertEqual(deletions, ["delete under lock"]);
    assertEqual(worker.outputs, [{ type: "DatabaseDeleted" }]);
  });
});

describe("owner deletion", () => {
  const newerSqliteSchema: SqliteSchema = {
    indexes: [],
    tables: {
      ...defaultSqliteSchema.tables,
      newerTable: new Set(["value"]),
      // Only index names starting with evolu_ are reserved.
      evolu_appTable: new Set(["value"]),
    },
  };

  /** Writes rows of the owner to every table that stores owners' data. */
  const writeOwnerRows = async (
    setup: DbWorkerSetup,
    ownerId: OwnerId,
  ): Promise<void> => {
    await postRequest(
      setup,
      setupMutateRequest(setup.evoluInstanceId, [
        createMutationChange({
          ownerId,
          table: "testTable",
          id: setup.createId(),
          // The schema lacks the note column, so it is quarantined.
          values: { name: "synced", note: "quarantined" },
          isInsert: true,
          isDelete: null,
        }),
        createMutationChange({
          ownerId,
          table: "_localTable",
          id: setup.createId(),
          values: { value: "local only" },
          isInsert: true,
          isDelete: null,
        }),
      ]),
    );
  };

  const countOwnerRows = (setup: DbSetup, ownerId: OwnerId) => {
    const ownerIdBytes = ownerIdToOwnerIdBytes(ownerId);
    const count = (table: string, value: SqliteValue): number => {
      const { rows } = setup.sqlite.exec<{ count: number }>(sql`
        select count(*) as "count"
        from ${sql.identifier(table)}
        where "ownerId" = ${value};
      `);
      return rows[0].count;
    };
    return {
      testTable: count("testTable", ownerId),
      _localTable: count("_localTable", ownerId),
      newerTable: count("newerTable", ownerId),
      evolu_appTable: count("evolu_appTable", ownerId),
      evolu_history: count("evolu_history", ownerIdBytes),
      evolu_message_quarantine: count("evolu_message_quarantine", ownerIdBytes),
      evolu_timestamp: count("evolu_timestamp", ownerIdBytes),
      evolu_usage: count("evolu_usage", ownerIdBytes),
    };
  };

  /**
   * A database whose two owners have rows in every table, including tables that
   * a newer build created and the DbWorker's schema lacks, one of them starting
   * with evolu_.
   */
  const setupOwnersDatabase = async (dbSetup: DbSetup) => {
    {
      await using newer = await setupDbWorker({
        dbSetup,
        sqliteSchema: newerSqliteSchema,
      });
      for (const ownerId of [testAppOwner.id, testDbAppOwner2.id]) {
        await writeOwnerRows(newer, ownerId);
        await postRequest(
          newer,
          setupMutateRequest(
            newer.evoluInstanceId,
            mapArray(["newerTable", "evolu_appTable"], (table) =>
              createMutationChange({
                ownerId,
                table,
                id: newer.createId(),
                values: { value: "newer" },
                isInsert: true,
                isDelete: null,
              }),
            ),
          ),
        );
      }
    }
    const setup = await setupDbWorker({ dbSetup });
    // The counted tables are every table that stores owners.
    const { rows: ownerTables } = setup.sqlite.exec<{ name: string }>(sql`
      select m.name
      from sqlite_master as m
      join pragma_table_info(m.name) as c on c.name = 'ownerId'
      where m.type = 'table';
    `);
    assertEqual(
      new Set(ownerTables.map(({ name }) => name)),
      new Set(Object.keys(countOwnerRows(setup, testAppOwner.id))),
    );
    for (const ownerId of [testAppOwner.id, testDbAppOwner2.id]) {
      const counts = countOwnerRows(setup, ownerId);
      // Every table holds rows of both owners.
      assertTrue(Object.values(counts).every((count) => count > 0));
    }
    return setup;
  };

  const deleteOwnerRequest = (
    setup: DbSetup,
    ownerId: OwnerId,
  ): DbWorkerRequest => ({
    type: "ForEvolu",
    id: setup.evoluInstanceId,
    message: { type: "DeleteOwner", ownerId },
  });

  it("deletes the owner's rows from every table in the file, including one its schema lacks", async () => {
    await using dbSetup = await setupDb();
    await using setup = await setupOwnersDatabase(dbSetup);
    const keptCounts = countOwnerRows(setup, testAppOwner.id);
    const attemptId = setup.createId();

    const outputs = await postRequest(
      setup,
      deleteOwnerRequest(setup, testDbAppOwner2.id),
      attemptId,
    );

    assertEqual(outputs, [
      {
        type: "OnQueuedResponse",
        attemptId,
        response: {
          type: "ForEvolu",
          id: setup.evoluInstanceId,
          message: { type: "OwnerDeleted" },
        },
      },
    ]);
    assertEqual(countOwnerRows(setup, testDbAppOwner2.id), {
      testTable: 0,
      _localTable: 0,
      newerTable: 0,
      evolu_appTable: 0,
      evolu_history: 0,
      evolu_message_quarantine: 0,
      evolu_timestamp: 0,
      evolu_usage: 0,
    });
    assertEqual(countOwnerRows(setup, testAppOwner.id), keptCounts);
  });

  it("leaves a view and a table without owners alone", async () => {
    await using dbSetup = await setupDb();
    await using setup = await setupOwnersDatabase(dbSetup);
    // Evolu creates neither, but a database file can hold them.
    setup.sqlite.exec(sql`
      create view "ownerView" as
        select "ownerId", "name" from "testTable";
    `);
    setup.sqlite.exec(sql`create table "plain" ("value" any);`);
    setup.sqlite.exec(sql`insert into "plain" ("value") values (1);`);
    const attemptId = setup.createId();

    const outputs = await postRequest(
      setup,
      deleteOwnerRequest(setup, testDbAppOwner2.id),
      attemptId,
    );

    assertEqual(outputs, [
      {
        type: "OnQueuedResponse",
        attemptId,
        response: {
          type: "ForEvolu",
          id: setup.evoluInstanceId,
          message: { type: "OwnerDeleted" },
        },
      },
    ]);
    assertSame(countOwnerRows(setup, testDbAppOwner2.id).testTable, 0);
    assertEqual(setup.sqlite.exec(sql`select "value" from "plain";`).rows, [
      { value: 1 },
    ]);
  });

  it("answers a value that is not an OwnerId with a failed deletion, without refusing the database", async () => {
    await using setup = await setupDbWorker();

    // A plain JavaScript caller can pass the owner's ID, whose id is
    // undefined.
    const outputs = await postRequest(
      setup,
      deleteOwnerRequest(setup, undefined as unknown as OwnerId),
      setup.createId(),
      "activity",
    );

    assertLength(outputs, 1);
    const [output] = outputs;
    assert(output.type === "OnQueuedResponse", "Expected an answer.");
    assertSame(output.response.message.type, "DeleteOwnerFailed");
  });

  it("answers a failure with an UnknownError, deletes nothing, and keeps serving", async () => {
    const error = new Error("disk I/O error");
    let failsUsageDeletion = false;
    await using dbSetup = await setupDb({
      onExec: (query) => {
        // The last statement of the deletion fails.
        if (failsUsageDeletion && query.sql.includes("delete from evolu_usage"))
          throw error;
      },
    });
    await using setup = await setupOwnersDatabase(dbSetup);
    const counts = countOwnerRows(setup, testDbAppOwner2.id);
    failsUsageDeletion = true;
    const attemptId = setup.createId();

    const outputs = await postRequest(
      setup,
      deleteOwnerRequest(setup, testDbAppOwner2.id),
      attemptId,
    );

    assertEqual(outputs, [
      {
        type: "OnQueuedResponse",
        attemptId,
        response: {
          type: "ForEvolu",
          id: setup.evoluInstanceId,
          message: {
            type: "DeleteOwnerFailed",
            error: createUnknownError(error),
          },
        },
      },
    ]);
    assertEqual(countOwnerRows(setup, testDbAppOwner2.id), counts);
    assertEqual(setup.reportDefect.getDefects(), []);

    const queryOutputs = await postRequest(setup, {
      type: "ForEvolu",
      id: setup.evoluInstanceId,
      message: {
        type: "Query",
        queries: createSet([testTableQuery]),
        callbackIds: [],
      },
    });
    assertLength(queryOutputs, 1);
    assertSame(queryOutputs[0].type, "OnQueuedResponse");
  });
});
