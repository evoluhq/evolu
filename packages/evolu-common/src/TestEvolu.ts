/**
 * This file provides utilities for creating test instances of Evolu, a
 * local-first database system. It allows developers to create isolated,
 * in-memory database instances for testing purposes.
 *
 * The main export is the `createTestEvolu` function, which creates a TestEvolu
 * instance.
 *
 * TestEvolu extends the standard Evolu interface with an additional `fork`
 * method:
 *
 * - It creates an independent copy of the current database state.
 * - Each fork operates on its own isolated database, allowing for parallel
 *   testing scenarios.
 * - Changes in a fork do not affect the parent or sibling forks.
 *
 * TestEvolu also ensures that all database operations are completed before
 * allowing a fork, preventing race conditions in tests.
 *
 * This implementation uses an in-memory SQLite database, making it fast and
 * isolated for each test run. It mocks various Evolu dependencies to create a
 * controlled testing environment.
 */

import { Effect, Layer } from "effect";
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

// Creates a Sqlite service from a given DB.
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

// Creates a layer that provides a SqliteFactory from a given DB.
const sqliteFactoryFromDb = (
  db: Database.Database,
): Layer.Layer<SqliteFactory> => {
  const sqlite = sqliteFromDatabase(db);
  return Layer.succeed(
    SqliteFactory,
    SqliteFactory.of({ createSqlite: Effect.succeed(sqlite) }),
  );
};

// CREATE STUB DEPENDENCIES:
// `createEvoluEffect` has a lot of dependencies that we need to provide and stub.
// For the most part we use existing implementations, except we replace the
// sync and app state services with stubs that don't actually do anything.
// We stub out sync because it uses a Worker, which slows things down and is async.
// Also if you are wanting to test sync, you should be ideally doing E2E tests.

const DbFactoryTest = Layer.effect(
  DbFactory,
  // `createDb` creates the DB Evolu uses. We'll provide the SQLite dependency it needs later.
  createDb.pipe(
    Effect.map((createDb) =>
      DbFactory.of({ createDb: Effect.succeed(createDb) }),
    ),
  ),
);

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

// COMBINE ALL THE STUB DEPENDENCIES INTO A SINGLE LAYER
const DependenciesLayer = Layer.mergeAll(
  DbFactoryTest.pipe(
    Layer.provideMerge(SyncLockTest),
    Layer.provideMerge(SyncFactoryTest),
    Layer.provideMerge(NanoidGeneratorTest),
    Layer.provide(Time.Live),
  ),
  FlushSyncTest,
  AppStateTest,
);

/**
 * TestEvolu extends the standard Evolu interface with additional testing
 * capabilities. It runs an in-memory SQLite database, and turns off Evolu's
 * sync capabilities to speed up tests.
 *
 * It provides all the functionality of Evolu plus a `fork` method for creating
 * isolated database instances.
 */
export interface TestEvolu<T extends EvoluSchema> extends Evolu<T> {
  /**
   * Creates an independent copy of the current database state.
   *
   * The `fork` method allows you to create isolated database instances for
   * parallel testing scenarios. Each fork operates on its own database, and
   * changes in one fork do not affect the parent or sibling forks.
   *
   * Key features:
   *
   * - Creates a new TestEvolu instance with the current state
   * - Can be called on nested forks multiple times
   * - Ensures all pending operations are completed before forking
   *
   * @example
   *   ```typescript
   *   import { createTestEvolu } from '@evolu/common';
   *   import { database, table, NonEmptyString1000 } from '../your/db/here';
   *
   *   const db = database({
   *     todo: table({
   *       title: NonEmptyString1000,
   *     }),
   *   });
   *
   *   describe('Your Test Code', () => {
   *     // This parent instance lets the Evolu migrations for your DB run only once, instead of once per test.
   *     // This speeds up your tests!
   *     const parent = createTestEvolu(db);
   *     parent.create('todo', { title: 'Parent Todo' });
   *
   *     it('your test method', async () => {
   *       // Creates an isolated 'fork' of the database that is a copy of the parent.
   *       // Mutations past this point to the parent do not modify the fork. Mutations to the fork
   *       // do not modify the parent.
   *       const fork = await parent.fork();
   *     });
   *   });
   *   ```;
   *
   * @returns A Promise that resolves to a new TestEvolu instance
   */
  fork: () => Promise<TestEvolu<T>>;
}

// Recursive function to create a TestEvolu from a database.
// This is used to create the initial TestEvolu and also to create new forks.
function testEvoluFromDb<T extends EvoluSchema, I>(
  tableSchema: Schema.Schema<T, I>,
  config: Partial<EvoluConfig<T>> = {},
  db: Database.Database,
): TestEvolu<T> {
  // Standard setup for Evolu instance, except we create a new SqliteFactory
  // from the passed database.
  const schema = {
    indexes: config.indexes ?? [],
    tables: schemaToTables(tableSchema),
  } satisfies DbSchema;
  const runtime = createRuntime(config);
  const sqliteFactory = sqliteFactoryFromDb(db);
  const evolu = createEvoluEffect(schema, runtime).pipe(
    Effect.provide(DependenciesLayer.pipe(Layer.provide(sqliteFactory))),
    runtime.runSync,
  ) as Evolu<T>;

  //
  // IMPORTANT PART OF THE CODE
  // Evolu batches mutations asynchronously. The `create`, `update`, and `createOrUpdate`
  // methods will return synchronously but are actually performed asynchronously.
  //
  // Our `fork` method needs to wait for any pending mutations to complete. If we don't do this,
  // the new fork will not have the same state as the parent.
  //
  // So, we wrap each of the `create`, `update`, and `createOrUpdate` calls.
  // When they are called, we push a promise into the `promises` array.
  // Then when `fork` is called, it awaits all of the promises in the array. This ensures that
  // all mutations are complete and the fork will have the same state as the parent.
  //

  let promises: Promise<void>[] = [];

  // Promise.withResolvers is not yet supported in TS (you will get an error if you try to use it). So
  // this is a stub that does the same thing.
  //
  // Basically returns a promise and its resolve function.
  const withResolve = () => {
    let resolve: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });

    return {
      promise,
      resolve: resolve!,
    };
  };

  // Wraps the `create`, `update`, etc. callbacks with a function that will push a promise into the `promises` array
  // when the callback is called.
  const resolvableCallback = (callback?: () => void) => {
    const { promise, resolve } = withResolve();

    promises.push(promise);

    return () => {
      resolve();
      if (callback) {
        callback();
      }
    };
  };

  // Forks the database by serializing the current state and creating a new database from the serialized state.
  // Awaits all promises in the `promises` array to ensure all mutations are complete.
  const forkDatabase = async () => {
    await Promise.all(promises);
    promises = [];
    const serialized = db.serialize();

    const newDb = new Database(serialized);

    return testEvoluFromDb(tableSchema, config, newDb);
  };

  return {
    fork: forkDatabase,
    ...evolu,

    // WRAPPING THESE METHODS TO ENSURE ALL MUTATIONS ARE COMPLETE BEFORE FORKING
    create: (a, b, onComplete) =>
      evolu.create(a, b, resolvableCallback(onComplete)),
    update: (a, b, onComplete) =>
      evolu.update(a, b, resolvableCallback(onComplete)),
    createOrUpdate: (a, b, onComplete) =>
      evolu.createOrUpdate(a, b, resolvableCallback(onComplete)),
  };
}

/**
 * Creates a test instance of Evolu with mocked dependencies for testing
 * purposes. Also includes a `fork` method for creating independent database
 * instances. See `TestEvolu<T>` for more information.
 *
 * @param tableSchema - The schema definition for the database tables.
 * @param config - Optional configuration for Evolu, including custom indexes.
 * @returns An instance of Evolu<T> configured for testing.
 */
export function createTestEvolu<T extends EvoluSchema, I>(
  tableSchema: Schema.Schema<T, I>,
  config: Partial<EvoluConfig<T>> = {},
): TestEvolu<T> {
  const db = new Database(":memory:");

  return testEvoluFromDb(tableSchema, config, db);
}
