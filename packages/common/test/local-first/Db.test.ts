import { describe, expect, test } from "vitest";
import { assert } from "../../src/Assert.js";
import {
  createConsoleStoreOutput,
  testCreateConsole,
  type ConsoleEntry,
  type ConsoleStoreOutput,
} from "../../src/Console.js";
import { lazyVoid } from "../../src/Function.js";
import { startDbWorker, type DbWorkerInit } from "../../src/local-first/Db.js";
import {
  applyProtocolMessageAsRelay,
  createProtocolMessageFromCrdtMessages,
  decryptAndDecodeDbChange,
} from "../../src/local-first/Protocol.js";
import { createQueryBuilder } from "../../src/local-first/Schema.js";
import type {
  DbWorkerInput,
  DbWorkerOutput,
} from "../../src/local-first/Shared.js";
import { DbChange } from "../../src/local-first/Storage.js";
import {
  createTimestamp,
  TimestampBytes,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "../../src/local-first/Timestamp.js";
import { ok } from "../../src/Result.js";
import { createSet, emptySet } from "../../src/Set.js";
import {
  createSqlite,
  getSqliteSnapshot,
  sql,
  type CreateSqliteDriver,
  type Sqlite,
  type SqliteSchema,
  type SqliteValue,
} from "../../src/Sqlite.js";
import { createInMemoryLeaderLock } from "../../src/Task.js";
import { testCreateId, testCreateDeps, testCreateRun } from "../../src/Test.js";
import { Millis, testCreateTime, type TestTime } from "../../src/Time.js";
import { id, String, testName, type Id } from "../../src/Type.js";
import type { ExtractType } from "../../src/Types.js";
import {
  createMessagePort,
  createWorker,
  testCreateMessageChannel,
  testWaitForWorkerMessage,
  type MessagePort,
} from "../../src/Worker.js";
import { setupSqliteAndRelayStorage, testCreateSqliteDep } from "../_deps.js";
import {
  testAppOwner,
  testAppOwner2,
  testAppOwnerIdBytes,
} from "./_fixtures.js";

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
  let broadcastMessage: Uint8Array | null = null;

  await relay.run.orThrow(
    applyProtocolMessageAsRelay(requestMessage, {
      broadcast: (_ownerId, message) => {
        broadcastMessage = message;
      },
    }),
  );

  assert(broadcastMessage, "Expected relay broadcast message");
  return broadcastMessage;
};

interface DbSetup extends AsyncDisposable {
  readonly consoleStoreOutput: ConsoleStoreOutput;
  readonly createId: ReturnType<typeof testCreateId>;
  readonly createSqliteDriver: CreateSqliteDriver;
  readonly evoluPortId: Id;
  readonly leaderLock: ReturnType<typeof createInMemoryLeaderLock>;
  readonly sqlite: Sqlite;
  readonly time: TestTime;
}

const setupDb = async ({
  time = testCreateTime(),
}: {
  time?: TestTime;
} = {}): Promise<DbSetup> => {
  await using stack = new AsyncDisposableStack();

  const createId = testCreateId();
  const evoluPortId = createId();
  const consoleStoreOutput = createConsoleStoreOutput();
  const run = stack.use(
    testCreateRun({
      console: testCreateConsole({ level: "silent" }),
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      time,
    }),
  );

  const driver = stack.use(
    await run.orThrow(testCreateSqliteDep.createSqliteDriver(testName)),
  );

  // Tests need a stable handle to the lazily created SQLite driver.
  const createSqliteDriver: CreateSqliteDriver = (_name, _options) => () =>
    ok({
      exec: (query) => driver.exec(query),
      export: () => driver.export(),
      [Symbol.dispose]: lazyVoid,
    });

  const sqlite = stack.use(
    await run
      .addDeps({ createSqliteDriver })
      .orThrow(createSqlite(testName, { mode: "memory" })),
  );
  const leaderLock = createInMemoryLeaderLock();
  const moved = stack.move();

  return {
    consoleStoreOutput,
    createId,
    createSqliteDriver,
    evoluPortId,
    leaderLock,
    sqlite,
    time,
    [Symbol.asyncDispose]: () => moved.disposeAsync(),
  };
};

interface DbWorkerSetup extends DbSetup {
  readonly initOutputs: ReadonlyArray<DbWorkerOutput>;
  readonly outputs: Array<DbWorkerOutput>;
  readonly port: MessagePort<DbWorkerInput, DbWorkerOutput>;
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
  await using stack = new AsyncDisposableStack();

  const dbSetup =
    providedDbSetup ??
    stack.use(await setupDb(time == null ? undefined : { time }));

  const run = stack.use(
    testCreateRun({
      console: testCreateConsole({ level: "silent" }),
      consoleStoreOutputEntry: dbSetup.consoleStoreOutput.entry,
      createMessagePort,
      leaderLock: dbSetup.leaderLock,
      createSqliteDriver: dbSetup.createSqliteDriver,
      time: dbSetup.time,
    }),
  );
  const worker = stack.use(
    createWorker<DbWorkerInit>((self) => {
      void run(startDbWorker(self));
    }),
  );
  const channel = stack.use(
    testCreateMessageChannel<DbWorkerOutput, DbWorkerInput>(),
  );
  const outputs: Array<DbWorkerOutput> = [];

  channel.port2.onMessage = (output) => {
    outputs.push(output);
  };

  worker.postMessage({
    type: "Init",
    name: testName,
    consoleLevel: "silent",
    sqliteSchema,
    encryptionKey: testAppOwner.encryptionKey,
    memoryOnly,
    port: channel.port1.native,
  });
  await testWaitForWorkerMessage();

  const initOutputs = outputs.splice(0);
  expect(initOutputs).toEqual([{ type: "LeaderAcquired", name: testName }]);
  await testWaitForWorkerMessage();

  const moved = stack.move();

  return {
    ...dbSetup,
    initOutputs,
    outputs,
    port: channel.port2,
    [Symbol.asyncDispose]: () => moved.disposeAsync(),
  };
};

const postRequest = async (
  setup: DbWorkerSetup,
  request: DbWorkerInput["request"],
  callbackId = setup.createId(),
): Promise<ReadonlyArray<DbWorkerOutput>> => {
  setup.port.postMessage({ callbackId, request });
  await testWaitForWorkerMessage();
  return setup.outputs.splice(0);
};

type QueuedResponse = ExtractType<DbWorkerOutput, "OnQueuedResponse">;
type SharedWorkerResponse = ExtractType<
  QueuedResponse["response"],
  "ForSharedWorker"
>;
type SharedWorkerResponseMessage = SharedWorkerResponse["message"];

const getQueuedSharedWorkerMessage = <
  TType extends SharedWorkerResponseMessage["type"],
>(
  outputs: ReadonlyArray<DbWorkerOutput>,
  type: TType,
): ExtractType<SharedWorkerResponseMessage, TType> => {
  const firstOutput = outputs[0];
  assert(firstOutput, "Expected queued response");
  assert(firstOutput.type === "OnQueuedResponse", "Expected queued response");

  const response = firstOutput.response;
  assert(
    response.type === "ForSharedWorker",
    "Expected shared worker response",
  );

  const message = response.message;
  assert(message.type === type, `Expected ${type} message`);

  return message as ExtractType<SharedWorkerResponseMessage, TType>;
};

describe("worker startup", () => {
  test("forwards console store entries to the worker port", async () => {
    await using setup = await setupDbWorker();

    const writeEntry = setup.consoleStoreOutput.write as (
      entry: ConsoleEntry | null,
    ) => void;

    writeEntry(null);
    await testWaitForWorkerMessage();
    expect(setup.outputs).toEqual([]);

    const entry: ConsoleEntry = {
      method: "info",
      path: ["DbWorker"],
      args: ["console-entry"],
    };

    writeEntry(entry);
    await testWaitForWorkerMessage();
    expect(setup.outputs).toEqual([{ type: "OnConsoleEntry", entry }]);
  });

  test("acquires leadership and initializes SQLite", async () => {
    await using setup = await setupDbWorker();

    expect(setup.initOutputs).toMatchInlineSnapshot(`
      [
        {
          "name": "Name",
          "type": "LeaderAcquired",
        },
      ]
    `);
    expect(getSqliteSnapshot(setup)).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,0,0,0,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [],
          },
          {
            "name": "evolu_usage",
            "rows": [],
          },
          {
            "name": "testTable",
            "rows": [],
          },
          {
            "name": "_localTable",
            "rows": [],
          },
        ],
      }
    `);
  });

  test("passes encrypted SQLite options when memoryOnly is false", async () => {
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

    expect(setup.initOutputs).toEqual([
      { type: "LeaderAcquired", name: testName },
    ]);
    expect(sqliteDriverOptions).toEqual([
      { mode: "encrypted", encryptionKey: testAppOwner.encryptionKey },
    ]);
  });
});

describe("query and mutation flow", () => {
  test("local-only mutation updates query rows and SQLite state", async () => {
    await using setup = await setupDbWorker();

    const rowId = setup.createId();

    expect(
      await postRequest(setup, {
        type: "ForEvolu",
        evoluPortId: setup.evoluPortId,
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
    ).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "mg8id41Qk7HxDoApjp0mZA",
          "response": {
            "evoluPortId": "IGNl5t4ulaaQpdnwDhgoCA",
            "message": {
              "messagesByOwnerId": Map {},
              "rowsByQuery": Map {
                "["select \\"id\\", \\"value\\" from \\"_localTable\\"",[],[]]" => [
                  {
                    "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                    "value": "local only",
                  },
                ],
              },
              "type": "Mutate",
            },
            "type": "ForEvolu",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    expect(getSqliteSnapshot(setup)).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,0,0,0,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [],
          },
          {
            "name": "evolu_usage",
            "rows": [],
          },
          {
            "name": "testTable",
            "rows": [],
          },
          {
            "name": "_localTable",
            "rows": [
              {
                "createdAt": "1970-01-01T00:00:00.000Z",
                "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                "isDeleted": null,
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "updatedAt": null,
                "value": "local only",
              },
            ],
          },
        ],
      }
    `);

    expect(
      await postRequest(setup, {
        type: "ForEvolu",
        evoluPortId: setup.evoluPortId,
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
    ).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "ane2ljnnecsBgmb_vbBHKw",
          "response": {
            "evoluPortId": "IGNl5t4ulaaQpdnwDhgoCA",
            "message": {
              "messagesByOwnerId": Map {},
              "rowsByQuery": Map {
                "["select \\"id\\", \\"value\\" from \\"_localTable\\"",[],[]]" => [
                  {
                    "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                    "value": "local only updated",
                  },
                ],
              },
              "type": "Mutate",
            },
            "type": "ForEvolu",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    expect(getSqliteSnapshot(setup)).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,0,0,0,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [],
          },
          {
            "name": "evolu_usage",
            "rows": [],
          },
          {
            "name": "testTable",
            "rows": [],
          },
          {
            "name": "_localTable",
            "rows": [
              {
                "createdAt": "1970-01-01T00:00:00.000Z",
                "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                "isDeleted": null,
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "updatedAt": "1970-01-01T00:00:00.000Z",
                "value": "local only updated",
              },
            ],
          },
        ],
      }
    `);

    expect(
      await postRequest(setup, {
        type: "ForEvolu",
        evoluPortId: setup.evoluPortId,
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
    ).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "T-vftdB4K_reh6yT2RUm8w",
          "response": {
            "evoluPortId": "IGNl5t4ulaaQpdnwDhgoCA",
            "message": {
              "messagesByOwnerId": Map {},
              "rowsByQuery": Map {
                "["select \\"id\\", \\"value\\" from \\"_localTable\\"",[],[]]" => [],
              },
              "type": "Mutate",
            },
            "type": "ForEvolu",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    expect(getSqliteSnapshot(setup)).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,0,0,0,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [],
          },
          {
            "name": "evolu_usage",
            "rows": [],
          },
          {
            "name": "testTable",
            "rows": [],
          },
          {
            "name": "_localTable",
            "rows": [],
          },
        ],
      }
    `);
  });

  test("local-only delete only removes the matching owner row", async () => {
    await using setup = await setupDbWorker();

    const rowId = setup.createId();

    await postRequest(setup, {
      type: "ForEvolu",
      evoluPortId: setup.evoluPortId,
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
            ownerId: testAppOwner2.id,
            values: { value: "second owner" },
            isInsert: true,
            isDelete: null,
          }),
        ],
        onCompleteIds: [],
        subscribedQueries: emptySet,
      },
    });

    expect(
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
    ).toEqual([
      { id: rowId, ownerId: testAppOwner.id, value: "first owner" },
      { id: rowId, ownerId: testAppOwner2.id, value: "second owner" },
    ]);

    await postRequest(setup, {
      type: "ForEvolu",
      evoluPortId: setup.evoluPortId,
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

    expect(
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
    ).toEqual([
      { id: rowId, ownerId: testAppOwner2.id, value: "second owner" },
    ]);
  });

  test("mixed local-only and sync mutate preserves order", async () => {
    await using setup = await setupDbWorker({
      time: testCreateTime({ autoIncrement: "sync" }),
    });

    await postRequest(
      setup,
      {
        type: "ForEvolu",
        evoluPortId: setup.evoluPortId,
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

    expect(getSqliteSnapshot(setup)).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,1,0,0,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [
              {
                "column": "name",
                "id": uint8:[154,15,34,119,141,80,147,177,241,14,128,41,142,157,38,100],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,1,0,0,255,46,38,44,239,232,201,76],
                "value": "synced",
              },
              {
                "column": "createdAt",
                "id": uint8:[154,15,34,119,141,80,147,177,241,14,128,41,142,157,38,100],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,1,0,0,255,46,38,44,239,232,201,76],
                "value": "1970-01-01T00:00:00.001Z",
              },
            ],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [
              {
                "c": 1,
                "h1": 192708586684379,
                "h2": 137690538904011,
                "l": 2,
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "t": uint8:[0,0,0,0,0,1,0,0,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_usage",
            "rows": [
              {
                "firstTimestamp": uint8:[0,0,0,0,0,1,0,0,255,46,38,44,239,232,201,76],
                "lastTimestamp": uint8:[0,0,0,0,0,1,0,0,255,46,38,44,239,232,201,76],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "storedBytes": 1,
              },
            ],
          },
          {
            "name": "testTable",
            "rows": [
              {
                "createdAt": "1970-01-01T00:00:00.001Z",
                "id": "mg8id41Qk7HxDoApjp0mZA",
                "isDeleted": null,
                "name": "synced",
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "updatedAt": null,
              },
            ],
          },
          {
            "name": "_localTable",
            "rows": [
              {
                "createdAt": "1970-01-01T00:00:00.000Z",
                "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                "isDeleted": null,
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "updatedAt": null,
                "value": "first local",
              },
              {
                "createdAt": "1970-01-01T00:00:00.002Z",
                "id": "ane2ljnnecsBgmb_vbBHKw",
                "isDeleted": null,
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "updatedAt": null,
                "value": "second local",
              },
            ],
          },
        ],
      }
    `);
  });

  test("query and export return current state", async () => {
    await using setup = await setupDbWorker();

    expect(
      await postRequest(setup, {
        type: "ForEvolu",
        evoluPortId: setup.evoluPortId,
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
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "mg8id41Qk7HxDoApjp0mZA",
          "response": {
            "evoluPortId": "IGNl5t4ulaaQpdnwDhgoCA",
            "message": {
              "messagesByOwnerId": Map {
                "-9AbmkcTJdXDGMs8_ycHCw" => [
                  {
                    "change": {
                      "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                      "isDelete": null,
                      "isInsert": true,
                      "table": "testTable",
                      "values": {
                        "name": "queryable",
                      },
                    },
                    "timestamp": {
                      "counter": 1,
                      "millis": 0,
                      "nodeId": "ff2e262cefe8c94c",
                    },
                  },
                ],
              },
              "rowsByQuery": Map {},
              "type": "Mutate",
            },
            "type": "ForEvolu",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    expect(
      await postRequest(setup, {
        type: "ForEvolu",
        evoluPortId: setup.evoluPortId,
        message: {
          type: "Query",
          queries: createSet([testTableQuery]),
        },
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "ane2ljnnecsBgmb_vbBHKw",
          "response": {
            "evoluPortId": "IGNl5t4ulaaQpdnwDhgoCA",
            "message": {
              "rowsByQuery": Map {
                "["select \\"id\\", \\"name\\" from \\"testTable\\"",[],[]]" => [
                  {
                    "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                    "name": "queryable",
                  },
                ],
              },
              "type": "Query",
            },
            "type": "ForEvolu",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    const exportOutputs = await postRequest(setup, {
      type: "ForEvolu",
      evoluPortId: setup.evoluPortId,
      message: { type: "Export" },
    });

    expect(exportOutputs).toMatchObject([
      {
        response: {
          evoluPortId: setup.evoluPortId,
          message: {
            file: expect.objectContaining({
              byteLength: setup.sqlite.export().byteLength,
            }),
            type: "Export",
          },
          type: "ForEvolu",
        },
        type: "OnQueuedResponse",
      },
    ]);

    expect(getSqliteSnapshot(setup)).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [
              {
                "column": "name",
                "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "value": "queryable",
              },
              {
                "column": "createdAt",
                "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "value": "1970-01-01T00:00:00.000Z",
              },
            ],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [
              {
                "c": 1,
                "h1": 254926804352991,
                "h2": 61544627249815,
                "l": 2,
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "t": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_usage",
            "rows": [
              {
                "firstTimestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "lastTimestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "storedBytes": 1,
              },
            ],
          },
          {
            "name": "testTable",
            "rows": [
              {
                "createdAt": "1970-01-01T00:00:00.000Z",
                "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                "isDeleted": null,
                "name": "queryable",
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "updatedAt": null,
              },
            ],
          },
          {
            "name": "_localTable",
            "rows": [],
          },
        ],
      }
    `);
  });
});

describe("sync message flow", () => {
  test("CreateSyncMessages returns a protocol message for synced owners", async () => {
    await using setup = await setupDbWorker();

    expect(
      await postRequest(setup, {
        type: "ForEvolu",
        evoluPortId: setup.evoluPortId,
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
    ).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "mg8id41Qk7HxDoApjp0mZA",
          "response": {
            "evoluPortId": "IGNl5t4ulaaQpdnwDhgoCA",
            "message": {
              "messagesByOwnerId": Map {
                "-9AbmkcTJdXDGMs8_ycHCw" => [
                  {
                    "change": {
                      "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                      "isDelete": null,
                      "isInsert": true,
                      "table": "testTable",
                      "values": {
                        "name": "synced",
                      },
                    },
                    "timestamp": {
                      "counter": 1,
                      "millis": 0,
                      "nodeId": "ff2e262cefe8c94c",
                    },
                  },
                ],
              },
              "rowsByQuery": Map {},
              "type": "Mutate",
            },
            "type": "ForEvolu",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    expect(
      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "CreateSyncMessages",
          owners: [testAppOwner],
        },
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "ane2ljnnecsBgmb_vbBHKw",
          "response": {
            "message": {
              "protocolMessagesByOwnerId": Map {
                "-9AbmkcTJdXDGMs8_ycHCw" => uint8:[1,251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11,0,0,1,0,1,2,1,0,1,1,255,46,38,44,239,232,201,76,1],
              },
              "type": "CreateSyncMessages",
            },
            "type": "ForSharedWorker",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    expect(getSqliteSnapshot(setup)).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [
              {
                "column": "name",
                "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "value": "synced",
              },
              {
                "column": "createdAt",
                "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "value": "1970-01-01T00:00:00.000Z",
              },
            ],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [
              {
                "c": 1,
                "h1": 254926804352991,
                "h2": 61544627249815,
                "l": 2,
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "t": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_usage",
            "rows": [
              {
                "firstTimestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "lastTimestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "storedBytes": 1,
              },
            ],
          },
          {
            "name": "testTable",
            "rows": [
              {
                "createdAt": "1970-01-01T00:00:00.000Z",
                "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                "isDeleted": null,
                "name": "synced",
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "updatedAt": null,
              },
            ],
          },
          {
            "name": "_localTable",
            "rows": [],
          },
        ],
      }
    `);
  });

  test.todo("CreateSyncMessages isolates owner state across multiple owners");

  test("sync mutate batches same-owner changes and updates updatedAt", async () => {
    await using setup = await setupDbWorker();

    const rowId = setup.createId();
    expect(
      await postRequest(setup, {
        type: "ForEvolu",
        evoluPortId: setup.evoluPortId,
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
    ).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "mg8id41Qk7HxDoApjp0mZA",
          "response": {
            "evoluPortId": "IGNl5t4ulaaQpdnwDhgoCA",
            "message": {
              "messagesByOwnerId": Map {
                "-9AbmkcTJdXDGMs8_ycHCw" => [
                  {
                    "change": {
                      "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                      "isDelete": null,
                      "isInsert": true,
                      "table": "testTable",
                      "values": {
                        "name": "before",
                      },
                    },
                    "timestamp": {
                      "counter": 1,
                      "millis": 0,
                      "nodeId": "ff2e262cefe8c94c",
                    },
                  },
                  {
                    "change": {
                      "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                      "isDelete": null,
                      "isInsert": false,
                      "table": "testTable",
                      "values": {
                        "name": "after",
                      },
                    },
                    "timestamp": {
                      "counter": 2,
                      "millis": 0,
                      "nodeId": "ff2e262cefe8c94c",
                    },
                  },
                ],
              },
              "rowsByQuery": Map {
                "["select \\"id\\", \\"name\\" from \\"testTable\\"",[],[]]" => [
                  {
                    "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                    "name": "after",
                  },
                ],
              },
              "type": "Mutate",
            },
            "type": "ForEvolu",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    expect(getSqliteSnapshot(setup)).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,0,0,2,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [
              {
                "column": "name",
                "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "value": "before",
              },
              {
                "column": "createdAt",
                "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "value": "1970-01-01T00:00:00.000Z",
              },
              {
                "column": "name",
                "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,0,0,2,255,46,38,44,239,232,201,76],
                "value": "after",
              },
              {
                "column": "updatedAt",
                "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,0,0,2,255,46,38,44,239,232,201,76],
                "value": "1970-01-01T00:00:00.000Z",
              },
            ],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [
              {
                "c": 1,
                "h1": 254926804352991,
                "h2": 61544627249815,
                "l": 2,
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "t": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
              },
              {
                "c": 1,
                "h1": 122996925536315,
                "h2": 100181130040714,
                "l": 1,
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "t": uint8:[0,0,0,0,0,0,0,2,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_usage",
            "rows": [
              {
                "firstTimestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "lastTimestamp": uint8:[0,0,0,0,0,0,0,2,255,46,38,44,239,232,201,76],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "storedBytes": 1,
              },
            ],
          },
          {
            "name": "testTable",
            "rows": [
              {
                "createdAt": "1970-01-01T00:00:00.000Z",
                "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                "isDeleted": null,
                "name": "after",
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "updatedAt": "1970-01-01T00:00:00.000Z",
              },
            ],
          },
          {
            "name": "_localTable",
            "rows": [],
          },
        ],
      }
    `);
  });

  test("ApplySyncMessage writes received rows and queries them", async () => {
    await using setup = await setupDbWorker();

    expect(
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
    ).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "mg8id41Qk7HxDoApjp0mZA",
          "response": {
            "message": {
              "didWriteMessages": true,
              "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
              "result": {
                "ok": true,
                "value": {
                  "type": "Broadcast",
                },
              },
              "type": "ApplySyncMessage",
            },
            "type": "ForSharedWorker",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    expect(
      await postRequest(setup, {
        type: "ForEvolu",
        evoluPortId: setup.evoluPortId,
        message: {
          type: "Query",
          queries: createSet([testTableQuery]),
        },
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "ane2ljnnecsBgmb_vbBHKw",
          "response": {
            "evoluPortId": "IGNl5t4ulaaQpdnwDhgoCA",
            "message": {
              "rowsByQuery": Map {
                "["select \\"id\\", \\"name\\" from \\"testTable\\"",[],[]]" => [
                  {
                    "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                    "name": "synced",
                  },
                ],
              },
              "type": "Query",
            },
            "type": "ForEvolu",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    expect(getSqliteSnapshot({ sqlite: setup.sqlite })).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,1,0,1,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [
              {
                "column": "name",
                "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                "value": "synced",
              },
              {
                "column": "createdAt",
                "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                "value": "1970-01-01T00:00:00.001Z",
              },
            ],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [
              {
                "c": 1,
                "h1": 233868751958873,
                "h2": 133743750684856,
                "l": 2,
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "t": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
              },
            ],
          },
          {
            "name": "evolu_usage",
            "rows": [
              {
                "firstTimestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                "lastTimestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "storedBytes": 1,
              },
            ],
          },
          {
            "name": "testTable",
            "rows": [
              {
                "createdAt": "1970-01-01T00:00:00.001Z",
                "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                "isDeleted": null,
                "name": "synced",
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "updatedAt": null,
              },
            ],
          },
          {
            "name": "_localTable",
            "rows": [],
          },
        ],
      }
    `);
  });

  test("ApplySyncMessage emits OnError for corrupted messages", async () => {
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

    expect(
      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: corruptedMessage,
        },
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "error": {
            "error": [Error: invalid tag],
            "type": "DecryptWithXChaCha20Poly1305Error",
          },
          "type": "OnError",
        },
        {
          "callbackId": "mg8id41Qk7HxDoApjp0mZA",
          "response": {
            "message": {
              "didWriteMessages": false,
              "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
              "result": {
                "ok": true,
                "value": {
                  "type": "Broadcast",
                },
              },
              "type": "ApplySyncMessage",
            },
            "type": "ForSharedWorker",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    expect(getSqliteSnapshot(setup)).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,0,0,0,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [],
          },
          {
            "name": "evolu_usage",
            "rows": [],
          },
          {
            "name": "testTable",
            "rows": [],
          },
          {
            "name": "_localTable",
            "rows": [],
          },
        ],
      }
    `);
  });

  test("ApplySyncMessage emits OnError for timestamps beyond max drift", async () => {
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

    expect(
      await postRequest(setup, {
        type: "ForSharedWorker",
        message: {
          type: "ApplySyncMessage",
          owner: testAppOwner,
          inputMessage: farFutureMessage,
        },
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "error": {
            "next": 600000,
            "now": 0,
            "type": "TimestampDriftError",
          },
          "type": "OnError",
        },
        {
          "callbackId": "mg8id41Qk7HxDoApjp0mZA",
          "response": {
            "message": {
              "didWriteMessages": false,
              "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
              "result": {
                "ok": true,
                "value": {
                  "type": "Broadcast",
                },
              },
              "type": "ApplySyncMessage",
            },
            "type": "ForSharedWorker",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    expect(getSqliteSnapshot(setup)).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,0,0,0,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [],
          },
          {
            "name": "evolu_usage",
            "rows": [],
          },
          {
            "name": "testTable",
            "rows": [],
          },
          {
            "name": "_localTable",
            "rows": [],
          },
        ],
      }
    `);
  });

  describe("CRDT", () => {
    const queryRows = async (
      setup: DbWorkerSetup,
      query: typeof testTableQuery | typeof testTableWithNoteQuery,
    ): Promise<ReadonlyArray<Record<string, unknown>>> => {
      const [output] = await postRequest(
        setup,
        {
          type: "ForEvolu",
          evoluPortId: setup.evoluPortId,
          message: {
            type: "Query",
            queries: createSet([query]),
          },
        },
        setup.createId(),
      );

      assert(output, "Expected query response");
      assert(output.type === "OnQueuedResponse", "Expected queued response");

      const response = output.response;
      assert(response.type === "ForEvolu", "Expected Evolu response");
      assert(response.message.type === "Query", "Expected query response");

      const rows = response.message.rowsByQuery.get(query);
      assert(rows, "Expected query rows");
      return rows as ReadonlyArray<Record<string, unknown>>;
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

    test("Duplicate remote delivery is idempotent", async () => {
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

      expect(rowsAfterSecondApply).toEqual(rowsAfterFirstApply);
      expect(rowsAfterSecondApply).toEqual([{ id: rowId, name: "synced" }]);
      expect(historyAfterSecondApply).toEqual(historyAfterFirstApply);
      expect(historyAfterSecondApply).toMatchObject([
        {
          column: "createdAt",
          value: "1970-01-01T00:00:00.001Z",
        },
        {
          column: "name",
          value: "synced",
        },
      ]);
    });

    test("Newer message wins even when delivered first", async () => {
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

      expect(await queryRows(setup, testTableQuery)).toEqual([
        { id: rowId, name: "new" },
      ]);
    });

    test("LWW is per-column, not per-row", async () => {
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

      expect(await queryRows(setup, testTableWithNoteQuery)).toEqual([
        { id: rowId, name: "new", note: "later" },
      ]);

      expect(selectTestTableRows(setup)).toEqual([
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

    test("Newer tombstone wins over an older explicit undelete", async () => {
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

      expect(selectTestTableRows(setup)).toEqual([
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

    test("Older tombstone delivered later still marks the row deleted", async () => {
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

      expect(selectTestTableRows(setup)).toEqual([
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

    test("Newer explicit undelete wins over an older tombstone", async () => {
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

      expect(selectTestTableRows(setup)).toEqual([
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

  test("persisted delete changes survive a sync roundtrip", async () => {
    await using setup = await setupDbWorker();
    const rowId = setup.createId();
    const createSyncMessagesCallbackId = setup.createId();
    const applySyncMessageCallbackId = setup.createId();

    await postRequest(setup, {
      type: "ForEvolu",
      evoluPortId: setup.evoluPortId,
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
      evoluPortId: setup.evoluPortId,
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

    expect(syncResponses).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "mg8id41Qk7HxDoApjp0mZA",
          "response": {
            "message": {
              "protocolMessagesByOwnerId": Map {
                "-9AbmkcTJdXDGMs8_ycHCw" => uint8:[1,251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11,0,0,1,0,1,2,2,0,0,1,1,2,1,255,46,38,44,239,232,201,76,2],
              },
              "type": "CreateSyncMessages",
            },
            "type": "ForSharedWorker",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    const protocolMessage = getQueuedSharedWorkerMessage(
      syncResponses,
      "CreateSyncMessages",
    ).protocolMessagesByOwnerId.get(testAppOwner.id);
    assert(protocolMessage, "Expected sync protocol message");

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

    expect(
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
    ).toMatchInlineSnapshot(`
      [
        {
          "callbackId": "ane2ljnnecsBgmb_vbBHKw",
          "response": {
            "message": {
              "didWriteMessages": false,
              "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
              "result": {
                "ok": true,
                "value": {
                  "message": "<dynamic>",
                  "type": "Response",
                },
              },
              "type": "ApplySyncMessage",
            },
            "type": "ForSharedWorker",
          },
          "type": "OnQueuedResponse",
        },
      ]
    `);

    const applySyncMessage = getQueuedSharedWorkerMessage(
      applySyncResponses,
      "ApplySyncMessage",
    );
    const clientFollowUpMessage =
      applySyncMessage.result.ok &&
      applySyncMessage.result.value.type === "Response"
        ? applySyncMessage.result.value.message
        : null;
    assert(clientFollowUpMessage, "Expected client follow-up sync response");

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

    expect(
      decodedRelayChanges.map((result) =>
        result.ok
          ? {
              ...result,
              value: { ...result.value, id: "<dynamic>" },
            }
          : result,
      ),
    ).toMatchInlineSnapshot(`
    [
      {
        "ok": true,
        "value": {
          "id": "<dynamic>",
          "isDelete": null,
          "isInsert": true,
          "table": "testTable",
          "values": {
            "name": "synced",
          },
        },
      },
      {
        "ok": true,
        "value": {
          "id": "<dynamic>",
          "isDelete": true,
          "isInsert": false,
          "table": "testTable",
          "values": {},
        },
      },
    ]
  `);
  });
});

describe("request deduplication and drift", () => {
  test("ignores duplicate callbackId for repeated mutate requests", async () => {
    await using setup = await setupDbWorker();

    const callbackId = setup.createId();
    const request: DbWorkerInput["request"] = {
      type: "ForEvolu",
      evoluPortId: setup.evoluPortId,
      message: {
        type: "Mutate",
        changes: [
          createMutationChange({
            table: "testTable",
            id: setup.createId(),
            values: { name: "once" },
            isInsert: true,
            isDelete: null,
          }),
        ],
        onCompleteIds: [],
        subscribedQueries: emptySet,
      },
    };

    expect(await postRequest(setup, request, callbackId))
      .toMatchInlineSnapshot(`
        [
          {
            "callbackId": "0l2pVhO0LWfZ0SWcHuPJiQ",
            "response": {
              "evoluPortId": "IGNl5t4ulaaQpdnwDhgoCA",
              "message": {
                "messagesByOwnerId": Map {
                  "-9AbmkcTJdXDGMs8_ycHCw" => [
                    {
                      "change": {
                        "id": "mg8id41Qk7HxDoApjp0mZA",
                        "isDelete": null,
                        "isInsert": true,
                        "table": "testTable",
                        "values": {
                          "name": "once",
                        },
                      },
                      "timestamp": {
                        "counter": 1,
                        "millis": 0,
                        "nodeId": "ff2e262cefe8c94c",
                      },
                    },
                  ],
                },
                "rowsByQuery": Map {},
                "type": "Mutate",
              },
              "type": "ForEvolu",
            },
            "type": "OnQueuedResponse",
          },
        ]
      `);

    expect(await postRequest(setup, request, callbackId)).toMatchInlineSnapshot(
      `[]`,
    );

    expect(getSqliteSnapshot(setup)).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [
              {
                "column": "name",
                "id": uint8:[154,15,34,119,141,80,147,177,241,14,128,41,142,157,38,100],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "value": "once",
              },
              {
                "column": "createdAt",
                "id": uint8:[154,15,34,119,141,80,147,177,241,14,128,41,142,157,38,100],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "testTable",
                "timestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "value": "1970-01-01T00:00:00.000Z",
              },
            ],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [
              {
                "c": 1,
                "h1": 254926804352991,
                "h2": 61544627249815,
                "l": 2,
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "t": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
              },
            ],
          },
          {
            "name": "evolu_usage",
            "rows": [
              {
                "firstTimestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "lastTimestamp": uint8:[0,0,0,0,0,0,0,1,255,46,38,44,239,232,201,76],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "storedBytes": 1,
              },
            ],
          },
          {
            "name": "testTable",
            "rows": [
              {
                "createdAt": "1970-01-01T00:00:00.000Z",
                "id": "mg8id41Qk7HxDoApjp0mZA",
                "isDeleted": null,
                "name": "once",
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "updatedAt": null,
              },
            ],
          },
          {
            "name": "_localTable",
            "rows": [],
          },
        ],
      }
    `);
  });

  test("sync mutate posts OnError when persisted clock exceeds drift", async () => {
    await using dbSetup = await setupDb();

    {
      await using setup = await setupDbWorker({ dbSetup });
      expect(setup.outputs).toEqual([]);
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

    expect(
      await postRequest(setup, {
        type: "ForEvolu",
        evoluPortId: setup.evoluPortId,
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
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "error": {
            "next": 600000,
            "now": 0,
            "type": "TimestampDriftError",
          },
          "type": "OnError",
        },
      ]
    `);

    expect(getSqliteSnapshot({ sqlite: dbSetup.sqlite }))
      .toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "_localTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "value",
            },
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "testTable": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "name",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,9,39,192,0,0,0,0,0,0,0,0,0,0],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [],
          },
          {
            "name": "evolu_usage",
            "rows": [],
          },
          {
            "name": "testTable",
            "rows": [],
          },
          {
            "name": "_localTable",
            "rows": [],
          },
        ],
      }
    `);
  });
});

describe("quarantine replay", () => {
  test("applies quarantined columns after schema expansion", async () => {
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

      expect(
        await postRequest(setup, {
          type: "ForSharedWorker",
          message: {
            type: "ApplySyncMessage",
            owner: testAppOwner,
            inputMessage: protocolMessage,
          },
        }),
      ).toMatchInlineSnapshot(`
        [
          {
            "callbackId": "mg8id41Qk7HxDoApjp0mZA",
            "response": {
              "message": {
                "didWriteMessages": true,
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "result": {
                  "ok": true,
                  "value": {
                    "type": "Broadcast",
                  },
                },
                "type": "ApplySyncMessage",
              },
              "type": "ForSharedWorker",
            },
            "type": "OnQueuedResponse",
          },
        ]
      `);
    }

    expect(getSqliteSnapshot({ sqlite: dbSetup.sqlite }))
      .toMatchInlineSnapshot(`
        {
          "schema": {
            "indexes": [
              {
                "name": "evolu_history_ownerId_timestamp",
                "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                  "ownerId",
                  "timestamp"
                )",
              },
              {
                "name": "evolu_history_ownerId_table_id_column_timestampDesc",
                "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                  "ownerId",
                  "table",
                  "id",
                  "column",
                  "timestamp" desc
                )",
              },
              {
                "name": "evolu_timestamp_index",
                "sql": "create index evolu_timestamp_index on evolu_timestamp (
                "ownerId",
                "l",
                "t",
                "h1",
                "h2",
                "c"
              )",
              },
            ],
            "tables": {
              "_localTable": Set {
                "id",
                "createdAt",
                "updatedAt",
                "isDeleted",
                "ownerId",
                "value",
              },
              "evolu_config": Set {
                "clock",
              },
              "evolu_history": Set {
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp",
                "value",
              },
              "evolu_message_quarantine": Set {
                "ownerId",
                "timestamp",
                "table",
                "id",
                "column",
                "value",
              },
              "evolu_timestamp": Set {
                "ownerId",
                "t",
                "h1",
                "h2",
                "c",
                "l",
              },
              "evolu_usage": Set {
                "ownerId",
                "storedBytes",
                "firstTimestamp",
                "lastTimestamp",
              },
              "evolu_version": Set {
                "protocolVersion",
              },
              "testTable": Set {
                "id",
                "createdAt",
                "updatedAt",
                "isDeleted",
                "ownerId",
                "name",
              },
            },
          },
          "tables": [
            {
              "name": "evolu_version",
              "rows": [
                {
                  "protocolVersion": 1,
                },
              ],
            },
            {
              "name": "evolu_config",
              "rows": [
                {
                  "clock": uint8:[0,0,0,0,0,1,0,1,255,46,38,44,239,232,201,76],
                },
              ],
            },
            {
              "name": "evolu_history",
              "rows": [
                {
                  "column": "name",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": "known",
                },
                {
                  "column": "createdAt",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": "1970-01-01T00:00:00.001Z",
                },
                {
                  "column": "isDeleted",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": 0,
                },
              ],
            },
            {
              "name": "evolu_message_quarantine",
              "rows": [
                {
                  "column": "note",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": "later",
                },
              ],
            },
            {
              "name": "evolu_timestamp",
              "rows": [
                {
                  "c": 1,
                  "h1": 233868751958873,
                  "h2": 133743750684856,
                  "l": 2,
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "t": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                },
              ],
            },
            {
              "name": "evolu_usage",
              "rows": [
                {
                  "firstTimestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "lastTimestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "storedBytes": 1,
                },
              ],
            },
            {
              "name": "testTable",
              "rows": [
                {
                  "createdAt": "1970-01-01T00:00:00.001Z",
                  "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                  "isDeleted": 0,
                  "name": "known",
                  "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                  "updatedAt": null,
                },
              ],
            },
            {
              "name": "_localTable",
              "rows": [],
            },
          ],
        }
      `);

    {
      await using setup = await setupDbWorker({ dbSetup });
      expect(setup.outputs).toEqual([]);
    }

    expect(getSqliteSnapshot({ sqlite: dbSetup.sqlite }))
      .toMatchInlineSnapshot(`
        {
          "schema": {
            "indexes": [
              {
                "name": "evolu_history_ownerId_timestamp",
                "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                  "ownerId",
                  "timestamp"
                )",
              },
              {
                "name": "evolu_history_ownerId_table_id_column_timestampDesc",
                "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                  "ownerId",
                  "table",
                  "id",
                  "column",
                  "timestamp" desc
                )",
              },
              {
                "name": "evolu_timestamp_index",
                "sql": "create index evolu_timestamp_index on evolu_timestamp (
                "ownerId",
                "l",
                "t",
                "h1",
                "h2",
                "c"
              )",
              },
            ],
            "tables": {
              "_localTable": Set {
                "id",
                "createdAt",
                "updatedAt",
                "isDeleted",
                "ownerId",
                "value",
              },
              "evolu_config": Set {
                "clock",
              },
              "evolu_history": Set {
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp",
                "value",
              },
              "evolu_message_quarantine": Set {
                "ownerId",
                "timestamp",
                "table",
                "id",
                "column",
                "value",
              },
              "evolu_timestamp": Set {
                "ownerId",
                "t",
                "h1",
                "h2",
                "c",
                "l",
              },
              "evolu_usage": Set {
                "ownerId",
                "storedBytes",
                "firstTimestamp",
                "lastTimestamp",
              },
              "evolu_version": Set {
                "protocolVersion",
              },
              "testTable": Set {
                "id",
                "createdAt",
                "updatedAt",
                "isDeleted",
                "ownerId",
                "name",
              },
            },
          },
          "tables": [
            {
              "name": "evolu_version",
              "rows": [
                {
                  "protocolVersion": 1,
                },
              ],
            },
            {
              "name": "evolu_config",
              "rows": [
                {
                  "clock": uint8:[0,0,0,0,0,1,0,1,255,46,38,44,239,232,201,76],
                },
              ],
            },
            {
              "name": "evolu_history",
              "rows": [
                {
                  "column": "name",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": "known",
                },
                {
                  "column": "createdAt",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": "1970-01-01T00:00:00.001Z",
                },
                {
                  "column": "isDeleted",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": 0,
                },
              ],
            },
            {
              "name": "evolu_message_quarantine",
              "rows": [
                {
                  "column": "note",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": "later",
                },
              ],
            },
            {
              "name": "evolu_timestamp",
              "rows": [
                {
                  "c": 1,
                  "h1": 233868751958873,
                  "h2": 133743750684856,
                  "l": 2,
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "t": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                },
              ],
            },
            {
              "name": "evolu_usage",
              "rows": [
                {
                  "firstTimestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "lastTimestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "storedBytes": 1,
                },
              ],
            },
            {
              "name": "testTable",
              "rows": [
                {
                  "createdAt": "1970-01-01T00:00:00.001Z",
                  "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                  "isDeleted": 0,
                  "name": "known",
                  "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                  "updatedAt": null,
                },
              ],
            },
            {
              "name": "_localTable",
              "rows": [],
            },
          ],
        }
      `);

    {
      await using setup = await setupDbWorker({
        dbSetup,
        sqliteSchema: expandedSqliteSchema,
      });

      expect(
        await postRequest(setup, {
          type: "ForEvolu",
          evoluPortId: setup.evoluPortId,
          message: {
            type: "Query",
            queries: createSet([testTableWithNoteQuery]),
          },
        }),
      ).toMatchInlineSnapshot(`
        [
          {
            "callbackId": "ane2ljnnecsBgmb_vbBHKw",
            "response": {
              "evoluPortId": "IGNl5t4ulaaQpdnwDhgoCA",
              "message": {
                "rowsByQuery": Map {
                  "["select \\"id\\", \\"name\\", \\"note\\" from \\"testTable\\"",[],[]]" => [
                    {
                      "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                      "name": "known",
                      "note": "later",
                    },
                  ],
                },
                "type": "Query",
              },
              "type": "ForEvolu",
            },
            "type": "OnQueuedResponse",
          },
        ]
      `);
    }

    expect(getSqliteSnapshot({ sqlite: dbSetup.sqlite }))
      .toMatchInlineSnapshot(`
        {
          "schema": {
            "indexes": [
              {
                "name": "evolu_history_ownerId_timestamp",
                "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                  "ownerId",
                  "timestamp"
                )",
              },
              {
                "name": "evolu_history_ownerId_table_id_column_timestampDesc",
                "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                  "ownerId",
                  "table",
                  "id",
                  "column",
                  "timestamp" desc
                )",
              },
              {
                "name": "evolu_timestamp_index",
                "sql": "create index evolu_timestamp_index on evolu_timestamp (
                "ownerId",
                "l",
                "t",
                "h1",
                "h2",
                "c"
              )",
              },
            ],
            "tables": {
              "_localTable": Set {
                "id",
                "createdAt",
                "updatedAt",
                "isDeleted",
                "ownerId",
                "value",
              },
              "evolu_config": Set {
                "clock",
              },
              "evolu_history": Set {
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp",
                "value",
              },
              "evolu_message_quarantine": Set {
                "ownerId",
                "timestamp",
                "table",
                "id",
                "column",
                "value",
              },
              "evolu_timestamp": Set {
                "ownerId",
                "t",
                "h1",
                "h2",
                "c",
                "l",
              },
              "evolu_usage": Set {
                "ownerId",
                "storedBytes",
                "firstTimestamp",
                "lastTimestamp",
              },
              "evolu_version": Set {
                "protocolVersion",
              },
              "testTable": Set {
                "id",
                "createdAt",
                "updatedAt",
                "isDeleted",
                "ownerId",
                "name",
                "note",
              },
            },
          },
          "tables": [
            {
              "name": "evolu_version",
              "rows": [
                {
                  "protocolVersion": 1,
                },
              ],
            },
            {
              "name": "evolu_config",
              "rows": [
                {
                  "clock": uint8:[0,0,0,0,0,1,0,1,255,46,38,44,239,232,201,76],
                },
              ],
            },
            {
              "name": "evolu_history",
              "rows": [
                {
                  "column": "name",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": "known",
                },
                {
                  "column": "createdAt",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": "1970-01-01T00:00:00.001Z",
                },
                {
                  "column": "isDeleted",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": 0,
                },
                {
                  "column": "note",
                  "id": uint8:[210,93,169,86,19,180,45,103,217,209,37,156,30,227,201,137],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "table": "testTable",
                  "timestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "value": "later",
                },
              ],
            },
            {
              "name": "evolu_message_quarantine",
              "rows": [],
            },
            {
              "name": "evolu_timestamp",
              "rows": [
                {
                  "c": 1,
                  "h1": 233868751958873,
                  "h2": 133743750684856,
                  "l": 2,
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "t": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                },
              ],
            },
            {
              "name": "evolu_usage",
              "rows": [
                {
                  "firstTimestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "lastTimestamp": uint8:[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
                  "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                  "storedBytes": 1,
                },
              ],
            },
            {
              "name": "testTable",
              "rows": [
                {
                  "createdAt": "1970-01-01T00:00:00.001Z",
                  "id": "0l2pVhO0LWfZ0SWcHuPJiQ",
                  "isDeleted": 0,
                  "name": "known",
                  "note": "later",
                  "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                  "updatedAt": null,
                },
              ],
            },
            {
              "name": "_localTable",
              "rows": [],
            },
          ],
        }
      `);
  });

  test("quarantined column replay respects LWW", async () => {
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

    expect(
      dbSetup.sqlite.exec<{
        readonly column: string;
        readonly value: SqliteValue;
      }>(sql`
        select "column", "value"
        from evolu_message_quarantine
        where "table" = ${"testTable"}
        order by "timestamp" desc;
      `).rows,
    ).toEqual([
      { column: "note", value: "newer" },
      { column: "note", value: "older" },
    ]);

    {
      await using setup = await setupDbWorker({
        dbSetup,
        sqliteSchema: createTestSqliteSchema(["name", "note"]),
      });

      const [output] = await postRequest(
        setup,
        {
          type: "ForEvolu",
          evoluPortId: setup.evoluPortId,
          message: {
            type: "Query",
            queries: createSet([testTableWithNoteQuery]),
          },
        },
        setup.createId(),
      );

      assert(output, "Expected query response");
      assert(output.type === "OnQueuedResponse", "Expected queued response");
      assert(output.response.type === "ForEvolu", "Expected Evolu response");
      assert(
        output.response.message.type === "Query",
        "Expected query message",
      );

      expect(
        output.response.message.rowsByQuery.get(testTableWithNoteQuery),
      ).toEqual([{ id: rowId, name: "known", note: "newer" }]);
    }

    expect(
      dbSetup.sqlite.exec<{
        readonly value: SqliteValue;
      }>(sql`
        select "value"
        from evolu_message_quarantine
        where "table" = ${"testTable"} and "column" = ${"note"};
      `).rows,
    ).toEqual([]);
    expect(
      dbSetup.sqlite.exec<{
        readonly note: string;
      }>(sql`
        select "note"
        from testTable
        where "id" = ${rowId};
      `).rows,
    ).toEqual([{ note: "newer" }]);
  });

  test("applies quarantined tables after schema expansion", async () => {
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

      expect(
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
      ).toEqual([
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
      ]);
    }

    expect(
      getSqliteSnapshot({ sqlite: dbSetup.sqlite }).schema.tables,
    ).not.toHaveProperty("futureTable");
    expect(
      dbSetup.sqlite.exec<{
        readonly column: string;
        readonly value: SqliteValue;
      }>(sql`
        select "column", "value"
        from evolu_message_quarantine
        where "table" = ${"futureTable"}
        order by "column";
      `).rows,
    ).toEqual([
      { column: "createdAt", value: "1970-01-01T00:00:00.001Z" },
      { column: "isDeleted", value: 0 },
      { column: "name", value: "future row" },
    ]);

    {
      await using setup = await setupDbWorker({ dbSetup });
      expect(setup.outputs).toEqual([]);
    }

    expect(
      dbSetup.sqlite.exec<{
        readonly column: string;
        readonly value: SqliteValue;
      }>(sql`
        select "column", "value"
        from evolu_message_quarantine
        where "table" = ${"futureTable"}
        order by "column";
      `).rows,
    ).toEqual([
      { column: "createdAt", value: "1970-01-01T00:00:00.001Z" },
      { column: "isDeleted", value: 0 },
      { column: "name", value: "future row" },
    ]);

    {
      await using setup = await setupDbWorker({
        dbSetup,
        sqliteSchema: expandedSqliteSchema,
      });

      expect(
        await postRequest(
          setup,
          {
            type: "ForEvolu",
            evoluPortId: setup.evoluPortId,
            message: {
              type: "Query",
              queries: createSet([futureTableQuery]),
            },
          },
          queryCallbackId,
        ),
      ).toEqual([
        {
          callbackId: queryCallbackId,
          response: {
            evoluPortId: setup.evoluPortId,
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
      ]);
    }

    expect(
      getSqliteSnapshot({ sqlite: dbSetup.sqlite }).schema.tables,
    ).toHaveProperty("futureTable");
    expect(
      dbSetup.sqlite.exec<{
        readonly column: string;
        readonly value: SqliteValue;
      }>(sql`
        select "column", "value"
        from evolu_message_quarantine
        where "table" = ${"futureTable"};
      `).rows,
    ).toEqual([]);
    expect(
      dbSetup.sqlite.exec<{
        readonly column: string;
        readonly value: SqliteValue;
      }>(sql`
        select "column", "value"
        from evolu_history
        where "table" = ${"futureTable"}
        order by "column";
      `).rows,
    ).toEqual([
      { column: "createdAt", value: "1970-01-01T00:00:00.001Z" },
      { column: "isDeleted", value: 0 },
      { column: "name", value: "future row" },
    ]);
    expect(
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
    ).toEqual([
      {
        createdAt: "1970-01-01T00:00:00.001Z",
        id: futureRowId,
        isDeleted: 0,
        name: "future row",
        ownerId: testAppOwner.id,
        updatedAt: null,
      },
    ]);
  });
});
