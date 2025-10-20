import {
  EvoluSchema,
  id,
  NonEmptyString100,
  nullOr,
  SqliteBoolean,
} from "@evolu/common";

// Define the typed IDs
export const TodoId = id("Todo");
export type TodoId = typeof TodoId.Type;

const TodoSchema = {
  id: TodoId,
  title: NonEmptyString100,
  isCompleted: nullOr(SqliteBoolean),
} as const;

export const Schema = {
  todo: TodoSchema,
} satisfies EvoluSchema;
