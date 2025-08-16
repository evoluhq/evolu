import {
  CreateIndexBuilder,
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteQueryCompiler,
} from "kysely";
import { DbIndex } from "./DbSchema.js";

// https://kysely.dev/docs/recipes/splitting-query-building-and-execution
export const kysely = new Kysely({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector() {
      throw new Error("Not implemeneted");
    },
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

export type DbIndexesBuilder = (
  create: (indexName: string) => CreateIndexBuilder,
) => ReadonlyArray<CreateIndexBuilder<any>>;

const createIndex = kysely.schema.createIndex.bind(kysely.schema);

export const createIndexes = (
  indexes?: DbIndexesBuilder,
): ReadonlyArray<DbIndex> => {
  if (!indexes) return [];
  return indexes(createIndex).map(
    (index): DbIndex => ({
      name: index.toOperationNode().name.name,
      sql: index.compile().sql,
    }),
  );
};
