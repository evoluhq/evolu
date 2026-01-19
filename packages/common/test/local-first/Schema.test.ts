import { describe, expect, test } from "vitest";
import { ok } from "../../src/Result.js";
import {
  DbSchema,
  ensureDbSchema,
  getDbSchema,
} from "../../src/local-first/Schema.js";
import { testCreateSqlite } from "../_deps.js";

describe("ensureDbSchema", () => {
  test("creates new tables", async () => {
    const sqlite = await testCreateSqlite();
    const deps = { sqlite };

    const newSchema: DbSchema = {
      tables: {
        todo: new Set(["title", "isCompleted"]),
      },
      indexes: [],
    };

    const result = ensureDbSchema(deps)(newSchema);
    expect(result).toEqual(ok());

    const dbSchema = getDbSchema(deps)();
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
    const sqlite = await testCreateSqlite();
    const deps = { sqlite };

    const initialSchema: DbSchema = {
      tables: {
        todo: new Set(["title"]),
      },
      indexes: [],
    };

    const result1 = ensureDbSchema(deps)(initialSchema);
    expect(result1).toEqual(ok());

    const updatedSchema: DbSchema = {
      tables: {
        todo: new Set(["title", "isCompleted", "priority"]),
      },
      indexes: [],
    };

    const result2 = ensureDbSchema(deps)(updatedSchema);
    expect(result2).toEqual(ok());

    const dbSchema = getDbSchema(deps)();
    expect(dbSchema.ok).toBe(true);
    if (!dbSchema.ok) return;

    expect(dbSchema.value.tables.todo.has("title")).toBe(true);
    expect(dbSchema.value.tables.todo.has("isCompleted")).toBe(true);
    expect(dbSchema.value.tables.todo.has("priority")).toBe(true);
  });

  test("creates multiple tables", async () => {
    const sqlite = await testCreateSqlite();
    const deps = { sqlite };

    const newSchema: DbSchema = {
      tables: {
        todo: new Set(["title"]),
        category: new Set(["name"]),
      },
      indexes: [],
    };

    const result = ensureDbSchema(deps)(newSchema);
    expect(result).toEqual(ok());

    const dbSchema = getDbSchema(deps)();
    expect(dbSchema.ok).toBe(true);
    if (!dbSchema.ok) return;

    expect(dbSchema.value.tables.todo).toBeDefined();
    expect(dbSchema.value.tables.category).toBeDefined();
    expect(dbSchema.value.tables.todo.has("title")).toBe(true);
    expect(dbSchema.value.tables.category.has("name")).toBe(true);
  });

  test("uses set difference to find new columns", async () => {
    const sqlite = await testCreateSqlite();
    const deps = { sqlite };

    const initialSchema: DbSchema = {
      tables: {
        todo: new Set(["a", "b", "c"]),
      },
      indexes: [],
    };

    ensureDbSchema(deps)(initialSchema);

    const updatedSchema: DbSchema = {
      tables: {
        todo: new Set(["b", "c", "d", "e"]),
      },
      indexes: [],
    };

    const result = ensureDbSchema(deps)(updatedSchema);
    expect(result).toEqual(ok());

    const dbSchema = getDbSchema(deps)();
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
    const sqlite = await testCreateSqlite();
    const deps = { sqlite };

    const currentSchema: DbSchema = {
      tables: {
        todo: new Set(["title"]),
      },
      indexes: [],
    };

    // First create the table
    ensureDbSchema(deps)(currentSchema);

    const newSchema: DbSchema = {
      tables: {
        todo: new Set(["title", "description"]),
      },
      indexes: [],
    };

    // Pass currentSchema to skip getDbSchema
    const result = ensureDbSchema(deps)(newSchema, currentSchema);
    expect(result).toEqual(ok());

    const dbSchema = getDbSchema(deps)();
    expect(dbSchema.ok).toBe(true);
    if (!dbSchema.ok) return;

    expect(dbSchema.value.tables.todo.has("description")).toBe(true);
  });
});
