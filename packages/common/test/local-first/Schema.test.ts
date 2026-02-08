import { describe, expect, expectTypeOf, test } from "vitest";
import * as z from "zod";
import type { Brand } from "../../src/Brand.js";
import type {
  MutationValues,
  ValidateColumnTypes,
  ValidateIdColumnType,
  ValidateNoSystemColumns,
  ValidateSchema,
  ValidateSchemaHasId,
} from "../../src/local-first/Schema.js";
import {
  DbSchema,
  ensureDbSchema,
  getDbSchema,
} from "../../src/local-first/Schema.js";
import { ok } from "../../src/Result.js";
import { SqliteBoolean } from "../../src/Sqlite.js";
import {
  Boolean,
  Id,
  id,
  NonEmptyString100,
  nullOr,
  type InferType,
} from "../../src/Type.js";
import { testCreateRunWithSqlite } from "../_deps.nodejs.js";

const TodoId = id("Todo");
type TodoId = typeof TodoId.Type;

describe("ValidateSchema", () => {
  describe("ValidateSchemaHasId", () => {
    test("reports missing id column", () => {
      const _SchemaWithoutId = {
        todo: { title: NonEmptyString100 },
      };

      type Result = ValidateSchemaHasId<typeof _SchemaWithoutId>;
      expectTypeOf<Result>().toEqualTypeOf<'❌ Schema Error: Table "todo" is missing required id column.'>();
    });

    test("passes for valid schema", () => {
      const _Schema = {
        todo: { id: TodoId, title: NonEmptyString100 },
      };

      type Result = ValidateSchemaHasId<typeof _Schema>;
      expectTypeOf<Result>().toEqualTypeOf<never>();
    });
  });

  describe("ValidateIdColumnType", () => {
    test("reports non-Id output type", () => {
      const _SchemaWithBadId = {
        todo: { id: NonEmptyString100, title: NonEmptyString100 },
      };

      type Result = ValidateIdColumnType<typeof _SchemaWithBadId>;
      expectTypeOf<Result>().toEqualTypeOf<'❌ Schema Error: Table "todo" id column output type must extend Id. Use id("todo") from Evolu Type.'>();
    });

    test("passes for branded id", () => {
      const _Schema = {
        todo: { id: TodoId, title: NonEmptyString100 },
      };

      type Result = ValidateIdColumnType<typeof _Schema>;
      expectTypeOf<Result>().toEqualTypeOf<never>();
    });
  });

  describe("ValidateNoSystemColumns", () => {
    test("reports createdAt system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: { id: typeof TodoId; createdAt: typeof NonEmptyString100 };
      }>;
      expectTypeOf<Result>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "createdAt". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();
    });

    test("reports updatedAt system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: { id: typeof TodoId; updatedAt: typeof NonEmptyString100 };
      }>;
      expectTypeOf<Result>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "updatedAt". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();
    });

    test("reports isDeleted system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: { id: typeof TodoId; isDeleted: typeof NonEmptyString100 };
      }>;
      expectTypeOf<Result>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "isDeleted". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();
    });

    test("reports ownerId system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: { id: typeof TodoId; ownerId: typeof NonEmptyString100 };
      }>;
      expectTypeOf<Result>().toEqualTypeOf<'❌ Schema Error: Table "todo" uses system column name "ownerId". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();
    });

    test("passes for valid schema", () => {
      const _Schema = {
        todo: {
          id: TodoId,
          title: NonEmptyString100,
          isCompleted: nullOr(SqliteBoolean),
        },
      };

      type Result = ValidateNoSystemColumns<typeof _Schema>;
      expectTypeOf<Result>().toEqualTypeOf<never>();
    });
  });

  describe("ValidateColumnTypes", () => {
    test("reports non-SqliteValue column", () => {
      const _SchemaWithBadCol = {
        todo: {
          id: TodoId,
          data: Boolean,
        },
      };

      type Result = ValidateColumnTypes<typeof _SchemaWithBadCol>;
      expectTypeOf<Result>().toEqualTypeOf<'❌ Schema Error: Table "todo" column "data" type is not compatible with SQLite. Column types must extend SqliteValue (string, number, Uint8Array, or null).'>();
    });

    test("passes for valid schema", () => {
      const _Schema = {
        todo: {
          id: TodoId,
          title: NonEmptyString100,
          isCompleted: nullOr(SqliteBoolean),
        },
      };

      type Result = ValidateColumnTypes<typeof _Schema>;
      expectTypeOf<Result>().toEqualTypeOf<never>();
    });
  });
});

describe("Evolu Type", () => {
  const _Schema = {
    todo: {
      id: TodoId,
      title: NonEmptyString100,
      isCompleted: nullOr(SqliteBoolean),
    },
  };

  test("ValidateSchema returns schema type when valid", () => {
    type Result = ValidateSchema<typeof _Schema>;
    expectTypeOf<Result>().toEqualTypeOf<typeof _Schema>();
  });

  describe("mutation value types", () => {
    type TodoTable = typeof _Schema.todo;

    test("InsertValues omits id and makes nullable columns optional", () => {
      type Insert = MutationValues<TodoTable, "insert">;

      expectTypeOf<Insert>().toEqualTypeOf<{
        readonly title: InferType<typeof NonEmptyString100>;
        readonly isCompleted?: SqliteBoolean | null;
      }>();
    });

    test("UpdateValues requires only id, everything else optional", () => {
      type Update = MutationValues<TodoTable, "update">;

      expectTypeOf<Update>().toEqualTypeOf<{
        readonly id: TodoId;
        readonly title?: InferType<typeof NonEmptyString100>;
        readonly isCompleted?: SqliteBoolean | null;
        readonly isDeleted?: SqliteBoolean;
      }>();
    });

    test("UpsertValues requires id and non-nullable columns", () => {
      type Upsert = MutationValues<TodoTable, "upsert">;

      expectTypeOf<Upsert>().toEqualTypeOf<{
        readonly id: TodoId;
        readonly title: InferType<typeof NonEmptyString100>;
        readonly isCompleted?: SqliteBoolean | null;
        readonly isDeleted?: SqliteBoolean;
      }>();
    });
  });
});

describe("Zod", () => {
  // A Zod equivalent of Evolu's id() factory.
  const zodId = <Table extends string>(_table: Table) =>
    z.custom<Id & Brand<Table>>(Id.is);

  // A Zod equivalent of Evolu's SqliteBoolean.
  const ZodSqliteBoolean = z.union([z.literal(0), z.literal(1)]);
  type ZodSqliteBoolean = z.infer<typeof ZodSqliteBoolean>;

  const TodoId = zodId("Todo");
  type TodoId = z.infer<typeof TodoId>;

  const _Schema = {
    todo: {
      id: TodoId,
      title: z.string().min(1).max(100),
      isCompleted: ZodSqliteBoolean.nullable(),
    },
  };

  test("ValidateSchema returns schema type when valid", () => {
    type Result = ValidateSchema<typeof _Schema>;
    expectTypeOf<Result>().toEqualTypeOf<typeof _Schema>();
  });

  describe("mutation value types", () => {
    type TodoTable = typeof _Schema.todo;

    test("InsertValues omits id and makes nullable columns optional", () => {
      type Insert = MutationValues<TodoTable, "insert">;

      expectTypeOf<Insert>().toEqualTypeOf<{
        readonly title: string;
        readonly isCompleted?: 0 | 1 | null;
      }>();
    });

    test("UpdateValues requires only id, everything else optional", () => {
      type Update = MutationValues<TodoTable, "update">;

      expectTypeOf<Update>().toEqualTypeOf<{
        readonly id: TodoId;
        readonly title?: string;
        readonly isCompleted?: 0 | 1 | null;
        readonly isDeleted?: ZodSqliteBoolean;
      }>();
    });

    test("UpsertValues requires id and non-nullable columns", () => {
      type Upsert = MutationValues<TodoTable, "upsert">;

      expectTypeOf<Upsert>().toEqualTypeOf<{
        readonly id: TodoId;
        readonly title: string;
        readonly isCompleted?: 0 | 1 | null;
        readonly isDeleted?: ZodSqliteBoolean;
      }>();
    });
  });
});

describe("ensureDbSchema", () => {
  test("creates new tables", async () => {
    await using run = await testCreateRunWithSqlite();

    const newSchema: DbSchema = {
      tables: {
        todo: new Set(["title", "isCompleted"]),
      },
      indexes: [],
    };

    const result = ensureDbSchema(run.deps)(newSchema);
    expect(result).toEqual(ok());

    const dbSchema = getDbSchema(run.deps)();
    expect(dbSchema.ok).toBe(true);
    if (!dbSchema.ok) return;

    expect(dbSchema.value.tables.todo).toBeDefined();
    expect(dbSchema.value.tables.todo.has("id")).toBe(true);
    expect(dbSchema.value.tables.todo.has("title")).toBe(true);
    expect(dbSchema.value.tables.todo.has("isCompleted")).toBe(true);
    expect(dbSchema.value.tables.todo.has("createdAt")).toBe(true);
    expect(dbSchema.value.tables.todo.has("updatedAt")).toBe(true);
    expect(dbSchema.value.tables.todo.has("isDeleted")).toBe(true);
    expect(dbSchema.value.tables.todo.has("ownerId")).toBe(true);
  });

  test("adds new columns to existing tables", async () => {
    await using run = await testCreateRunWithSqlite();

    const initialSchema: DbSchema = {
      tables: {
        todo: new Set(["title"]),
      },
      indexes: [],
    };

    const result1 = ensureDbSchema(run.deps)(initialSchema);
    expect(result1).toEqual(ok());

    const updatedSchema: DbSchema = {
      tables: {
        todo: new Set(["title", "isCompleted", "priority"]),
      },
      indexes: [],
    };

    const result2 = ensureDbSchema(run.deps)(updatedSchema);
    expect(result2).toEqual(ok());

    const dbSchema = getDbSchema(run.deps)();
    expect(dbSchema.ok).toBe(true);
    if (!dbSchema.ok) return;

    expect(dbSchema.value.tables.todo.has("title")).toBe(true);
    expect(dbSchema.value.tables.todo.has("isCompleted")).toBe(true);
    expect(dbSchema.value.tables.todo.has("priority")).toBe(true);
  });

  test("creates multiple tables", async () => {
    await using run = await testCreateRunWithSqlite();

    const newSchema: DbSchema = {
      tables: {
        todo: new Set(["title"]),
        category: new Set(["name"]),
      },
      indexes: [],
    };

    const result = ensureDbSchema(run.deps)(newSchema);
    expect(result).toEqual(ok());

    const dbSchema = getDbSchema(run.deps)();
    expect(dbSchema.ok).toBe(true);
    if (!dbSchema.ok) return;

    expect(dbSchema.value.tables.todo).toBeDefined();
    expect(dbSchema.value.tables.category).toBeDefined();
    expect(dbSchema.value.tables.todo.has("title")).toBe(true);
    expect(dbSchema.value.tables.category.has("name")).toBe(true);
  });

  test("uses set difference to find new columns", async () => {
    await using run = await testCreateRunWithSqlite();

    const initialSchema: DbSchema = {
      tables: {
        todo: new Set(["a", "b", "c"]),
      },
      indexes: [],
    };

    ensureDbSchema(run.deps)(initialSchema);

    const updatedSchema: DbSchema = {
      tables: {
        todo: new Set(["b", "c", "d", "e"]),
      },
      indexes: [],
    };

    const result = ensureDbSchema(run.deps)(updatedSchema);
    expect(result).toEqual(ok());

    const dbSchema = getDbSchema(run.deps)();
    expect(dbSchema.ok).toBe(true);
    if (!dbSchema.ok) return;

    // Original columns still exist
    expect(dbSchema.value.tables.todo.has("a")).toBe(true);
    expect(dbSchema.value.tables.todo.has("b")).toBe(true);
    expect(dbSchema.value.tables.todo.has("c")).toBe(true);
    // New columns added via difference
    expect(dbSchema.value.tables.todo.has("d")).toBe(true);
    expect(dbSchema.value.tables.todo.has("e")).toBe(true);
  });

  test("with currentSchema parameter skips getDbSchema call", async () => {
    await using run = await testCreateRunWithSqlite();

    const currentSchema: DbSchema = {
      tables: {
        todo: new Set(["title"]),
      },
      indexes: [],
    };

    // First create the table
    ensureDbSchema(run.deps)(currentSchema);

    const newSchema: DbSchema = {
      tables: {
        todo: new Set(["title", "description"]),
      },
      indexes: [],
    };

    // Pass currentSchema to skip getDbSchema
    const result = ensureDbSchema(run.deps)(newSchema, currentSchema);
    expect(result).toEqual(ok());

    const dbSchema = getDbSchema(run.deps)();
    expect(dbSchema.ok).toBe(true);
    if (!dbSchema.ok) return;

    expect(dbSchema.value.tables.todo.has("description")).toBe(true);
  });
});
