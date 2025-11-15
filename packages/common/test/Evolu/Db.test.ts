import { describe, expect, test } from "vitest";
import { CallbackId } from "../../src/Callbacks.js";
import {
  createDbWorkerForPlatform,
  DbWorker,
  DbWorkerPlatformDeps,
  defaultDbConfig,
} from "../../src/Evolu/Db.js";
import { createQuery } from "../../src/Evolu/Evolu.js";
import { createAppOwner } from "../../src/Evolu/Owner.js";
import {
  applyProtocolMessageAsRelay,
  createProtocolMessageFromCrdtMessages,
  ProtocolMessage,
} from "../../src/Evolu/Protocol.js";
import { getOrThrow } from "../../src/Result.js";
import { createSqlite, Sqlite } from "../../src/Sqlite.js";
import { wait } from "../../src/Task.js";
import { createId } from "../../src/Type.js";
import {
  TestConsole,
  testCreateConsole,
  testCreateId,
  testCreateRelayStorageAndSqliteDeps,
  testCreateSqliteDriver,
  testCreateWebSocket,
  testDeps,
  testOwnerSecret,
  testRandom,
  testRandomBytes,
  testSimpleName,
  testTime,
  TestWebSocket,
} from "../_deps.js";
import { createTestCrdtMessage, getDbSnapshot } from "./_utils.js";

const createInitializedDbWorker = async (): Promise<{
  readonly worker: DbWorker;
  readonly sqlite: Sqlite;
  readonly transports: ReadonlyArray<TestWebSocket>;
  readonly workerOutput: Array<unknown>;
  readonly testConsole: TestConsole;
}> => {
  const { worker, sqlite, transports, testConsole } =
    await createDbWorkerWithDeps();

  // Track worker output messages
  const workerOutput: Array<unknown> = [];
  worker.onMessage((message) => workerOutput.push(message));

  // Initialize with external AppOwner
  worker.postMessage({
    type: "init",
    config: { ...defaultDbConfig, externalAppOwner: appOwner },
    dbSchema: {
      tables: [
        {
          name: "testTable",
          columns: ["id", "name"],
        },
        {
          name: "_localTable",
          columns: ["id", "value"],
        },
      ],
      indexes: [],
    },
  });

  // Wait for initialization to complete (async createSqlite)
  await wait("10ms")();

  expect(workerOutput.splice(0)).toEqual([]);

  return {
    worker,
    sqlite,
    transports,
    workerOutput,
    testConsole,
  };
};

const createDbWorkerWithDeps = async (): Promise<{
  readonly worker: DbWorker;
  readonly sqlite: Sqlite;
  readonly transports: ReadonlyArray<TestWebSocket>;
  readonly testConsole: TestConsole;
}> => {
  const sqliteDriver = await testCreateSqliteDriver(testSimpleName);
  const testConsole = testCreateConsole();
  const sqliteResult = await createSqlite({
    createSqliteDriver: () => Promise.resolve(sqliteDriver),
    console: testConsole,
  })(testSimpleName);
  const sqlite = getOrThrow(sqliteResult);

  // Track all created WebSocket transports
  const transports: Array<TestWebSocket> = [];

  const deps: DbWorkerPlatformDeps = {
    console: testConsole,
    createSqliteDriver: () => Promise.resolve(sqliteDriver),
    createWebSocket: (url, options) => {
      const testWebSocket = testCreateWebSocket(url, options);
      transports.push(testWebSocket);
      return testWebSocket;
    },
    random: testRandom,
    randomBytes: testRandomBytes,
    time: testTime,
  };

  const worker = createDbWorkerForPlatform(deps);

  return {
    worker,
    sqlite,
    transports,
    testConsole,
  };
};

const appOwner = createAppOwner(testOwnerSecret);
const tabId = testCreateId();

const checkSqlOperations = (testConsole: TestConsole): void => {
  const logs = testConsole.getLogsSnapshot();

  // Only capture SQL strings from query logs: deps.console?.log("[sql]", { query });
  const sqlStrings = logs
    .filter(
      (log) =>
        Array.isArray(log) &&
        log[0] === "[sql]" &&
        log[1] &&
        typeof log[1] === "object" &&
        "query" in log[1],
    )
    .map((log) => {
      const query = log[1] as { query: { sql: string } };
      return normalizeSql(query.query.sql);
    });

  // Snapshot the normalized SQL strings for easy review
  expect(sqlStrings).toMatchSnapshot();
};

const normalizeSql = (sql: string): string => {
  // Remove extra whitespace and normalize to single line
  const normalized = sql.replace(/\s+/g, " ").trim();

  // Truncate if too long, with ellipsis
  if (normalized.length > 80) {
    return normalized.substring(0, 77) + "...";
  }

  return normalized;
};

test("initializes DbWorker with external AppOwner", async () => {
  const { transports, sqlite, testConsole } = await createInitializedDbWorker();

  // Should show empty database with Evolu system tables created
  expect(getDbSnapshot({ sqlite })).toMatchInlineSnapshot(`
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
        "tables": [
          {
            "columns": [
              "protocolVersion",
            ],
            "name": "evolu_version",
          },
          {
            "columns": [
              "clock",
              "appOwnerId",
              "appOwnerEncryptionKey",
              "appOwnerWriteKey",
              "appOwnerMnemonic",
            ],
            "name": "evolu_config",
          },
          {
            "columns": [
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            ],
            "name": "evolu_history",
          },
          {
            "columns": [
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            ],
            "name": "evolu_timestamp",
          },
          {
            "columns": [
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            ],
            "name": "evolu_usage",
          },
          {
            "columns": [
              "id",
              "name",
              "createdAt",
              "updatedAt",
              "isDeleted",
            ],
            "name": "testTable",
          },
          {
            "columns": [
              "id",
              "value",
              "createdAt",
              "updatedAt",
              "isDeleted",
            ],
            "name": "_localTable",
          },
        ],
      },
      "tables": [
        {
          "name": "evolu_version",
          "rows": [
            {
              "protocolVersion": 0,
            },
          ],
        },
        {
          "name": "evolu_config",
          "rows": [
            {
              "appOwnerEncryptionKey": uint8:[91,241,76,125,158,117,227,125,230,50,87,204,167,80,56,233,236,32,119,114,3,133,11,114,245,76,230,8,123,187,158,115],
              "appOwnerId": "StbvdTPxk80z0cNVwDJg6g",
              "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
              "appOwnerWriteKey": uint8:[109,96,75,228,41,186,7,162,141,92,37,209,56,226,201,91],
              "clock": "1970-01-01T00:00:00.000Z-0000-fbb04e7d3c422504",
            },
          ],
        },
        {
          "name": "evolu_history",
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

  // Check that we have no WebSocket messages yet (no sync)
  expect(transports[0]?.sentMessages ?? []).toEqual([]);

  // Check SQL operations
  checkSqlOperations(testConsole);
});

test("local mutations", async () => {
  const { worker, sqlite, transports, workerOutput, testConsole } =
    await createInitializedDbWorker();

  const recordId = testCreateId();

  const subscribedQuery = createQuery((db) =>
    db.selectFrom("_localTable").selectAll().where("isDeleted", "is", null),
  );

  worker.postMessage({
    type: "mutate",
    tabId,
    changes: [
      {
        id: recordId,
        table: "_localTable",
        values: { value: "local data" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [subscribedQuery],
  });

  // Should show the local table with created data
  expect(getDbSnapshot({ sqlite }).tables).toMatchInlineSnapshot(`
      [
        {
          "name": "evolu_version",
          "rows": [
            {
              "protocolVersion": 0,
            },
          ],
        },
        {
          "name": "evolu_config",
          "rows": [
            {
              "appOwnerEncryptionKey": uint8:[91,241,76,125,158,117,227,125,230,50,87,204,167,80,56,233,236,32,119,114,3,133,11,114,245,76,230,8,123,187,158,115],
              "appOwnerId": "StbvdTPxk80z0cNVwDJg6g",
              "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
              "appOwnerWriteKey": uint8:[109,96,75,228,41,186,7,162,141,92,37,209,56,226,201,91],
              "clock": "1970-01-01T00:00:00.000Z-0000-227c8d41bff384ad",
            },
          ],
        },
        {
          "name": "evolu_history",
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
              "id": "8-qbgiYx9BRvmlUTvE9wKQ",
              "isDeleted": null,
              "updatedAt": "1970-01-01T00:00:00.000Z",
              "value": "local data",
            },
          ],
        },
      ]
    `);

  // Should show replaceAll patch with the new record since query is subscribed
  expect(workerOutput.splice(0)).toMatchInlineSnapshot(`
    [
      {
        "onCompleteIds": [],
        "queryPatches": [
          {
            "patches": [
              {
                "op": "replaceAll",
                "value": [
                  {
                    "createdAt": "1970-01-01T00:00:00.000Z",
                    "id": "8-qbgiYx9BRvmlUTvE9wKQ",
                    "isDeleted": null,
                    "updatedAt": "1970-01-01T00:00:00.000Z",
                    "value": "local data",
                  },
                ],
              },
            ],
            "query": "["select * from \\"_localTable\\" where \\"isDeleted\\" is null",[],[]]",
          },
        ],
        "tabId": "T-vftdB4K_reh6yT2RUm8w",
        "type": "onQueryPatches",
      },
      {
        "tabId": "T-vftdB4K_reh6yT2RUm8w",
        "type": "refreshQueries",
      },
    ]
  `);

  worker.postMessage({
    type: "query",
    tabId,
    queries: [subscribedQuery],
  });

  // Query operation should return empty patches since no data changed
  expect(workerOutput.splice(0)).toMatchInlineSnapshot(
    `
    [
      {
        "onCompleteIds": [],
        "queryPatches": [
          {
            "patches": [],
            "query": "["select * from \\"_localTable\\" where \\"isDeleted\\" is null",[],[]]",
          },
        ],
        "tabId": "T-vftdB4K_reh6yT2RUm8w",
        "type": "onQueryPatches",
      },
    ]
  `,
  );

  // Now test deletion of the same record
  worker.postMessage({
    type: "mutate",
    tabId,
    changes: [
      {
        id: recordId,
        table: "_localTable",
        values: { value: "local data", isDeleted: 1 },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [subscribedQuery],
  });

  // _localTable should be empty
  expect(getDbSnapshot({ sqlite }).tables).toMatchInlineSnapshot(`
    [
      {
        "name": "evolu_version",
        "rows": [
          {
            "protocolVersion": 0,
          },
        ],
      },
      {
        "name": "evolu_config",
        "rows": [
          {
            "appOwnerEncryptionKey": uint8:[91,241,76,125,158,117,227,125,230,50,87,204,167,80,56,233,236,32,119,114,3,133,11,114,245,76,230,8,123,187,158,115],
            "appOwnerId": "StbvdTPxk80z0cNVwDJg6g",
            "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
            "appOwnerWriteKey": uint8:[109,96,75,228,41,186,7,162,141,92,37,209,56,226,201,91],
            "clock": "1970-01-01T00:00:00.000Z-0000-227c8d41bff384ad",
          },
        ],
      },
      {
        "name": "evolu_history",
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
    ]
  `);

  // Should show replaceAll patch with empty array
  expect(workerOutput.splice(0)).toMatchInlineSnapshot(`
    [
      {
        "onCompleteIds": [],
        "queryPatches": [
          {
            "patches": [
              {
                "op": "replaceAll",
                "value": [],
              },
            ],
            "query": "["select * from \\"_localTable\\" where \\"isDeleted\\" is null",[],[]]",
          },
        ],
        "tabId": "T-vftdB4K_reh6yT2RUm8w",
        "type": "onQueryPatches",
      },
      {
        "tabId": "T-vftdB4K_reh6yT2RUm8w",
        "type": "refreshQueries",
      },
    ]
  `);

  worker.postMessage({
    type: "reset",
    onCompleteId: createId(testDeps) as CallbackId,
    reload: false,
  });

  expect(getDbSnapshot({ sqlite }).tables).toMatchInlineSnapshot(`[]`);

  expect(workerOutput.splice(0)).toMatchInlineSnapshot(`
    [
      {
        "onCompleteId": "s8GaTyQYpixM_eXR3FgmiA",
        "reload": false,
        "type": "onReset",
      },
    ]
  `);

  // No WebSocket messages (local mutations don't sync)
  expect(transports[0]?.sentMessages ?? []).toEqual([]);

  checkSqlOperations(testConsole);
});

test("sync mutations", async () => {
  const { worker, sqlite, transports, workerOutput, testConsole } =
    await createInitializedDbWorker();

  const recordId = testCreateId();

  const subscribedQuery = createQuery((db) =>
    db.selectFrom("testTable").selectAll().where("isDeleted", "is", null),
  );

  worker.postMessage({
    type: "mutate",
    tabId,
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: {
          createdAt: new Date(testTime.now()).toISOString(),
          name: "sync data",
        },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [subscribedQuery],
  });

  // Should show tables with the new testTable record
  expect(getDbSnapshot({ sqlite }).tables).toMatchInlineSnapshot(`
    [
      {
        "name": "evolu_version",
        "rows": [
          {
            "protocolVersion": 0,
          },
        ],
      },
      {
        "name": "evolu_config",
        "rows": [
          {
            "appOwnerEncryptionKey": uint8:[91,241,76,125,158,117,227,125,230,50,87,204,167,80,56,233,236,32,119,114,3,133,11,114,245,76,230,8,123,187,158,115],
            "appOwnerId": "StbvdTPxk80z0cNVwDJg6g",
            "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
            "appOwnerWriteKey": uint8:[109,96,75,228,41,186,7,162,141,92,37,209,56,226,201,91],
            "clock": "1970-01-01T00:00:00.001Z-0000-80ebbce6ff52c923",
          },
        ],
      },
      {
        "name": "evolu_history",
        "rows": [
          {
            "column": "createdAt",
            "id": uint8:[190,187,5,80,66,13,31,12,215,33,35,94,252,125,121,118],
            "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
            "value": "1970-01-01T00:00:00.001Z",
          },
          {
            "column": "name",
            "id": uint8:[190,187,5,80,66,13,31,12,215,33,35,94,252,125,121,118],
            "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
            "value": "sync data",
          },
        ],
      },
      {
        "name": "evolu_timestamp",
        "rows": [
          {
            "c": 1,
            "h1": 129512733105875,
            "h2": 267434249476759,
            "l": 2,
            "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
            "t": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
          },
        ],
      },
      {
        "name": "evolu_usage",
        "rows": [
          {
            "firstTimestamp": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
            "lastTimestamp": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
            "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
            "storedBytes": 1,
          },
        ],
      },
      {
        "name": "testTable",
        "rows": [
          {
            "createdAt": "1970-01-01T00:00:00.001Z",
            "id": "vrsFUEINHwzXISNe_H15dg",
            "isDeleted": null,
            "name": "sync data",
            "updatedAt": "1970-01-01T00:00:00.001Z",
          },
        ],
      },
      {
        "name": "_localTable",
        "rows": [],
      },
    ]
  `);

  // Should show replaceAll patch with the new record data
  expect(workerOutput.splice(0)).toMatchInlineSnapshot(`
    [
      {
        "onCompleteIds": [],
        "queryPatches": [
          {
            "patches": [
              {
                "op": "replaceAll",
                "value": [
                  {
                    "createdAt": "1970-01-01T00:00:00.001Z",
                    "id": "vrsFUEINHwzXISNe_H15dg",
                    "isDeleted": null,
                    "name": "sync data",
                    "updatedAt": "1970-01-01T00:00:00.001Z",
                  },
                ],
              },
            ],
            "query": "["select * from \\"testTable\\" where \\"isDeleted\\" is null",[],[]]",
          },
        ],
        "tabId": "T-vftdB4K_reh6yT2RUm8w",
        "type": "onQueryPatches",
      },
      {
        "tabId": "T-vftdB4K_reh6yT2RUm8w",
        "type": "refreshQueries",
      },
    ]
  `);

  // Test last-write-wins: update the same record before deletion
  worker.postMessage({
    type: "mutate",
    tabId,
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: { name: "updated data" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [subscribedQuery],
  });

  // Verify that last write wins - should show "updated data" and other stuff
  expect(getDbSnapshot({ sqlite }).tables).toMatchInlineSnapshot(`
      [
        {
          "name": "evolu_version",
          "rows": [
            {
              "protocolVersion": 0,
            },
          ],
        },
        {
          "name": "evolu_config",
          "rows": [
            {
              "appOwnerEncryptionKey": uint8:[91,241,76,125,158,117,227,125,230,50,87,204,167,80,56,233,236,32,119,114,3,133,11,114,245,76,230,8,123,187,158,115],
              "appOwnerId": "StbvdTPxk80z0cNVwDJg6g",
              "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
              "appOwnerWriteKey": uint8:[109,96,75,228,41,186,7,162,141,92,37,209,56,226,201,91],
              "clock": "1970-01-01T00:00:00.001Z-0001-80ebbce6ff52c923",
            },
          ],
        },
        {
          "name": "evolu_history",
          "rows": [
            {
              "column": "createdAt",
              "id": uint8:[190,187,5,80,66,13,31,12,215,33,35,94,252,125,121,118],
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "table": "testTable",
              "timestamp": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
              "value": "1970-01-01T00:00:00.001Z",
            },
            {
              "column": "name",
              "id": uint8:[190,187,5,80,66,13,31,12,215,33,35,94,252,125,121,118],
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "table": "testTable",
              "timestamp": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
              "value": "sync data",
            },
            {
              "column": "name",
              "id": uint8:[190,187,5,80,66,13,31,12,215,33,35,94,252,125,121,118],
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "table": "testTable",
              "timestamp": uint8:[0,0,0,0,0,1,0,1,128,235,188,230,255,82,201,35],
              "value": "updated data",
            },
          ],
        },
        {
          "name": "evolu_timestamp",
          "rows": [
            {
              "c": 1,
              "h1": 129512733105875,
              "h2": 267434249476759,
              "l": 2,
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "t": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
            },
            {
              "c": 1,
              "h1": 112724284071995,
              "h2": 221257483641481,
              "l": 1,
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "t": uint8:[0,0,0,0,0,1,0,1,128,235,188,230,255,82,201,35],
            },
          ],
        },
        {
          "name": "evolu_usage",
          "rows": [
            {
              "firstTimestamp": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
              "lastTimestamp": uint8:[0,0,0,0,0,1,0,1,128,235,188,230,255,82,201,35],
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "storedBytes": 1,
            },
          ],
        },
        {
          "name": "testTable",
          "rows": [
            {
              "createdAt": "1970-01-01T00:00:00.001Z",
              "id": "vrsFUEINHwzXISNe_H15dg",
              "isDeleted": null,
              "name": "updated data",
              "updatedAt": "1970-01-01T00:00:00.001Z",
            },
          ],
        },
        {
          "name": "_localTable",
          "rows": [],
        },
      ]
    `);

  expect(workerOutput.splice(0)).toMatchInlineSnapshot(`
    [
      {
        "onCompleteIds": [],
        "queryPatches": [
          {
            "patches": [
              {
                "op": "replaceAll",
                "value": [
                  {
                    "createdAt": "1970-01-01T00:00:00.001Z",
                    "id": "vrsFUEINHwzXISNe_H15dg",
                    "isDeleted": null,
                    "name": "updated data",
                    "updatedAt": "1970-01-01T00:00:00.001Z",
                  },
                ],
              },
            ],
            "query": "["select * from \\"testTable\\" where \\"isDeleted\\" is null",[],[]]",
          },
        ],
        "tabId": "T-vftdB4K_reh6yT2RUm8w",
        "type": "onQueryPatches",
      },
      {
        "tabId": "T-vftdB4K_reh6yT2RUm8w",
        "type": "refreshQueries",
      },
    ]
  `);

  // Test deletion of the sync record
  worker.postMessage({
    type: "mutate",
    tabId,
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: { isDeleted: 1 },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [subscribedQuery],
  });

  // Check that record is now marked as deleted in sync tables
  expect(getDbSnapshot({ sqlite }).tables).toMatchInlineSnapshot(`
      [
        {
          "name": "evolu_version",
          "rows": [
            {
              "protocolVersion": 0,
            },
          ],
        },
        {
          "name": "evolu_config",
          "rows": [
            {
              "appOwnerEncryptionKey": uint8:[91,241,76,125,158,117,227,125,230,50,87,204,167,80,56,233,236,32,119,114,3,133,11,114,245,76,230,8,123,187,158,115],
              "appOwnerId": "StbvdTPxk80z0cNVwDJg6g",
              "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
              "appOwnerWriteKey": uint8:[109,96,75,228,41,186,7,162,141,92,37,209,56,226,201,91],
              "clock": "1970-01-01T00:00:00.001Z-0002-80ebbce6ff52c923",
            },
          ],
        },
        {
          "name": "evolu_history",
          "rows": [
            {
              "column": "createdAt",
              "id": uint8:[190,187,5,80,66,13,31,12,215,33,35,94,252,125,121,118],
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "table": "testTable",
              "timestamp": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
              "value": "1970-01-01T00:00:00.001Z",
            },
            {
              "column": "name",
              "id": uint8:[190,187,5,80,66,13,31,12,215,33,35,94,252,125,121,118],
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "table": "testTable",
              "timestamp": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
              "value": "sync data",
            },
            {
              "column": "name",
              "id": uint8:[190,187,5,80,66,13,31,12,215,33,35,94,252,125,121,118],
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "table": "testTable",
              "timestamp": uint8:[0,0,0,0,0,1,0,1,128,235,188,230,255,82,201,35],
              "value": "updated data",
            },
            {
              "column": "isDeleted",
              "id": uint8:[190,187,5,80,66,13,31,12,215,33,35,94,252,125,121,118],
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "table": "testTable",
              "timestamp": uint8:[0,0,0,0,0,1,0,2,128,235,188,230,255,82,201,35],
              "value": 1,
            },
          ],
        },
        {
          "name": "evolu_timestamp",
          "rows": [
            {
              "c": 1,
              "h1": 129512733105875,
              "h2": 267434249476759,
              "l": 2,
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "t": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
            },
            {
              "c": 1,
              "h1": 112724284071995,
              "h2": 221257483641481,
              "l": 1,
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "t": uint8:[0,0,0,0,0,1,0,1,128,235,188,230,255,82,201,35],
            },
            {
              "c": 1,
              "h1": 16701667325350,
              "h2": 194980779631109,
              "l": 1,
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "t": uint8:[0,0,0,0,0,1,0,2,128,235,188,230,255,82,201,35],
            },
          ],
        },
        {
          "name": "evolu_usage",
          "rows": [
            {
              "firstTimestamp": uint8:[0,0,0,0,0,1,0,0,128,235,188,230,255,82,201,35],
              "lastTimestamp": uint8:[0,0,0,0,0,1,0,2,128,235,188,230,255,82,201,35],
              "ownerId": uint8:[74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234],
              "storedBytes": 1,
            },
          ],
        },
        {
          "name": "testTable",
          "rows": [
            {
              "createdAt": "1970-01-01T00:00:00.001Z",
              "id": "vrsFUEINHwzXISNe_H15dg",
              "isDeleted": 1,
              "name": "updated data",
              "updatedAt": "1970-01-01T00:00:00.001Z",
            },
          ],
        },
        {
          "name": "_localTable",
          "rows": [],
        },
      ]
    `);

  expect(workerOutput.splice(0)).toMatchInlineSnapshot(`
    [
      {
        "onCompleteIds": [],
        "queryPatches": [
          {
            "patches": [
              {
                "op": "replaceAll",
                "value": [],
              },
            ],
            "query": "["select * from \\"testTable\\" where \\"isDeleted\\" is null",[],[]]",
          },
        ],
        "tabId": "T-vftdB4K_reh6yT2RUm8w",
        "type": "onQueryPatches",
      },
      {
        "tabId": "T-vftdB4K_reh6yT2RUm8w",
        "type": "refreshQueries",
      },
    ]
  `);

  worker.postMessage({
    type: "reset",
    onCompleteId: createId(testDeps) as CallbackId,
    reload: false,
  });

  expect(getDbSnapshot({ sqlite }).tables).toMatchInlineSnapshot(`[]`);

  expect(workerOutput.splice(0)).toMatchInlineSnapshot(`
    [
      {
        "onCompleteId": "Jbxb-ucbVhZdFj5e3LpT9Q",
        "reload": false,
        "type": "onReset",
      },
    ]
  `);

  // WebSocket was not opened.
  expect(transports[0]?.sentMessages ?? []).toEqual([]);

  checkSqlOperations(testConsole);
});

test("sends messages when socket is opened", async () => {
  const { worker, transports, testConsole } = await createInitializedDbWorker();

  const recordId = testCreateId();

  // Create a sync mutation first to have data to send
  worker.postMessage({
    type: "mutate",
    tabId,
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: { name: "sync data" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  const webSocket = transports[0];

  // Before opening WebSocket, no messages should be sent
  expect(webSocket.sentMessages).toEqual([]);

  // Simulate WebSocket opening
  webSocket.simulateOpen();

  // After opening, WebSocket should send sync messages
  expect(webSocket.sentMessages).toMatchInlineSnapshot(
    `
    [
      uint8:[0,74,214,239,117,51,241,147,205,51,209,195,85,192,50,96,234,0,0,1,0,1,2,1,5,0,1,2,0,125,85,114,123,39,28,1],
    ]
  `,
  );

  checkSqlOperations(testConsole);
});

describe("last-write-wins for received messages", () => {
  const applyMessagesAndReceiveBroadcasts = async (
    messages: ReadonlyArray<ProtocolMessage>,
  ): Promise<{ transports: ReadonlyArray<TestWebSocket>; sqlite: Sqlite }> => {
    const deps = await testCreateRelayStorageAndSqliteDeps();
    const broadcasts: Array<ProtocolMessage> = [];

    for (const message of messages) {
      await applyProtocolMessageAsRelay(deps)(message, {
        broadcast: (_ownerId, message) => {
          broadcasts.push(message);
        },
      });
    }

    // Create fresh DbWorker to receive broadcast messages
    const { transports, sqlite } = await createInitializedDbWorker();
    const webSocket = transports[0];
    webSocket.simulateOpen();

    // Simulate receiving broadcast messages
    for (const broadcast of broadcasts) {
      webSocket.simulateMessage(broadcast);
      await wait("1ms")();
    }

    return { transports, sqlite };
  };

  const getTestTableName = (sqlite: Sqlite): string => {
    const rows = getDbSnapshot({ sqlite }).tables.find(
      (t) => t.name === "testTable",
    )?.rows;
    expect(rows).toHaveLength(1);
    return rows?.[0]?.name as unknown as string;
  };

  test("creates new record from received message", async () => {
    const id = testCreateId();
    const message = createTestCrdtMessage(id, 1, "created");
    const pm = createProtocolMessageFromCrdtMessages(testDeps)(appOwner, [
      message,
    ]);

    const { sqlite } = await applyMessagesAndReceiveBroadcasts([pm]);

    expect(getTestTableName(sqlite)).toBe("created");
  });

  test("newer message updates existing record", async () => {
    const id = testCreateId();

    const older = createTestCrdtMessage(id, 1, "older");
    const newer = createTestCrdtMessage(id, 2, "newer");

    const pmOlder = createProtocolMessageFromCrdtMessages(testDeps)(appOwner, [
      older,
    ]);
    const pmNewer = createProtocolMessageFromCrdtMessages(testDeps)(appOwner, [
      newer,
    ]);

    // Apply older message first, then newer message
    const { sqlite } = await applyMessagesAndReceiveBroadcasts([
      pmOlder,
      pmNewer,
    ]);

    // Should have "newer" because newer timestamp overwrites older
    expect(getTestTableName(sqlite)).toBe("newer");
  });

  test("older messages do not overwrite newer ones", async () => {
    const id = testCreateId();

    const older = createTestCrdtMessage(id, 1, "older");
    const newer = createTestCrdtMessage(id, 2, "newer");

    const pmOlder = createProtocolMessageFromCrdtMessages(testDeps)(appOwner, [
      older,
    ]);
    const pmNewer = createProtocolMessageFromCrdtMessages(testDeps)(appOwner, [
      newer,
    ]);

    // Apply newer message first, then older message
    const { sqlite } = await applyMessagesAndReceiveBroadcasts([
      pmNewer,
      pmOlder,
    ]);

    // Should still have "newer" because older message should not overwrite
    expect(getTestTableName(sqlite)).toBe("newer");
  });

  test("duplicate messages are idempotent", async () => {
    const id = testCreateId();

    // Create two different messages with the same timestamp.
    // This situation cannot happen in production (HLC ensures unique timestamps),
    // but we use it to test that the database operation is skipped for performance.
    const m1 = createTestCrdtMessage(id, 1, "first");
    const m2 = createTestCrdtMessage(id, 1, "second");

    const pm1 = createProtocolMessageFromCrdtMessages(testDeps)(appOwner, [m1]);
    const pm2 = createProtocolMessageFromCrdtMessages(testDeps)(appOwner, [m2]);

    // Apply both messages with the same timestamp
    const { sqlite } = await applyMessagesAndReceiveBroadcasts([pm1, pm2]);

    // Should have exactly one row, and the first message should win
    // since the second one is skipped due to same timestamp
    expect(getTestTableName(sqlite)).toBe("first");
  });
});
