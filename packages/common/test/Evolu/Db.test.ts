import { describe, expect, test } from "vitest";
import { CallbackId } from "../../src/Callbacks.js";
import { createConsole } from "../../src/Console.js";
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
  createTestWebSocket,
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

const createDbWorkerWithDeps = async (): Promise<{
  readonly worker: DbWorker;
  readonly sqlite: Sqlite;
  readonly transports: ReadonlyArray<TestWebSocket>;
}> => {
  const sqliteDriver = await testCreateSqliteDriver(testSimpleName);
  const sqliteResult = await createSqlite({
    createSqliteDriver: () => Promise.resolve(sqliteDriver),
  })(testSimpleName);
  const sqlite = getOrThrow(sqliteResult);

  // Track all created WebSocket transports
  const transports: Array<TestWebSocket> = [];

  const deps: DbWorkerPlatformDeps = {
    console: createConsole(),
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
  };
};

const testAppOwner = createAppOwner(testOwnerSecret);

const createInitializedDbWorker = async (): Promise<{
  readonly worker: DbWorker;
  readonly sqlite: Sqlite;
  readonly transports: ReadonlyArray<TestWebSocket>;
  readonly workerOutput: Array<unknown>;
}> => {
  const { worker, sqlite, transports } = await createDbWorkerWithDeps();

  // Track worker output messages
  const workerOutput: Array<unknown> = [];
  worker.onMessage((message) => workerOutput.push(message));

  // Initialize with external AppOwner
  worker.postMessage({
    type: "init",
    config: {
      ...defaultConfig,
      externalAppOwner: testAppOwner,
    },
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

  // Wait for initialization to complete
  await wait(10);

  expect(workerOutput).toEqual([
    {
      type: "onInit",
      appOwner: testAppOwner,
      isFirst: true,
    },
  ]);

  workerOutput.length = 0;

  return {
    worker,
    sqlite,
    transports,
    workerOutput,
  };
};

test("initializes DbWorker with external AppOwner", async () => {
  const { transports, sqlite } = await createInitializedDbWorker();

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
              "clock": "1970-01-01T00:00:00.000Z-0000-452cde0b36593c7e",
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
});

test("local mutations", async () => {
  const { worker, sqlite, transports, workerOutput } =
    await createInitializedDbWorker();

  // Create a mutation on local table (underscore prefix)
  const recordId = testCreateId();

  // Create a subscribed query to see patches in onChange
  const subscribedQuery = createQuery((db) =>
    db.selectFrom("_localTable").selectAll().where("isDeleted", "is", null),
  );

  worker.postMessage({
    type: "mutate",
    tabId: testCreateId(),
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

  // Check that data was inserted into local table
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
            "clock": "1970-01-01T00:00:00.000Z-0000-90fc35af44162ba3",
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
            "id": "Ix1Y9e4dzcD2PtSrFu-SJ",
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

  expect(workerOutput).toMatchInlineSnapshot(`
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
                    "id": "Ix1Y9e4dzcD2PtSrFu-SJ",
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
        "tabId": "O9i2LT9BlFv5rPltodHge",
        "type": "onChange",
      },
      {
        "tabId": "O9i2LT9BlFv5rPltodHge",
        "type": "onReceive",
      },
    ]
  `);

  workerOutput.length = 0;

  // Test querying the data
  worker.postMessage({
    type: "query",
    tabId: testCreateId(),
    queries: [subscribedQuery],
  });

  expect(workerOutput).toMatchInlineSnapshot(`
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
                    "id": "Ix1Y9e4dzcD2PtSrFu-SJ",
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
        "tabId": "WZ_SQtmCvz6xwHpK2ZkuZ",
        "type": "onChange",
      },
    ]
  `);

  workerOutput.length = 0;

  // Now test deletion of the same record
  worker.postMessage({
    type: "mutate",
    tabId: testCreateId(),
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
            "clock": "1970-01-01T00:00:00.000Z-0000-90fc35af44162ba3",
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

  expect(workerOutput).toMatchInlineSnapshot(`
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
        "tabId": "VHzg5iuekXyVRcpEppKHy",
        "type": "onChange",
      },
      {
        "tabId": "VHzg5iuekXyVRcpEppKHy",
        "type": "onReceive",
      },
    ]
  `);

  // Test reset functionality
  workerOutput.length = 0;

  // Reset the database
  const onCompleteId = testNanoIdLib.nanoid() as CallbackId;
  worker.postMessage({
    type: "reset",
    onCompleteId,
    reload: false,
  });

  // Check that reset completed
  expect(workerOutput).toMatchInlineSnapshot(`
    [
      {
        "onCompleteId": "jl8Ky6BW9jCTxiAw0gY_f",
        "reload": false,
        "type": "onReset",
      },
    ]
  `);

  expect(getDbSnapshot({ sqlite }).tables).toMatchInlineSnapshot(`[]`);

  // No WebSocket messages (local mutations don't sync)
  expect(transports[0]?.sentMessages ?? []).toEqual([]);
});

test("sync mutations", async () => {
  const { worker, sqlite, transports, workerOutput } =
    await createInitializedDbWorker();

  const recordId = testCreateId();

  // Create a subscribed query to see patches in onChange
  const subscribedQuery = createQuery((db) =>
    db.selectFrom("testTable").selectAll().where("isDeleted", "is", null),
  );

  worker.postMessage({
    type: "mutate",
    tabId: testCreateId(),
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

  // Check that data was inserted into regular table
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
            "clock": "1970-01-01T00:00:00.001Z-0000-5028b5d42b661bdd",
          },
        ],
      },
      {
        "name": "evolu_history",
        "rows": [
          {
            "column": "createdAt",
            "id": uint8:[141,138,232,83,108,230,218,122,87,126,208,128,141,75,36,76],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,80,40,181,212,43,102,27,221],
            "value": "1970-01-01T00:00:00.001Z",
          },
          {
            "column": "name",
            "id": uint8:[141,138,232,83,108,230,218,122,87,126,208,128,141,75,36,76],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,80,40,181,212,43,102,27,221],
            "value": "sync data",
          },
        ],
      },
      {
        "name": "testTable",
        "rows": [
          {
            "createdAt": "1970-01-01T00:00:00.001Z",
            "id": "jYroU2zm2npXftCAjUskT",
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
            "h1": 273847295500364,
            "h2": 38036290989003,
            "l": 2,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,0,80,40,181,212,43,102,27,221],
          },
        ],
      },
    ]
  `);

  expect(workerOutput).toMatchInlineSnapshot(`
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
                    "id": "jYroU2zm2npXftCAjUskT",
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
        "tabId": "V83IcuxG6clxIS9iEBxWD",
        "type": "onChange",
      },
      {
        "tabId": "V83IcuxG6clxIS9iEBxWD",
        "type": "onReceive",
      },
    ]
  `);

  // Test last-write-wins: update the same record before deletion
  workerOutput.length = 0;

  worker.postMessage({
    type: "mutate",
    tabId: testCreateId(),
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

  await wait(10);

  // Verify that last write wins - should show "updated data"
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
            "clock": "1970-01-01T00:00:00.001Z-0001-5028b5d42b661bdd",
          },
        ],
      },
      {
        "name": "evolu_history",
        "rows": [
          {
            "column": "createdAt",
            "id": uint8:[141,138,232,83,108,230,218,122,87,126,208,128,141,75,36,76],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,80,40,181,212,43,102,27,221],
            "value": "1970-01-01T00:00:00.001Z",
          },
          {
            "column": "name",
            "id": uint8:[141,138,232,83,108,230,218,122,87,126,208,128,141,75,36,76],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,80,40,181,212,43,102,27,221],
            "value": "sync data",
          },
          {
            "column": "name",
            "id": uint8:[141,138,232,83,108,230,218,122,87,126,208,128,141,75,36,76],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,1,80,40,181,212,43,102,27,221],
            "value": "updated data",
          },
        ],
      },
      {
        "name": "testTable",
        "rows": [
          {
            "createdAt": "1970-01-01T00:00:00.001Z",
            "id": "jYroU2zm2npXftCAjUskT",
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
            "h1": 273847295500364,
            "h2": 38036290989003,
            "l": 2,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,0,80,40,181,212,43,102,27,221],
          },
          {
            "c": 1,
            "h1": 222117604733632,
            "h2": 196050759167509,
            "l": 1,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,1,80,40,181,212,43,102,27,221],
          },
        ],
      },
    ]
  `);

  // Test deletion of the sync record
  workerOutput.length = 0;

  worker.postMessage({
    type: "mutate",
    tabId: testCreateId(),
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
            "clock": "1970-01-01T00:00:00.004Z-0000-5028b5d42b661bdd",
          },
        ],
      },
      {
        "name": "evolu_history",
        "rows": [
          {
            "column": "createdAt",
            "id": uint8:[141,138,232,83,108,230,218,122,87,126,208,128,141,75,36,76],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,80,40,181,212,43,102,27,221],
            "value": "1970-01-01T00:00:00.001Z",
          },
          {
            "column": "name",
            "id": uint8:[141,138,232,83,108,230,218,122,87,126,208,128,141,75,36,76],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,0,80,40,181,212,43,102,27,221],
            "value": "sync data",
          },
          {
            "column": "name",
            "id": uint8:[141,138,232,83,108,230,218,122,87,126,208,128,141,75,36,76],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,1,0,1,80,40,181,212,43,102,27,221],
            "value": "updated data",
          },
          {
            "column": "isDeleted",
            "id": uint8:[141,138,232,83,108,230,218,122,87,126,208,128,141,75,36,76],
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "table": "testTable",
            "timestamp": uint8:[0,0,0,0,0,4,0,0,80,40,181,212,43,102,27,221],
            "value": 1,
          },
        ],
      },
      {
        "name": "testTable",
        "rows": [
          {
            "createdAt": "1970-01-01T00:00:00.001Z",
            "id": "jYroU2zm2npXftCAjUskT",
            "isDeleted": 1,
            "name": "updated data",
            "updatedAt": "1970-01-01T00:00:00.004Z",
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
            "h1": 273847295500364,
            "h2": 38036290989003,
            "l": 2,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,0,80,40,181,212,43,102,27,221],
          },
          {
            "c": 1,
            "h1": 222117604733632,
            "h2": 196050759167509,
            "l": 1,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,1,0,1,80,40,181,212,43,102,27,221],
          },
          {
            "c": 1,
            "h1": 232573821234168,
            "h2": 231480427562672,
            "l": 1,
            "ownerId": uint8:[26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56],
            "t": uint8:[0,0,0,0,0,4,0,0,80,40,181,212,43,102,27,221],
          },
        ],
      },
    ]
  `);

  expect(workerOutput).toMatchInlineSnapshot(`
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
        "tabId": "NSX7ssTYhFI2lFtcq9dZb",
        "type": "onChange",
      },
      {
        "tabId": "NSX7ssTYhFI2lFtcq9dZb",
        "type": "onReceive",
      },
    ]
  `);

  // Test reset functionality
  workerOutput.length = 0;

  // Reset the database
  const onCompleteId = testNanoIdLib.nanoid() as CallbackId;
  worker.postMessage({
    type: "reset",
    onCompleteId,
    reload: false,
  });

  // Check that reset completed
  expect(workerOutput).toMatchInlineSnapshot(`
    [
      {
        "onCompleteId": "sVAus_7j-a98-R9rQCnOb",
        "reload": false,
        "type": "onReset",
      },
    ]
  `);

  expect(getDbSnapshot({ sqlite }).tables).toMatchInlineSnapshot(`[]`);

  // WebSocket is not opened.
  expect(transports[0]?.sentMessages ?? []).toEqual([]);
});

describe("WebSocket", () => {
  test("sends messages when socket is opened", async () => {
    const { worker, transports } = await createInitializedDbWorker();

    const recordId = testCreateId();

    // Create a sync mutation first to have data to send
    worker.postMessage({
      type: "mutate",
      tabId: testCreateId(),
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
      /**
       * This protocol message decodes to:
       *
       * - Protocol version: 0
       * - Owner ID: [26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56]
       * - Message type: 0 (Request)
       * - Write key: 0 (none - read-only sync)
       * - Subscription flag: 1 (Subscribe for updates)
       * - Messages: 0 (no messages to send)
       * - Ranges: 1 range of type 2 (Timestamps)
       * - Timestamp: 5ms after epoch
       * - Counter RLE: 0 (single counter value, not a range)
       * - Counter: 1
       * - NodeId RLE: [117,13,222,168,226,197,162,215] (single nodeId, not a
       *   range)
       * - Final RLE: 1 (single timestamp entry)
       */
      `
      [
        uint8:[0,26,109,171,196,54,34,110,152,233,244,194,208,98,9,215,56,0,0,1,0,1,2,1,5,0,1,117,13,222,168,226,197,162,215,1],
      ]
    `,
    );
  });

  // TODO: test on message (a received message)
});
