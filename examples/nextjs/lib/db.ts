import { pipe } from "@effect/data/Function";
import * as Schema from "@effect/schema/Schema";
import * as Evolu from "evolu";

export const TodoId = Evolu.id("Todo");
export type TodoId = Schema.To<typeof TodoId>;

export const TodoCategoryId = Evolu.id("TodoCategory");
export type TodoCategoryId = Schema.To<typeof TodoCategoryId>;

export const NonEmptyString50 = pipe(
  Schema.string,
  Schema.minLength(1),
  Schema.maxLength(50),
  Schema.brand("NonEmptyString50")
);
export type NonEmptyString50 = Schema.To<typeof NonEmptyString50>;

export const TodoTable = Schema.struct({
  id: TodoId,
  title: Evolu.NonEmptyString1000,
  isCompleted: Evolu.SqliteBoolean,
  categoryId: Schema.nullable(TodoCategoryId),
});
export type TodoTable = Schema.To<typeof TodoTable>;

export const TodoCategoryTable = Schema.struct({
  id: TodoCategoryId,
  name: NonEmptyString50,
});
export type TodoCategoryTable = Schema.To<typeof TodoCategoryTable>;

const Database = Schema.struct({
  todo: TodoTable,
  todoCategory: TodoCategoryTable,
});

export const {
  useQuery,
  useMutation,
  useEvoluError,
  useOwner,
  useOwnerActions,
} = Evolu.create(Database);
