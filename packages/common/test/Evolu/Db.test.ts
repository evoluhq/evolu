import { assert, expect, test } from "vitest";
import { CallbackId } from "../../src/Callbacks.js";
import { createConsole } from "../../src/Console.js";
import {
  createDbWorkerForPlatform,
  DbSchema,
  DbWorker,
  DbWorkerOutput,
  DbWorkerPlatformDeps,
  getDbSchema,
  getDbSnapshot,
  maybeMigrateToVersion0,
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
  testCreateSqlite,
  testCreateSqliteDriver,
  testDbConfig,
  testNanoIdLib,
  testOwnerBinaryId,
  testRandom,
  testSimpleName,
  testTime,
} from "../_deps.js";
import { testTimestampsAsc } from "./_fixtures.js";

const testCreateVersion0 = ({ exec }: Sqlite): void => {
  exec(sql`begin;`);

  exec(sql`
    create table "evolu_message" (
      "timestamp" blob primary key,
      "table" blob,
      "id" blob,
      "column" blob,
      "value" blob
    );
  `);

  exec(sql`
    create index "index_evolu_message" on "evolu_message" (
      "table",
      "id",
      "column",
      "timestamp" desc
    );
  `);

  exec(sql`
    insert into evolu_message
    values
      (
        '2024-08-24T07:16:20.246Z-0000-431898faea378430',
        'todoCategory',
        'VeLlYHBvFcy3yAhboJp-L',
        'name',
        'Not Urgent'
      );
  `);

  exec(sql`
    insert into evolu_message
    values
      (
        '2024-08-24T07:16:20.246Z-0001-431898faea378430',
        'todo',
        'JiSMETkhgJT-GZ_2W3p48',
        'title',
        'Try React Suspense'
      );
  `);

  exec(sql`
    insert into evolu_message
    values
      (
        '2024-08-24T07:16:20.246Z-0002-431898faea378430',
        'todo',
        'JiSMETkhgJT-GZ_2W3p48',
        'categoryId',
        'VeLlYHBvFcy3yAhboJp-L'
      );
  `);

  exec(sql`
    insert into evolu_message
    values
      (
        '2024-08-24T07:16:28.969Z-0000-431898faea378430',
        'todo',
        '18DyYqVEmVI0voIlxbniY',
        'title',
        'Test 1'
      );
  `);

  exec(sql`
    insert into evolu_message
    values
      (
        '2024-09-05T12:54:42.857Z-0000-431898faea378430',
        'todo',
        'ZMmNCbACx5Km29e5wZ48l',
        'isCompleted',
        1
      );
  `);

  exec(sql`
    create table "evolu_owner" (
      "id" blob,
      "mnemonic" blob,
      "encryptionkey" blob,
      "timestamp" blob,
      "merkletree" blob
    );
  `);

  exec(sql`
    insert into evolu_owner
    values
      (
        'NXqRROM1U3dSJRawS9LRf',
        'over elder sense peace scheme hard total pigeon access tomato spray ocean',
        x'8d6b3447d9a6ae6890eead6b713b1c297e7af26ec7eb4cb5d90f5657d9091539',
        '2024-09-05T14:07:03.338Z-0004-de562c45893915d4',
        '{"2":{"0":{"0":{"0":{"0":{"0":{"2":{"0":{"1":{"2":{"2":{"1":{"0":{"0":{"1":{"1":{"hash":676696346},"hash":676696346},"hash":676696346},"hash":676696346},"hash":676696346},"hash":676696346},"hash":676696346},"hash":676696346},"hash":676696346},"hash":676696346},"hash":676696346},"1":{"0":{"0":{"0":{"0":{"2":{"1":{"2":{"1":{"0":{"1":{"hash":1532565686},"hash":1532565686},"hash":1532565686},"hash":1532565686},"hash":1532565686},"hash":1532565686},"hash":1532565686},"2":{"2":{"2":{"1":{"1":{"1":{"0":{"hash":1149993009},"1":{"hash":1677793058},"2":{"hash":-1929932990},"hash":-1401087919},"2":{"0":{"hash":-1331646170},"1":{"hash":1147271680},"2":{"hash":1003866511},"hash":-820739415},"hash":1667865336},"2":{"0":{"0":{"hash":-1060739940},"hash":-1060739940},"hash":-1060739940},"hash":-1548747164},"hash":-1548747164},"hash":-1548747164},"hash":-1548747164},"hash":-118036782},"hash":-118036782},"hash":-118036782},"hash":-118036782},"hash":-794593336},"hash":-794593336},"hash":-794593336},"hash":-794593336},"hash":-794593336},"hash":-794593336}'
      );
  `);

  exec(sql`commit;`);
};

test("maybeMigrateTo0", async () => {
  const sqlite = await testCreateSqlite();
  testCreateVersion0(sqlite);

  const schema = getDbSchema({ sqlite })();
  assert(schema.ok);

  const messagesMnemonicLastTimestamp = maybeMigrateToVersion0({
    ...testCreateRandomBytesDep,
    sqlite,
  })(schema.value);

  assert(messagesMnemonicLastTimestamp.ok);
});

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
