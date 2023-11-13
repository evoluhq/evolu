import { Schema } from "@evolu/common";
import { Context } from "effect";

export interface ReactHooks<S extends Schema> {
  /**
   * `useQuery` React Hook performs a database query and returns `rows` and
   * `row` props that are automatically updated when data changes. It
   * takes two callbacks, a Kysely type-safe SQL query builder, and a
   * `filterMap` helper for rows filtering and ad-hoc migrations. Note that
   * `useQuery` uses React Suspense.
   *
   * ### Examples
   *
   * The most simple example:
   *
   * ```
   * const { rows } = useQuery((db) => db.selectFrom("todo").selectAll());
   * ```
   *
   * If you mouse hover over `rows`, you will see that all columns except `Id`
   * are nullable regardless of the database Schema.
   *
   * There are two good reasons for that. The first is the local-first app
   * database schema can be changed anytime, but already-created data can't
   * because it's not feasible to migrate all local data. The second reason
   * is that sync messages can arrive in any order in distributed systems.
   *
   * The remedy for nullability is ad-hoc filtering and mapping via filterMap
   * helper. This example filters out rows with falsy titles:
   *
   * ```
   * const { rows } = useQuery(
   *   (db) => db.selectFrom("todo").selectAll(),
   *   ({ title, ...rest }) => title && { title, ...rest }
   * );
   * ```
   *
   * A real app would filterMap all versions of the table schema defined
   * by a union of types, therefore safely enforced by the TypeScript compiler.
   *
   * The next example shows the usage of columns that Evolu automatically
   * adds to all tables. Those columns are: `createdAt`, `updatedAt`, and `isDeleted`.
   *
   * ```
   * const { rows } = useQuery(
   *   (db) =>
   *     db
   *       .selectFrom("todoCategory")
   *       .select(["id", "name"])
   *       .where("isDeleted", "is not", Evolu.cast(true))
   *       .orderBy("createdAt"),
   *   ({ name, ...rest }) => name && { name, ...rest }
   * );
   * ```
   *
   * Note `Evolu.cast` usage. It's Evolu's helper to cast booleans and dates
   * that SQLite does not support natively.
   */
  //   readonly useQuery: UseQuery<S>;
  /**
   * `useMutation` React Hook returns an object with two functions for creating
   * and updating rows in the database.
   *
   * Note that Evolu does not use SQL for mutations. It's not a bug;
   * it's a feature. SQL for mutations is dangerous for local-first apps.
   * One wrong update can accidentally affect many rows.
   *
   * Local-first data are meant to last forever. Imagine an SQL update that
   * changes tons of data. That would generate a lot of sync messages making
   * sync slow and backup huge.
   *
   * Explicit mutations also allow Evolu to automatically add and update
   * a few useful columns common to all tables.
   *
   * Those columns are: `createdAt`, `updatedAt`, and `isDeleted`.
   */
  //   readonly useMutation: UseMutation<S>;
  /**
   * `useEvoluError` React Hook returns `EvoluError`.
   *
   * Evolu should never fail; that's one of the advantages of local-first apps,
   * but if an error still occurs, please report it in Evolu GitHub issues.
   *
   * The reason why Evolu should never fail is that there is no reason it should.
   * Mutations are saved immediately and synced when the internet is available.
   * The only expectable error is QuotaExceeded (TODO).
   */
  //   readonly useEvoluError: () => EvoluError | null;
  /**
   * `useOwner` React Hook returns `Owner`.
   */
  //   readonly useOwner: () => Owner | null;
  /**
   * `useOwnerActions` React Hook returns `OwnerActions` that can be used to
   * reset `Owner` on the current device or restore `Owner` on a different one.
   */
  //   readonly useOwnerActions: () => OwnerActions;
  /**
   * `useSyncState` React Hook returns `SyncState`.
   *
   * Don't unnecessarily frighten users with a message that they do not have
   * synchronized data. It's okay to be offline. However, you can warn users
   * if they have been offline too long.
   */
  //   readonly useSyncState: () => SyncState;
}

export const ReactHooks = <S extends Schema>(): Context.Tag<
  ReactHooks<S>,
  ReactHooks<S>
> => Context.Tag<ReactHooks<S>>();
