import { expect, test } from "vitest";
import { CallbackId } from "../../src/Callbacks.js";
import { createConsole } from "../../src/Console.js";
import {
  createDbWorkerForPlatform,
  DbSchema,
  DbWorker,
  DbWorkerOutput,
  DbWorkerPlatformDeps,
  getDbSnapshot,
} from "../../src/Evolu/Db.js";
import {
  Base64Url256,
  DbChange,
  idToBinaryId,
} from "../../src/Evolu/Protocol.js";
import { constVoid } from "../../src/Function.js";
import { wait } from "../../src/Promise.js";
import { getOrThrow } from "../../src/Result.js";
import { createSqlite, sql, Sqlite } from "../../src/Sqlite.js";
import {
  testCreateId,
  testCreateMnemonic,
  testCreateRandomBytesDep,
  testCreateSqliteDriver,
  testDbConfig,
  testNanoIdLib,
  testOwnerBinaryId,
  testRandom,
  testSimpleName,
  testTime,
} from "../_deps.js";
import { testTimestampsAsc } from "./_fixtures.js";

const createSimpleTestSchema = (): DbSchema => {
  return {
    tables: [
      {
        name: "testTable" as Base64Url256,
        columns: ["id" as Base64Url256, "name" as Base64Url256],
      },
      {
        name: "_testTable" as Base64Url256,
        columns: ["id" as Base64Url256, "name" as Base64Url256],
      },
    ],
    indexes: [],
  };
};

const createSqliteWithDbWorkerPlatformDeps = async (): Promise<
  [Sqlite, DbWorkerPlatformDeps]
> => {
  const sqliteDriver = await testCreateSqliteDriver(testSimpleName);
  const createSqliteDriver = () => Promise.resolve(sqliteDriver);
  const sqlite = getOrThrow(
    await createSqlite({ createSqliteDriver })(testSimpleName),
  );

  const deps: DbWorkerPlatformDeps = {
    createSqliteDriver,
    createSync: () => () => ({
      send: constVoid,
    }),
    console: createConsole(),
    time: testTime,
    random: testRandom,
    nanoIdLib: testNanoIdLib,
    createMnemonic: testCreateMnemonic,
    ...testCreateRandomBytesDep,
  };
  return [sqlite, deps];
};

const setupInitializedDbWorker = async (
  callback?: (db: DbWorker) => void,
): Promise<[Array<DbWorkerOutput>, Sqlite, DbWorker]> => {
  const [sqlite, deps] = await createSqliteWithDbWorkerPlatformDeps();
  const db = createDbWorkerForPlatform(deps);

  const dbWorkerOutput: Array<DbWorkerOutput> = [];
  db.onMessage((message) => dbWorkerOutput.push(message));

  // Execute callback before initialization if provided
  if (callback) {
    callback(db);
  }

  db.postMessage({
    type: "init",
    config: testDbConfig,
    dbSchema: createSimpleTestSchema(),
    initialData: [],
  });

  // async createSqliteDriver
  await wait(10);

  return [dbWorkerOutput, sqlite, db];
};

test("createDbWorker initializes correctly", async () => {
  const [dbWorkerOutput, sqlite] = await setupInitializedDbWorker();

  expect(dbWorkerOutput).toMatchSnapshot();
  expect(getDbSnapshot({ sqlite })).toMatchSnapshot();
});

test("mutations", async () => {
  const [dbWorkerOutput, sqlite, db] = await setupInitializedDbWorker();

  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [
      {
        id: testCreateId(),
        table: "testTable" as Base64Url256,
        values: { ["name" as Base64Url256]: "test" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  expect(dbWorkerOutput).toMatchSnapshot();
  expect(getDbSnapshot({ sqlite }).tables).toMatchSnapshot();
});

test("mutate before init", async () => {
  const [dbWorkerOutput, sqlite] = await setupInitializedDbWorker((db) => {
    // This runs BEFORE init
    db.postMessage({
      type: "mutate",
      tabId: testCreateId(),
      changes: [
        {
          id: testCreateId(),
          table: "_testTable" as Base64Url256,
          values: { ["name" as Base64Url256]: "test" },
        },
      ],
      onCompleteIds: [],
      subscribedQueries: [],
    });
  });

  expect(dbWorkerOutput).toMatchSnapshot();
  expect(getDbSnapshot({ sqlite }).tables).toMatchSnapshot();
});

test("local mutation", async () => {
  const [dbWorkerOutput, sqlite, db] = await setupInitializedDbWorker();

  const change: DbChange = {
    id: testCreateId(),
    table: "_testTable" as Base64Url256,
    values: { ["name" as Base64Url256]: "test" },
  };

  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [change],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  expect(dbWorkerOutput).toMatchSnapshot();
  expect(getDbSnapshot({ sqlite }).tables).toMatchSnapshot();

  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [
      {
        ...change,
        values: {
          ...change.values,
          ["isDeleted" as Base64Url256]: 1,
        },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  expect(getDbSnapshot({ sqlite }).tables).toMatchSnapshot();
});

test("reset", async () => {
  const [, sqlite, db] = await setupInitializedDbWorker();

  db.postMessage({
    type: "reset",
    reload: false,
    onCompleteId: testNanoIdLib.nanoid() as CallbackId,
  });

  expect(getDbSnapshot({ sqlite })).toMatchSnapshot();
});

test("evolu_history unique index prevents duplicates", async () => {
  const [, sqlite] = await setupInitializedDbWorker();

  const ownerId = testOwnerBinaryId;
  const table = "testTable";
  const id = idToBinaryId(testCreateId());
  const column = "name";
  const value = "test value";
  const timestamp = testTimestampsAsc[0];

  // Manually insert the same record twice
  sqlite.exec(sql`
    insert into evolu_history
      ("ownerId", "table", "id", "column", "value", "timestamp")
    values
      (${ownerId}, ${table}, ${id}, ${column}, ${value}, ${timestamp})
    on conflict do nothing;
  `);
  sqlite.exec(sql`
    insert into evolu_history
      ("ownerId", "table", "id", "column", "value", "timestamp")
    values
      (${ownerId}, ${table}, ${id}, ${column}, ${value}, ${timestamp})
    on conflict do nothing;
  `);

  const count = getOrThrow(
    sqlite.exec<{ count: number }>(sql`
      select count(*) as count from evolu_history;
    `),
  );
  expect(count.rows[0].count).toBe(1);
});
