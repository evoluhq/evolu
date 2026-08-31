import { sql as kyselySql } from "kysely";
import { describe, it } from "node:test";
import * as z from "zod";
import {
  assertEqual,
  assertNonNullable,
  assertThrowsInstanceOf,
  assertTrue,
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
  assertType,
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
    it("reports missing id column", () => {
      const _SchemaWithoutId = {
        todo: { title: NonEmptyTrimmedString100 },
      };

      type Result = ValidateSchemaHasId<typeof _SchemaWithoutId>;
      assertType<
        Result,
        '⛔ Schema error: Table "todo" is missing required id column.'
      >();
    });

    it("passes for valid schema", () => {
      const _Schema = {
        todo: { id: TodoId, title: NonEmptyTrimmedString100 },
      };

      type Result = ValidateSchemaHasId<typeof _Schema>;
      assertType<Result, never>();
    });
  });

  describe("ValidateIdColumnType", () => {
    it("reports non-Id output type", () => {
      const _SchemaWithBadId = {
        todo: {
          id: NonEmptyTrimmedString100,
          title: NonEmptyTrimmedString100,
        },
      };

      type Result = ValidateIdColumnType<typeof _SchemaWithBadId>;
      assertType<
        Result,
        '⛔ Schema error: Table "todo" id column output type must extend Id. Use id("todo") from Evolu Type.'
      >();
    });

    it("passes for branded id", () => {
      const _Schema = {
        todo: { id: TodoId, title: NonEmptyTrimmedString100 },
      };

      type Result = ValidateIdColumnType<typeof _Schema>;
      assertType<Result, never>();
    });
  });

  describe("ValidateNoSystemColumns", () => {
    it("reports createdAt system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: {
          id: typeof TodoId;
          createdAt: typeof NonEmptyTrimmedString100;
        };
      }>;
      assertType<
        Result,
        '⛔ Schema error: Table "todo" uses system column name "createdAt". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'
      >();
    });

    it("reports updatedAt system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: {
          id: typeof TodoId;
          updatedAt: typeof NonEmptyTrimmedString100;
        };
      }>;
      assertType<
        Result,
        '⛔ Schema error: Table "todo" uses system column name "updatedAt". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'
      >();
    });

    it("reports isDeleted system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: {
          id: typeof TodoId;
          isDeleted: typeof NonEmptyTrimmedString100;
        };
      }>;
      assertType<
        Result,
        '⛔ Schema error: Table "todo" uses system column name "isDeleted". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'
      >();
    });

    it("reports ownerId system column", () => {
      type Result = ValidateNoSystemColumns<{
        todo: {
          id: typeof TodoId;
          ownerId: typeof NonEmptyTrimmedString100;
        };
      }>;
      assertType<
        Result,
        '⛔ Schema error: Table "todo" uses system column name "ownerId". System columns (createdAt, updatedAt, isDeleted, ownerId) are added automatically.'
      >();
    });

    it("passes for valid schema", () => {
      const _Schema = {
        todo: {
          id: TodoId,
          title: NonEmptyTrimmedString100,
          isCompleted: nullOr(SqliteBoolean),
        },
      };

      type Result = ValidateNoSystemColumns<typeof _Schema>;
      assertType<Result, never>();
    });
  });

  describe("ValidateColumnTypes", () => {
    it("reports non-SqliteValue column", () => {
      const _SchemaWithBadCol = {
        todo: {
          id: TodoId,
          data: Boolean,
        },
      };

      type Result = ValidateColumnTypes<typeof _SchemaWithBadCol>;
      assertType<
        Result,
        '⛔ Schema error: Table "todo" column "data" type is not compatible with SQLite. Column types must extend SqliteValue (string, FiniteNumber, Uint8Array, or null).'
      >();
    });

    it("reports unrestricted Number column", () => {
      const _SchemaWithNumber = {
        todo: {
          id: TodoId,
          value: Number,
        },
      };

      type Result = ValidateColumnTypes<typeof _SchemaWithNumber>;
      assertType<
        Result,
        '⛔ Schema error: Table "todo" column "value" type is not compatible with SQLite. Column types must extend SqliteValue (string, FiniteNumber, Uint8Array, or null).'
      >();
    });

    it("reports NonNaNNumber column because it permits infinities", () => {
      const _SchemaWithNonNaNNumber = {
        todo: {
          id: TodoId,
          value: NonNaNNumber,
        },
      };

      type Result = ValidateColumnTypes<typeof _SchemaWithNonNaNNumber>;
      assertType<
        Result,
        '⛔ Schema error: Table "todo" column "value" type is not compatible with SQLite. Column types must extend SqliteValue (string, FiniteNumber, Uint8Array, or null).'
      >();
    });

    it("passes for FiniteNumber column", () => {
      const _SchemaWithFiniteNumber = {
        todo: {
          id: TodoId,
          value: FiniteNumber,
        },
      };

      type Result = ValidateColumnTypes<typeof _SchemaWithFiniteNumber>;
      assertType<Result, never>();
    });

    it("requires compatible finite brands for third-party numeric schemas", () => {
      const _SchemaWithUnbrandedZodFiniteNumber = {
        todo: {
          id: TodoId,
          value: z.number(),
        },
      };
      type UnbrandedResult = ValidateColumnTypes<
        typeof _SchemaWithUnbrandedZodFiniteNumber
      >;
      assertType<
        UnbrandedResult,
        '⛔ Schema error: Table "todo" column "value" type is not compatible with SQLite. Column types must extend SqliteValue (string, FiniteNumber, Uint8Array, or null).'
      >();

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
      assertType<BrandedResult, never>();
      assertType<z.output<typeof ZodFiniteNumber>, FiniteNumber>();
    });

    it("passes for valid schema", () => {
      const _Schema = {
        todo: {
          id: TodoId,
          title: NonEmptyTrimmedString100,
          isCompleted: nullOr(SqliteBoolean),
        },
      };

      type Result = ValidateColumnTypes<typeof _Schema>;
      assertType<Result, never>();
    });
  });
});

describe("createQueryBuilder", () => {
  it("asserts that compiled parameters are SqliteQueryParameters", () => {
    const createQuery = createQueryBuilder({
      todo: {
        id: TodoId,
        value: FiniteNumber,
      },
    });
    const thrown = assertThrowsInstanceOf(() => {
      createQuery((db) =>
        db
          .selectFrom("todo")
          .select(
            kyselySql<number>`${globalThis.Number.POSITIVE_INFINITY}`.as(
              "value",
            ),
          ),
      );
    }, Error);

    assertEqual(thrown.message, "Expected Array.");
    assertEqual(thrown.cause, {
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

  it("ValidateSchema returns schema type when valid", () => {
    type Result = ValidateSchema<typeof _Schema>;
    assertType<Result, typeof _Schema>();
  });

  describe("mutation value types", () => {
    type TodoTable = typeof _Schema.todo;

    it("InsertValues omits id and makes nullable columns optional", () => {
      type Insert = MutationValues<TodoTable, "insert">;

      assertType<
        Insert,
        {
          readonly title: typeof NonEmptyTrimmedString100.Output;
          readonly isCompleted?: SqliteBoolean | null;
        }
      >();
    });

    it("UpdateValues requires only id, everything else optional", () => {
      type Update = MutationValues<TodoTable, "update">;

      assertType<
        Update,
        {
          readonly id: TodoId;
          readonly title?: typeof NonEmptyTrimmedString100.Output;
          readonly isCompleted?: SqliteBoolean | null;
          readonly isDeleted?: SqliteBoolean;
        }
      >();
    });

    it("UpsertValues requires id and non-nullable columns", () => {
      type Upsert = MutationValues<TodoTable, "upsert">;

      assertType<
        Upsert,
        {
          readonly id: TodoId;
          readonly title: typeof NonEmptyTrimmedString100.Output;
          readonly isCompleted?: SqliteBoolean | null;
          readonly isDeleted?: SqliteBoolean;
        }
      >();
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

  it("ValidateSchema returns schema type when valid", () => {
    type Result = ValidateSchema<typeof _Schema>;
    assertType<Result, typeof _Schema>();
  });

  describe("mutation value types", () => {
    type TodoTable = typeof _Schema.todo;

    it("InsertValues omits id and makes nullable columns optional", () => {
      type Insert = MutationValues<TodoTable, "insert">;

      assertType<
        Insert,
        {
          readonly title: string;
          readonly isCompleted?: 0 | 1 | null;
        }
      >();
    });

    it("UpdateValues requires only id, everything else optional", () => {
      type Update = MutationValues<TodoTable, "update">;

      assertType<
        Update,
        {
          readonly id: TodoId;
          readonly title?: string;
          readonly isCompleted?: 0 | 1 | null;
          readonly isDeleted?: ZodSqliteBoolean;
        }
      >();
    });

    it("UpsertValues requires id and non-nullable columns", () => {
      type Upsert = MutationValues<TodoTable, "upsert">;

      assertType<
        Upsert,
        {
          readonly id: TodoId;
          readonly title: string;
          readonly isCompleted?: 0 | 1 | null;
          readonly isDeleted?: ZodSqliteBoolean;
        }
      >();
    });
  });
});

describe("ensureSqliteSchema", () => {
  it("creates new tables", async () => {
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
    assertTrue(todoColumns.has("id"));
    assertTrue(todoColumns.has("title"));
    assertTrue(todoColumns.has("isCompleted"));
    assertTrue(todoColumns.has("createdAt"));
    assertTrue(todoColumns.has("updatedAt"));
    assertTrue(todoColumns.has("isDeleted"));
    assertTrue(todoColumns.has("ownerId"));
  });

  it("adds new columns to existing tables", async () => {
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
    assertTrue(todoColumns.has("title"));
    assertTrue(todoColumns.has("isCompleted"));
    assertTrue(todoColumns.has("priority"));
  });

  it("creates multiple tables", async () => {
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
    assertTrue(todoColumns.has("title"));
    assertTrue(categoryColumns.has("name"));
  });

  it("uses set difference to find new columns", async () => {
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
    assertTrue(todoColumns.has("a"));
    assertTrue(todoColumns.has("b"));
    assertTrue(todoColumns.has("c"));
    // New columns added via difference
    assertTrue(todoColumns.has("d"));
    assertTrue(todoColumns.has("e"));
  });

  it("with currentSchema parameter skips getSqliteSchema call", async () => {
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
    assertTrue(todoColumns.has("description"));
  });

  it("does not drop Evolu-managed indexes when currentSchema is omitted", async () => {
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

    assertTrue(
      schemaWithEvoluIndexes.indexes.some(
        ({ name }) => name === "evolu_internal_test",
      ),
    );
  });
});
