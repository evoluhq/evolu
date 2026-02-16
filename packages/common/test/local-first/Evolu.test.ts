import { describe, expect, expectTypeOf, test } from "vitest";
import type { Brand } from "../../src/Brand.js";
import type { ConsoleEntry, TestConsole } from "../../src/Console.js";
import { testCreateConsole } from "../../src/Console.js";
import { lazyVoid } from "../../src/Function.js";
import type {
  CreateDbWorker,
  DbWorker,
  DbWorkerInput,
} from "../../src/local-first/Db.js";
import {
  AppName,
  createEvolu,
  createEvoluDeps,
  testAppName,
} from "../../src/local-first/Evolu.js";
import type {
  EvoluInput,
  EvoluTabOutput,
  SharedWorker,
  SharedWorkerInput,
} from "../../src/local-first/Shared.js";
import { err, ok } from "../../src/Result.js";
import { SqliteBoolean } from "../../src/Sqlite.js";
import { testCreateRun } from "../../src/Test.js";
import {
  createIdFromString,
  id,
  NonEmptyString100,
  nullOr,
} from "../../src/Type.js";
import {
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
  testCreateWorker,
} from "../../src/Worker.js";
import { testAppOwner } from "./_fixtures.js";

const TodoId = id("Todo");
type TodoId = typeof TodoId.Type;

const Schema = {
  todo: {
    id: TodoId,
    title: NonEmptyString100,
    isCompleted: nullOr(SqliteBoolean),
  },
};

const testCreateDbWorker: CreateDbWorker = () => {
  const { worker } = testCreateWorker<DbWorkerInput>();
  return worker as DbWorker;
};

const createEvoluRun = (
  worker: SharedWorker = testCreateSharedWorker<SharedWorkerInput>().worker,
) =>
  testCreateRun({
    console: testCreateConsole(),
    createDbWorker: testCreateDbWorker,
    createMessageChannel: testCreateMessageChannel,
    reloadApp: lazyVoid,
    sharedWorker: worker,
  });

const setupCreateEvolu = async () => {
  const { worker, self, connect } = testCreateSharedWorker<SharedWorkerInput>();
  const evoluInputs: Array<EvoluInput> = [];

  self.onConnect = (port) => {
    port.onMessage = (message) => {
      if (message.type !== "InitEvolu") return;
      const evoluPort = testCreateMessagePort<never, EvoluInput>(message.port1);
      evoluPort.onMessage = (input) => {
        evoluInputs.push(input);
      };
    };
  };
  connect();

  const run = createEvoluRun(worker);

  const result = await run(
    createEvolu(Schema, { appName: testAppName, appOwner: testAppOwner }),
  );

  return { run, result, evoluInputs };
};

test("AppName", () => {
  expect(AppName.from("my-app")).toEqual(ok("my-app"));
  expect(AppName.from("")).toEqual(
    err({
      type: "Regex",
      name: "UrlSafeString",
      pattern: /^[A-Za-z0-9_-]+$/,
      value: "",
    }),
  );
  expect(AppName.from("a".repeat(41))).toEqual(ok("a".repeat(41)));
  expect(AppName.from("a".repeat(42))).toEqual(
    err({
      type: "AppName",
      value: "a".repeat(42),
    }),
  );

  const appName = AppName.orThrow("my-app");
  expectTypeOf(appName).toExtend<string & Brand<"AppName">>();
  expectTypeOf(AppName.Input).toEqualTypeOf<string>();
  expectTypeOf(AppName.Parent).toEqualTypeOf<string & Brand<"UrlSafeString">>();
});

describe("createEvoluDeps", () => {
  const setupAndCall = (console?: TestConsole) => {
    const { worker, self, connect } =
      testCreateSharedWorker<SharedWorkerInput>();
    const messages: Array<SharedWorkerInput> = [];
    self.onConnect = (port) => {
      port.onMessage = (message) => messages.push(message);
    };
    connect();

    createEvoluDeps({
      createDbWorker: testCreateDbWorker,
      createMessageChannel: testCreateMessageChannel,
      sharedWorker: worker,
      reloadApp: lazyVoid,
      ...(console && { console }),
    });

    return { messages };
  };

  test("posts InitTab with port to worker", () => {
    const { messages } = setupAndCall(testCreateConsole());

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe("InitTab");
  });

  test("falls back to default console when not provided", () => {
    const { messages } = setupAndCall();

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe("InitTab");
  });

  const setupDepsWithPort = () => {
    const { worker, self, connect } =
      testCreateSharedWorker<SharedWorkerInput>();
    const messages: Array<SharedWorkerInput> = [];
    self.onConnect = (port) => {
      port.onMessage = (message) => messages.push(message);
    };
    connect();

    const deps = createEvoluDeps({
      createDbWorker: testCreateDbWorker,
      createMessageChannel: testCreateMessageChannel,
      sharedWorker: worker,
      reloadApp: lazyVoid,
    });

    const initTab = messages[0] as Extract<
      SharedWorkerInput,
      { readonly type: "InitTab" }
    >;
    const workerPort = testCreateMessagePort<EvoluTabOutput>(initTab.port);

    return { deps, workerPort };
  };

  test("wires console channel to console.write", () => {
    const console = testCreateConsole();
    const { messages } = setupAndCall(console);

    const initConsole = messages[0] as Extract<
      SharedWorkerInput,
      { readonly type: "InitTab" }
    >;
    const workerPort = testCreateMessagePort<EvoluTabOutput>(initConsole.port);

    const entry: ConsoleEntry = {
      method: "info",
      path: ["test"],
      args: ["hello"],
    };
    workerPort.postMessage({ type: "ConsoleEntry", entry });

    expect(console.getEntriesSnapshot()).toEqual([entry]);
  });

  test("maps ConsoleEntry error output to deps.evoluError store", () => {
    const { deps, workerPort } = setupDepsWithPort();

    const entry: ConsoleEntry = {
      method: "error",
      path: ["global"],
      args: ["error", { type: "UnknownError", error: "boom" }],
    };

    workerPort.postMessage({ type: "ConsoleEntry", entry });

    expect(deps.evoluError.get()).toEqual({
      type: "UnknownError",
      error: ["error", { type: "UnknownError", error: "boom" }],
    });
  });

  test("wraps single-arg ConsoleEntry error output to UnknownError", () => {
    const { deps, workerPort } = setupDepsWithPort();

    workerPort.postMessage({
      type: "ConsoleEntry",
      entry: { method: "error", path: ["global"], args: ["boom"] },
    });

    expect(deps.evoluError.get()).toEqual({
      type: "UnknownError",
      error: ["boom"],
    });
  });

  test("wraps multi-arg ConsoleEntry error output to UnknownError", () => {
    const { deps, workerPort } = setupDepsWithPort();

    workerPort.postMessage({
      type: "ConsoleEntry",
      entry: { method: "error", path: ["global"], args: ["error", "boom"] },
    });

    expect(deps.evoluError.get()).toEqual({
      type: "UnknownError",
      error: ["error", "boom"],
    });
  });

  test("wires EvoluError output to deps.evoluError store", () => {
    const { deps, workerPort } = setupDepsWithPort();

    const error = { type: "UnknownError", error: "boom" } as const;
    workerPort.postMessage({ type: "EvoluError", error });

    expect(deps.evoluError.get()).toEqual(error);
  });

  test("throws for unknown tab output type", () => {
    const { workerPort } = setupDepsWithPort();

    expect(() => {
      workerPort.postMessage({ type: "Unknown" } as never);
    }).toThrow();
  });

  test("dispose cleans up resources", () => {
    const { worker, self, connect } =
      testCreateSharedWorker<SharedWorkerInput>();
    self.onConnect = (port) => {
      port.onMessage = lazyVoid;
    };
    connect();

    const channels: Array<{ readonly isDisposed: () => boolean }> = [];
    let workerDisposed = false;
    const sharedWorker: SharedWorker = {
      port: worker.port,
      [Symbol.dispose]: () => {
        workerDisposed = true;
        worker[Symbol.dispose]();
      },
    };

    const deps = createEvoluDeps({
      createDbWorker: testCreateDbWorker,
      createMessageChannel: <Input, Output = never>() => {
        const channel = testCreateMessageChannel<Input, Output>();
        channels.push(channel);
        return channel;
      },
      sharedWorker,
      reloadApp: lazyVoid,
    });

    expect(channels[0].isDisposed()).toBe(false);
    expect(workerDisposed).toBe(false);
    deps[Symbol.dispose]();
    expect(channels[0].isDisposed()).toBe(true);
    expect(workerDisposed).toBe(true);
  });
});

describe("createEvolu", () => {
  test("initializes db worker with resolved name", async () => {
    const dbWorkerMessages: Array<DbWorkerInput> = [];

    const createDbWorker: CreateDbWorker = () => {
      const { worker, self } = testCreateWorker<DbWorkerInput>();
      self.onMessage = (message) => {
        dbWorkerMessages.push(message);
      };
      return worker as DbWorker;
    };

    await using run = testCreateRun({
      console: testCreateConsole(),
      createDbWorker,
      createMessageChannel: testCreateMessageChannel,
      reloadApp: lazyVoid,
      sharedWorker: testCreateSharedWorker<SharedWorkerInput>().worker,
    });

    const result = await run(
      createEvolu(Schema, { appName: testAppName, appOwner: testAppOwner }),
    );
    if (!result.ok) return;

    expect(dbWorkerMessages).toHaveLength(1);
    expect(dbWorkerMessages[0]).toEqual(
      expect.objectContaining({
        type: "Init",
        name: result.value.name,
      }),
    );
  });

  test("resolves name from appName and appOwner hash", async () => {
    await using run = createEvoluRun();

    const result = await run(
      createEvolu(Schema, { appName: testAppName, appOwner: testAppOwner }),
    );
    const expectedSuffix = createIdFromString(testAppOwner.id);
    expect(result.ok && result.value.name).toBe(`AppName-${expectedSuffix}`);
  });

  test("appOwner from config is exposed as evolu.appOwner", async () => {
    await using run = createEvoluRun();

    const result = await run(
      createEvolu(Schema, { appName: testAppName, appOwner: testAppOwner }),
    );

    expect(result.ok && result.value.appOwner).toBe(testAppOwner);
  });

  test("appOwner is created when omitted from config", async () => {
    await using run = createEvoluRun();

    const result = await run(createEvolu(Schema, { appName: testAppName }));

    expect(result.ok && result.value.appOwner).toMatchInlineSnapshot(`
      {
        "encryptionKey": uint8:[50,42,177,193,76,197,92,240,100,30,92,209,205,42,108,45,195,37,118,158,238,206,161,144,11,241,190,167,14,254,186,53],
        "id": "t_xEbmXuICrgDm3Ob0_afw",
        "mnemonic": "old jungle over boy ankle suggest service source civil insane end silver polar swap flight diagram keep fix gauge social wink subway bronze leader",
        "type": "AppOwner",
        "writeKey": uint8:[129,228,239,103,127,237,0,59,174,241,77,12,26,180,213,14],
      }
    `);
  });

  test("asyncDispose disposes Evolu resources", async () => {
    await using run = createEvoluRun();

    const result = await run(createEvolu(Schema, { appName: testAppName }));

    if (!result.ok) return;
    await result.value[Symbol.asyncDispose]();
  });
});

describe("mutations", () => {
  test("insert posts mutate with generated id and stripped values", async () => {
    const { run, result, evoluInputs } = await setupCreateEvolu();
    await using _run = run;

    if (!result.ok) return;

    const { id } = result.value.insert("todo", {
      title: NonEmptyString100.orThrow("Todo 1"),
    });

    await Promise.resolve();

    expect(evoluInputs).toHaveLength(1);
    expect(evoluInputs[0]).toEqual({
      type: "Mutate",
      changes: [
        {
          table: "todo",
          id,
          values: { title: "Todo 1" },
          isInsert: true,
          isDelete: null,
          ownerId: undefined,
        },
      ],
      onCompleteIds: [],
      subscribedQueries: [],
    });
  });

  test("update and upsert preserve passed id and set isInsert correctly", async () => {
    const { run, result, evoluInputs } = await setupCreateEvolu();
    await using _run = run;

    if (!result.ok) return;

    const updateId = TodoId.orThrow(createIdFromString("todo-update"));
    const upsertId = TodoId.orThrow(createIdFromString("todo-upsert"));

    result.value.update("todo", {
      id: updateId,
      title: NonEmptyString100.orThrow("Updated"),
      isDeleted: 1,
    });

    result.value.upsert("todo", {
      id: upsertId,
      title: NonEmptyString100.orThrow("Upserted"),
    });

    await Promise.resolve();

    expect(evoluInputs).toHaveLength(1);
    expect(evoluInputs[0]).toEqual({
      type: "Mutate",
      changes: [
        {
          table: "todo",
          id: updateId,
          values: { title: "Updated" },
          isInsert: false,
          isDelete: true,
          ownerId: undefined,
        },
        {
          table: "todo",
          id: upsertId,
          values: { title: "Upserted" },
          isInsert: true,
          isDelete: null,
          ownerId: undefined,
        },
      ],
      onCompleteIds: [],
      subscribedQueries: [],
    });
  });

  test("coalesces insert, update, and upsert in one microtask", async () => {
    const { run, result, evoluInputs } = await setupCreateEvolu();
    await using _run = run;

    if (!result.ok) return;

    const updateId = TodoId.orThrow(createIdFromString("todo-batch-update"));
    const upsertId = TodoId.orThrow(createIdFromString("todo-batch-upsert"));

    result.value.insert("todo", { title: NonEmptyString100.orThrow("A") });
    result.value.update("todo", {
      id: updateId,
      title: NonEmptyString100.orThrow("B"),
    });
    result.value.upsert("todo", {
      id: upsertId,
      title: NonEmptyString100.orThrow("C"),
    });

    await Promise.resolve();

    expect(evoluInputs).toHaveLength(1);
    expect(evoluInputs[0]?.type).toBe("Mutate");
    expect(evoluInputs[0]?.changes).toHaveLength(3);
    expect(evoluInputs[0]?.changes[1]?.isInsert).toBe(false);
    expect(evoluInputs[0]?.changes[2]?.isInsert).toBe(true);
  });

  test("includes ownerId and onComplete callback ids", async () => {
    const { run, result, evoluInputs } = await setupCreateEvolu();
    await using _run = run;

    if (!result.ok) return;

    result.value.insert(
      "todo",
      { title: NonEmptyString100.orThrow("With callback") },
      { ownerId: testAppOwner.id, onComplete: lazyVoid },
    );

    await Promise.resolve();

    expect(evoluInputs).toHaveLength(1);
    expect(evoluInputs[0]?.changes[0]?.ownerId).toBe(testAppOwner.id);
    expect(evoluInputs[0]?.onCompleteIds).toHaveLength(1);
  });
});

// import { describe, expectTypeOf, test } from "vitest";
// import { createConsole } from "../../src/Console.js";
// import { constVoid } from "../../src/Function.js";
// import {
//   createDbWorkerForPlatform,
//   DbWorkerInput,
//   DbWorkerOutput,
// } from "../../src/local-first/Db.js";
// import { createEvolu } from "../../src/local-first/Evolu.js";
// import {
//   ValidateColumnTypes,
//   ValidateIdColumnType,
//   ValidateNoSystemColumns,
//   ValidateSchemaHasId,
// } from "../../src/local-first/Schema.js";
// import { getOrThrow } from "../../src/Result.js";
// import { createSqlite, SqliteBoolean } from "../../src/Sqlite.js";
// import {
//   Boolean,
//   id,
//   InferType,
//   maxLength,
//   NonEmptyString,
//   nullOr,
//   Name,
// } from "../../src/Type.js";
// import {
//   testCreateDummyWebSocket,
//   testCreateSqliteDriver,
//   testRandom,
//   testRandomBytes,
//   testName,
//   testTime,

// const TodoId = id("Todo");
// type TodoId = InferType<typeof TodoId>;

// const TodoCategoryId = id("TodoCategory");
// type TodoCategoryId = InferType<typeof TodoCategoryId>;

// const NonEmptyString50 = maxLength(50)(NonEmptyString);
// type NonEmptyString50 = InferType<typeof NonEmptyString50>;

// const Schema = {
//   todo: {
//     id: TodoId,
//     title: NonEmptyString50,
//     isCompleted: nullOr(SqliteBoolean),
//     categoryId: nullOr(TodoCategoryId),
//   },
//   todoCategory: {
//     id: TodoCategoryId,
//     name: NonEmptyString50,
//   },
// };

// const testCreateEvolu = async (options?: {
//   onInit?: (postMessageCalls: ReadonlyArray<DbWorkerInput>) => void;
// }) => {
//   const { deps, postMessageCalls, instanceName, getOnMessageCallback } =
//     await testCreateEvoluDeps();

//   const evolu = createEvolu(deps)(Schema, {
//     name: instanceName,
//   });

//   if (options?.onInit) options.onInit(postMessageCalls);
//   postMessageCalls.length = 0;

//   const allTodosQuery = evolu.createQuery((db) =>
//     db.selectFrom("todo").selectAll(),
//   );

//   return {
//     evolu,
//     postMessageCalls,
//     allTodosQuery,
//     getOnMessageCallback,
//   };
// };

// let testInstanceCounter = 0;

// const testCreateEvoluDeps = async () => {
//   const instanceName = Name.orThrow(`Test${testInstanceCounter++}`);
//   // We eagerly create a SqliteDriver instance so we can use it for SQL tests.
//   const sqliteDriver = await testCreateSqliteDriver(instanceName);
//   const createSqliteDriver = () => Promise.resolve(sqliteDriver);

//   const postMessageCalls: Array<DbWorkerInput> = [];
//   let onMessageCallback: ((message: DbWorkerOutput) => void) | undefined;

//   const innerDbWorker = createDbWorkerForPlatform({
//     console: createConsole(),
//     createSqliteDriver,
//     createWebSocket: testCreateDummyWebSocket,
//     random: testRandom,
//     randomBytes: testRandomBytes,
//     time: testTime,
//   });

//   const deps = {
//     console: createConsole(),
//     createDbWorker: () => ({
//       onMessage: (callback: (message: DbWorkerOutput) => void) => {
//         onMessageCallback = callback;
//         innerDbWorker.onMessage(callback);
//       },
//       postMessage: (
//         message: Parameters<typeof innerDbWorker.postMessage>[0],
//       ) => {
//         postMessageCalls.push(message);
//         innerDbWorker.postMessage(message);
//       },
//     }),
//     randomBytes: testRandomBytes,
//     reloadApp: constVoid,
//     time: testTime,
//   };

//   const sqlite = getOrThrow(
//     await createSqlite({ createSqliteDriver })(instanceName),
//   );

//   return {
//     instanceName,
//     deps,
//     postMessageCalls,
//     sqlite,
//     innerDbWorker,
//     getOnMessageCallback: () => onMessageCallback,
//   };
// };

// describe("createEvolu schema validation", () => {
//   test("schema without id column", async () => {
//     const { deps } = await testCreateEvoluDeps();

//     const SchemaWithoutId = {
//       todo: {
//         // Missing id column - should cause TypeScript error
//         title: NonEmptyString50,
//       },
//     };

//     // Type-level assertion for the exact error message
//     type ValidationResult = ValidateSchemaHasId<typeof SchemaWithoutId>;
//     expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" is missing required id column.'>();

//     // @ts-expect-error - Schema validation should catch missing id column
//     createEvolu(deps)(SchemaWithoutId, {
//       name: testName,
//     });
//   });

//   test("schema with system column createdAt", async () => {
//     const { deps } = await testCreateEvoluDeps();

//     const SchemaWithDefaultColumn = {
//       todo: {
//         id: TodoId,
//         createdAt: NonEmptyString50,
//       },
//     };

//     // Type-level assertion for the exact error message
//     type ValidationResult = ValidateNoSystemColumns<
//       typeof SchemaWithDefaultColumn
//     >;
//     expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "createdAt". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();

//     // @ts-expect-error - Schema validation should catch system column name
//     createEvolu(deps)(SchemaWithDefaultColumn, {
//       name: testName,
//     });
//   });

//   test("schema with system column updatedAt", async () => {
//     const { deps } = await testCreateEvoluDeps();

//     const SchemaWithDefaultColumn = {
//       todo: {
//         id: TodoId,
//         updatedAt: NonEmptyString50,
//       },
//     };

//     // Type-level assertion for the exact error message
//     type ValidationResult = ValidateNoSystemColumns<
//       typeof SchemaWithDefaultColumn
//     >;
//     expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "updatedAt". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();

//     // @ts-expect-error - Schema validation should catch system column name
//     createEvolu(deps)(SchemaWithDefaultColumn, {
//       name: testName,
//     });
//   });

//   test("schema with system column isDeleted", async () => {
//     const { deps } = await testCreateEvoluDeps();

//     const SchemaWithDefaultColumn = {
//       todo: {
//         id: TodoId,
//         isDeleted: NonEmptyString50,
//       },
//     };

//     // Type-level assertion for the exact error message
//     type ValidationResult = ValidateNoSystemColumns<
//       typeof SchemaWithDefaultColumn
//     >;
//     expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "isDeleted". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();

//     // @ts-expect-error - Schema validation should catch system column name
//     createEvolu(deps)(SchemaWithDefaultColumn, {
//       name: testName,
//     });
//   });

//   test("schema with system column ownerId", async () => {
//     const { deps } = await testCreateEvoluDeps();

//     const SchemaWithDefaultColumn = {
//       todo: {
//         id: TodoId,
//         ownerId: NonEmptyString50,
//       },
//     };

//     // Type-level assertion for the exact error message
//     type ValidationResult = ValidateNoSystemColumns<
//       typeof SchemaWithDefaultColumn
//     >;
//     expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "ownerId". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();

//     // @ts-expect-error - Schema validation should catch system column name
//     createEvolu(deps)(SchemaWithDefaultColumn, {
//       name: testName,
//     });
//   });

//   test("schema with non-branded id column", async () => {
//     const { deps } = await testCreateEvoluDeps();

//     const SchemaWithInvalidId = {
//       todo: {
//         id: NonEmptyString50,
//         title: NonEmptyString50,
//       },
//     };

//     // Type-level assertion for the exact error message
//     type ValidationResult = ValidateIdColumnType<typeof SchemaWithInvalidId>;
//     expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" id column must be a branded ID type (created with id("todo")).'>();

//     // @ts-expect-error - Schema validation should catch non-branded id column
//     createEvolu(deps)(SchemaWithInvalidId, {
//       name: testName,
//     });
//   });

//   test("schema with incompatible column type", async () => {
//     const { deps } = await testCreateEvoluDeps();

//     const SchemaWithInvalidType = {
//       todo: {
//         id: TodoId,
//         title: NonEmptyString50,
//         invalidColumn: Boolean, // Boolean is not compatible with SQLite
//       },
//     };

//     // Type-level assertion for the exact error message
//     type ValidationResult = ValidateColumnTypes<typeof SchemaWithInvalidType>;
//     expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" column "invalidColumn" type is not compatible with SQLite. Column types must extend SqliteValue (string, number, Uint8Array, or null).'>();

//     // @ts-expect-error - Schema validation should catch incompatible column type
//     createEvolu(deps)(SchemaWithInvalidType, {
//       name: testName,
//     });
//   });
// });

// describe("createQuery type inference", () => {
//   test("Query.Row infers correct types for simple selectAll", async () => {
//     const { evolu } = await testCreateEvolu();

//     const _allTodosQuery = evolu.createQuery((db) =>
//       db.selectFrom("todo").selectAll(),
//     );

//     type AllTodosRow = typeof _allTodosQuery.Row;

//     // Verify the Row type has the correct shape including user-defined columns
//     expectTypeOf<AllTodosRow>().toExtend<{
//       readonly id: TodoId;
//       readonly title: NonEmptyString50 | null;
//       readonly isCompleted: SqliteBoolean | null;
//       readonly categoryId: TodoCategoryId | null;
//     }>();

//     // Verify system columns are included
//     expectTypeOf<AllTodosRow>().toHaveProperty("createdAt");
//     expectTypeOf<AllTodosRow>().toHaveProperty("updatedAt");
//     expectTypeOf<AllTodosRow>().toHaveProperty("isDeleted");
//     expectTypeOf<AllTodosRow>().toHaveProperty("ownerId");
//   });

//   test("Query.Row infers correct types for select with specific columns", async () => {
//     const { evolu } = await testCreateEvolu();

//     const _todoTitlesQuery = evolu.createQuery((db) =>
//       db.selectFrom("todo").select(["id", "title"]),
//     );

//     type TodoTitlesRow = typeof _todoTitlesQuery.Row;

//     // Should only have selected columns
//     expectTypeOf<TodoTitlesRow["id"]>().toEqualTypeOf<TodoId>();
//     expectTypeOf<
//       TodoTitlesRow["title"]
//     >().toEqualTypeOf<NonEmptyString50 | null>();
//   });

//   test("Query.Row infers correct types for table with foreign key", async () => {
//     const { evolu } = await testCreateEvolu();

//     const _todosWithCategoryQuery = evolu.createQuery((db) =>
//       db.selectFrom("todo").select(["id", "title", "categoryId"]),
//     );

//     type TodosWithCategoryRow = typeof _todosWithCategoryQuery.Row;

//     expectTypeOf<TodosWithCategoryRow["id"]>().toEqualTypeOf<TodoId>();
//     expectTypeOf<
//       TodosWithCategoryRow["title"]
//     >().toEqualTypeOf<NonEmptyString50 | null>();
//     expectTypeOf<
//       TodosWithCategoryRow["categoryId"]
//     >().toEqualTypeOf<TodoCategoryId | null>();
//   });

//   test("Query.Row infers correct types for different table", async () => {
//     const { evolu } = await testCreateEvolu();

//     const _categoriesQuery = evolu.createQuery((db) =>
//       db.selectFrom("todoCategory").select(["id", "name"]),
//     );

//     type CategoriesRow = typeof _categoriesQuery.Row;

//     expectTypeOf<CategoriesRow["id"]>().toEqualTypeOf<TodoCategoryId>();
//     expectTypeOf<
//       CategoriesRow["name"]
//     >().toEqualTypeOf<NonEmptyString50 | null>();
//   });

//   test("Query.Row infers correct types with $narrowType", async () => {
//     const { evolu } = await testCreateEvolu();

//     const _nonNullTitlesQuery = evolu.createQuery((db) =>
//       db
//         .selectFrom("todo")
//         .select(["id", "title"])
//         .where("title", "is not", null)
//         .$narrowType<{ title: NonEmptyString50 }>(),
//     );

//     type NonNullTitlesRow = typeof _nonNullTitlesQuery.Row;

//     // After $narrowType, title should not be nullable
//     expectTypeOf<NonNullTitlesRow["id"]>().toEqualTypeOf<TodoId>();
//     expectTypeOf<NonNullTitlesRow["title"]>().toEqualTypeOf<NonEmptyString50>();
//   });
// });

// // test("init", async () => {
// //   let postMessageCallsCalled = false;

// //   await testCreateEvolu({
// //     onInit: (postMessageCalls) => {
// //       postMessageCallsCalled = true;
// //       expect(postMessageCalls).toMatchInlineSnapshot(`
// //         [
// //           {
// //             "config": {
// //               "enableLogging": false,
// //               "maxDrift": 300000,
// //               "name": "Test7",
// //               "transports": [
// //                 {
// //                   "type": "WebSocket",
// //                   "url": "wss://free.evoluhq.com",
// //                 },
// //               ],
// //             },
// //             "dbSchema": {
// //               "indexes": [],
// //               "tables": {
// //                 "todo": Set {
// //                   "title",
// //                   "isCompleted",
// //                   "categoryId",
// //                 },
// //                 "todoCategory": Set {
// //                   "name",
// //                 },
// //               },
// //             },
// //             "type": "init",
// //           },
// //           {
// //             "type": "getAppOwner",
// //           },
// //         ]
// //       `);
// //     },
// //   });

// //   expect(postMessageCallsCalled).toBe(true);
// // });

// // test("externalAppOwner should use provided owner", async () => {
// //   const { instanceName, deps, sqlite } = await testCreateEvoluDeps();

// //   const externalAppOwner = createAppOwner(testOwnerSecret);

// //   createEvolu(deps)(Schema, {
// //     name: instanceName,
// //     externalAppOwner,
// //   });

// //   await wait("10ms")();

// //   const snapshot = getDbSnapshot({ sqlite });
// //   expect(snapshot).toMatchSnapshot();

// //   const configTable = snapshot.tables.find(
// //     (table) => table.name === "evolu_config",
// //   );
// //   expect(configTable?.rows[0].appOwnerId).toBe(externalAppOwner.id);
// // });

// // describe("mutations", () => {
// //   test("insert should validate and call postMessage", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     const invalidTodo = {
// //       title: "",
// //     };

// //     const invalidResult = evolu.insert("todo", invalidTodo);
// //     expect(invalidResult).toMatchInlineSnapshot(`
// //       {
// //         "error": {
// //           "reason": {
// //             "errors": {
// //               "title": {
// //                 "min": 1,
// //                 "type": "MinLength",
// //                 "value": "",
// //               },
// //             },
// //             "kind": "Props",
// //           },
// //           "type": "Object",
// //           "value": {
// //             "title": "",
// //           },
// //         },
// //         "ok": false,
// //       }
// //     `);

// //     // Wait for microtask queue to process (invalid mutation won't be sent)
// //     await Promise.resolve();

// //     expect(postMessageCalls).toHaveLength(0);

// //     const validTodo = {
// //       title: "Test Todo",
// //     };

// //     const validResult = evolu.insert("todo", validTodo);

// //     expect(validResult).toMatchInlineSnapshot(`
// //       {
// //         "ok": true,
// //         "value": {
// //           "id": "1XirdqSNyyoJfY1psc1W0Q",
// //         },
// //       }
// //     `);

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     expect(postMessageCalls).toMatchInlineSnapshot(`
// //       [
// //         {
// //           "changes": [
// //             {
// //               "id": "1XirdqSNyyoJfY1psc1W0Q",
// //               "isDelete": null,
// //               "isInsert": true,
// //               "ownerId": undefined,
// //               "table": "todo",
// //               "values": {
// //                 "title": "Test Todo",
// //               },
// //             },
// //           ],
// //           "onCompleteIds": [],
// //           "subscribedQueries": [],
// //           "tabId": "l7NvoJDLyCIlL8A1b4lblg",
// //           "type": "mutate",
// //         },
// //       ]
// //     `);
// //   });

// //   test("update should validate and call postMessage", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     const testId = testCreateId();

// //     const invalidUpdate = {
// //       title: "Updated Todo",
// //     };

// //     // @ts-expect-error - Testing runtime validation
// //     const invalidResult = evolu.update("todo", invalidUpdate);
// //     expect(invalidResult.ok).toBe(false);

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     expect(postMessageCalls).toHaveLength(0);

// //     const validUpdate = {
// //       id: testId,
// //       title: "Updated Todo",
// //     };

// //     const validResult = evolu.update("todo", validUpdate);

// //     expect(validResult).toMatchInlineSnapshot(`
// //       {
// //         "ok": true,
// //         "value": {
// //           "id": "clE52X3Xyxo0jShkCjrbjg",
// //         },
// //       }
// //     `);

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     expect(postMessageCalls).toMatchInlineSnapshot(`
// //       [
// //         {
// //           "changes": [
// //             {
// //               "id": "clE52X3Xyxo0jShkCjrbjg",
// //               "isDelete": null,
// //               "isInsert": false,
// //               "ownerId": undefined,
// //               "table": "todo",
// //               "values": {
// //                 "title": "Updated Todo",
// //               },
// //             },
// //           ],
// //           "onCompleteIds": [],
// //           "subscribedQueries": [],
// //           "tabId": "l7NvoJDLyCIlL8A1b4lblg",
// //           "type": "mutate",
// //         },
// //       ]
// //     `);
// //   });

// //   test("upsert should validate and call postMessage", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     const testId = testCreateId();

// //     const invalidUpsert = {
// //       id: testId,
// //       title: "",
// //     };

// //     const invalidResult = evolu.upsert("todo", invalidUpsert);
// //     expect(invalidResult.ok).toBe(false);

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     expect(postMessageCalls).toHaveLength(0);

// //     const validUpsert = {
// //       id: testId,
// //       title: "Upserted Todo",
// //     };

// //     const validResult = evolu.upsert("todo", validUpsert);

// //     expect(validResult).toMatchInlineSnapshot(`
// //       {
// //         "ok": true,
// //         "value": {
// //           "id": "_6EDjBwdU3ZCo-iXpJ29DQ",
// //         },
// //       }
// //     `);

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     expect(postMessageCalls).toMatchInlineSnapshot(`
// //       [
// //         {
// //           "changes": [
// //             {
// //               "id": "_6EDjBwdU3ZCo-iXpJ29DQ",
// //               "isDelete": null,
// //               "isInsert": true,
// //               "ownerId": undefined,
// //               "table": "todo",
// //               "values": {
// //                 "title": "Upserted Todo",
// //               },
// //             },
// //           ],
// //           "onCompleteIds": [],
// //           "subscribedQueries": [],
// //           "tabId": "l7NvoJDLyCIlL8A1b4lblg",
// //           "type": "mutate",
// //         },
// //       ]
// //     `);
// //   });

// //   test("mutations should be processed in microtask queue", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     // Queue multiple mutations
// //     evolu.insert("todo", { title: "Todo 1" });
// //     evolu.insert("todo", { title: "Todo 2" });
// //     evolu.insert("todo", { title: "Todo 3" });

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     // Only one postMessage call should happen with all changes
// //     expect(postMessageCalls).toHaveLength(1);
// //   });

// //   test("mutation with onlyValidate should not call postMessage", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     evolu.insert("todo", { title: "Validation only" }, { onlyValidate: true });

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     expect(postMessageCalls).toHaveLength(0);
// //   });

// //   test("mutations should fail as a transaction when any mutation fails", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     // Queue valid and invalid mutations
// //     evolu.insert("todo", { title: "Valid Todo" });
// //     evolu.insert("todo", { title: "" }); // Invalid - empty title
// //     evolu.insert("todo", { title: "Another Valid Todo" });

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     expect(postMessageCalls).toHaveLength(0);
// //   });
// // });

// // describe("queries", () => {
// //   test("loadQuery should return initial empty result", async () => {
// //     const { evolu, allTodosQuery } = await testCreateEvolu();

// //     const result = await evolu.loadQuery(allTodosQuery);

// //     expect(result).toMatchInlineSnapshot(`[]`);
// //   });

// //   test("loadQuery should cache promises for the same query", async () => {
// //     const { evolu, allTodosQuery } = await testCreateEvolu();

// //     const promise1 = evolu.loadQuery(allTodosQuery);
// //     const promise2 = evolu.loadQuery(allTodosQuery);

// //     // Same query should return the same promise instance
// //     expect(promise1).toBe(promise2);

// //     // Both should resolve to the same result
// //     const [result1, result2] = await Promise.all([promise1, promise2]);
// //     expect(result1).toBe(result2);
// //   });

// //   test("loadQuery should return inserted data", async () => {
// //     const { evolu, allTodosQuery } = await testCreateEvolu();

// //     const result = evolu.insert("todo", { title: "Test Todo" });
// //     expect(result.ok).toBe(true);

// //     const rows = await evolu.loadQuery(allTodosQuery);
// //     expect(rows.length).toBe(1);
// //     expect(rows[0]?.title).toBe("Test Todo");
// //   });

// //   test("loadQuery unsubscribed query should be released on mutation", async () => {
// //     const { evolu, postMessageCalls, allTodosQuery } = await testCreateEvolu();

// //     // Load query (creates promise in cache)
// //     const promise1 = evolu.loadQuery(allTodosQuery);
// //     await promise1;

// //     // Clear to track only what happens after initial load
// //     postMessageCalls.length = 0;

// //     // Mutate (should release unsubscribed queries from cache)
// //     evolu.insert("todo", { title: "Test Todo" });

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     // Should have 1 mutate call
// //     expect(postMessageCalls).toHaveLength(1);
// //     expect(postMessageCalls[0]?.type).toBe("mutate");

// //     // Load again - cache was released, so this sends a NEW query to worker
// //     const promise2 = evolu.loadQuery(allTodosQuery);

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     // Now should have 2 calls: mutate + new query
// //     expect(postMessageCalls).toHaveLength(2);
// //     expect(postMessageCalls[1]?.type).toBe("query");

// //     // Promise is different because cache was released
// //     expect(promise1).not.toBe(promise2);
// //   });

// //   test("loadQuery subscribed query should not be released on mutation", async () => {
// //     const { evolu, postMessageCalls, allTodosQuery } = await testCreateEvolu();

// //     const promise1 = evolu.loadQuery(allTodosQuery);
// //     await promise1;

// //     evolu.subscribeQuery(allTodosQuery)(constVoid);

// //     // Clear previous calls to track only what happens after subscription
// //     postMessageCalls.length = 0;

// //     // Mutate (should NOT release subscribed queries from cache)
// //     evolu.insert("todo", { title: "Test Todo" });

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     // Should have 1 mutate call
// //     expect(postMessageCalls).toHaveLength(1);
// //     expect(postMessageCalls[0]?.type).toBe("mutate");

// //     // Load again - cache entry stays, so NO new query postMessage
// //     const promise2 = evolu.loadQuery(allTodosQuery);

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     // Still only 1 call (the mutation) - no new query was sent to worker
// //     expect(postMessageCalls).toHaveLength(1);

// //     // Check the value property that React's use() reads (not await result)
// //     expect(promise1).toMatchInlineSnapshot(`
// //       Promise {
// //         "status": "fulfilled",
// //         "value": [],
// //       }
// //     `);
// //     expect(promise2).toMatchInlineSnapshot(`
// //       Promise {
// //         "status": "fulfilled",
// //         "value": [
// //           {
// //             "categoryId": null,
// //             "createdAt": "1970-01-01T00:00:00.008Z",
// //             "id": "EXqDJoTfofrVXy_-hTIKow",
// //             "isCompleted": null,
// //             "isDeleted": null,
// //             "ownerId": "O-CuBGc9kBPdNNkVCKM1uA",
// //             "title": "Test Todo",
// //             "updatedAt": null,
// //           },
// //         ],
// //       }
// //     `);
// //   });

// //   test("loadQuery pending unsubscribed query should be released after resolve", async () => {
// //     const { evolu, postMessageCalls, allTodosQuery } = await testCreateEvolu();

// //     // Load query - creates pending promise in cache
// //     const promise1 = evolu.loadQuery(allTodosQuery);

// //     // Mutate BEFORE promise1 resolves. releaseUnsubscribedOnMutation() runs
// //     // but can't delete the pending promise (would break promise resolution).
// //     evolu.insert("todo", { title: "Test Todo" });

// //     // Wait for query to resolve - when resolve() runs, it checks releaseOnResolve
// //     // flag and deletes the cache entry after fulfilling the promise
// //     await promise1;

// //     postMessageCalls.length = 0;

// //     // Load again - cache entry was deleted, so this sends a NEW query
// //     const promise2 = evolu.loadQuery(allTodosQuery);

// //     // Wait for microtask queue to process
// //     await Promise.resolve();

// //     // Verify new query was sent to worker (cache was released)
// //     expect(postMessageCalls).toHaveLength(1);
// //     expect(postMessageCalls[0]?.type).toBe("query");

// //     expect(promise1).not.toBe(promise2);

// //     // Check the value property that React's use() reads (not await result)
// //     expect(promise1).toMatchInlineSnapshot(`
// //       Promise {
// //         "status": "fulfilled",
// //         "value": [],
// //       }
// //     `);
// //     expect(promise2).toMatchInlineSnapshot(`
// //       Promise {
// //         "status": "fulfilled",
// //         "value": [
// //           {
// //             "categoryId": null,
// //             "createdAt": "1970-01-01T00:00:00.009Z",
// //             "id": "V9jl1rlzsDtroJAB4SK5Bg",
// //             "isCompleted": null,
// //             "isDeleted": null,
// //             "ownerId": "eE5PP1qED8YN2k3_gFg8Zw",
// //             "title": "Test Todo",
// //             "updatedAt": null,
// //           },
// //         ],
// //       }
// //     `);
// //   });
// // });

// // describe("subscribeQuery and getQueryRows", () => {
// //   test("getQueryRows should return empty rows initially", async () => {
// //     const { evolu, allTodosQuery } = await testCreateEvolu();

// //     const rows = evolu.getQueryRows(allTodosQuery);

// //     expect(rows).toMatchInlineSnapshot(`[]`);
// //   });

// //   test("getQueryRows should return data after loadQuery", async () => {
// //     const { evolu, allTodosQuery } = await testCreateEvolu();

// //     evolu.insert("todo", { title: "Test Todo" });
// //     await evolu.loadQuery(allTodosQuery);

// //     const rows = evolu.getQueryRows(allTodosQuery);

// //     expect(rows).toHaveLength(1);
// //     expect(rows[0]?.title).toBe("Test Todo");
// //   });

// //   test("subscribeQuery should call listener when data changes", async () => {
// //     const { evolu, allTodosQuery } = await testCreateEvolu();

// //     let callCount = 0;
// //     const unsubscribe = evolu.subscribeQuery(allTodosQuery)(() => {
// //       callCount++;
// //     });

// //     // Initial subscription should not call listener
// //     expect(callCount).toBe(0);

// //     // Insert and load - should trigger listener
// //     evolu.insert("todo", { title: "Test Todo" });
// //     await evolu.loadQuery(allTodosQuery);

// //     expect(callCount).toBe(1);

// //     unsubscribe();
// //   });

// //   test("subscribeQuery should not call listener if result unchanged", async () => {
// //     const { evolu, allTodosQuery } = await testCreateEvolu();

// //     let callCount = 0;
// //     const unsubscribe = evolu.subscribeQuery(allTodosQuery)(() => {
// //       callCount++;
// //     });

// //     // Load initial data
// //     await evolu.loadQuery(allTodosQuery);

// //     expect(callCount).toBe(1);

// //     // Load again - same result, should not call listener
// //     await evolu.loadQuery(allTodosQuery);

// //     expect(callCount).toBe(1);

// //     unsubscribe();
// //   });

// //   test("subscribeQuery listener should see updated data via getQueryRows", async () => {
// //     const { evolu, allTodosQuery } = await testCreateEvolu();

// //     const results: Array<number> = [];
// //     const unsubscribe = evolu.subscribeQuery(allTodosQuery)(() => {
// //       const rows = evolu.getQueryRows(allTodosQuery);
// //       results.push(rows.length);
// //     });

// //     // Insert first todo
// //     evolu.insert("todo", { title: "First Todo" });
// //     await evolu.loadQuery(allTodosQuery);

// //     // Insert second todo
// //     evolu.insert("todo", { title: "Second Todo" });
// //     await evolu.loadQuery(allTodosQuery);

// //     expect(results).toEqual([1, 2]);

// //     unsubscribe();
// //   });

// //   test("unsubscribe should stop calling listener", async () => {
// //     const { evolu, allTodosQuery } = await testCreateEvolu();

// //     let callCount = 0;
// //     const unsubscribe = evolu.subscribeQuery(allTodosQuery)(() => {
// //       callCount++;
// //     });

// //     // First mutation - listener should be called
// //     evolu.insert("todo", { title: "First Todo" });
// //     await evolu.loadQuery(allTodosQuery);

// //     expect(callCount).toBe(1);

// //     unsubscribe();

// //     // Second mutation - listener should NOT be called
// //     evolu.insert("todo", { title: "Second Todo" });
// //     await evolu.loadQuery(allTodosQuery);

// //     expect(callCount).toBe(1);
// //   });
// // });

// // describe("refreshQueries", () => {
// //   /**
// //    * This is not an ideal test; we should run Evolu in a browser with React
// //    * useQuery to detect a condition when a component is suspended via loadQuery,
// //    * so useQuerySubscription is not yet called, but refreshQueries is, so
// //    * subscribedQueries is empty, but loadingPromisesQueries is not. The problem
// //    * is that the React component is rendered with stale data which are not
// //    * updated. Using loadingPromisesQueries in refreshQueries fixes that.
// //    *
// //    * Manual test: Open EvoluMinimalExample, close browser dev tools (yes), and
// //    * restore account. Without using loadingPromisesQueries in refreshQueries,
// //    * React will render stale data, but when we click into the input and write
// //    * something, the UI is immediately updated with actual data. It's happening
// //    * in all browsers, and NOT happening when dev tools are open. This race
// //    * condition is hard to simulate in Node.js, probably because we don't have an
// //    * async DB worker.
// //    */
// //   test("refreshQueries includes pending loadQuery queries", async () => {
// //     const { evolu, postMessageCalls, allTodosQuery, getOnMessageCallback } =
// //       await testCreateEvolu();

// //     // Start a loadQuery - this creates a pending promise but DON'T await it yet
// //     void evolu.loadQuery(allTodosQuery);

// //     // Wait for the microtask to execute so the query is sent
// //     await Promise.resolve();

// //     // Verify initial query was sent
// //     expect(postMessageCalls).toHaveLength(1);
// //     expect(postMessageCalls[0]).toMatchObject({
// //       type: "query",
// //       queries: [allTodosQuery],
// //     });

// //     postMessageCalls.length = 0;

// //     const handler = getOnMessageCallback();
// //     assert(handler, "getOnMessageCallback");

// //     // Directly call Evolu's message handler with refreshQueries.
// //     // This simulates what happens when sync data arrives.
// //     handler({ type: "refreshQueries" });

// //     await Promise.resolve();

// //     const queryMessages = postMessageCalls.filter(
// //       (call) => call.type === "query",
// //     );

// //     expect(queryMessages.length).toBe(1);
// //     expect(queryMessages[0]?.queries).toContain(allTodosQuery);
// //   });

// //   test("refreshQueries includes subscribed queries", async () => {
// //     const { evolu, postMessageCalls, allTodosQuery, getOnMessageCallback } =
// //       await testCreateEvolu();

// //     const unsubscribe = evolu.subscribeQuery(allTodosQuery)(constVoid);

// //     await Promise.resolve();

// //     postMessageCalls.length = 0;

// //     const handler = getOnMessageCallback();
// //     assert(handler, "getOnMessageCallback");

// //     // Directly call Evolu's message handler with refreshQueries.
// //     // This simulates what happens when sync data arrives.
// //     handler({ type: "refreshQueries" });

// //     await Promise.resolve();

// //     const queryMessages = postMessageCalls.filter(
// //       (call) => call.type === "query",
// //     );

// //     expect(queryMessages.length).toBe(1);
// //     expect(queryMessages[0]?.queries).toContain(allTodosQuery);

// //     unsubscribe();
// //   });
// // });

// // describe("createdAt behavior", () => {
// //   test("insert should set createdAt to current time", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     const result = evolu.insert("todo", { title: "Test Todo" });
// //     expect(result).toMatchInlineSnapshot(`
// //       {
// //         "ok": true,
// //         "value": {
// //           "id": "p-twDTGK4YVi7ZZmiCi9TA",
// //         },
// //       }
// //     `);

// //     await Promise.resolve();

// //     expect(postMessageCalls).toMatchInlineSnapshot(`
// //       [
// //         {
// //           "changes": [
// //             {
// //               "id": "p-twDTGK4YVi7ZZmiCi9TA",
// //               "isDelete": null,
// //               "isInsert": true,
// //               "ownerId": undefined,
// //               "table": "todo",
// //               "values": {
// //                 "title": "Test Todo",
// //               },
// //             },
// //           ],
// //           "onCompleteIds": [],
// //           "subscribedQueries": [],
// //           "tabId": "l7NvoJDLyCIlL8A1b4lblg",
// //           "type": "mutate",
// //         },
// //       ]
// //     `);
// //   });

// //   test("upsert should set createdAt to current time", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     const testId = testCreateId();
// //     const result = evolu.upsert("todo", { id: testId, title: "Upserted Todo" });
// //     expect(result).toMatchInlineSnapshot(`
// //       {
// //         "ok": true,
// //         "value": {
// //           "id": "aVm9lRgGoF6038X2MlJ2Cw",
// //         },
// //       }
// //     `);

// //     await Promise.resolve();

// //     expect(postMessageCalls).toMatchInlineSnapshot(`
// //       [
// //         {
// //           "changes": [
// //             {
// //               "id": "aVm9lRgGoF6038X2MlJ2Cw",
// //               "isDelete": null,
// //               "isInsert": true,
// //               "ownerId": undefined,
// //               "table": "todo",
// //               "values": {
// //                 "title": "Upserted Todo",
// //               },
// //             },
// //           ],
// //           "onCompleteIds": [],
// //           "subscribedQueries": [],
// //           "tabId": "l7NvoJDLyCIlL8A1b4lblg",
// //           "type": "mutate",
// //         },
// //       ]
// //     `);
// //   });

// //   test("update should NOT set createdAt", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     const testId = testCreateId();
// //     const result = evolu.update("todo", { id: testId, title: "Updated Todo" });
// //     expect(result).toMatchInlineSnapshot(`
// //       {
// //         "ok": true,
// //         "value": {
// //           "id": "R8qs_iP8FEwYBfwzQ7o_Og",
// //         },
// //       }
// //     `);

// //     await Promise.resolve();

// //     expect(postMessageCalls).toMatchInlineSnapshot(`
// //       [
// //         {
// //           "changes": [
// //             {
// //               "id": "R8qs_iP8FEwYBfwzQ7o_Og",
// //               "isDelete": null,
// //               "isInsert": false,
// //               "ownerId": undefined,
// //               "table": "todo",
// //               "values": {
// //                 "title": "Updated Todo",
// //               },
// //             },
// //           ],
// //           "onCompleteIds": [],
// //           "subscribedQueries": [],
// //           "tabId": "l7NvoJDLyCIlL8A1b4lblg",
// //           "type": "mutate",
// //         },
// //       ]
// //     `);
// //   });
// // });

// // describe("useOwner", () => {
// //   const ownerMessage = (owner: SyncOwner, use: boolean) => ({
// //     type: "useOwner",
// //     owner,
// //     use,
// //   });

// //   test("single useOwner call", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     evolu.useOwner(testOwner);

// //     await Promise.resolve();

// //     expect(postMessageCalls).toHaveLength(1);
// //     expect(postMessageCalls[0]).toEqual(ownerMessage(testOwner, true));
// //   });

// //   test("multiple useOwner calls for same owner preserves count", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     // Each call should result in a separate postMessage for reference counting
// //     evolu.useOwner(testOwner);
// //     evolu.useOwner(testOwner);
// //     evolu.useOwner(testOwner);

// //     await Promise.resolve();

// //     expect(postMessageCalls).toHaveLength(3);
// //     for (let i = 0; i < 3; i++) {
// //       expect(postMessageCalls[i]).toEqual(ownerMessage(testOwner, true));
// //     }
// //   });

// //   test("exact use/unuse pair cancels out", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     // Add testOwner, then remove it - should cancel out
// //     const unuse1 = evolu.useOwner(testOwner);
// //     unuse1();

// //     queueMicrotask(() => {
// //       expect(postMessageCalls).toHaveLength(0);
// //     });

// //     await Promise.resolve();
// //   });

// //   test("multiple exact pairs cancel out", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     // Two separate use/unuse pairs - both should cancel out
// //     const unuse1 = evolu.useOwner(testOwner);
// //     const unuse2 = evolu.useOwner(testOwner);
// //     unuse1();
// //     unuse2();

// //     queueMicrotask(() => {
// //       expect(postMessageCalls).toHaveLength(0);
// //     });

// //     await Promise.resolve();
// //   });

// //   test("partial pairs leave remainder", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     // Three uses, one unuse - should result in two remaining uses
// //     evolu.useOwner(testOwner);
// //     evolu.useOwner(testOwner);
// //     const unuse3 = evolu.useOwner(testOwner);
// //     unuse3();

// //     await Promise.resolve();

// //     expect(postMessageCalls).toHaveLength(2);
// //     for (let i = 0; i < 2; i++) {
// //       expect(postMessageCalls[i]).toEqual(ownerMessage(testOwner, true));
// //     }
// //   });

// //   test("different owners don't interfere", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     // Different owners should not cancel each other
// //     evolu.useOwner(testOwner);
// //     const unuse2 = evolu.useOwner(testOwner2);
// //     unuse2();

// //     await Promise.resolve();

// //     expect(postMessageCalls).toHaveLength(1);
// //     expect(postMessageCalls[0]).toEqual(ownerMessage(testOwner, true));
// //   });

// //   test("order preservation with mixed operations", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     // Mixed operations: use, use, unuse, use
// //     // Should cancel one pair and leave: use, use
// //     evolu.useOwner(testOwner); // use #1
// //     const unuse2 = evolu.useOwner(testOwner); // use #2
// //     unuse2(); // unuse (cancels with use #2)
// //     evolu.useOwner(testOwner); // use #3

// //     await Promise.resolve();

// //     expect(postMessageCalls).toHaveLength(2);
// //     for (let i = 0; i < 2; i++) {
// //       expect(postMessageCalls[i]).toEqual(ownerMessage(testOwner, true));
// //     }
// //   });

// //   test("remove before add - processed owner requires explicit remove", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     // Add owner and wait for it to be processed
// //     const unuse1 = evolu.useOwner(testOwner);

// //     await Promise.resolve();

// //     // Verify it was added
// //     expect(postMessageCalls).toHaveLength(1);
// //     expect(postMessageCalls[0]).toEqual(ownerMessage(testOwner, true));

// //     postMessageCalls.length = 0; // Clear previous calls

// //     // Now remove and immediately add again
// //     unuse1(); // Remove
// //     evolu.useOwner(testOwner); // Add again

// //     await Promise.resolve();

// //     // Should result in no calls since remove/add cancel out
// //     expect(postMessageCalls).toHaveLength(0);
// //   });

// //   test("delayed unuse call is processed", async () => {
// //     const { evolu, postMessageCalls } = await testCreateEvolu();

// //     const unuse = evolu.useOwner(testOwner);

// //     await Promise.resolve();
// //     expect(postMessageCalls).toHaveLength(1);
// //     expect(postMessageCalls[0]).toEqual(ownerMessage(testOwner, true));

// //     postMessageCalls.length = 0; // Clear previous calls

// //     // Delayed unuse without any subsequent useOwner calls
// //     setTimeout(() => {
// //       unuse();
// //     }, 10);

// //     await wait("20ms")();

// //     expect(postMessageCalls).toHaveLength(1);
// //     expect(postMessageCalls[0]).toEqual(ownerMessage(testOwner, false));
// //   });
// // });
