import * as S from "@effect/schema/Schema";
import {
  AppState,
  Bip39,
  Config,
  ConfigLive,
  Create,
  DbWorker,
  Evolu,
  EvoluError,
  ExcludeNullAndFalse,
  FilterMap,
  FlushSync,
  NanoId,
  OrNullOrFalse,
  Owner,
  OwnerActions,
  Platform,
  QueryCallback,
  Row,
  Schema,
  SyncState,
  Update,
  loadingPromisesPromiseProp,
  makeEvoluForPlatform,
  schemaToTables,
} from "@evolu/common";
import {
  Context,
  Effect,
  Function,
  Layer,
  Option,
  ReadonlyArray,
} from "effect";
import { Simplify } from "kysely";
import { useMemo, useRef, useSyncExternalStore } from "react";

export interface ReactHooks<S extends Schema> {
  /**
   * `useQuery` React Hook performs a database query and returns `rows` and
   * `firstRow` props that are automatically updated when data changes. It
   * takes two callbacks, a Kysely type-safe SQL query builder, and a
   * `filterMap` helper for rows filtering and ad-hoc migrations. Note that
   * `useQuery` uses React Suspense.
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
   * Those columns are: `createdAt`, `updatedAt`, and `isDeleted`.
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

  /**
   * `useSyncState` React Hook returns `SyncState`.
   *
   * Don't unnecessarily frighten users with a message that they do not have
   * synchronized data. It's okay to be offline. However, you can warn users
   * if they have been offline too long.
   */
  readonly useSyncState: () => SyncState;
}

export const ReactHooks = <T extends Schema>(): Context.Tag<
  ReactHooks<T>,
  ReactHooks<T>
> => Context.Tag<ReactHooks<T>>("evolu/ReactHooks");

type UseQuery<S extends Schema> = <
  QueryRow extends Row,
  FilterMapRow extends Row,
>(
  queryCallback: OrNullOrFalse<QueryCallback<S, QueryRow>>,
  filterMap: FilterMap<QueryRow, FilterMapRow>,
) => {
  /**
   * Rows from the database. They can be filtered and mapped by `filterMap`.
   */
  readonly rows: ReadonlyArray<
    Readonly<Simplify<ExcludeNullAndFalse<FilterMapRow>>>
  >;
  /**
   * The first row from `rows`. For empty rows, it's null.
   */
  readonly firstRow: Readonly<
    Simplify<ExcludeNullAndFalse<FilterMapRow>>
  > | null;
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

export const ReactHooksLive = <T extends Schema>(): Layer.Layer<
  Platform | Evolu<T>,
  never,
  ReactHooks<T>
> =>
  Layer.effect(
    ReactHooks<T>(),
    Effect.gen(function* (_) {
      const evolu = yield* _(Evolu<T>());
      const platform = yield* _(Platform);

      const cache = new WeakMap<Row, Option.Option<Row>>();

      const useQuery: UseQuery<T> = (queryCallback, filterMap) => {
        const query = useMemo(
          () => (queryCallback ? evolu.createQuery(queryCallback) : null),
          [queryCallback],
        );

        const promise = useMemo(() => {
          return query ? evolu.loadQuery(query) : null;
        }, [query]);

        if (
          platform.name !== "server" &&
          promise &&
          !(loadingPromisesPromiseProp in promise)
        )
          throw promise;

        const subscribedRows = useSyncExternalStore(
          useMemo(() => evolu.subscribeQuery(query), [query]),
          useMemo(() => () => evolu.getQuery(query), [query]),
          Function.constNull,
        );

        // Use useRef until React Forget release.
        const filterMapRef = useRef(filterMap);

        const rows = useMemo(() => {
          if (subscribedRows == null) return [];
          return ReadonlyArray.filterMap(subscribedRows, (row) => {
            let cachedRow = cache.get(row);
            if (cachedRow !== undefined) return cachedRow;
            cachedRow = Option.fromNullable(
              filterMapRef.current(row as never),
            ) as never;
            cache.set(row, cachedRow);
            return cachedRow;
          });
        }, [subscribedRows]);

        return {
          rows: rows as never,
          firstRow: rows[0] as never,
        };
      };

      const useMutation: UseMutation<T> = () =>
        useMemo(() => ({ create: evolu.create, update: evolu.update }), []);

      const useEvoluError: ReactHooks<T>["useEvoluError"] = () =>
        useSyncExternalStore(
          evolu.subscribeError,
          evolu.getError,
          Function.constNull,
        );

      const useOwner: ReactHooks<T>["useOwner"] = () =>
        useSyncExternalStore(
          evolu.subscribeOwner,
          evolu.getOwner,
          Function.constNull,
        );

      const useOwnerActions: ReactHooks<T>["useOwnerActions"] = () =>
        evolu.ownerActions;

      const syncStateInitial: SyncState = { _tag: "SyncStateInitial" };
      const useSyncState: ReactHooks<T>["useSyncState"] = () =>
        useSyncExternalStore(
          evolu.subscribeSyncState,
          evolu.getSyncState,
          () => syncStateInitial,
        );

      return ReactHooks<T>().of({
        useQuery,
        useMutation,
        useEvoluError,
        useOwner,
        useOwnerActions,
        useSyncState,
      });
    }),
  );

// For React Fast Refresh, to ensure only one instance of Evolu exists.
let evolu: Evolu<Schema> | null = null;

export const makeReactHooksForPlatform =
  (
    DbWorkerLive: Layer.Layer<never, never, DbWorker>,
    AppStateLive: Layer.Layer<Config, never, AppState>,
    PlatformLive: Layer.Layer<never, never, Platform>,
    Bip39Live: Layer.Layer<never, never, Bip39>,
    NanoIdLive: Layer.Layer<never, never, NanoId>,
    FlushSyncLive: Layer.Layer<never, never, FlushSync>,
  ) =>
  <From, To extends Schema>(
    schema: S.Schema<From, To>,
    config?: Partial<Config>,
  ): ReactHooks<To> => {
    const tables = schemaToTables(schema);

    if (evolu == null) {
      evolu = makeEvoluForPlatform<To>(
        Layer.mergeAll(
          DbWorkerLive,
          Bip39Live,
          NanoIdLive,
          FlushSyncLive,
          Layer.use(AppStateLive, ConfigLive(config)),
        ),
        tables,
        config,
      ) as Evolu<Schema>;
    } else {
      evolu.ensureSchema(tables);
    }

    return Effect.provideLayer(
      ReactHooks<To>(),
      Layer.use(
        ReactHooksLive<To>(),
        Layer.merge(
          PlatformLive,
          Layer.succeed(Evolu<To>(), evolu as Evolu<To>),
        ),
      ),
    ).pipe(Effect.runSync);
  };
