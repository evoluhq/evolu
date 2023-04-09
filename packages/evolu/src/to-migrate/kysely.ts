import {
  DatabaseIntrospector,
  Driver,
  DummyDriver,
  Kysely,
  QueryCompiler,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

export const kysely = new Kysely({
  dialect: {
    createAdapter(): SqliteAdapter {
      return new SqliteAdapter();
    },
    createDriver(): Driver {
      return new DummyDriver();
    },
    createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
      return new SqliteIntrospector(db);
    },
    createQueryCompiler(): QueryCompiler {
      return new SqliteQueryCompiler();
    },
  },
});
