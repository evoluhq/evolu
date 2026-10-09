import {
  createQueryBuilder,
  id,
  NonEmptyTrimmedString100,
  nullOr,
  SqliteBoolean,
  sqliteTrue,
} from "@evolu/common";

// Evolu Schema supports any Standard Schema compatible library, such as Zod.
// This one uses Evolu Type.
export const Schema = {
  todo: {
    id: id("Todo"),
    title: NonEmptyTrimmedString100,
    isCompleted: nullOr(SqliteBoolean),
  },
};

// Type-safe SQL, built with Kysely.
const createQuery = createQueryBuilder(Schema);

export const todosQuery = createQuery((db) =>
  db
    .selectFrom("todo")
    .select(["id", "title", "isCompleted"])
    .where("isDeleted", "is not", sqliteTrue)
    .orderBy("createdAt"),
);
