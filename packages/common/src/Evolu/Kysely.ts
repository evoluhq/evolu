import {
  CreateIndexBuilder,
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteQueryCompiler,
} from "kysely";
import { Index } from "./Db.js";

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

export const createIndex = kysely.schema.createIndex.bind(kysely.schema);

export type Indexex = (
  create: typeof createIndex,
) => ReadonlyArray<CreateIndexBuilder<any>>;

export const createIndexes = (indexes?: Indexex): ReadonlyArray<Index> => {
  if (!indexes) return [];
  return indexes(createIndex).map(
    (index): Index => ({
      name: index.toOperationNode().name.name,
      sql: index.compile().sql,
    }),
  );
};
