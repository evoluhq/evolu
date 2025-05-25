import { assert, expect, test } from "vitest";
import { CallbackId } from "../../src/Callbacks.js";
import { Console } from "../../src/Console.js";
import {
  createDbWorkerForPlatform,
  DbSchema,
  DbSnapshot,
  DbWorkerOutput,
  DbWorkerPlatformDeps,
  getDbSchema,
  getDbSnapshot,
  maybeMigrateToVersion0,
} from "../../src/Evolu/Db.js";
import { ColumnName, TableName } from "../../src/Evolu/Protocol.js";
import { defaultColumnsNames } from "../../src/Evolu/Schema.js";
import { constVoid } from "../../src/Function.js";
import { wait } from "../../src/Promise.js";
import { createRandomWithSeed } from "../../src/Random.js";
import { getOrThrow } from "../../src/Result.js";
import { createSqlite, sql, Sqlite } from "../../src/Sqlite.js";
import { createId } from "../../src/Type.js";
import {
  testCreateId,
  testCreateMnemonic,
  testCreateRandomBytesDep,
  testCreateSqlite,
  testCreateSqliteDriver,
  testDbConfig,
  testNanoIdLib,
  testNanoIdLibDep,
  testSimpleName,
  testTime,
} from "../_deps.js";

export const testCreateVersion0 = ({ exec }: Sqlite): void => {
  exec(sql`begin;`);

  exec(sql`
    create table "evolu_message" (
      "timestamp" blob primary key,
      "table" blob,
      "row" blob,
      "column" blob,
      "value" blob
    );
  `);

  exec(sql`
    create index "index_evolu_message" on "evolu_message" (
      "table",
      "row",
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

// TODO: Migration works, but we have to update the test.
test.skip("maybeMigrateTo0", async () => {
  const sqlite = await testCreateSqlite();
  testCreateVersion0(sqlite);

  const schema = getDbSchema({ sqlite })();
  assert(schema.ok);

  maybeMigrateToVersion0({
    ...testCreateRandomBytesDep,
    sqlite,
  })(schema.value);

  const snapshot = getDbSnapshot({ sqlite });

  expect(snapshot).toMatchSnapshot();
});

test("createDbWorker", async () => {
  const onMessageMessagesAndDbSnapshots: Array<{
    message: DbWorkerOutput;
    snapshot: DbSnapshot;
  }> = [];
  const logArgs: Array<unknown> = [];

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
    console: {
      log: (...args) => {
        logArgs.push(args);
      },
    } as Console,
    time: testTime,
    random: createRandomWithSeed("test"),
    nanoIdLib: testNanoIdLib,
    createMnemonic: testCreateMnemonic,
    ...testCreateRandomBytesDep,
  };

  const db = createDbWorkerForPlatform(deps);

  db.onMessage((message) => {
    const snapshot = getDbSnapshot({ sqlite });
    assert(snapshot.ok);
    onMessageMessagesAndDbSnapshots.push({
      message,
      snapshot: snapshot.value,
    });
  });

  const tabId = createId(testNanoIdLibDep);

  // Run mutate before the init to test the init is handled first and mutate waits.
  db.postMessage({
    type: "mutate",
    tabId,
    changes: [
      {
        id: testCreateId(),
        table: "_table1" as TableName,
        values: {
          ["column1" as ColumnName]: "bar",
        },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  const testDbSchema: DbSchema = {
    tables: [
      {
        name: "_table1" as TableName,
        columns: ["id" as ColumnName, "column1" as ColumnName].concat(
          defaultColumnsNames,
        ),
      },
      {
        name: "table1" as TableName,
        columns: ["id" as ColumnName, "column1" as ColumnName].concat(
          defaultColumnsNames,
        ),
      },
    ],
    indexes: [],
  };

  db.postMessage({
    type: "init",
    config: { ...testDbConfig, enableLogging: true },
    dbSchema: testDbSchema,
    initialData: [
      {
        id: testCreateId(),
        table: "table1" as TableName,
        values: {
          ["column1" as ColumnName]: "foo",
        },
      },
    ],
  });

  db.postMessage({
    type: "mutate",
    tabId,
    changes: [
      {
        id: testCreateId(),
        table: "_table1" as TableName,
        values: {
          ["isDeleted" as ColumnName]: 1,
        },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  db.postMessage({
    type: "mutate",
    tabId,
    changes: [
      {
        id: testCreateId(),
        table: "Table1" as TableName,
        values: {
          ["column1" as ColumnName]: "foo",
        },
      },
    ],
    onCompleteIds: [],
    subscribedQueries: [],
  });

  db.postMessage({
    type: "reset",
    reload: false,
    onCompleteId: testNanoIdLib.nanoid() as CallbackId,
  });

  await wait(10);

  expect(logArgs).toMatchSnapshot("logArgs");

  expect(onMessageMessagesAndDbSnapshots).toMatchSnapshot(
    "onMessageMessagesAndDbSnapshots",
  );

  // TODO:
  // db.ensureDbSchema({ tables: [], indexes: [] });
  // getDatabaseSnapshot.toMatchSnapshot(
  //   "ensureDbSchema doesn't remove tables nor app indexes",
  // );
  // const indexes = createIndexes((create) => [
  //   create("indexTodoCreatedAt").on("todo").column("createdAt"),
  // ]);
  // db.ensureDbSchema({ tables: [], indexes })
  // getDatabaseSnapshot.toMatchSnapshot(
  //   "ensureDbSchema adds user indexes",
  // );
});
