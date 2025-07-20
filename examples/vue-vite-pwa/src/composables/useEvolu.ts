import {
  DateIsoString,
  NonEmptyString,
  NonEmptyString1000,
  SimpleName,
  SqliteBoolean,
  assert,
  createEvolu,
  getOrThrow,
  id,
  maxLength,
  nullOr,
  union,
  type EvoluSchema,
} from "@evolu/common";

import { evoluWebDeps } from "@evolu/web";
import { createUseEvolu } from "@evolu/vue";

// Let's start with typed primary keys.
export const TodoId = id("Todo");
// you can redeclare the TodoId as type in normal ts files, seems not possible inside a svelte file
// but we want to keep the full example in one file, so we have to rename this here with a suffix
export type TodoId = typeof TodoId.Type;

export const TodoCategoryId = id("TodoCategory");
export type TodoCategoryIdType = typeof TodoCategoryId.Type;

// A custom branded Type.
export const NonEmptyString50 = maxLength(50)(NonEmptyString);
// string & Brand<"MinLength1"> & Brand<"MaxLength50">
export type NonEmptyString50 = typeof NonEmptyString50.Type;

export const TodoPriority = union("low", "high");
export type TodoPriority = typeof TodoPriority.Type;

export const PriorityList = TodoPriority.members.map((u) => u.expected);

// Database schema.
export const DatabaseSchema = {
  todo: {
    id: TodoId,
    title: NonEmptyString1000,
    // SQLite doesn't support Boolean, so we use SqliteBoolean (0 or 1) instead.
    isCompleted: nullOr(SqliteBoolean),
    // SQLite doesn't support Date, so we use DateIsoString instead.
    completedAt: nullOr(DateIsoString),
    categoryId: nullOr(TodoCategoryId),
    priority: TodoPriority,
  },
  todoCategory: {
    id: TodoCategoryId,
    name: NonEmptyString50,
  },
} satisfies EvoluSchema;

export type DatabaseSchema = typeof DatabaseSchema;

export const evolu = createEvolu(evoluWebDeps)(DatabaseSchema, {
  reloadUrl: "/",
  name: getOrThrow(SimpleName.from("evolu-svelte-example")),

  ...(import.meta.env.DEV && {
    syncUrl: "http://localhost:4000",
  }),

  initialData: (_evolu) => {
    const todoCategory = _evolu.insert("todoCategory", {
      name: getOrThrow(NonEmptyString50.from("Not Urgent")),
    });

    assert(todoCategory.ok, "invalid initial data");

    _evolu.insert("todo", {
      title: getOrThrow(NonEmptyString1000.from("Try Vue computed()")),
      categoryId: todoCategory.value.id,
      priority: "low",
    });
  },

  // Indexes are not necessary for development but are recommended for production.
  // https://www.evolu.dev/docs/indexes
  indexes: (create) => [
    create("todoCreatedAt").on("todo").column("createdAt"),
    create("todoCategoryCreatedAt").on("todoCategory").column("createdAt"),
  ],

  // enableLogging: true,
});

export const useEvolu = createUseEvolu(evolu);
