import * as S from "@effect/schema/Schema";
import {
  NonEmptyString1000,
  SqliteBoolean,
  String,
  createIndexes,
  database,
  id,
  table,
} from "@evolu/react-native";

// Let's start with the database schema.

// Every table needs Id. It's defined as a branded type.
// Branded types make database types super safe.
export const TodoId = id("Todo");
export type TodoId = typeof TodoId.Type;

export const TodoCategoryId = id("TodoCategory");
export type TodoCategoryId = typeof TodoCategoryId.Type;

// This branded type ensures a string must be validated before being put
// into the database.
export const NonEmptyString50 = String.pipe(
  S.minLength(1),
  S.maxLength(50),
  S.brand("NonEmptyString50"),
);
export type NonEmptyString50 = typeof NonEmptyString50.Type;

// Now we can define tables.
export const TodoTable = table({
  id: TodoId,
  title: NonEmptyString1000,
  isCompleted: S.NullOr(SqliteBoolean),
  categoryId: S.NullOr(TodoCategoryId),
});
export type TodoTable = typeof TodoTable.Type;

// Evolu tables can contain typed JSONs.
export const SomeJson = S.Struct({ foo: S.String, bar: S.Boolean });
export type SomeJson = typeof SomeJson.Type;

export const TodoCategoryTable = table({
  id: TodoCategoryId,
  name: NonEmptyString50,
  json: S.NullOr(SomeJson),
});
export type TodoCategoryTable = typeof TodoCategoryTable.Type;

// Now, we can define the database schema.
export const Database = database({
  todo: TodoTable,
  todoCategory: TodoCategoryTable,
});
export type Database = typeof Database.Type;

/**
 * Indexes are not necessary for development but are required for production.
 * Before adding an index, use `logExecutionTime` and `logExplainQueryPlan`
 * createQuery options.
 *
 * See https://www.evolu.dev/docs/indexes
 */
export const indexes = createIndexes((create) => [
  create("indexTodoCreatedAt").on("todo").column("createdAt"),
  create("indexTodoCategoryCreatedAt").on("todoCategory").column("createdAt"),
]);

export interface TodoCategoryForSelect {
  readonly id: TodoCategoryTable["id"];
  readonly name: TodoCategoryTable["name"] | null;
}
