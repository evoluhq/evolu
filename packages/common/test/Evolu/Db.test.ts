import { describe, expect, test } from "vitest";
import { CallbackId } from "../../src/CallbackRegistry.js";
import {
  createDbWorkerForPlatform,
  DbWorker,
  DbWorkerPlatformDeps,
  defaultDbConfig,
} from "../../src/Evolu/Db.js";
import { createQuery } from "../../src/Evolu/Evolu.js";
import { createAppOwner } from "../../src/Evolu/Owner.js";
import { getOrThrow } from "../../src/Result.js";
import { createSqlite, Sqlite } from "../../src/Sqlite.js";
import { wait } from "../../src/Task.js";
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
              "clock": "1970-01-01T00:00:00.000Z-0000-9b822631f4146f9a",
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
            "clock": "1970-01-01T00:00:00.000Z-0000-5513bc4f7029b3c1",
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
            "id": "RDIx1Y9e4dzcD2PtSrFu-",
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
                    "id": "RDIx1Y9e4dzcD2PtSrFu-",
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
            "clock": "1970-01-01T00:00:00.000Z-0000-5513bc4f7029b3c1",
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
        "onCompleteId": "9fO9i2LT9BlFv5rPltodH",
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
            "clock": "1970-01-01T00:00:00.001Z-0000-56d197b36fa090cb",
          },
        ],
      },
      {
        "name": "evolu_history",
        "rows": [
          {
            "column": "createdAt",
            "id": uint8:[182,94,81,103,137,179,215,101,153,253,36,45,152,43,243,232],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,86,209,151,179,111,160,144,203],
            "value": "1970-01-01T00:00:00.001Z",
          },
          {
            "column": "name",
            "id": uint8:[182,94,81,103,137,179,215,101,153,253,36,45,152,43,243,232],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,86,209,151,179,111,160,144,203],
            "value": "sync data",
          },
        ],
      },
      {
        "name": "testTable",
        "rows": [
          {
            "createdAt": "1970-01-01T00:00:00.001Z",
            "id": "tl5RZ4mz12WZ_SQtmCvz6",
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
            "h1": 194164930225761,
            "h2": 119152584474333,
            "l": 2,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,0,86,209,151,179,111,160,144,203],
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
                    "id": "tl5RZ4mz12WZ_SQtmCvz6",
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
            "clock": "1970-01-01T00:00:00.001Z-0001-56d197b36fa090cb",
          },
        ],
      },
      {
        "name": "evolu_history",
        "rows": [
          {
            "column": "createdAt",
            "id": uint8:[182,94,81,103,137,179,215,101,153,253,36,45,152,43,243,232],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,86,209,151,179,111,160,144,203],
            "value": "1970-01-01T00:00:00.001Z",
          },
          {
            "column": "name",
            "id": uint8:[182,94,81,103,137,179,215,101,153,253,36,45,152,43,243,232],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,86,209,151,179,111,160,144,203],
            "value": "sync data",
          },
          {
            "column": "name",
            "id": uint8:[182,94,81,103,137,179,215,101,153,253,36,45,152,43,243,232],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,1,86,209,151,179,111,160,144,203],
            "value": "updated data",
          },
        ],
      },
      {
        "name": "testTable",
        "rows": [
          {
            "createdAt": "1970-01-01T00:00:00.001Z",
            "id": "tl5RZ4mz12WZ_SQtmCvz6",
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
            "h1": 194164930225761,
            "h2": 119152584474333,
            "l": 2,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,0,86,209,151,179,111,160,144,203],
          },
          {
            "c": 1,
            "h1": 192963511622877,
            "h2": 206380938777523,
            "l": 1,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,1,86,209,151,179,111,160,144,203],
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
                    "id": "tl5RZ4mz12WZ_SQtmCvz6",
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
            "clock": "1970-01-01T00:00:00.001Z-0002-56d197b36fa090cb",
          },
        ],
      },
      {
        "name": "evolu_history",
        "rows": [
          {
            "column": "createdAt",
            "id": uint8:[182,94,81,103,137,179,215,101,153,253,36,45,152,43,243,232],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,86,209,151,179,111,160,144,203],
            "value": "1970-01-01T00:00:00.001Z",
          },
          {
            "column": "name",
            "id": uint8:[182,94,81,103,137,179,215,101,153,253,36,45,152,43,243,232],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,86,209,151,179,111,160,144,203],
            "value": "sync data",
          },
          {
            "column": "name",
            "id": uint8:[182,94,81,103,137,179,215,101,153,253,36,45,152,43,243,232],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,1,86,209,151,179,111,160,144,203],
            "value": "updated data",
          },
          {
            "column": "isDeleted",
            "id": uint8:[182,94,81,103,137,179,215,101,153,253,36,45,152,43,243,232],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,2,86,209,151,179,111,160,144,203],
            "value": 1,
          },
        ],
      },
      {
        "name": "testTable",
        "rows": [
          {
            "createdAt": "1970-01-01T00:00:00.001Z",
            "id": "tl5RZ4mz12WZ_SQtmCvz6",
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
            "h1": 194164930225761,
            "h2": 119152584474333,
            "l": 2,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,0,86,209,151,179,111,160,144,203],
          },
          {
            "c": 1,
            "h1": 192963511622877,
            "h2": 206380938777523,
            "l": 1,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,1,86,209,151,179,111,160,144,203],
          },
          {
            "c": 1,
            "h1": 232194233462575,
            "h2": 97699155513514,
            "l": 1,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,2,86,209,151,179,111,160,144,203],
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
        "onCompleteId": "pXftCAjUskTmno2dqqyjQ",
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
        uint8:[0,26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56,0,0,1,0,1,2,1,5,0,1,4,201,7,123,137,165,198,188,1],
      ]
    `,
    );

    checkSqlOperations(testConsole);
  });

  // TODO: test on message (a received message)
});
