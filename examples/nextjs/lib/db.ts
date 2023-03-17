import { pipe } from "@effect/data/Function";
import * as S from "@effect/schema";
import * as E from "evolu";

export const TodoId = E.id("Todo");
export type TodoId = S.Infer<typeof TodoId>;

export const TodoCategoryId = E.id("TodoCategory");
export type TodoCategoryId = S.Infer<typeof TodoCategoryId>;

export const NonEmptyString50 = pipe(
  S.string,
  S.minLength(1),
  S.maxLength(50),
  S.brand("NonEmptyString50")
);
export type NonEmptyString50 = S.Infer<typeof NonEmptyString50>;

export const TodoTable = S.struct({
  id: TodoId,
  title: E.NonEmptyString1000,
  isCompleted: E.SqliteBoolean,
  categoryId: S.nullable(TodoCategoryId),
});
export type TodoTable = S.Infer<typeof TodoTable>;

export const TodoCategoryTable = S.struct({
  id: TodoCategoryId,
  name: NonEmptyString50,
});
export type TodoCategoryTable = S.Infer<typeof TodoCategoryTable>;

const Database = S.struct({
  todo: TodoTable,
  todoCategory: TodoCategoryTable,
});

export const {
  useQuery,
  useMutation,
  useEvoluError,
  useOwner,
  useOwnerActions,
} = E.createHooks(Database);
