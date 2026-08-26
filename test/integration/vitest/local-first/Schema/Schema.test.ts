import { describe, expect, expectTypeOf, test } from "vitest";
import { sql as kyselySql } from "kysely";
import * as z from "zod";
import {
  assert,
  assertNonNullable,
} from "../../../../../packages/common/src/Assert.ts";
import type { Brand } from "../../../../../packages/common/src/Brand.ts";
import type {
  MutationValues,
  ValidateColumnTypes,
  ValidateIdColumnType,
  ValidateNoSystemColumns,
  ValidateSchema,
  ValidateSchemaHasId,
} from "../../../../../packages/common/src/local-first/Schema.ts";
import {
  createQueryBuilder,
  ensureSqliteSchema,
} from "../../../../../packages/common/src/local-first/Schema.ts";
import {
  getSqliteSchema,
  sql,
  SqliteBoolean,
  type SqliteSchema,
} from "../../../../../packages/common/src/Sqlite.ts";
import {
  Boolean,
  FiniteNumber,
  Id,
  id,
  NonEmptyTrimmedString100,
  NonNaNNumber,
  Number,
  nullOr,
} from "../../../../../packages/common/src/Type.ts";
import { setupSqlite } from "../../_deps.ts";

const TodoId = id("Todo");
type TodoId = typeof TodoId.Output;

describe("ValidateSchema", () => {
  describe("ValidateSchemaHasId", () => {
    test("reports missing id column", () => {
      const _SchemaWithoutId = {
        todo: { title: NonEmptyTrimmedString100 },
      };

      type Result = ValidateSchemaHasId<typeof _SchemaWithoutId>;
      expectTypeOf<Result>().toEqualTypeOf<'⛔ Schema error: Table "todo" is missing required id column.'>();
    });

    test("passes for valid schema", () => {
      const _Schema = {
        todo: { id: TodoId, title: NonEmptyTrimmedString100 },
      };

      type Result = ValidateSchemaHasId<typeof _Schema>;
      expectTypeOf<Result>().toEqualTypeOf<never>();
    });
  });

  describe("ValidateIdColumnType", () => {
    test("reports non-Id output type", () => {
      const _SchemaWithBadId = {
        todo: {
          id: NonEmptyTrimmedString100,
          title: NonEmptyTrimmedString100,
        },
      };

      type Result = ValidateIdColumnType<typeof _SchemaWithBadId>;
      expectTypeOf<Result>().toEqualTypeOf<'⛔ Schema error: Table "todo" id column output type must extend Id. Use id("todo") from Evolu Type.'>();
    });

    test("passes for branded id", () => {
      const _Schema = {
        todo: { id: TodoId, title: NonEmptyTrimmedString100 },
      };

      type Result = ValidateIdColumnType<typeof _Schema>;
      expectTypeOf<Result>().toEqualTypeOf<never>();
    });
  });

  describe("ValidateNoSystemColumns", () => {
    test("reports createdAt system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: {
          id: typeof TodoId;
          createdAt: typeof NonEmptyTrimmedString100;
        };
      }>;
      expectTypeOf<Result>().toEqualTypeOf<'⛔ Schema error: Table "todo" uses system column name "createdAt". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();
    });

    test("reports updatedAt system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: {
          id: typeof TodoId;
          updatedAt: typeof NonEmptyTrimmedString100;
        };
      }>;
      expectTypeOf<Result>().toEqualTypeOf<'⛔ Schema error: Table "todo" uses system column name "updatedAt". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();
    });

    test("reports isDeleted system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: {
          id: typeof TodoId;
          isDeleted: typeof NonEmptyTrimmedString100;
        };
      }>;
      expectTypeOf<Result>().toEqualTypeOf<'⛔ Schema error: Table "todo" uses system column name "isDeleted". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();
    });

    test("reports ownerId system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: {
          id: typeof TodoId;
          ownerId: typeof NonEmptyTrimmedString100;
        };
      }>;
      expectTypeOf<Result>().toEqualTypeOf<'⛔ Schema error: Table "todo" uses system column name "ownerId". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'>();
    });

    test("passes for valid schema", () => {
      const _Schema = {
        todo: {
          id: TodoId,
          title: NonEmptyTrimmedString100,
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
      expectTypeOf<Result>().toEqualTypeOf<'⛔ Schema error: Table "todo" column "data" type is not compatible with SQLite. Column types must extend SqliteValue (string, FiniteNumber, Uint8Array, or null).'>();
    });

    test("reports unrestricted Number column", () => {
      const _SchemaWithNumber = {
        todo: {
          id: TodoId,
          value: Number,
        },
      };

      type Result = ValidateColumnTypes<typeof _SchemaWithNumber>;
      expectTypeOf<Result>().toEqualTypeOf<'⛔ Schema error: Table "todo" column "value" type is not compatible with SQLite. Column types must extend SqliteValue (string, FiniteNumber, Uint8Array, or null).'>();
    });

    test("reports NonNaNNumber column because it permits infinities", () => {
      const _SchemaWithNonNaNNumber = {
        todo: {
          id: TodoId,
          value: NonNaNNumber,
        },
      };

      type Result = ValidateColumnTypes<typeof _SchemaWithNonNaNNumber>;
      expectTypeOf<Result>().toEqualTypeOf<'⛔ Schema error: Table "todo" column "value" type is not compatible with SQLite. Column types must extend SqliteValue (string, FiniteNumber, Uint8Array, or null).'>();
    });

    test("passes for FiniteNumber column", () => {
      const _SchemaWithFiniteNumber = {
        todo: {
          id: TodoId,
          value: FiniteNumber,
        },
      };

      type Result = ValidateColumnTypes<typeof _SchemaWithFiniteNumber>;
      expectTypeOf<Result>().toEqualTypeOf<never>();
    });

    test("requires compatible finite brands for third-party numeric schemas", () => {
      const _SchemaWithUnbrandedZodFiniteNumber = {
        todo: {
          id: TodoId,
          value: z.number(),
        },
      };
      type UnbrandedResult = ValidateColumnTypes<
        typeof _SchemaWithUnbrandedZodFiniteNumber
      >;
      expectTypeOf<UnbrandedResult>().toEqualTypeOf<'⛔ Schema error: Table "todo" column "value" type is not compatible with SQLite. Column types must extend SqliteValue (string, FiniteNumber, Uint8Array, or null).'>();

      const ZodFiniteNumber = z
        .number()
        .transform((value): FiniteNumber => value as FiniteNumber);
      const _SchemaWithBrandedZodFiniteNumber = {
        todo: {
          id: TodoId,
          value: ZodFiniteNumber,
        },
      };
      type BrandedResult = ValidateColumnTypes<
        typeof _SchemaWithBrandedZodFiniteNumber
      >;
      expectTypeOf<BrandedResult>().toEqualTypeOf<never>();
      expectTypeOf<
        z.output<typeof ZodFiniteNumber>
      >().toEqualTypeOf<FiniteNumber>();
    });

    test("passes for valid schema", () => {
      const _Schema = {
        todo: {
          id: TodoId,
          title: NonEmptyTrimmedString100,
          isCompleted: nullOr(SqliteBoolean),
        },
      };

      type Result = ValidateColumnTypes<typeof _Schema>;
      expectTypeOf<Result>().toEqualTypeOf<never>();
    });
  });
});

describe("createQueryBuilder", () => {
  test("asserts that compiled parameters are SqliteQueryParameters", () => {
    const createQuery = createQueryBuilder({
      todo: {
        id: TodoId,
        value: FiniteNumber,
      },
    });
    let thrown: unknown;

    try {
      createQuery((db) =>
        db
          .selectFrom("todo")
          .select(
            kyselySql<number>`${globalThis.Number.POSITIVE_INFINITY}`.as(
              "value",
            ),
          ),
      );
    } catch (error) {
      thrown = error;
    }

    assert(thrown instanceof Error, "Expected an Error.");
    expect(thrown.message).toBe("Expected Array.");
    expect(thrown.cause).toEqual({
      type: "Array",
      reason: {
        kind: "Items",
        issues: [
          {
            kind: "Element",
            index: 0,
            error: {
              type: "Union",
              errors: [
                {
                  index: 0,
                  error: {
                    type: "Finite",
                    value: globalThis.Number.POSITIVE_INFINITY,
                  },
                },
              ],
            },
          },
        ],
      },
    });
  });
});

describe("Evolu Type", () => {
  const _Schema = {
    todo: {
      id: TodoId,
      title: NonEmptyTrimmedString100,
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
        readonly title: typeof NonEmptyTrimmedString100.Output;
        readonly isCompleted?: SqliteBoolean | null;
      }>();
    });

    test("UpdateValues requires only id, everything else optional", () => {
      type Update = MutationValues<TodoTable, "update">;

      expectTypeOf<Update>().toEqualTypeOf<{
        readonly id: TodoId;
        readonly title?: typeof NonEmptyTrimmedString100.Output;
        readonly isCompleted?: SqliteBoolean | null;
        readonly isDeleted?: SqliteBoolean;
      }>();
    });

    test("UpsertValues requires id and non-nullable columns", () => {
      type Upsert = MutationValues<TodoTable, "upsert">;

      expectTypeOf<Upsert>().toEqualTypeOf<{
        readonly id: TodoId;
        readonly title: typeof NonEmptyTrimmedString100.Output;
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

describe("ensureSqliteSchema", () => {
  test("creates new tables", async () => {
    await using deps = await setupSqlite();

    const newSchema: SqliteSchema = {
      tables: {
        todo: new Set(["title", "isCompleted"]),
      },
      indexes: [],
    };

    ensureSqliteSchema(deps)(newSchema);

    const sqliteSchema = getSqliteSchema(deps)();
    const todoColumns = sqliteSchema.tables.todo;
    assertNonNullable(todoColumns);
    expect(todoColumns.has("id")).toBe(true);
    expect(todoColumns.has("title")).toBe(true);
    expect(todoColumns.has("isCompleted")).toBe(true);
    expect(todoColumns.has("createdAt")).toBe(true);
    expect(todoColumns.has("updatedAt")).toBe(true);
    expect(todoColumns.has("isDeleted")).toBe(true);
    expect(todoColumns.has("ownerId")).toBe(true);
  });

  test("adds new columns to existing tables", async () => {
    await using deps = await setupSqlite();

    const initialSchema: SqliteSchema = {
      tables: {
        todo: new Set(["title"]),
      },
      indexes: [],
    };

    ensureSqliteSchema(deps)(initialSchema);

    const updatedSchema: SqliteSchema = {
      tables: {
        todo: new Set(["title", "isCompleted", "priority"]),
      },
      indexes: [],
    };

    ensureSqliteSchema(deps)(updatedSchema);

    const sqliteSchema = getSqliteSchema(deps)();
    const todoColumns = sqliteSchema.tables.todo;
    assertNonNullable(todoColumns);
    expect(todoColumns.has("title")).toBe(true);
    expect(todoColumns.has("isCompleted")).toBe(true);
    expect(todoColumns.has("priority")).toBe(true);
  });

  test("creates multiple tables", async () => {
    await using deps = await setupSqlite();

    const newSchema: SqliteSchema = {
      tables: {
        todo: new Set(["title"]),
        category: new Set(["name"]),
      },
      indexes: [],
    };

    ensureSqliteSchema(deps)(newSchema);

    const sqliteSchema = getSqliteSchema(deps)();
    const todoColumns = sqliteSchema.tables.todo;
    const categoryColumns = sqliteSchema.tables.category;
    assertNonNullable(todoColumns);
    assertNonNullable(categoryColumns);
    expect(todoColumns.has("title")).toBe(true);
    expect(categoryColumns.has("name")).toBe(true);
  });

  test("uses set difference to find new columns", async () => {
    await using deps = await setupSqlite();

    const initialSchema: SqliteSchema = {
      tables: {
        todo: new Set(["a", "b", "c"]),
      },
      indexes: [],
    };

    ensureSqliteSchema(deps)(initialSchema);

    const updatedSchema: SqliteSchema = {
      tables: {
        todo: new Set(["b", "c", "d", "e"]),
      },
      indexes: [],
    };

    ensureSqliteSchema(deps)(updatedSchema);

    const sqliteSchema = getSqliteSchema(deps)();
    const todoColumns = sqliteSchema.tables.todo;
    assertNonNullable(todoColumns);
    // Original columns still exist
    expect(todoColumns.has("a")).toBe(true);
    expect(todoColumns.has("b")).toBe(true);
    expect(todoColumns.has("c")).toBe(true);
    // New columns added via difference
    expect(todoColumns.has("d")).toBe(true);
    expect(todoColumns.has("e")).toBe(true);
  });

  test("with currentSchema parameter skips getSqliteSchema call", async () => {
    await using deps = await setupSqlite();

    const currentSchema: SqliteSchema = {
      tables: {
        todo: new Set(["title"]),
      },
      indexes: [],
    };

    // First create the table
    ensureSqliteSchema(deps)(currentSchema);

    const newSchema: SqliteSchema = {
      tables: {
        todo: new Set(["title", "description"]),
      },
      indexes: [],
    };

    // Pass currentSchema to skip getSqliteSchema
    ensureSqliteSchema(deps)(newSchema, currentSchema);

    const sqliteSchema = getSqliteSchema(deps)();
    const todoColumns = sqliteSchema.tables.todo;
    assertNonNullable(todoColumns);
    expect(todoColumns.has("description")).toBe(true);
  });

  test("does not drop Evolu-managed indexes when currentSchema is omitted", async () => {
    await using deps = await setupSqlite();

    const schema: SqliteSchema = {
      tables: {
        todo: new Set(["title"]),
      },
      indexes: [],
    };

    ensureSqliteSchema(deps)(schema);
    deps.sqlite.exec(sql` create index evolu_internal_test on todo (title); `);

    // Re-running ensure without currentSchema must keep evolu_ indexes untouched.
    ensureSqliteSchema(deps)(schema);

    const schemaWithEvoluIndexes = getSqliteSchema(deps)();

    expect(
      schemaWithEvoluIndexes.indexes.some(
        ({ name }) => name === "evolu_internal_test",
      ),
    ).toBe(true);
  });
});
