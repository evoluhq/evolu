import {
  createQueryBuilder,
  id,
  NonEmptyTrimmedString100,
  nullOr,
  SqliteBoolean,
  sqliteTrue,
  type KyselyNotNull,
} from "@evolu/common";

// Any Standard Schema library can be used.
export const AppSchema = {
  todo: {
    // Primary keys are branded types, so a TodoId can't be used where another
    // table's ID is expected.
    id: id("Todo"),
    title: NonEmptyTrimmedString100,
    // SQLite doesn't support the boolean type; it uses 0 and 1 instead.
    isCompleted: nullOr(SqliteBoolean),
  },
};

const createAppQuery = createQueryBuilder(AppSchema);

export const todosQuery = createAppQuery((db) =>
  db
    // Type-safe SQL: try autocomplete for table and column names.
    .selectFrom("todo")
    .select(["id", "title", "isCompleted"])

    // Soft delete: filter out deleted rows.
    .where("isDeleted", "is not", sqliteTrue)

    // All columns except id are nullable in queries, so the schema can evolve
    // without migrations. Filter nulls with where + $narrowType.
    .where("title", "is not", null)
    .$narrowType<{ title: KyselyNotNull }>()
    .orderBy("createdAt"),
);
