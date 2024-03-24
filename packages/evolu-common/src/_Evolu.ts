import * as S from "@effect/schema/Schema";
import * as Kysely from "kysely";
import { TimestampError } from "./Crdt.js";
import { Mnemonic } from "./Crypto.js";
import {
  DatabaseSchema,
  Queries,
  Query,
  QueryResult,
  QueryResultsPromisesFromQueries,
  Row,
} from "./Db.js";
import { SqliteBoolean, SqliteDate } from "./Model.js";
import { Owner } from "./Owner.js";
import { Index, SqliteQueryOptions } from "./Sqlite.js";
import { Listener, Unsubscribe } from "./Store.js";
import { SyncState } from "./SyncWorker.js";

export interface Evolu<T extends DatabaseSchema = DatabaseSchema> {
  /**
   * Subscribe to {@link EvoluError} changes.
   *
   * @example
   *   const unsubscribe = evolu.subscribeError(() => {
   *     const error = evolu.getError();
   *     console.log(error);
   *   });
   */
  readonly subscribeError: (listener: Listener) => Unsubscribe;

  /** Get {@link EvoluError}. */
  readonly getError: () => EvoluError | null;

  /**
   * Create type-safe SQL {@link Query}.
   *
   * Evolu uses Kysely - the type-safe SQL query builder for TypeScript. See
   * https://kysely.dev.
   *
   * For mutations, use {@link create} and {@link update}.
   *
   * @example
   *   const allTodos = evolu.createQuery((db) =>
   *     db.selectFrom("todo").selectAll(),
   *   );
   *
   *   const todoById = (id: TodoId) =>
   *     evolu.createQuery((db) =>
   *       db.selectFrom("todo").selectAll().where("id", "=", id),
   *     );
   */
  readonly createQuery: <R extends Row>(
    queryCallback: (
      db: Pick<
        Kysely.Kysely<{
          [Table in keyof T]: NullableExceptIdCreatedAtUpdatedAt<{
            [Column in keyof T[Table]]: T[Table][Column];
          }>;
        }>,
        "selectFrom" | "fn" | "with" | "withRecursive"
      >,
    ) => Kysely.SelectQueryBuilder<any, any, R>,
    options?: SqliteQueryOptions,
  ) => Query<R>;

  /**
   * Load {@link Query} and return a promise with {@link QueryResult}.
   *
   * A returned promise always resolves successfully because there is no reason
   * why loading should fail. All data are local, and the query is typed. A
   * serious unexpected Evolu error shall be handled with
   * {@link subscribeError}.
   *
   * Loading is batched, and returned promises are cached, so there is no need
   * for an additional cache. Evolu's internal cache is invalidated on
   * mutation.
   *
   * The returned promise is enriched with special status and value properties
   * for the upcoming React `use` Hook, but other UI libraries can also leverage
   * them. Speaking of React, there are two essential React Suspense-related
   * patterns that every developer should be aware of—passing promises to
   * children and caching over mutations.
   *
   * With promises passed to children, we can load a query as soon as possible,
   * but we don't have to use the returned promise immediately. That's useful
   * for prefetching, which is generally not necessary for local-first apps but
   * can be if a query takes a long time to load.
   *
   * Caching over mutation is a pattern that every developer should know. As we
   * said, Evolu caches promise until a mutation happens. A query loaded after
   * that will return a new pending promise. That's okay for general usage but
   * not for UI with React Suspense because a mutation would suspend rerendered
   * queries on a page, and that's not a good UX.
   *
   * We call this pattern "caching over mutation" because it has no globally
   * accepted name yet. React RFC for React Cache does not exist yet.
   *
   * For better UX, a query must be subscribed for updates. This way, instead of
   * Suspense flashes, the user sees new data immediately because Evolu replaces
   * cached promises with fresh, already resolved new ones.
   *
   * If you are curious why Evolu does not do that for all queries by default,
   * the answer is simple: performance. Tracking changes is costly and
   * meaningful only for visible (hence subscribed) queries anyway. To subscribe
   * to a query, use {@link subscribeQuery}.
   *
   * @example
   *   const allTodos = evolu.createQuery((db) =>
   *     db.selectFrom("todo").selectAll(),
   *   );
   *   evolu.loadQuery(allTodos).then(({ rows }) => {
   *     console.log(rows);
   *   });
   */
  readonly loadQuery: <R extends Row>(
    query: Query<R>,
  ) => Promise<QueryResult<R>>;

  /**
   * Load an array of {@link Query} queries and return an array of
   * {@link QueryResult} promises. It's like `queries.map(loadQuery)` but with
   * proper types for returned promises.
   *
   * @example
   *   evolu.loadQueries([allTodos, todoById(1)]);
   */
  readonly loadQueries: <R extends Row, Q extends Queries<R>>(
    queries: [...Q],
  ) => [...QueryResultsPromisesFromQueries<Q>];

  /**
   * Subscribe to {@link Query} {@link QueryResult} changes.
   *
   * @example
   *   const unsubscribe = evolu.subscribeQuery(allTodos)(() => {
   *     const { rows } = evolu.getQuery(allTodos);
   *   });
   */
  readonly subscribeQuery: (
    query: Query,
  ) => (listener: Listener) => Unsubscribe;

  /**
   * Get {@link Query} {@link QueryResult}.
   *
   * @example
   *   const unsubscribe = evolu.subscribeQuery(allTodos)(() => {
   *     const { rows } = evolu.getQuery(allTodos);
   *   });
   */
  readonly getQuery: <R extends Row>(query: Query<R>) => QueryResult<R>;

  /**
   * Subscribe to {@link Owner} changes.
   *
   * @example
   *   const unsubscribe = evolu.subscribeOwner(() => {
   *     const owner = evolu.getOwner();
   *   });
   */
  readonly subscribeOwner: (listener: Listener) => Unsubscribe;

  /**
   * Get {@link Owner}.
   *
   * @example
   *   const unsubscribe = evolu.subscribeOwner(() => {
   *     const owner = evolu.getOwner();
   *   });
   */
  readonly getOwner: () => Owner | null;

  /**
   * Subscribe to {@link SyncState} changes.
   *
   * @example
   *   const unsubscribe = evolu.subscribeSyncState(() => {
   *     const syncState = evolu.getSyncState();
   *   });
   */
  readonly subscribeSyncState: (listener: Listener) => Unsubscribe;

  /**
   * Get {@link SyncState}.
   *
   * @example
   *   const unsubscribe = evolu.subscribeSyncState(() => {
   *     const syncState = evolu.getSyncState();
   *   });
   */
  readonly getSyncState: () => SyncState;

  /**
   * Create a row in the database and returns a new ID. The first argument is
   * the table name, and the second is an object.
   *
   * The third optional argument, the onComplete callback, is generally
   * unnecessary because creating a row cannot fail. Still, UI libraries can use
   * it to ensure the DOM is updated if we want to manipulate it, for example,
   * to focus an element.
   *
   * Evolu does not use SQL for mutations to ensure data can be safely and
   * predictably merged without conflicts.
   *
   * Explicit mutations also allow Evolu to automatically add and update a few
   * useful columns common to all tables. Those columns are: `createdAt`,
   * `updatedAt`, and `isDeleted`.
   *
   * @example
   *   import * as S from "@effect/schema/Schema";
   *
   *   // Evolu uses the Schema to enforce domain model.
   *   const title = S.decodeSync(Evolu.NonEmptyString1000)("A title");
   *
   *   const { id } = evolu.create("todo", { title }, () => {
   *     // onComplete callback
   *   });
   */
  create: Mutate<T, "create">;

  /**
   * Update a row in the database and return the existing ID. The first argument
   * is the table name, and the second is an object.
   *
   * The third optional argument, the onComplete callback, is generally
   * unnecessary because updating a row cannot fail. Still, UI libraries can use
   * it to ensure the DOM is updated if we want to manipulate it, for example,
   * to focus an element.
   *
   * Evolu does not use SQL for mutations to ensure data can be safely and
   * predictably merged without conflicts.
   *
   * Explicit mutations also allow Evolu to automatically add and update a few
   * useful columns common to all tables. Those columns are: `createdAt`,
   * `updatedAt`, and `isDeleted`.
   *
   * @example
   *   import * as S from "@effect/schema/Schema";
   *
   *   // Evolu uses the Schema to enforce domain model.
   *   const title = S.decodeSync(Evolu.NonEmptyString1000)("A title");
   *   evolu.update("todo", { id, title });
   *
   *   // To delete a row, set `isDeleted` to true.
   *   evolu.update("todo", { id, isDeleted: true });
   */
  update: Mutate<T, "update">;

  /**
   * Create or update a row in the database and return the existing ID. The
   * first argument is the table name, and the second is an object.
   *
   * This function is useful when we already have an `id` and want to create a
   * new row or update an existing one.
   *
   * The third optional argument, the onComplete callback, is generally
   * unnecessary because updating a row cannot fail. Still, UI libraries can use
   * it to ensure the DOM is updated if we want to manipulate it, for example,
   * to focus an element.
   *
   * Evolu does not use SQL for mutations to ensure data can be safely and
   * predictably merged without conflicts.
   *
   * Explicit mutations also allow Evolu to automatically add and update a few
   * useful columns common to all tables. Those columns are: `createdAt`,
   * `updatedAt`, and `isDeleted`.
   *
   * @example
   *   import * as S from "@effect/schema/Schema";
   *   import { Id } from "@evolu/react";
   *
   *   // Id can be stable.
   *   // 2024-02-0800000000000
   *   const id = S.decodeSync(Id)(date.toString().padEnd(21, "0")) as TodoId;
   *
   *   evolu.createOrUpdate("todo", { id, title });
   */
  createOrUpdate: Mutate<T, "createOrUpdate">;

  /**
   * Delete {@link Owner} and all their data from the current device. After the
   * deletion, Evolu will purge the application state. For browsers, this will
   * reload all tabs using Evolu. For native apps, it will restart the app.
   */
  readonly resetOwner: () => void;

  /** Restore {@link Owner} with all their synced data. */
  readonly restoreOwner: (mnemonic: Mnemonic) => void;

  /**
   * Ensure tables and columns defined in {@link DatabaseSchema} exist in the
   * database.
   *
   * This function is for hot/live reload and future dynamic import.
   */
  readonly ensureSchema: <T, I>(
    schema: S.Schema<T, I>,
    indexes?: ReadonlyArray<Index>,
  ) => void;

  /**
   * Force sync with Evolu Server.
   *
   * Evolu syncs on every mutation, tab focus, and network reconnect, so it's
   * generally not required to sync manually, but if you need it, you can do
   * it.
   */
  readonly sync: () => void;

  // // TODO: dispose
}

/** The EvoluError type is used to represent errors that can occur in Evolu. */
export type EvoluError = TimestampError | UnexpectedError;

/**
 * The UnexpectedError represents errors that can occur anywhere, even in
 * third-party libraries, because Evolu uses Effect to track all errors.
 */
export interface UnexpectedError {
  readonly _tag: "UnexpectedError";
  readonly error: unknown;
}

type NullableExceptIdCreatedAtUpdatedAt<T> = {
  readonly [K in keyof T]: K extends "id" | "createdAt" | "updatedAt"
    ? T[K]
    : T[K] | null;
};

type Mutate<
  S extends DatabaseSchema = DatabaseSchema,
  Mode extends "create" | "update" | "createOrUpdate" = "update",
> = <K extends keyof S>(
  table: K,
  values: Kysely.Simplify<
    Mode extends "create"
      ? PartialForNullable<
          Castable<Omit<S[K], "id" | "createdAt" | "updatedAt" | "isDeleted">>
        >
      : Mode extends "update"
        ? Partial<Castable<Omit<S[K], "id" | "createdAt" | "updatedAt">>> & {
            readonly id: S[K]["id"];
          }
        : PartialForNullable<
            Castable<Omit<S[K], "createdAt" | "updatedAt" | "isDeleted">>
          >
  >,
  onComplete?: () => void,
) => {
  readonly id: S[K]["id"];
};

// https://stackoverflow.com/a/54713648/233902
type PartialForNullable<
  T,
  NK extends keyof T = {
    [K in keyof T]: null extends T[K] ? K : never;
  }[keyof T],
  NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>,
> = { [K in keyof NP]: NP[K] };

/**
 * SQLite doesn't support Date nor Boolean types, so Evolu emulates them with
 * {@link SqliteBoolean} and {@link SqliteDate}.
 */
type Castable<T> = {
  readonly [K in keyof T]: T[K] extends SqliteBoolean
    ? boolean | SqliteBoolean
    : T[K] extends null | SqliteBoolean
      ? null | boolean | SqliteBoolean
      : T[K] extends SqliteDate
        ? Date | SqliteDate
        : T[K] extends null | SqliteDate
          ? null | Date | SqliteDate
          : T[K];
};
