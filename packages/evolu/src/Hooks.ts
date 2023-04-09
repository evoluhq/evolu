import { constNull, pipe } from "@effect/data/Function";
import * as Option from "@effect/data/Option";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Schema from "@effect/schema/Schema";
import * as Kysely from "kysely";
import { useMemo, useRef, useSyncExternalStore } from "react";
import * as Config from "./Config.js";
import * as Db from "./Db.js";
import * as Errors from "./Errors.js";
import * as Evolu from "./Evolu.js";
import * as Model from "./Model.js";

type KyselySelectFrom<DB> = Pick<Kysely.Kysely<DB>, "selectFrom">;

type QueryCallback<S extends Db.Schema, QueryRow> = (
  db: KyselySelectFrom<Db.SchemaForQuery<S>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Kysely.SelectQueryBuilder<any, any, QueryRow>;

type OrNullOrFalse<T> = T | null | false;
type ExcludeNullAndFalse<T> = Exclude<T, null | false>;

type UseQuery<S extends Db.Schema> = <
  QueryRow extends Db.Row,
  FilterMapRow extends Db.Row
>(
  query: OrNullOrFalse<QueryCallback<S, QueryRow>>,
  filterMap: (row: QueryRow) => OrNullOrFalse<FilterMapRow>
) => {
  /**
   * Rows from the database. They can be filtered and mapped by `filterMap`.
   */
  readonly rows: readonly Readonly<
    Kysely.Simplify<ExcludeNullAndFalse<FilterMapRow>>
  >[];
  /**
   * The first row from `rows`. For empty rows, it's null.
   */
  readonly row: Readonly<
    Kysely.Simplify<ExcludeNullAndFalse<FilterMapRow>>
  > | null;
  /**
   * `isLoaded` becomes true when rows are loaded for the first time.
   * Rows are cached per SQL query, so this happens only once.
   */
  readonly isLoaded: boolean;
  /**
   * `isLoading` becomes true whenever rows are loading.
   */
  readonly isLoading: boolean;
};

type UseMutation<S extends Db.Schema> = () => {
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
  readonly create: Db.Create<S>;
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
  readonly update: Db.Update<S>;
};

interface Hooks<S extends Db.Schema> {
  /**
   * `useQuery` React Hook performs a database query and returns rows that
   * are automatically updated when data changes.
   *
   * It takes two callbacks, a Kysely type-safe SQL query builder,
   * and a filterMap helper.
   *
   * `useQuery` also returns `isLoaded` and `isLoading` props that indicate
   * loading progress. `isLoaded` becomes true when rows are loaded for the
   *  first time. `isLoading` becomes true whenever rows are loading.
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
  readonly useEvoluError: () => Errors.EvoluError | null;
  /**
   * `useOwner` React Hook returns `Owner`.
   */
  readonly useOwner: () => Model.Owner | null;
  /**
   * `useOwnerActions` React Hook returns `OwnerActions` that can be used to
   * reset `Owner` on the current device or restore `Owner` on a different one.
   */
  readonly useOwnerActions: () => Db.OwnerActions;
}

const createKysely = (): Kysely.Kysely<unknown> =>
  new Kysely.Kysely({
    dialect: {
      createAdapter(): Kysely.SqliteAdapter {
        return new Kysely.SqliteAdapter();
      },
      createDriver(): Kysely.Driver {
        return new Kysely.DummyDriver();
      },
      createIntrospector(
        db: Kysely.Kysely<unknown>
      ): Kysely.DatabaseIntrospector {
        return new Kysely.SqliteIntrospector(db);
      },
      createQueryCompiler(): Kysely.QueryCompiler {
        return new Kysely.SqliteQueryCompiler();
      },
    },
  });

/**
 * `createHooks` defines the database schema and returns React Hooks.
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
 * } = Evolu.createHooks(Database);
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
export const createHooks = <From, To extends Db.Schema>(
  schema: Schema.Schema<From, To>,
  config?: Partial<Config.Config>
): Hooks<To> => {
  const evolu = Evolu.createEvolu(schema, config);
  const kysely = createKysely();
  const cache = new WeakMap<Db.Row, Option.Option<Db.Row>>();

  const useQuery: UseQuery<To> = (query, filterMap) => {
    // `query` can and will change, compile() is cheap
    const queryString = query
      ? pipe(query(kysely as never).compile() as Db.Query, Db.queryToString)
      : null;
    // filterMap is expensive but must be static, hence useRef
    const filterMapRef = useRef(filterMap);

    const rowsWithLoadingState = useSyncExternalStore(
      useMemo(
        () => evolu.subscribeRowsWithLoadingState(queryString),
        [queryString]
      ),
      evolu.getRowsWithLoadingState(queryString),
      constNull
    );

    const filterMapRow = (row: Db.Row): Option.Option<Db.Row> => {
      let cachedRow = cache.get(row);
      if (cachedRow !== undefined) return cachedRow;
      cachedRow = pipe(filterMapRef.current(row as never), (row) =>
        row ? Option.some(row) : Option.none
      ) as never;
      cache.set(row, cachedRow);
      return cachedRow;
    };

    const rows = useMemo(
      () =>
        pipe(
          rowsWithLoadingState?.rows,
          Option.fromNullable,
          Option.map(ReadonlyArray.filterMap(filterMapRow)),
          Option.getOrNull
        ),
      [rowsWithLoadingState?.rows]
    );

    return useMemo(
      () => ({
        rows: (rows || []) as never,
        row: ((rows && rows[0]) || null) as never,
        isLoaded: rows != null,
        isLoading: rowsWithLoadingState ? rowsWithLoadingState.isLoading : true,
      }),
      [rows, rowsWithLoadingState]
    );
  };

  const useMutation: UseMutation<To> = () =>
    useMemo(
      () => ({
        create: evolu.mutate as Db.Create<To>,
        update: evolu.mutate as Db.Update<To>,
      }),
      []
    );

  const useEvoluError: Hooks<To>["useEvoluError"] = () =>
    useSyncExternalStore(evolu.subscribeError, evolu.getError, constNull);

  const useOwner: Hooks<To>["useOwner"] = () =>
    useSyncExternalStore(evolu.subscribeOwner, evolu.getOwner, constNull);

  const useOwnerActions: Hooks<To>["useOwnerActions"] = () =>
    evolu.ownerActions;

  return {
    useQuery,
    useMutation,
    useEvoluError,
    useOwner,
    useOwnerActions,
  };
};
