import {
  EvoluSchema,
  id,
  json,
  nullOr,
  SqliteBoolean,
  FiniteNumber,
  maxLength,
  NonEmptyString,
  object,
} from "@evolu/common";

// Define the typed IDs
export const TodoId = id("Todo");
export type TodoId = typeof TodoId.Type;

export const TodoCategoryId = id("TodoCategory");
export type TodoCategoryId = typeof TodoCategoryId.Type;

// Custom branded types
const NonEmptyString50 = maxLength(50)(NonEmptyString);
export type NonEmptyString50 = typeof NonEmptyString50.Type;

const NonEmptyString1000 = maxLength(1000)(NonEmptyString);
export type NonEmptyString1000 = typeof NonEmptyString1000.Type;

// Person object for JSON data
const Person = object({
  name: NonEmptyString50,
  // Use FiniteNumber to prevent NaN/null issues
  age: FiniteNumber,
});
export type Person = typeof Person.Type;

// JSON type for Person data
const PersonJson = json(Person, "PersonJson");
export type PersonJson = typeof PersonJson.Type;

const TodoSchema = {
  id: TodoId,
  title: NonEmptyString1000,
  isCompleted: nullOr(SqliteBoolean),
  categoryId: nullOr(TodoCategoryId),
  personJson: nullOr(PersonJson),
} as const;

const TodoCategorySchema = {
  id: TodoCategoryId,
  name: NonEmptyString50,
} as const;

export const Schema = {
  todo: TodoSchema,
  todoCategory: TodoCategorySchema,
} satisfies EvoluSchema;
