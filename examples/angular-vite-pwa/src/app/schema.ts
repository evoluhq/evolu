import {
  EvoluSchema,
  id,
  NonEmptyTrimmedString100,
  nullOr,
  SqliteBoolean,
} from "@evolu/common";

// Define the typed IDs
export const TodoId = /*#__PURE__*/ id("Todo");
export type TodoId = typeof TodoId.Output;

const TodoSchema = {
  id: TodoId,
  title: NonEmptyTrimmedString100,
  isCompleted: nullOr(SqliteBoolean),
} as const;

export const Schema = {
  todo: TodoSchema,
} satisfies EvoluSchema;
