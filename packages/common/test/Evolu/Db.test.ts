import { expect, test } from "vitest";
import { CallbackId } from "../../src/Callbacks.js";
import { createConsole } from "../../src/Console.js";
import {
  createDbWorkerForPlatform,
  DbWorker,
  DbWorkerOutput,
  DbWorkerPlatformDeps,
} from "../../src/Evolu/Db.js";
import { DbSchema } from "../../src/Evolu/DbSchema.js";
import { DbChange } from "../../src/Evolu/Storage.js";
import { constVoid } from "../../src/Function.js";
import { wait } from "../../src/Promise.js";
import { getOrThrow } from "../../src/Result.js";
import { createSqlite, sql, Sqlite } from "../../src/Sqlite.js";
import { idToBinaryId } from "../../src/Type.js";
import {
  testCreateId,
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
import { getDbSnapshot } from "./_utils.js";

const createSimpleTestSchema = (): DbSchema => {
  return {
    tables: [
      {
        name: "testTable",
        columns: ["id", "name"],
      },
      {
        name: "_testTable",
        columns: ["id", "name"],
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
        table: "testTable",
        values: { name: "test" },
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
          table: "_testTable",
          values: { name: "test" },
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
    table: "_testTable",
    values: { name: "test" },
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
          isDeleted: 1,
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

test("timestamp ordering - newer mutations overwrite older ones", async () => {
  const [, sqlite, db] = await setupInitializedDbWorker();

  const recordId = testCreateId();

  // Create first mutation
  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: { name: "first_value" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  await wait(10);

  // Create second mutation on same record (will have newer timestamp)
  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: { name: "second_value" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  await wait(10);

  // Verify the app table has the latest value
  const finalResult = getOrThrow(
    sqlite.exec<{ name: string }>(sql`
      select name from testTable where id = ${recordId};
    `),
  );
  expect(finalResult.rows[0].name).toBe("second_value");

  // Verify both mutations are stored in history
  const historyCount = getOrThrow(
    sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_history
      where
        "table" = 'testTable'
        and "id" = ${idToBinaryId(recordId)}
        and "column" = 'name';
    `),
  );
  expect(historyCount.rows[0].count).toBe(2);
});

test("timestamp ordering - multiple columns update independently", async () => {
  const [, sqlite, db] = await setupInitializedDbWorker();

  const recordId = testCreateId();

  // Create first mutation that sets the name
  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: { name: "original_name" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  await wait(10);

  // Update the same record with a different value for name
  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: { name: "updated_name" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  await wait(10);

  // Verify the app table has the latest name value
  const finalResult = getOrThrow(
    sqlite.exec<{ name: string }>(sql`
      select name from testTable where id = ${recordId};
    `),
  );
  expect(finalResult.rows[0].name).toBe("updated_name");

  // Verify we have two entries in history for the name column
  const nameHistoryCount = getOrThrow(
    sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_history
      where
        "table" = 'testTable'
        and "id" = ${idToBinaryId(recordId)}
        and "column" = 'name';
    `),
  );
  expect(nameHistoryCount.rows[0].count).toBe(2);

  // Verify the values are stored in chronological order in history
  const historyValues = getOrThrow(
    sqlite.exec<{ value: string }>(sql`
      select value
      from evolu_history
      where
        "table" = 'testTable'
        and "id" = ${idToBinaryId(recordId)}
        and "column" = 'name'
      order by timestamp;
    `),
  );
  expect(historyValues.rows[0].value).toBe("original_name");
  expect(historyValues.rows[1].value).toBe("updated_name");
});

test("timestamp ordering - concurrent mutations on different records", async () => {
  const [, sqlite, db] = await setupInitializedDbWorker();

  const recordId1 = testCreateId();
  const recordId2 = testCreateId();

  // Create mutations on different records in quick succession
  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [
      {
        id: recordId1,
        table: "testTable",
        values: { name: "record1_value" },
      },
      {
        id: recordId2,
        table: "testTable",
        values: { name: "record2_value" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  await wait(10);

  // Verify both records exist with correct values
  const allRecords = getOrThrow(
    sqlite.exec<{ id: string; name: string }>(sql`
      select id, name
      from testTable
      where id in (${recordId1}, ${recordId2})
      order by id;
    `),
  );
  expect(allRecords.rows).toHaveLength(2);

  const record1 = allRecords.rows.find((r) => r.id === recordId1);
  const record2 = allRecords.rows.find((r) => r.id === recordId2);

  expect(record1?.name).toBe("record1_value");
  expect(record2?.name).toBe("record2_value");

  // Verify both records have entries in history
  const totalHistoryCount = getOrThrow(
    sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_history
      where "table" = 'testTable' and "column" = 'name';
    `),
  );
  expect(totalHistoryCount.rows[0].count).toBe(2);
});

test("timestamp ordering - verify CRDT last-write-wins behavior", async () => {
  const [, sqlite, db] = await setupInitializedDbWorker();

  const recordId = testCreateId();

  // Create initial value
  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: { name: "initial" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  await wait(10);

  // Update multiple times rapidly to ensure different timestamps
  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: { name: "second" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  await wait(5);

  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: { name: "third" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  await wait(5);

  db.postMessage({
    type: "mutate",
    tabId: testCreateId(),
    changes: [
      {
        id: recordId,
        table: "testTable",
        values: { name: "final" },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  await wait(10);

  // Verify app table has the final value (last write wins)
  const appTableResult = getOrThrow(
    sqlite.exec<{ name: string }>(sql`
      select name from testTable where id = ${recordId};
    `),
  );
  expect(appTableResult.rows[0].name).toBe("final");

  // Verify all mutations are preserved in history in timestamp order
  const historyResults = getOrThrow(
    sqlite.exec<{ value: string }>(sql`
      select value
      from evolu_history
      where
        "table" = 'testTable'
        and "id" = ${idToBinaryId(recordId)}
        and "column" = 'name'
      order by timestamp;
    `),
  );

  expect(historyResults.rows).toHaveLength(4);
  expect(historyResults.rows[0].value).toBe("initial");
  expect(historyResults.rows[1].value).toBe("second");
  expect(historyResults.rows[2].value).toBe("third");
  expect(historyResults.rows[3].value).toBe("final");

  // Verify that the app table always reflects the value with the highest timestamp
  const timestampResults = getOrThrow(
    sqlite.exec<{ value: string; timestamp: Uint8Array }>(sql`
      select value, timestamp
      from evolu_history
      where
        "table" = 'testTable'
        and "id" = ${idToBinaryId(recordId)}
        and "column" = 'name'
      order by timestamp desc
      limit 1;
    `),
  );

  expect(timestampResults.rows[0].value).toBe("final");
});
