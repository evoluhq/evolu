import { describe, expect, expectTypeOf, test, vi } from "vitest";
import { createConsole } from "../../src/Console.js";
import { createEvolu } from "../../src/Evolu/Evolu.js";
import { getOrThrow } from "../../src/Result.js";
import { SqliteBoolean } from "../../src/Sqlite.js";
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
  testCreateId,
  testNanoIdLib,
  testSimpleName,
  testTime,
} from "../_deps.js";
import {
  ValidateColumnTypes,
  ValidateIdColumnType,
  ValidateNoDefaultColumns,
  ValidateSchemaHasId,
} from "../../src/Evolu/Schema.js";

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

const mockDeps = () => {
  const dbWorker = {
    onMessage: vi.fn(),
    postMessage: vi.fn(),
  };

  return {
    createDbWorker: () => dbWorker,
    time: testTime,
    nanoIdLib: testNanoIdLib,
    console: createConsole(),
    createAppState: () => ({
      reset: vi.fn(),
    }),
  };
};

let instancesCount = 0;

const setupEvoluTest = () => {
  const deps = mockDeps();
  const evolu = createEvolu(deps)(Schema, {
    name: getOrThrow(SimpleName.from(`instance${instancesCount++}`)),
  });
  const dbWorker = deps.createDbWorker();

  return { deps, evolu, dbWorker };
};

test("init postMessage call", () => {
  const { dbWorker } = setupEvoluTest();

  expect(dbWorker.postMessage.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "config": {
            "enableLogging": false,
            "maxDrift": 300000,
            "name": "instance0",
            "reloadUrl": "/",
            "syncUrl": "https://free.evoluhq.com",
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
          "initialData": [],
          "type": "init",
        },
      ],
    ]
  `);
});

test("insert should validate input and call postMessage", async () => {
  const { evolu, dbWorker } = setupEvoluTest();

  const validTodo = {
    title: "Test Todo",
  };

  const result = evolu.insert("todo", validTodo);

  expect(result.ok).toBe(true);
  expect(result.ok && result.value.id).toMatchInlineSnapshot(
    `"esTwHwplqLBSE8Ou8ffX4"`,
  );

  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(dbWorker.postMessage.mock.calls[1]).toMatchInlineSnapshot(`
    [
      {
        "changes": [
          {
            "id": "esTwHwplqLBSE8Ou8ffX4",
            "table": "todo",
            "values": {
              "title": "Test Todo",
            },
          },
        ],
        "onCompleteIds": [],
        "subscribedQueries": [],
        "tabId": "s9rNnUeri8bzhS5AX_mRy",
        "type": "mutate",
      },
    ]
  `);
});

test("insert should reject invalid input", () => {
  const { evolu } = setupEvoluTest();

  // Empty title (violates NonEmptyString constraint)
  const invalidTodo = {
    title: "",
  };

  const result = evolu.insert("todo", invalidTodo);

  expect(result).toMatchInlineSnapshot(`
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
});

test("update should validate input and call postMessage", async () => {
  const { evolu, dbWorker } = setupEvoluTest();

  const testId = testCreateId();

  // Valid update
  const validUpdate = {
    id: testId,
    title: "Updated Todo",
  };

  const result = evolu.update("todo", validUpdate);

  expect(result.ok).toBe(true);
  expect(result.ok && result.value.id).toBe(testId);

  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(dbWorker.postMessage.mock.calls[1]).toMatchInlineSnapshot(`
    [
      {
        "changes": [
          {
            "id": "e37rn9q4lwirRDIx1Y9e4",
            "table": "todo",
            "values": {
              "title": "Updated Todo",
            },
          },
        ],
        "onCompleteIds": [],
        "subscribedQueries": [],
        "tabId": "s9rNnUeri8bzhS5AX_mRy",
        "type": "mutate",
      },
    ]
  `);
});

test("update should reject invalid input", () => {
  const { evolu } = setupEvoluTest();

  // Missing id
  const invalidUpdate = {
    title: "Updated Todo",
  };

  // @ts-expect-error - Testing runtime validation
  const result = evolu.update("todo", invalidUpdate);

  // Should return error
  expect(result).toMatchInlineSnapshot(`
    {
      "error": {
        "reason": {
          "errors": {
            "id": {
              "type": "String",
              "value": undefined,
            },
          },
          "kind": "Props",
        },
        "type": "Object",
        "value": {
          "title": "Updated Todo",
        },
      },
      "ok": false,
    }
  `);
});

test("upsert should validate input and call postMessage", async () => {
  const { evolu, dbWorker } = setupEvoluTest();

  const testId = testCreateId();

  // Valid upsert
  const validUpsert = {
    id: testId,
    title: "Upserted Todo",
  };

  const result = evolu.upsert("todo", validUpsert);

  expect(result.ok).toBe(true);
  expect(result.ok && result.value.id).toBe(testId);

  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(dbWorker.postMessage.mock.calls[1]).toMatchInlineSnapshot(`
    [
      {
        "changes": [
          {
            "id": "ZUN-T4MZhx0p9fO9i2LT9",
            "table": "todo",
            "values": {
              "title": "Upserted Todo",
            },
          },
        ],
        "onCompleteIds": [],
        "subscribedQueries": [],
        "tabId": "s9rNnUeri8bzhS5AX_mRy",
        "type": "mutate",
      },
    ]
  `);
});

test("upsert should reject invalid input", () => {
  const { evolu } = setupEvoluTest();

  const testId = testCreateId();

  const invalidUpsert = {
    id: testId,
    title: "",
  };

  const result = evolu.upsert("todo", invalidUpsert);

  expect(result).toMatchInlineSnapshot(`
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
          "id": "yKrUtl5RZ4mz12WZ_SQtm",
          "title": "",
        },
      },
      "ok": false,
    }
  `);
});

test("mutations should be processed in microtask queue", async () => {
  const { evolu, dbWorker } = setupEvoluTest();

  // Queue multiple mutations
  evolu.insert("todo", { title: "Todo 1" });
  evolu.insert("todo", { title: "Todo 2" });
  evolu.insert("todo", { title: "Todo 3" });

  await new Promise((resolve) => setTimeout(resolve, 0));

  // Only one postMessage call should happen with all changes
  expect(dbWorker.postMessage).toHaveBeenCalledTimes(2); // 1 for init, 1 for mutations
  expect(dbWorker.postMessage.mock.calls[1]).toMatchInlineSnapshot(`
    [
      {
        "changes": [
          {
            "id": "fIT5Ci6Vt_fajhVHzg5iu",
            "table": "todo",
            "values": {
              "title": "Todo 1",
            },
          },
          {
            "id": "oSfTGGJoCBJ9xgjl8Ky6B",
            "table": "todo",
            "values": {
              "title": "Todo 2",
            },
          },
          {
            "id": "pXftCAjUskTmno2dqqyjQ",
            "table": "todo",
            "values": {
              "title": "Todo 3",
            },
          },
        ],
        "onCompleteIds": [],
        "subscribedQueries": [],
        "tabId": "s9rNnUeri8bzhS5AX_mRy",
        "type": "mutate",
      },
    ]
  `);
});

test("mutation with onlyValidate should not call postMessage", async () => {
  const { evolu, dbWorker } = setupEvoluTest();

  evolu.insert("todo", { title: "Validation only" }, { onlyValidate: true });

  await new Promise((resolve) => setTimeout(resolve, 0));

  // Only init should be called, not the mutation
  expect(dbWorker.postMessage).toHaveBeenCalledTimes(1);
});

test("mutations should fail as a transaction when any mutation fails", async () => {
  const { evolu, dbWorker } = setupEvoluTest();

  // Queue valid and invalid mutations
  evolu.insert("todo", { title: "Valid Todo" });
  evolu.insert("todo", { title: "" }); // Invalid - empty title
  evolu.insert("todo", { title: "Another Valid Todo" });

  await new Promise((resolve) => setTimeout(resolve, 0));

  // Only init should be called, not the mutations since one failed
  expect(dbWorker.postMessage).toHaveBeenCalledTimes(1);
});

describe("EvoluSchema validation", () => {
  test("schema without id column", () => {
    const deps = mockDeps();

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

  test("schema with default column createdAt", () => {
    const deps = mockDeps();

    const SchemaWithDefaultColumn = {
      todo: {
        id: TodoId,
        createdAt: NonEmptyString50,
      },
    };

    // Type-level assertion for the exact error message
    type ValidationResult = ValidateNoDefaultColumns<
      typeof SchemaWithDefaultColumn
    >;
    expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses default column name "createdAt". Default columns (createdAt, updatedAt, isDeleted) are added automatically.'>();

    // @ts-expect-error - Schema validation should catch default column name
    createEvolu(deps)(SchemaWithDefaultColumn, {
      name: testSimpleName,
    });
  });

  test("schema with default column updatedAt", () => {
    const deps = mockDeps();

    const SchemaWithDefaultColumn = {
      todo: {
        id: TodoId,
        updatedAt: NonEmptyString50,
      },
    };

    // Type-level assertion for the exact error message
    type ValidationResult = ValidateNoDefaultColumns<
      typeof SchemaWithDefaultColumn
    >;
    expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses default column name "updatedAt". Default columns (createdAt, updatedAt, isDeleted) are added automatically.'>();

    // @ts-expect-error - Schema validation should catch default column name
    createEvolu(deps)(SchemaWithDefaultColumn, {
      name: testSimpleName,
    });
  });

  test("schema with default column isDeleted", () => {
    const deps = mockDeps();

    const SchemaWithDefaultColumn = {
      todo: {
        id: TodoId,
        isDeleted: NonEmptyString50,
      },
    };

    // Type-level assertion for the exact error message
    type ValidationResult = ValidateNoDefaultColumns<
      typeof SchemaWithDefaultColumn
    >;
    expectTypeOf<ValidationResult>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses default column name "isDeleted". Default columns (createdAt, updatedAt, isDeleted) are added automatically.'>();

    // @ts-expect-error - Schema validation should catch default column name
    createEvolu(deps)(SchemaWithDefaultColumn, {
      name: testSimpleName,
    });
  });

  test("schema with non-branded id column", () => {
    const deps = mockDeps();

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

  test("schema with incompatible column type", () => {
    const deps = mockDeps();

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
