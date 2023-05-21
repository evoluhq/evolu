import { constNull, pipe } from "@effect/data/Function";
import * as Option from "@effect/data/Option";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Kysely from "kysely";
import { useMemo, useRef, useSyncExternalStore } from "react";
import {
  AllowAutoCasting,
  CommonColumns,
  Evolu,
  EvoluError,
  Owner,
  OwnerActions,
  QueryCallback,
  Row,
  Schema,
} from "./Types.js";

type OrNullOrFalse<T> = T | null | false;
type ExcludeNullAndFalse<T> = Exclude<T, null | false>;

type UseQuery<S extends Schema> = <
  QueryRow extends Row,
  FilterMapRow extends Row
>(
  queryCallback: OrNullOrFalse<QueryCallback<S, QueryRow>>,
  filterMap: (row: QueryRow) => OrNullOrFalse<FilterMapRow>
) => {
  /**
   * Rows from the database. They can be filtered and mapped by `filterMap`.
   */
  readonly rows: ReadonlyArray<
    Readonly<Kysely.Simplify<ExcludeNullAndFalse<FilterMapRow>>>
  >;
  /**
   * The first row from `rows`. For empty rows, it's null.
   */
  readonly firstRow: Readonly<
    Kysely.Simplify<ExcludeNullAndFalse<FilterMapRow>>
  > | null;
};

// https://stackoverflow.com/a/54713648/233902
type NullablePartial<
  T,
  NK extends keyof T = {
    [K in keyof T]: null extends T[K] ? K : never;
  }[keyof T],
  NP = Pick<T, Exclude<keyof T, NK>> & Partial<Pick<T, NK>>
> = { [K in keyof NP]: NP[K] };

type Create<S extends Schema> = <T extends keyof S>(
  table: T,
  values: Kysely.Simplify<NullablePartial<AllowAutoCasting<Omit<S[T], "id">>>>,
  onComplete?: () => void
) => {
  readonly id: S[T]["id"];
};

type Update<S extends Schema> = <T extends keyof S>(
  table: T,
  values: Kysely.Simplify<
    Partial<
      AllowAutoCasting<Omit<S[T], "id"> & Pick<CommonColumns, "isDeleted">>
    > & { id: S[T]["id"] }
  >,
  onComplete?: () => void
) => {
  readonly id: S[T]["id"];
};

type UseMutation<S extends Schema> = () => {
  /**
   * Creates a new row with the given values.
   *
   * ### Examples
   *
   * To create a new row:
   *
   * ```
   * const { create } = useMutation();
   * create("todo", { title });
   * ```
   *
   * To get a new row's `Id`:
   *
   * ```
   * const { create } = useMutation();
   * const { id } = create("todo", { title });
   * ```
   *
   * To wait until a new row is rendered:
   *
   * ```
   * const { create } = useMutation();
   * create("todo", { title }, onComplete);
   * ```
   */
  readonly create: Create<S>;
  /**
   * Update a row with the given values.
   *
   * ### Examples
   *
   * To update a row:
   *
   * ```
   * const { update } = useMutation();
   * update("todo", { id, title });
   * ```
   *
   * To wait until the updated row is rendered:
   *
   * ```
   * const { update } = useMutation();
   * update("todo", { id, title }, onComplete);
   * ```
   *
   * To delete a row.
   *
   * ```
   * const { update } = useMutation();
   * update("todo", { id, isDeleted: true });
   * ```
   */
  readonly update: Update<S>;
};

export interface Hooks<S extends Schema> {
  /**
   * `useQuery` React Hook performs a database query and returns rows that
   * are automatically updated when data changes. `useQuery` uses React
   * Suspense.
   *
   * `useQuery` takes two callbacks, a Kysely type-safe SQL query builder
   * and a `filterMap` helper for rows filtering and ad-hoc migrations.
   *
   * `useQuery` returns `rows` and `firstRow` props.
   *
   * ### Examples
   *
   * The most simple example:
   *
   * ```
   * const { rows } = useQuery(
   *   (db) => db.selectFrom("todo").selectAll(),
   *   (row) => row
   * );
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
   * adds to all tables. Those columns are: `createdAt`, `createdBy`,
   * `updatedAt`, and `isDeleted`.
   *
   * ```
   * const { rows } = useQuery(
   *   (db) =>
   *     db
   *       .selectFrom("todoCategory")
   *       .select(["id", "name"])
   *       .where("isDeleted", "is not", E.cast(true))
   *       .orderBy("createdAt"),
   *   ({ name, ...rest }) => name && { name, ...rest }
   * );
   * ```
   *
   * Note `E.cast` usage. It's Evolu's helper to cast booleans and dates
   * that SQLite does not support natively.
   */
  readonly useQuery: UseQuery<S>;
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
   * Those columns are: `createdAt`, `createdBy`, `updatedAt`, and `isDeleted`.
   */
  readonly useMutation: UseMutation<S>;
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
  readonly useEvoluError: () => EvoluError | null;
  /**
   * `useOwner` React Hook returns `Owner`.
   */
  readonly useOwner: () => Owner | null;
  /**
   * `useOwnerActions` React Hook returns `OwnerActions` that can be used to
   * reset `Owner` on the current device or restore `Owner` on a different one.
   */
  readonly useOwnerActions: () => OwnerActions;
}

/**
 * `create` defines the database schema and returns React Hooks.
 * Evolu uses [Schema](https://github.com/effect-ts/schema) for domain modeling.
 *
 * ### Example
 *
 * ```
 * import * as Schema from "@effect/schema/Schema";
 * import * as Evolu from "evolu";
 *
 * const TodoId = Evolu.id("Todo");
 * type TodoId = Schema.To<typeof TodoId>;
 *
 * const TodoTable = Schema.struct({
 *   id: TodoId,
 *   title: Evolu.NonEmptyString1000,
 *   isCompleted: Evolu.SqliteBoolean,
 * });
 * type TodoTable = Schema.To<typeof TodoTable>;
 *
 * const Database = Schema.struct({
 *   todo: TodoTable,
 * });
 *
 * export const {
 *   useQuery,
 *   useMutation,
 *   useEvoluError,
 *   useOwner,
 *   useOwnerActions,
 * } = Evolu.create(Database);
 * ```
 *
 * There is one simple rule for local-first apps domain modeling:
 * After the initial release, models shall be append-only.
 *
 * Tables and columns shall not be removed because there is a possibility
 * that somebody is already using them. Column types shall be enriched only.
 *
 * With this simple rule, any app version can handle any schema version.
 * Evolu database is schemaless and doesn't have to be migrated when
 * a schema is changed. Migrations are not feasible for local-first apps.
 *
 * If an obsolete app gets a sync message with a newer schema, Evolu
 * automatically updates the database schema to store the message safely,
 * and `useQuery` filterMap helper will ignore unknown rows until
 * the app is updated.
 *
 * To learn more about migration-less schema evolving, check the `useQuery`
 * documentation.
 */
export const createHooks = <S extends Schema>(evolu: Evolu<S>): Hooks<S> => {
  const cache = new WeakMap<Row, Option.Option<Row>>();

  const useQuery: UseQuery<S> = (queryCallback, filterMap) => {
    const query = useMemo(
      () => (queryCallback ? evolu.createQuery(queryCallback) : null),
      [queryCallback]
    );

    const promise = useMemo(() => {
      return query ? evolu.loadQuery(query) : null;
    }, [query]);

    if (promise && evolu.isPending(promise)) throw promise;

    const subscribedRows = useSyncExternalStore(
      useMemo(() => evolu.subscribeQuery(query), [query]),
      useMemo(() => () => evolu.getQuery(query), [query]),
      constNull
    );

    // Use useRef until React Forget release.
    const filterMapRef = useRef(filterMap);

    const rows = useMemo(
      () =>
        pipe(
          subscribedRows,
          Option.fromNullable,
          Option.map(
            ReadonlyArray.filterMap((row) => {
              let cachedRow = cache.get(row);
              if (cachedRow !== undefined) return cachedRow;
              cachedRow = pipe(filterMapRef.current(row as never), (row) =>
                row ? Option.some(row) : Option.none
              ) as never;
              cache.set(row, cachedRow);
              return cachedRow;
            })
          ),
          Option.getOrElse(() => ReadonlyArray.empty())
        ),
      [subscribedRows]
    );

    return {
      rows: rows as never,
      firstRow: rows[0] as never,
    };
  };

  const useMutation: UseMutation<S> = () =>
    useMemo(
      () => ({
        create: evolu.mutate as Create<S>,
        update: evolu.mutate as Update<S>,
      }),
      []
    );

  const useEvoluError: Hooks<S>["useEvoluError"] = () =>
    useSyncExternalStore(evolu.subscribeError, evolu.getError, constNull);

  const useOwner: Hooks<S>["useOwner"] = () =>
    useSyncExternalStore(evolu.subscribeOwner, evolu.getOwner, constNull);

  const useOwnerActions: Hooks<S>["useOwnerActions"] = () => evolu.ownerActions;

  return {
    useQuery,
    useMutation,
    useEvoluError,
    useOwner,
    useOwnerActions,
  };
};
