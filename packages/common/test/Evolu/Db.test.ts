import { describe, expect, test } from "vitest";
import { CallbackId } from "../../src/CallbackRegistry.js";
import { defaultConfig } from "../../src/Evolu/Config.js";
import {
  createDbWorkerForPlatform,
  DbWorker,
  DbWorkerPlatformDeps,
} from "../../src/Evolu/Db.js";
import { createQuery } from "../../src/Evolu/Evolu.js";
import { createAppOwner } from "../../src/Evolu/Owner.js";
import { wait } from "../../src/Promise.js";
import { getOrThrow } from "../../src/Result.js";
import { createSqlite, Sqlite } from "../../src/Sqlite.js";
import {
  createTestConsole,
  createTestWebSocket,
  TestConsole,
  testCreateId,
  testCreateSqliteDriver,
  testNanoIdLib,
  testOwnerSecret,
  testRandom,
  testRandomBytes,
  testSimpleName,
  testTime,
  TestWebSocket,
} from "../_deps.js";
import { getDbSnapshot } from "./_utils.js";

const createInitializedDbWorker = async (): Promise<{
  readonly worker: DbWorker;
  readonly sqlite: Sqlite;
  readonly transports: ReadonlyArray<TestWebSocket>;
  readonly workerOutput: Array<unknown>;
  readonly testConsole: ReturnType<typeof createTestConsole>;
}> => {
  const { worker, sqlite, transports, testConsole } =
    await createDbWorkerWithDeps();

  // Track worker output messages
  const workerOutput: Array<unknown> = [];
  worker.onMessage((message) => workerOutput.push(message));

  // Initialize with external AppOwner
  worker.postMessage({
    type: "init",
    config: { ...defaultConfig, externalAppOwner: appOwner },
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
  await wait(10);

  expect(workerOutput.splice(0)).toEqual([
    {
      type: "onInit",
      appOwner,
      isFirst: true,
    },
  ]);

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
  readonly testConsole: ReturnType<typeof createTestConsole>;
}> => {
  const sqliteDriver = await testCreateSqliteDriver(testSimpleName);
  const testConsole = createTestConsole();
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
      const testWebSocket = createTestWebSocket(url, options);
      transports.push(testWebSocket);
      return testWebSocket;
    },
    nanoIdLib: testNanoIdLib,
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
              "appOwnerEncryptionKey": uint8:[176,184,97,218,198,34,195,43,62,39,189,137,148,170,87,108,226,12,196,233,204,222,233,31,126,1,165,170,15,208,115,18],
              "appOwnerId": "Gm2rxDYibpjp9MLQYgnXO",
              "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
              "appOwnerWriteKey": uint8:[223,255,201,168,127,27,26,188,250,180,237,65,254,6,128,233],
              "clock": "1970-01-01T00:00:00.000Z-0000-dcc684fa1390fc35",
            },
          ],
        },
        {
          "name": "evolu_history",
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
        {
          "name": "evolu_timestamp",
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
            "appOwnerEncryptionKey": uint8:[176,184,97,218,198,34,195,43,62,39,189,137,148,170,87,108,226,12,196,233,204,222,233,31,126,1,165,170,15,208,115,18],
            "appOwnerId": "Gm2rxDYibpjp9MLQYgnXO",
            "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
            "appOwnerWriteKey": uint8:[223,255,201,168,127,27,26,188,250,180,237,65,254,6,128,233],
            "clock": "1970-01-01T00:00:00.000Z-0000-17cfd205be392f6c",
          },
        ],
      },
      {
        "name": "evolu_history",
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
            "id": "O9i2LT9BlFv5rPltodHge",
            "isDeleted": null,
            "updatedAt": "1970-01-01T00:00:00.000Z",
            "value": "local data",
          },
        ],
      },
      {
        "name": "evolu_timestamp",
        "rows": [],
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
                    "id": "O9i2LT9BlFv5rPltodHge",
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
        "tabId": "LhGnhts9rNnUeri8bzhS5",
        "type": "onQueryPatches",
      },
      {
        "tabId": "LhGnhts9rNnUeri8bzhS5",
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
        "tabId": "LhGnhts9rNnUeri8bzhS5",
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
            "appOwnerEncryptionKey": uint8:[176,184,97,218,198,34,195,43,62,39,189,137,148,170,87,108,226,12,196,233,204,222,233,31,126,1,165,170,15,208,115,18],
            "appOwnerId": "Gm2rxDYibpjp9MLQYgnXO",
            "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
            "appOwnerWriteKey": uint8:[223,255,201,168,127,27,26,188,250,180,237,65,254,6,128,233],
            "clock": "1970-01-01T00:00:00.000Z-0000-17cfd205be392f6c",
          },
        ],
      },
      {
        "name": "evolu_history",
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
      {
        "name": "evolu_timestamp",
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
        "tabId": "LhGnhts9rNnUeri8bzhS5",
        "type": "onQueryPatches",
      },
      {
        "tabId": "LhGnhts9rNnUeri8bzhS5",
        "type": "refreshQueries",
      },
    ]
  `);

  worker.postMessage({
    type: "reset",
    onCompleteId: testNanoIdLib.nanoid() as CallbackId,
    reload: false,
  });

  expect(getDbSnapshot({ sqlite }).tables).toMatchInlineSnapshot(`[]`);

  expect(workerOutput.splice(0)).toMatchInlineSnapshot(`
    [
      {
        "onCompleteId": "WZ_SQtmCvz6xwHpK2ZkuZ",
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
            "appOwnerEncryptionKey": uint8:[176,184,97,218,198,34,195,43,62,39,189,137,148,170,87,108,226,12,196,233,204,222,233,31,126,1,165,170,15,208,115,18],
            "appOwnerId": "Gm2rxDYibpjp9MLQYgnXO",
            "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
            "appOwnerWriteKey": uint8:[223,255,201,168,127,27,26,188,250,180,237,65,254,6,128,233],
            "clock": "1970-01-01T00:00:00.001Z-0000-acee6d66b7abc5f6",
          },
        ],
      },
      {
        "name": "evolu_history",
        "rows": [
          {
            "column": "createdAt",
            "id": uint8:[9,60,98,3,13,32,99,247,200,79,144,162,233,91,127,124],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,172,238,109,102,183,171,197,246],
            "value": "1970-01-01T00:00:00.001Z",
          },
          {
            "column": "name",
            "id": uint8:[9,60,98,3,13,32,99,247,200,79,144,162,233,91,127,124],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,172,238,109,102,183,171,197,246],
            "value": "sync data",
          },
        ],
      },
      {
        "name": "testTable",
        "rows": [
          {
            "createdAt": "1970-01-01T00:00:00.001Z",
            "id": "CTxiAw0gY_fIT5Ci6Vt_f",
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
      {
        "name": "evolu_timestamp",
        "rows": [
          {
            "c": 1,
            "h1": 126806530230506,
            "h2": 89189876735078,
            "l": 2,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,0,172,238,109,102,183,171,197,246],
          },
        ],
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
                    "id": "CTxiAw0gY_fIT5Ci6Vt_f",
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
        "tabId": "LhGnhts9rNnUeri8bzhS5",
        "type": "onQueryPatches",
      },
      {
        "tabId": "LhGnhts9rNnUeri8bzhS5",
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
            "appOwnerEncryptionKey": uint8:[176,184,97,218,198,34,195,43,62,39,189,137,148,170,87,108,226,12,196,233,204,222,233,31,126,1,165,170,15,208,115,18],
            "appOwnerId": "Gm2rxDYibpjp9MLQYgnXO",
            "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
            "appOwnerWriteKey": uint8:[223,255,201,168,127,27,26,188,250,180,237,65,254,6,128,233],
            "clock": "1970-01-01T00:00:00.001Z-0001-acee6d66b7abc5f6",
          },
        ],
      },
      {
        "name": "evolu_history",
        "rows": [
          {
            "column": "createdAt",
            "id": uint8:[9,60,98,3,13,32,99,247,200,79,144,162,233,91,127,124],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,172,238,109,102,183,171,197,246],
            "value": "1970-01-01T00:00:00.001Z",
          },
          {
            "column": "name",
            "id": uint8:[9,60,98,3,13,32,99,247,200,79,144,162,233,91,127,124],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,172,238,109,102,183,171,197,246],
            "value": "sync data",
          },
          {
            "column": "name",
            "id": uint8:[9,60,98,3,13,32,99,247,200,79,144,162,233,91,127,124],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,1,172,238,109,102,183,171,197,246],
            "value": "updated data",
          },
        ],
      },
      {
        "name": "testTable",
        "rows": [
          {
            "createdAt": "1970-01-01T00:00:00.001Z",
            "id": "CTxiAw0gY_fIT5Ci6Vt_f",
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
      {
        "name": "evolu_timestamp",
        "rows": [
          {
            "c": 1,
            "h1": 126806530230506,
            "h2": 89189876735078,
            "l": 2,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,0,172,238,109,102,183,171,197,246],
          },
          {
            "c": 1,
            "h1": 259463229193581,
            "h2": 206627421859385,
            "l": 1,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,1,172,238,109,102,183,171,197,246],
          },
        ],
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
                    "id": "CTxiAw0gY_fIT5Ci6Vt_f",
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
        "tabId": "LhGnhts9rNnUeri8bzhS5",
        "type": "onQueryPatches",
      },
      {
        "tabId": "LhGnhts9rNnUeri8bzhS5",
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
            "appOwnerEncryptionKey": uint8:[176,184,97,218,198,34,195,43,62,39,189,137,148,170,87,108,226,12,196,233,204,222,233,31,126,1,165,170,15,208,115,18],
            "appOwnerId": "Gm2rxDYibpjp9MLQYgnXO",
            "appOwnerMnemonic": "call brass keen rough true spy dream robot useless ignore anxiety balance chair start flame isolate coin disagree inmate enroll sea impose change decorate",
            "appOwnerWriteKey": uint8:[223,255,201,168,127,27,26,188,250,180,237,65,254,6,128,233],
            "clock": "1970-01-01T00:00:00.001Z-0002-acee6d66b7abc5f6",
          },
        ],
      },
      {
        "name": "evolu_history",
        "rows": [
          {
            "column": "createdAt",
            "id": uint8:[9,60,98,3,13,32,99,247,200,79,144,162,233,91,127,124],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,172,238,109,102,183,171,197,246],
            "value": "1970-01-01T00:00:00.001Z",
          },
          {
            "column": "name",
            "id": uint8:[9,60,98,3,13,32,99,247,200,79,144,162,233,91,127,124],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,172,238,109,102,183,171,197,246],
            "value": "sync data",
          },
          {
            "column": "name",
            "id": uint8:[9,60,98,3,13,32,99,247,200,79,144,162,233,91,127,124],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,1,172,238,109,102,183,171,197,246],
            "value": "updated data",
          },
          {
            "column": "isDeleted",
            "id": uint8:[9,60,98,3,13,32,99,247,200,79,144,162,233,91,127,124],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,2,172,238,109,102,183,171,197,246],
            "value": 1,
          },
        ],
      },
      {
        "name": "testTable",
        "rows": [
          {
            "createdAt": "1970-01-01T00:00:00.001Z",
            "id": "CTxiAw0gY_fIT5Ci6Vt_f",
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
      {
        "name": "evolu_timestamp",
        "rows": [
          {
            "c": 1,
            "h1": 126806530230506,
            "h2": 89189876735078,
            "l": 2,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,0,172,238,109,102,183,171,197,246],
          },
          {
            "c": 1,
            "h1": 259463229193581,
            "h2": 206627421859385,
            "l": 1,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,1,172,238,109,102,183,171,197,246],
          },
          {
            "c": 1,
            "h1": 258666984155276,
            "h2": 58650870936463,
            "l": 1,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,2,172,238,109,102,183,171,197,246],
          },
        ],
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
        "tabId": "LhGnhts9rNnUeri8bzhS5",
        "type": "onQueryPatches",
      },
      {
        "tabId": "LhGnhts9rNnUeri8bzhS5",
        "type": "refreshQueries",
      },
    ]
  `);

  worker.postMessage({
    type: "reset",
    onCompleteId: testNanoIdLib.nanoid() as CallbackId,
    reload: false,
  });

  expect(getDbSnapshot({ sqlite }).tables).toMatchInlineSnapshot(`[]`);

  expect(workerOutput.splice(0)).toMatchInlineSnapshot(`
    [
      {
        "onCompleteId": "wEnwV83IcuxG6clxIS9iE",
        "reload": false,
        "type": "onReset",
      },
    ]
  `);

  // WebSocket was not opened.
  expect(transports[0]?.sentMessages ?? []).toEqual([]);

  checkSqlOperations(testConsole);
});

describe("WebSocket", () => {
  test("sends messages when socket is opened", async () => {
    const { worker, transports, testConsole } =
      await createInitializedDbWorker();

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
        uint8:[0,26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56,0,0,1,0,1,2,1,5,0,1,190,196,31,138,64,8,182,63,1],
      ]
    `,
    );

    checkSqlOperations(testConsole);
  });

  // TODO: test on message (a received message)
});
