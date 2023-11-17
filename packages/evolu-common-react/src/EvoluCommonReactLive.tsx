/// <reference types="react/experimental" />
import {
  Evolu,
  EvoluError,
  PlatformName,
  Query,
  QueryResult,
  Row,
  Schema,
  emptyRows,
  queryResultFromRows,
} from "@evolu/common";
import { Context, Effect, Function, Layer } from "effect";
import ReactExports, {
  FC,
  ReactNode,
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

export interface EvoluCommonReact<S extends Schema = Schema> {
  /** TODO: Docs */
  readonly evolu: Evolu<S>;

  /** TODO: Docs */
  readonly EvoluProvider: FC<{
    readonly children?: ReactNode | undefined;
  }>;

  /** TODO: Docs */
  readonly useEvolu: () => Evolu<S>;

  /** TODO: Docs */
  readonly useEvoluError: () => EvoluError | null;

  /** TODO: Docs */
  readonly createQuery: Evolu<S>["createQuery"];

  /** TODO: Docs */
  readonly usePromise: <R extends Row>(
    promise: Promise<QueryResult<R>>,
  ) => QueryResult<R>;

  /** TODO: Docs */
  readonly useQuerySubscription: <R extends Row>(
    query: Query<R>,
  ) => QueryResult<R>;

  /** TODO: Docs */
  readonly useQuery: <R extends Row>(query: Query<R>) => QueryResult<R>;

  /** TODO: Docs */
  readonly useCreate: () => Evolu<S>["create"];

  /** TODO: Docs */
  readonly useUpdate: () => Evolu<S>["update"];

  // readonly useQueries
  //    useQueries([todos], [todoById], [chatRoom(1)])
  // readonly useUpdate
  // const { loadQuery } = useEvolu()
  // useQueryPromise, to pujde? imho ne, protoze vytvorena promisa
  // pomohlo by useMemo? imho jo, pac to vrati ty same
  // useQueryPromise(Promise.all([loadQuery(todos), loadQuery(todoById(1))])
}

export const EvoluCommonReact = Context.Tag<EvoluCommonReact>();

export const EvoluCommonReactLive = Layer.effect(
  EvoluCommonReact,
  Effect.gen(function* (_) {
    const evolu = yield* _(Evolu);
    const platformName = yield* _(PlatformName);

    const EvoluContext = createContext<Evolu>(evolu);

    const EvoluProvider: EvoluCommonReact["EvoluProvider"] = ({ children }) => (
      <EvoluContext.Provider value={evolu}>{children}</EvoluContext.Provider>
    );

    const useEvolu: EvoluCommonReact["useEvolu"] = () =>
      useContext(EvoluContext);

    const useEvoluError: EvoluCommonReact["useEvoluError"] = () =>
      useSyncExternalStore(
        evolu.subscribeError,
        evolu.getError,
        Function.constNull,
      );

    /**
     * React `use` polyfill.
     */
    const usePromise = <R extends Row>(
      promise: Promise<QueryResult<R>>,
    ): QueryResult<R> => {
      if (platformName === "server") return queryResultFromRows(emptyRows<R>());
      return use(promise);
    };

    const useQuerySubscription = <R extends Row>(
      query: Query<R>,
    ): QueryResult<R> => {
      const evolu = useEvolu();
      return useSyncExternalStore(
        useMemo(() => evolu.subscribeQuery(query), [evolu, query]),
        useMemo(() => () => evolu.getQuery(query), [evolu, query]),
      );
    };

    const useQuery = <R extends Row>(query: Query<R>): QueryResult<R> => {
      const evolu = useEvolu();
      usePromise(evolu.loadQuery(query));
      return useQuerySubscription(query);
    };

    const useCreate: EvoluCommonReact["useCreate"] = () => useEvolu().create;
    const useUpdate: EvoluCommonReact["useUpdate"] = () => useEvolu().update;

    return EvoluCommonReact.of({
      evolu,
      EvoluProvider,
      useEvolu,
      useEvoluError,
      createQuery: evolu.createQuery,
      useQuerySubscription,
      usePromise,
      useQuery,
      useCreate,
      useUpdate,
    });
  }),
);

// import * as S from "@effect/schema/Schema";
// import {
//   AppState,
//   Bip39,
//   Config,
//   ConfigLive,
//   Create,
//   DbWorker,
//   Evolu,
//   EvoluError,
//   FilterMap,
//   FlushSync,
//   NanoId,
//   Owner,
//   OwnerActions,
//   Platform,
//   QueryCallback,
//   QueryResult,
//   Row,
//   Schema,
//   SyncState,
//   Update,
//   loadingPromisesPromiseProp,
//   makeCacheFilterMap,
//   makeEvoluForPlatform,
//   schemaToTables,
// } from "@evolu/common";
// import {
//   Context,
//   Effect,
//   Function,
//   Layer,
//   Option,
//   ReadonlyArray,
// } from "effect";
// import { useMemo, useRef, useSyncExternalStore } from "react";

// type UseQuery<S extends Schema> = {
//   <QueryRow extends Row>(
//     queryCallback: QueryCallback<S, QueryRow>,
//   ): QueryResult<QueryRow>;
//   <QueryRow extends Row, FilterMapRow extends Row>(
//     queryCallback: QueryCallback<S, QueryRow>,
//     filterMap: FilterMap<QueryRow, FilterMapRow>,
//     options?: UseQueryOptions,
//   ): QueryResult<FilterMapRow>;
// };

// interface UseQueryOptions {
//   /**
//    * React Suspense is enabled by default but can be optionally disabled
//    * per useQuery hook. When disabled, useQuery will not stop rendering
//    * and will return empty rows instead.
//    *
//    * That can be helpful to avoid waterfall when using more than one
//    * useQuery within one React Component. In such a situation, disable
//    * Suspense for all useQuery hooks except the last one.
//    *
//    * Because Evolu queues queries within a microtask sequentially, all
//    * queries will be batched within one roundtrip.
//    *
//    * Another use case is to optimistically prefetch data that might be
//    * needed in a future render without blocking the current render.
//    */
//   readonly suspense?: boolean;
// }

// type UseMutation<S extends Schema> = () => {
//   /**
//    * Creates a new row with the given values.
//    *
//    * ### Examples
//    *
//    * To create a new row:
//    *
//    * ```
//    * const { create } = useMutation();
//    * create("todo", { title });
//    * ```
//    *
//    * To get a new row's `Id`:
//    *
//    * ```
//    * const { create } = useMutation();
//    * const { id } = create("todo", { title });
//    * ```
//    *
//    * To wait until a new row is rendered:
//    *
//    * ```
//    * const { create } = useMutation();
//    * create("todo", { title }, onComplete);
//    * ```
//    */
//   readonly create: Create<S>;
//   /**
//    * Update a row with the given values.
//    *
//    * ### Examples
//    *
//    * To update a row:
//    *
//    * ```
//    * const { update } = useMutation();
//    * update("todo", { id, title });
//    * ```
//    *
//    * To wait until the updated row is rendered:
//    *
//    * ```
//    * const { update } = useMutation();
//    * update("todo", { id, title }, onComplete);
//    * ```
//    *
//    * To delete a row.
//    *
//    * ```
//    * const { update } = useMutation();
//    * update("todo", { id, isDeleted: true });
//    * ```
//    */
//   readonly update: Update<S>;
// };

// export const ReactHooksLive = <S extends Schema>(): Layer.Layer<
//   Platform | Evolu<S>,
//   never,
//   ReactHooks<S>
// > =>
//   Layer.effect(
//     ReactHooks<S>(),
//     Effect.gen(function* (_) {
//       const evolu = yield* _(Evolu<S>());
//       const platform = yield* _(Platform);
//       const cacheFilterMap = makeCacheFilterMap();

//       const useQuery: UseQuery<S> = <
//         QueryRow extends Row,
//         FilterMapRow extends Row,
//       >(
//         queryCallback: QueryCallback<S, QueryRow>,
//         initialFilterMap?: FilterMap<QueryRow, FilterMapRow>,
//         options: UseQueryOptions = {},
//       ) => {
//         const query = useMemo(
//           () => evolu.createQuery(queryCallback),
//           [queryCallback],
//         );

//         const promise = useMemo(() => evolu.loadQuery(query), [query]);

//         if (
//           options.suspense !== false &&
//           platform.name !== "server" &&
//           !(loadingPromisesPromiseProp in promise)
//         )
//           throw promise;

//         // Enforce pure filterMap via useRef, args belong to query
//         const initialFilterMapRef = useRef(initialFilterMap);

//         const rows =
//           useSyncExternalStore(
//             useMemo(() => evolu.subscribeQuery(query), [query]),
//             useMemo(() => () => evolu.getQuery(query), [query]),
//             Function.constNull,
//           ) || ReadonlyArray.empty();

//         const filterMapRows = useMemo(() => {
//           const { current: filterMap } = initialFilterMapRef;
//           if (!filterMap) return rows;

//           return ReadonlyArray.filterMap(rows, (row) => {
//             const cachedRow = cacheFilterMap(filterMap)(row as QueryRow);
//             if (cachedRow === false) return Option.none();
//             return Option.fromNullable(cachedRow);
//           });
//         }, [rows]);

//         return {
//           rows: filterMapRows,
//           row: filterMapRows[0],
//         };
//       };

//       const useMutation: UseMutation<S> = () =>
//         useMemo(() => ({ create: evolu.create, update: evolu.update }), []);

//       const useEvoluError: ReactHooks<S>["useEvoluError"] = () =>
//         useSyncExternalStore(
//           evolu.subscribeError,
//           evolu.getError,
//           Function.constNull,
//         );

//       const useOwner: ReactHooks<S>["useOwner"] = () =>
//         useSyncExternalStore(
//           evolu.subscribeOwner,
//           evolu.getOwner,
//           Function.constNull,
//         );

//       const useOwnerActions: ReactHooks<S>["useOwnerActions"] = () =>
//         evolu.ownerActions;

//       const syncStateInitial: SyncState = { _tag: "SyncStateInitial" };
//       const useSyncState: ReactHooks<S>["useSyncState"] = () =>
//         useSyncExternalStore(
//           evolu.subscribeSyncState,
//           evolu.getSyncState,
//           () => syncStateInitial,
//         );

//       return ReactHooks<S>().of({
//         useQuery,
//         useMutation,
//         useEvoluError,
//         useOwner,
//         useOwnerActions,
//         useSyncState,
//       });
//     }),
//   );

const use =
  ReactExports.use ||
  (<T,>(
    promise: Promise<T> & {
      status?: "pending" | "fulfilled" | "rejected";
      value?: T;
      reason?: unknown;
    },
  ): T => {
    if (promise.status === "pending") {
      throw promise;
    } else if (promise.status === "fulfilled") {
      return promise.value as T;
    } else if (promise.status === "rejected") {
      throw promise.reason;
    } else {
      promise.status = "pending";
      promise.then(
        (v) => {
          promise.status = "fulfilled";
          promise.value = v;
        },
        (e) => {
          promise.status = "rejected";
          promise.reason = e;
        },
      );
      throw promise;
    }
  });
