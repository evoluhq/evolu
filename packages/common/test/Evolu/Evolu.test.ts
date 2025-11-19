import { describe, expect, expectTypeOf, test } from "vitest";
import { assert } from "../../src/Assert.js";
import { createConsole } from "../../src/Console.js";
import {
  createDbWorkerForPlatform,
  DbWorkerInput,
  DbWorkerOutput,
} from "../../src/Evolu/Db.js";
import { createEvolu } from "../../src/Evolu/Evolu.js";
import { createAppOwner } from "../../src/Evolu/Owner.js";
import {
  ValidateColumnTypes,
  ValidateIdColumnType,
  ValidateNoSystemColumns,
  ValidateSchemaHasId,
} from "../../src/Evolu/Schema.js";
import { SyncOwner } from "../../src/Evolu/Sync.js";
import { constVoid } from "../../src/Function.js";
import { getOrThrow } from "../../src/Result.js";
import { createSqlite, SqliteBoolean } from "../../src/Sqlite.js";
import { wait } from "../../src/Task.js";
import {
  Boolean,
  id,
  InferType,
  maxLength,
  NonEmptyString,
  nullOr,
  SimpleName,
} from "../../src/Type.js";
import {
  testCreateDummyWebSocket,
  testCreateId,
  testCreateSqliteDriver,
  testOwner,
  testOwner2,
  testOwnerSecret,
  testRandom,
  testRandomBytes,
  testSimpleName,
  testTime,
} from "../_deps.js";
import { getDbSnapshot } from "./_utils.js";

const TodoId = id("Todo");
type TodoId = InferType<typeof TodoId>;

const TodoCategoryId = id("TodoCategory");
type TodoCategoryId = InferType<typeof TodoCategoryId>;

const NonEmptyString50 = maxLength(50)(NonEmptyString);
type NonEmptyString50 = InferType<typeof NonEmptyString50>;

const Schema = {
  todo: {
    id: TodoId,
    title: NonEmptyString50,
    isCompleted: nullOr(SqliteBoolean),
    categoryId: nullOr(TodoCategoryId),
  },
  todoCategory: {
    id: TodoCategoryId,
    name: NonEmptyString50,
  },
};

const testCreateEvolu = async (options?: {
  onInit?: (postMessageCalls: ReadonlyArray<DbWorkerInput>) => void;
}) => {
  const { deps, postMessageCalls, instanceName, getOnMessageCallback } =
    await testCreateEvoluDeps();

  const evolu = createEvolu(deps)(Schema, {
    name: instanceName,
  });

  if (options?.onInit) options.onInit(postMessageCalls);
  postMessageCalls.length = 0;

  const allTodosQuery = evolu.createQuery((db) =>
    db.selectFrom("todo").selectAll(),
  );

  return {
    evolu,
    postMessageCalls,
    allTodosQuery,
    getOnMessageCallback,
  };
};

let testInstanceCounter = 0;

const testCreateEvoluDeps = async () => {
  const instanceName = SimpleName.orThrow(`Test${testInstanceCounter++}`);
  // We eagerly create a SqliteDriver instance so we can use it for SQL tests.
  const sqliteDriver = await testCreateSqliteDriver(instanceName);
  const createSqliteDriver = () => Promise.resolve(sqliteDriver);

  const postMessageCalls: Array<DbWorkerInput> = [];
  let onMessageCallback: ((message: DbWorkerOutput) => void) | undefined;

  const innerDbWorker = createDbWorkerForPlatform({
    console: createConsole(),
    createSqliteDriver,
    createWebSocket: testCreateDummyWebSocket,
    random: testRandom,
    randomBytes: testRandomBytes,
    time: testTime,
  });

  const deps = {
    console: createConsole(),
    createDbWorker: () => ({
      onMessage: (callback: (message: DbWorkerOutput) => void) => {
        onMessageCallback = callback;
        innerDbWorker.onMessage(callback);
      },
      postMessage: (
        message: Parameters<typeof innerDbWorker.postMessage>[0],
      ) => {
        postMessageCalls.push(message);
        innerDbWorker.postMessage(message);
      },
    }),
    randomBytes: testRandomBytes,
    reloadApp: constVoid,
    time: testTime,
  };

  const sqlite = getOrThrow(
    await createSqlite({ createSqliteDriver })(instanceName),
  );

  return {
    instanceName,
    deps,
    postMessageCalls,
    sqlite,
    innerDbWorker,
    getOnMessageCallback: () => onMessageCallback,
  };
};

describe("createEvolu schema validation", () => {
  test("schema without id column", async () => {
    const { deps } = await testCreateEvoluDeps();

    const SchemaWithoutId = {
      todo: {
        // Missing id column - should cause TypeScript error
        title: NonEmptyString50,
      },
    };

    // Type-level assertion for the exact error message
    type ValidationResult = ValidateSchemaHasId<typeof SchemaWithoutId>;
    expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" is missing required id column.'>();

    // @ts-expect-error - Schema validation should catch missing id column
    createEvolu(deps)(SchemaWithoutId, {
      name: testSimpleName,
    });
  });

  test("schema with system column createdAt", async () => {
    const { deps } = await testCreateEvoluDeps();

    const SchemaWithDefaultColumn = {
      todo: {
        id: TodoId,
        createdAt: NonEmptyString50,
      },
    };

    // Type-level assertion for the exact error message
    type ValidationResult = ValidateNoSystemColumns<
      typeof SchemaWithDefaultColumn
    >;
    expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "createdAt". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();

    // @ts-expect-error - Schema validation should catch system column name
    createEvolu(deps)(SchemaWithDefaultColumn, {
      name: testSimpleName,
    });
  });

  test("schema with system column updatedAt", async () => {
    const { deps } = await testCreateEvoluDeps();

    const SchemaWithDefaultColumn = {
      todo: {
        id: TodoId,
        updatedAt: NonEmptyString50,
      },
    };

    // Type-level assertion for the exact error message
    type ValidationResult = ValidateNoSystemColumns<
      typeof SchemaWithDefaultColumn
    >;
    expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "updatedAt". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();

    // @ts-expect-error - Schema validation should catch system column name
    createEvolu(deps)(SchemaWithDefaultColumn, {
      name: testSimpleName,
    });
  });

  test("schema with system column isDeleted", async () => {
    const { deps } = await testCreateEvoluDeps();

    const SchemaWithDefaultColumn = {
      todo: {
        id: TodoId,
        isDeleted: NonEmptyString50,
      },
    };

    // Type-level assertion for the exact error message
    type ValidationResult = ValidateNoSystemColumns<
      typeof SchemaWithDefaultColumn
    >;
    expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "isDeleted". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();

    // @ts-expect-error - Schema validation should catch system column name
    createEvolu(deps)(SchemaWithDefaultColumn, {
      name: testSimpleName,
    });
  });

  test("schema with system column ownerId", async () => {
    const { deps } = await testCreateEvoluDeps();

    const SchemaWithDefaultColumn = {
      todo: {
        id: TodoId,
        ownerId: NonEmptyString50,
      },
    };

    // Type-level assertion for the exact error message
    type ValidationResult = ValidateNoSystemColumns<
      typeof SchemaWithDefaultColumn
    >;
    expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "ownerId". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();

    // @ts-expect-error - Schema validation should catch system column name
    createEvolu(deps)(SchemaWithDefaultColumn, {
      name: testSimpleName,
    });
  });

  test("schema with non-branded id column", async () => {
    const { deps } = await testCreateEvoluDeps();

    const SchemaWithInvalidId = {
      todo: {
        id: NonEmptyString50,
        title: NonEmptyString50,
      },
    };

    // Type-level assertion for the exact error message
    type ValidationResult = ValidateIdColumnType<typeof SchemaWithInvalidId>;
    expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" id column must be a branded ID type (created with id("todo")).'>();

    // @ts-expect-error - Schema validation should catch non-branded id column
    createEvolu(deps)(SchemaWithInvalidId, {
      name: testSimpleName,
    });
  });

  test("schema with incompatible column type", async () => {
    const { deps } = await testCreateEvoluDeps();

    const SchemaWithInvalidType = {
      todo: {
        id: TodoId,
        title: NonEmptyString50,
        invalidColumn: Boolean, // Boolean is not compatible with SQLite
      },
    };

    // Type-level assertion for the exact error message
    type ValidationResult = ValidateColumnTypes<typeof SchemaWithInvalidType>;
    expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" column "invalidColumn" type is not compatible with SQLite. Column types must extend SqliteValue (string, number, Uint8Array, or null).'>();

    // @ts-expect-error - Schema validation should catch incompatible column type
    createEvolu(deps)(SchemaWithInvalidType, {
      name: testSimpleName,
    });
  });
});

test("init", async () => {
  let postMessageCallsCalled = false;

  await testCreateEvolu({
    onInit: (postMessageCalls) => {
      postMessageCallsCalled = true;
      expect(postMessageCalls).toMatchInlineSnapshot(`
        [
          {
            "config": {
              "enableLogging": false,
              "maxDrift": 300000,
              "name": "Test7",
              "transports": [
                {
                  "type": "WebSocket",
                  "url": "wss://free.evoluhq.com",
                },
              ],
            },
            "dbSchema": {
              "indexes": [],
              "tables": [
                {
                  "columns": [
                    "title",
                    "isCompleted",
                    "categoryId",
                  ],
                  "name": "todo",
                },
                {
                  "columns": [
                    "name",
                  ],
                  "name": "todoCategory",
                },
              ],
            },
            "type": "init",
          },
          {
            "type": "getAppOwner",
          },
        ]
      `);
    },
  });

  expect(postMessageCallsCalled).toBe(true);
});

test("externalAppOwner should use provided owner", async () => {
  const { instanceName, deps, sqlite } = await testCreateEvoluDeps();

  const externalAppOwner = createAppOwner(testOwnerSecret);

  createEvolu(deps)(Schema, {
    name: instanceName,
    externalAppOwner,
  });

  await wait("10ms")();

  const snapshot = getDbSnapshot({ sqlite });
  expect(snapshot).toMatchSnapshot();

  const configTable = snapshot.tables.find(
    (table) => table.name === "evolu_config",
  );
  expect(configTable?.rows[0].appOwnerId).toBe(externalAppOwner.id);
});

describe("mutations", () => {
  test("insert should validate and call postMessage", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    const invalidTodo = {
      title: "",
    };

    const invalidResult = evolu.insert("todo", invalidTodo);
    expect(invalidResult).toMatchInlineSnapshot(`
      {
        "error": {
          "reason": {
            "errors": {
              "title": {
                "min": 1,
                "type": "MinLength",
                "value": "",
              },
            },
            "kind": "Props",
          },
          "type": "Object",
          "value": {
            "title": "",
          },
        },
        "ok": false,
      }
    `);

    // Wait for microtask queue to process (invalid mutation won't be sent)
    await Promise.resolve();

    expect(postMessageCalls).toHaveLength(0);

    const validTodo = {
      title: "Test Todo",
    };

    const validResult = evolu.insert("todo", validTodo);

    expect(validResult).toMatchInlineSnapshot(`
      {
        "ok": true,
        "value": {
          "id": "1XirdqSNyyoJfY1psc1W0Q",
        },
      }
    `);

    // Wait for microtask queue to process
    await Promise.resolve();

    expect(postMessageCalls).toMatchInlineSnapshot(`
      [
        {
          "changes": [
            {
              "id": "1XirdqSNyyoJfY1psc1W0Q",
              "isDelete": null,
              "isInsert": true,
              "ownerId": undefined,
              "table": "todo",
              "values": {
                "title": "Test Todo",
              },
            },
          ],
          "onCompleteIds": [],
          "subscribedQueries": [],
          "tabId": "l7NvoJDLyCIlL8A1b4lblg",
          "type": "mutate",
        },
      ]
    `);
  });

  test("update should validate and call postMessage", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    const testId = testCreateId();

    const invalidUpdate = {
      title: "Updated Todo",
    };

    // @ts-expect-error - Testing runtime validation
    const invalidResult = evolu.update("todo", invalidUpdate);
    expect(invalidResult.ok).toBe(false);

    // Wait for microtask queue to process
    await Promise.resolve();

    expect(postMessageCalls).toHaveLength(0);

    const validUpdate = {
      id: testId,
      title: "Updated Todo",
    };

    const validResult = evolu.update("todo", validUpdate);

    expect(validResult).toMatchInlineSnapshot(`
      {
        "ok": true,
        "value": {
          "id": "clE52X3Xyxo0jShkCjrbjg",
        },
      }
    `);

    // Wait for microtask queue to process
    await Promise.resolve();

    expect(postMessageCalls).toMatchInlineSnapshot(`
      [
        {
          "changes": [
            {
              "id": "clE52X3Xyxo0jShkCjrbjg",
              "isDelete": null,
              "isInsert": false,
              "ownerId": undefined,
              "table": "todo",
              "values": {
                "title": "Updated Todo",
              },
            },
          ],
          "onCompleteIds": [],
          "subscribedQueries": [],
          "tabId": "l7NvoJDLyCIlL8A1b4lblg",
          "type": "mutate",
        },
      ]
    `);
  });

  test("upsert should validate and call postMessage", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    const testId = testCreateId();

    const invalidUpsert = {
      id: testId,
      title: "",
    };

    const invalidResult = evolu.upsert("todo", invalidUpsert);
    expect(invalidResult.ok).toBe(false);

    // Wait for microtask queue to process
    await Promise.resolve();

    expect(postMessageCalls).toHaveLength(0);

    const validUpsert = {
      id: testId,
      title: "Upserted Todo",
    };

    const validResult = evolu.upsert("todo", validUpsert);

    expect(validResult).toMatchInlineSnapshot(`
      {
        "ok": true,
        "value": {
          "id": "_6EDjBwdU3ZCo-iXpJ29DQ",
        },
      }
    `);

    // Wait for microtask queue to process
    await Promise.resolve();

    expect(postMessageCalls).toMatchInlineSnapshot(`
      [
        {
          "changes": [
            {
              "id": "_6EDjBwdU3ZCo-iXpJ29DQ",
              "isDelete": null,
              "isInsert": true,
              "ownerId": undefined,
              "table": "todo",
              "values": {
                "title": "Upserted Todo",
              },
            },
          ],
          "onCompleteIds": [],
          "subscribedQueries": [],
          "tabId": "l7NvoJDLyCIlL8A1b4lblg",
          "type": "mutate",
        },
      ]
    `);
  });

  test("mutations should be processed in microtask queue", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    // Queue multiple mutations
    evolu.insert("todo", { title: "Todo 1" });
    evolu.insert("todo", { title: "Todo 2" });
    evolu.insert("todo", { title: "Todo 3" });

    // Wait for microtask queue to process
    await Promise.resolve();

    // Only one postMessage call should happen with all changes
    expect(postMessageCalls).toHaveLength(1);
  });

  test("mutation with onlyValidate should not call postMessage", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    evolu.insert("todo", { title: "Validation only" }, { onlyValidate: true });

    // Wait for microtask queue to process
    await Promise.resolve();

    expect(postMessageCalls).toHaveLength(0);
  });

  test("mutations should fail as a transaction when any mutation fails", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    // Queue valid and invalid mutations
    evolu.insert("todo", { title: "Valid Todo" });
    evolu.insert("todo", { title: "" }); // Invalid - empty title
    evolu.insert("todo", { title: "Another Valid Todo" });

    // Wait for microtask queue to process
    await Promise.resolve();

    expect(postMessageCalls).toHaveLength(0);
  });
});

describe("queries", () => {
  test("loadQuery should return initial empty result", async () => {
    const { evolu, allTodosQuery } = await testCreateEvolu();

    const result = await evolu.loadQuery(allTodosQuery);

    expect(result).toMatchInlineSnapshot(`[]`);
  });

  test("loadQuery should cache promises for the same query", async () => {
    const { evolu, allTodosQuery } = await testCreateEvolu();

    const promise1 = evolu.loadQuery(allTodosQuery);
    const promise2 = evolu.loadQuery(allTodosQuery);

    // Same query should return the same promise instance
    expect(promise1).toBe(promise2);

    // Both should resolve to the same result
    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1).toBe(result2);
  });

  test("loadQuery should return inserted data", async () => {
    const { evolu, allTodosQuery } = await testCreateEvolu();

    const result = evolu.insert("todo", { title: "Test Todo" });
    expect(result.ok).toBe(true);

    const rows = await evolu.loadQuery(allTodosQuery);
    expect(rows.length).toBe(1);
    expect(rows[0]?.title).toBe("Test Todo");
  });

  test("loadQuery unsubscribed query should be released on mutation", async () => {
    const { evolu, postMessageCalls, allTodosQuery } = await testCreateEvolu();

    // Load query (creates promise in cache)
    const promise1 = evolu.loadQuery(allTodosQuery);
    await promise1;

    // Clear to track only what happens after initial load
    postMessageCalls.length = 0;

    // Mutate (should release unsubscribed queries from cache)
    evolu.insert("todo", { title: "Test Todo" });

    // Wait for microtask queue to process
    await Promise.resolve();

    // Should have 1 mutate call
    expect(postMessageCalls).toHaveLength(1);
    expect(postMessageCalls[0]?.type).toBe("mutate");

    // Load again - cache was released, so this sends a NEW query to worker
    const promise2 = evolu.loadQuery(allTodosQuery);

    // Wait for microtask queue to process
    await Promise.resolve();

    // Now should have 2 calls: mutate + new query
    expect(postMessageCalls).toHaveLength(2);
    expect(postMessageCalls[1]?.type).toBe("query");

    // Promise is different because cache was released
    expect(promise1).not.toBe(promise2);
  });

  test("loadQuery subscribed query should not be released on mutation", async () => {
    const { evolu, postMessageCalls, allTodosQuery } = await testCreateEvolu();

    const promise1 = evolu.loadQuery(allTodosQuery);
    await promise1;

    evolu.subscribeQuery(allTodosQuery)(constVoid);

    // Clear previous calls to track only what happens after subscription
    postMessageCalls.length = 0;

    // Mutate (should NOT release subscribed queries from cache)
    evolu.insert("todo", { title: "Test Todo" });

    // Wait for microtask queue to process
    await Promise.resolve();

    // Should have 1 mutate call
    expect(postMessageCalls).toHaveLength(1);
    expect(postMessageCalls[0]?.type).toBe("mutate");

    // Load again - cache entry stays, so NO new query postMessage
    const promise2 = evolu.loadQuery(allTodosQuery);

    // Wait for microtask queue to process
    await Promise.resolve();

    // Still only 1 call (the mutation) - no new query was sent to worker
    expect(postMessageCalls).toHaveLength(1);

    // Check the value property that React's use() reads (not await result)
    expect(promise1).toMatchInlineSnapshot(`
      Promise {
        "status": "fulfilled",
        "value": [],
      }
    `);
    expect(promise2).toMatchInlineSnapshot(`
      Promise {
        "status": "fulfilled",
        "value": [
          {
            "categoryId": null,
            "createdAt": "1970-01-01T00:00:00.008Z",
            "id": "EXqDJoTfofrVXy_-hTIKow",
            "isCompleted": null,
            "isDeleted": null,
            "ownerId": "O-CuBGc9kBPdNNkVCKM1uA",
            "title": "Test Todo",
            "updatedAt": "1970-01-01T00:00:00.008Z",
          },
        ],
      }
    `);
  });

  test("loadQuery pending unsubscribed query should be released after resolve", async () => {
    const { evolu, postMessageCalls, allTodosQuery } = await testCreateEvolu();

    // Load query - creates pending promise in cache
    const promise1 = evolu.loadQuery(allTodosQuery);

    // Mutate BEFORE promise1 resolves. releaseUnsubscribedOnMutation() runs
    // but can't delete the pending promise (would break promise resolution).
    evolu.insert("todo", { title: "Test Todo" });

    // Wait for query to resolve - when resolve() runs, it checks releaseOnResolve
    // flag and deletes the cache entry after fulfilling the promise
    await promise1;

    postMessageCalls.length = 0;

    // Load again - cache entry was deleted, so this sends a NEW query
    const promise2 = evolu.loadQuery(allTodosQuery);

    // Wait for microtask queue to process
    await Promise.resolve();

    // Verify new query was sent to worker (cache was released)
    expect(postMessageCalls).toHaveLength(1);
    expect(postMessageCalls[0]?.type).toBe("query");

    expect(promise1).not.toBe(promise2);

    // Check the value property that React's use() reads (not await result)
    expect(promise1).toMatchInlineSnapshot(`
      Promise {
        "status": "fulfilled",
        "value": [],
      }
    `);
    expect(promise2).toMatchInlineSnapshot(`
      Promise {
        "status": "fulfilled",
        "value": [
          {
            "categoryId": null,
            "createdAt": "1970-01-01T00:00:00.009Z",
            "id": "V9jl1rlzsDtroJAB4SK5Bg",
            "isCompleted": null,
            "isDeleted": null,
            "ownerId": "eE5PP1qED8YN2k3_gFg8Zw",
            "title": "Test Todo",
            "updatedAt": "1970-01-01T00:00:00.009Z",
          },
        ],
      }
    `);
  });
});

describe("subscribeQuery and getQueryRows", () => {
  test("getQueryRows should return empty rows initially", async () => {
    const { evolu, allTodosQuery } = await testCreateEvolu();

    const rows = evolu.getQueryRows(allTodosQuery);

    expect(rows).toMatchInlineSnapshot(`[]`);
  });

  test("getQueryRows should return data after loadQuery", async () => {
    const { evolu, allTodosQuery } = await testCreateEvolu();

    evolu.insert("todo", { title: "Test Todo" });
    await evolu.loadQuery(allTodosQuery);

    const rows = evolu.getQueryRows(allTodosQuery);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Test Todo");
  });

  test("subscribeQuery should call listener when data changes", async () => {
    const { evolu, allTodosQuery } = await testCreateEvolu();

    let callCount = 0;
    const unsubscribe = evolu.subscribeQuery(allTodosQuery)(() => {
      callCount++;
    });

    // Initial subscription should not call listener
    expect(callCount).toBe(0);

    // Insert and load - should trigger listener
    evolu.insert("todo", { title: "Test Todo" });
    await evolu.loadQuery(allTodosQuery);

    expect(callCount).toBe(1);

    unsubscribe();
  });

  test("subscribeQuery should not call listener if result unchanged", async () => {
    const { evolu, allTodosQuery } = await testCreateEvolu();

    let callCount = 0;
    const unsubscribe = evolu.subscribeQuery(allTodosQuery)(() => {
      callCount++;
    });

    // Load initial data
    await evolu.loadQuery(allTodosQuery);

    expect(callCount).toBe(1);

    // Load again - same result, should not call listener
    await evolu.loadQuery(allTodosQuery);

    expect(callCount).toBe(1);

    unsubscribe();
  });

  test("subscribeQuery listener should see updated data via getQueryRows", async () => {
    const { evolu, allTodosQuery } = await testCreateEvolu();

    const results: Array<number> = [];
    const unsubscribe = evolu.subscribeQuery(allTodosQuery)(() => {
      const rows = evolu.getQueryRows(allTodosQuery);
      results.push(rows.length);
    });

    // Insert first todo
    evolu.insert("todo", { title: "First Todo" });
    await evolu.loadQuery(allTodosQuery);

    // Insert second todo
    evolu.insert("todo", { title: "Second Todo" });
    await evolu.loadQuery(allTodosQuery);

    expect(results).toEqual([1, 2]);

    unsubscribe();
  });

  test("unsubscribe should stop calling listener", async () => {
    const { evolu, allTodosQuery } = await testCreateEvolu();

    let callCount = 0;
    const unsubscribe = evolu.subscribeQuery(allTodosQuery)(() => {
      callCount++;
    });

    // First mutation - listener should be called
    evolu.insert("todo", { title: "First Todo" });
    await evolu.loadQuery(allTodosQuery);

    expect(callCount).toBe(1);

    unsubscribe();

    // Second mutation - listener should NOT be called
    evolu.insert("todo", { title: "Second Todo" });
    await evolu.loadQuery(allTodosQuery);

    expect(callCount).toBe(1);
  });
});

describe("refreshQueries", () => {
  /**
   * This is not an ideal test; we should run Evolu in a browser with React
   * useQuery to detect a condition when a component is suspended via loadQuery,
   * so useQuerySubscription is not yet called, but refreshQueries is, so
   * subscribedQueries is empty, but loadingPromisesQueries is not. The problem
   * is that the React component is rendered with stale data which are not
   * updated. Using loadingPromisesQueries in refreshQueries fixes that.
   *
   * Manual test: Open EvoluMinimalExample, close browser dev tools (yes), and
   * restore account. Without using loadingPromisesQueries in refreshQueries,
   * React will render stale data, but when we click into the input and write
   * something, the UI is immediately updated with actual data. It's happening
   * in all browsers, and NOT happening when dev tools are open. This race
   * condition is hard to simulate in Node.js, probably because we don't have an
   * async DB worker.
   */
  test("refreshQueries includes pending loadQuery queries", async () => {
    const { evolu, postMessageCalls, allTodosQuery, getOnMessageCallback } =
      await testCreateEvolu();

    // Start a loadQuery - this creates a pending promise but DON'T await it yet
    void evolu.loadQuery(allTodosQuery);

    // Wait for the microtask to execute so the query is sent
    await Promise.resolve();

    // Verify initial query was sent
    expect(postMessageCalls).toHaveLength(1);
    expect(postMessageCalls[0]).toMatchObject({
      type: "query",
      queries: [allTodosQuery],
    });

    postMessageCalls.length = 0;

    const handler = getOnMessageCallback();
    assert(handler, "getOnMessageCallback");

    // Directly call Evolu's message handler with refreshQueries.
    // This simulates what happens when sync data arrives.
    handler({ type: "refreshQueries" });

    await Promise.resolve();

    const queryMessages = postMessageCalls.filter(
      (call) => call.type === "query",
    );

    expect(queryMessages.length).toBe(1);
    expect(queryMessages[0]?.queries).toContain(allTodosQuery);
  });

  test("refreshQueries includes subscribed queries", async () => {
    const { evolu, postMessageCalls, allTodosQuery, getOnMessageCallback } =
      await testCreateEvolu();

    const unsubscribe = evolu.subscribeQuery(allTodosQuery)(constVoid);

    await Promise.resolve();

    postMessageCalls.length = 0;

    const handler = getOnMessageCallback();
    assert(handler, "getOnMessageCallback");

    // Directly call Evolu's message handler with refreshQueries.
    // This simulates what happens when sync data arrives.
    handler({ type: "refreshQueries" });

    await Promise.resolve();

    const queryMessages = postMessageCalls.filter(
      (call) => call.type === "query",
    );

    expect(queryMessages.length).toBe(1);
    expect(queryMessages[0]?.queries).toContain(allTodosQuery);

    unsubscribe();
  });
});

describe("createdAt behavior", () => {
  test("insert should set createdAt to current time", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    const result = evolu.insert("todo", { title: "Test Todo" });
    expect(result).toMatchInlineSnapshot(`
      {
        "ok": true,
        "value": {
          "id": "p-twDTGK4YVi7ZZmiCi9TA",
        },
      }
    `);

    await Promise.resolve();

    expect(postMessageCalls).toMatchInlineSnapshot(`
      [
        {
          "changes": [
            {
              "id": "p-twDTGK4YVi7ZZmiCi9TA",
              "isDelete": null,
              "isInsert": true,
              "ownerId": undefined,
              "table": "todo",
              "values": {
                "title": "Test Todo",
              },
            },
          ],
          "onCompleteIds": [],
          "subscribedQueries": [],
          "tabId": "l7NvoJDLyCIlL8A1b4lblg",
          "type": "mutate",
        },
      ]
    `);
  });

  test("upsert should set createdAt to current time", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    const testId = testCreateId();
    const result = evolu.upsert("todo", { id: testId, title: "Upserted Todo" });
    expect(result).toMatchInlineSnapshot(`
      {
        "ok": true,
        "value": {
          "id": "aVm9lRgGoF6038X2MlJ2Cw",
        },
      }
    `);

    await Promise.resolve();

    expect(postMessageCalls).toMatchInlineSnapshot(`
      [
        {
          "changes": [
            {
              "id": "aVm9lRgGoF6038X2MlJ2Cw",
              "isDelete": null,
              "isInsert": true,
              "ownerId": undefined,
              "table": "todo",
              "values": {
                "title": "Upserted Todo",
              },
            },
          ],
          "onCompleteIds": [],
          "subscribedQueries": [],
          "tabId": "l7NvoJDLyCIlL8A1b4lblg",
          "type": "mutate",
        },
      ]
    `);
  });

  test("update should NOT set createdAt", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    const testId = testCreateId();
    const result = evolu.update("todo", { id: testId, title: "Updated Todo" });
    expect(result).toMatchInlineSnapshot(`
      {
        "ok": true,
        "value": {
          "id": "R8qs_iP8FEwYBfwzQ7o_Og",
        },
      }
    `);

    await Promise.resolve();

    expect(postMessageCalls).toMatchInlineSnapshot(`
      [
        {
          "changes": [
            {
              "id": "R8qs_iP8FEwYBfwzQ7o_Og",
              "isDelete": null,
              "isInsert": false,
              "ownerId": undefined,
              "table": "todo",
              "values": {
                "title": "Updated Todo",
              },
            },
          ],
          "onCompleteIds": [],
          "subscribedQueries": [],
          "tabId": "l7NvoJDLyCIlL8A1b4lblg",
          "type": "mutate",
        },
      ]
    `);
  });
});

describe("useOwner", () => {
  const ownerMessage = (owner: SyncOwner, use: boolean) => ({
    type: "useOwner",
    owner,
    use,
  });

  test("single useOwner call", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    evolu.useOwner(testOwner);

    await Promise.resolve();

    expect(postMessageCalls).toHaveLength(1);
    expect(postMessageCalls[0]).toEqual(ownerMessage(testOwner, true));
  });

  test("multiple useOwner calls for same owner preserves count", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    // Each call should result in a separate postMessage for reference counting
    evolu.useOwner(testOwner);
    evolu.useOwner(testOwner);
    evolu.useOwner(testOwner);

    await Promise.resolve();

    expect(postMessageCalls).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(postMessageCalls[i]).toEqual(ownerMessage(testOwner, true));
    }
  });

  test("exact use/unuse pair cancels out", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    // Add testOwner, then remove it - should cancel out
    const unuse1 = evolu.useOwner(testOwner);
    unuse1();

    queueMicrotask(() => {
      expect(postMessageCalls).toHaveLength(0);
    });

    await Promise.resolve();
  });

  test("multiple exact pairs cancel out", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    // Two separate use/unuse pairs - both should cancel out
    const unuse1 = evolu.useOwner(testOwner);
    const unuse2 = evolu.useOwner(testOwner);
    unuse1();
    unuse2();

    queueMicrotask(() => {
      expect(postMessageCalls).toHaveLength(0);
    });

    await Promise.resolve();
  });

  test("partial pairs leave remainder", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    // Three uses, one unuse - should result in two remaining uses
    evolu.useOwner(testOwner);
    evolu.useOwner(testOwner);
    const unuse3 = evolu.useOwner(testOwner);
    unuse3();

    await Promise.resolve();

    expect(postMessageCalls).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(postMessageCalls[i]).toEqual(ownerMessage(testOwner, true));
    }
  });

  test("different owners don't interfere", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    // Different owners should not cancel each other
    evolu.useOwner(testOwner);
    const unuse2 = evolu.useOwner(testOwner2);
    unuse2();

    await Promise.resolve();

    expect(postMessageCalls).toHaveLength(1);
    expect(postMessageCalls[0]).toEqual(ownerMessage(testOwner, true));
  });

  test("order preservation with mixed operations", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    // Mixed operations: use, use, unuse, use
    // Should cancel one pair and leave: use, use
    evolu.useOwner(testOwner); // use #1
    const unuse2 = evolu.useOwner(testOwner); // use #2
    unuse2(); // unuse (cancels with use #2)
    evolu.useOwner(testOwner); // use #3

    await Promise.resolve();

    expect(postMessageCalls).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(postMessageCalls[i]).toEqual(ownerMessage(testOwner, true));
    }
  });

  test("remove before add - processed owner requires explicit remove", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    // Add owner and wait for it to be processed
    const unuse1 = evolu.useOwner(testOwner);

    await Promise.resolve();

    // Verify it was added
    expect(postMessageCalls).toHaveLength(1);
    expect(postMessageCalls[0]).toEqual(ownerMessage(testOwner, true));

    postMessageCalls.length = 0; // Clear previous calls

    // Now remove and immediately add again
    unuse1(); // Remove
    evolu.useOwner(testOwner); // Add again

    await Promise.resolve();

    // Should result in no calls since remove/add cancel out
    expect(postMessageCalls).toHaveLength(0);
  });

  test("delayed unuse call is processed", async () => {
    const { evolu, postMessageCalls } = await testCreateEvolu();

    const unuse = evolu.useOwner(testOwner);

    await Promise.resolve();
    expect(postMessageCalls).toHaveLength(1);
    expect(postMessageCalls[0]).toEqual(ownerMessage(testOwner, true));

    postMessageCalls.length = 0; // Clear previous calls

    // Delayed unuse without any subsequent useOwner calls
    setTimeout(() => {
      unuse();
    }, 10);

    await wait("20ms")();

    expect(postMessageCalls).toHaveLength(1);
    expect(postMessageCalls[0]).toEqual(ownerMessage(testOwner, false));
  });
});
