import { Context, Effect, Layer } from "effect";
import { createRuntime } from "./Config.js";
import { createDb, DbFactory, DbSchema } from "./Db.js";
import {
  createEvoluEffect,
  Evolu,
  EvoluConfig,
  EvoluSchema,
  schemaToTables,
} from "./Evolu.js";
import { createNanoIdGeneratorLive } from "./Crypto.js";
import { AppState, FlushSync, SyncLock } from "./Platform.js";
import { Sqlite, SqliteFactory, SqliteRow } from "./Sqlite.js";
import { Time } from "./Crdt.js";
import { Sync, SyncFactory } from "./Sync.js";
import { customAlphabet, nanoid } from "nanoid";
import { Schema } from "@effect/schema";
import Database from "better-sqlite3";

const sqliteFromDatabase = (db: Database.Database) =>
  Sqlite.of({
    exec: (query) =>
      Effect.sync(() => {
        // Use a prepared statement to tell if the query returns data or not.
        const prepared = db.prepare(query.sql);
        const parameters = query.parameters || [];

        const result = prepared.reader
          ? { rows: prepared.all(parameters) as SqliteRow[], changes: 0 }
          : { rows: [], changes: prepared.run(parameters).changes };

        return result;
      }),

    transaction: () => (effect) => effect,

    export: () => Effect.succeed(new Uint8Array()),
  });

export const SqliteTest = Layer.effect(
  Sqlite,
  Effect.sync(() => {
    const db = new Database(":memory:");

    return sqliteFromDatabase(db);
  })
);

const SqliteFactoryTest = Layer.map(SqliteTest, (layer) => Context.add(layer, SqliteFactory, SqliteFactory.of({ createSqlite: Effect.succeed(Context.get(layer, Sqlite)) })))

/**
 * Creates a DbFactory effect that wraps the createDb function.
 * This effect maps the createDb function to a DbFactory instance,
 * ensuring that the createDb operation is wrapped in an Effect.succeed.
 */
const createDbFactoryEffect = createDb.pipe(
  Effect.map((createDb) =>
    DbFactory.of({ createDb: Effect.succeed(createDb) }),
  ),
);

const DbFactoryTest = Layer.effect(DbFactory, createDbFactoryEffect);

const createSyncTest = Effect.succeed(
  Sync.of({
    init: () => Effect.void,
    sync: (data) =>
      Effect.succeed({
        messages: [],
        merkleTree: data.merkleTree,
      }),
  }),
);

const SyncFactoryTest = Layer.succeed(
  SyncFactory,
  SyncFactory.of({
    createSync: createSyncTest,
  }),
);

const AppStateTest = Layer.succeed(
  AppState,
  AppState.of({
    init: () => Effect.succeed({ reset: Effect.void }),
  }),
);

const SyncLockTest = Layer.succeed(
  SyncLock,
  SyncLock.of({
    tryAcquire: Effect.succeed({ release: Effect.void }),
  }),
);

const NanoidGeneratorTest = createNanoIdGeneratorLive(customAlphabet, nanoid);

const FlushSyncTest = Layer.succeed(FlushSync, () => {});

const DependenciesLayer = Layer.mergeAll(
  DbFactoryTest.pipe(
    Layer.provideMerge(SyncLockTest),
    Layer.provideMerge(SyncFactoryTest),
    Layer.provideMerge(NanoidGeneratorTest),
    Layer.provide(SqliteFactoryTest),
    Layer.provide(Time.Live),
  ),
  FlushSyncTest,
  AppStateTest,
);

/**
 * Creates a test instance of Evolu with mocked dependencies for testing purposes.
 * 
 * @param tableSchema - The schema definition for the database tables.
 * @param config - Optional configuration for Evolu, including custom indexes.
 * @returns An instance of Evolu<T> configured for testing.
 */
export function createTestEvolu<T extends EvoluSchema, I>(
  tableSchema: Schema.Schema<T, I>,
  config: Partial<EvoluConfig<T>> = {},
): Evolu<T> {
  // Create a DbSchema object from the provided table schema and optional indexes
  const schema = {
    indexes: config.indexes ?? [],
    tables: schemaToTables(tableSchema),
  } satisfies DbSchema;

  // Create a runtime environment based on the provided config
  const runtime = createRuntime(config);

  // Create and run the Evolu effect with mocked dependencies
  return createEvoluEffect(schema, runtime).pipe(
    Effect.provide(DependenciesLayer),
    runtime.runSync,
  ) as Evolu<T>;
}
