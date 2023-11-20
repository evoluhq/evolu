/// <reference types="react/experimental" />
import {
  Evolu,
  EvoluError,
  Owner,
  PlatformName,
  Queries,
  Query,
  QueryResult,
  QueryResultsFromQueries,
  Row,
  Schema,
  SyncState,
  emptyRows,
  queryResultFromRows,
} from "@evolu/common";
import { Context, Effect, Function, Layer } from "effect";
import ReactExports, {
  FC,
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

export interface EvoluCommonReact<S extends Schema = Schema> {
  /** TODO: Docs */
  readonly evolu: Evolu<S>;

  /** TODO: Docs */
  readonly useEvolu: () => Evolu<S>;

  /** TODO: Docs */
  readonly useEvoluError: () => EvoluError | null;

  /** TODO: Docs */
  readonly createQuery: Evolu<S>["createQuery"];

  /**
   * It's like React `use` Hook but for React 18. It uses React `use` with React 19.
   */
  readonly useQueryPromise: <R extends Row>(
    promise: Promise<QueryResult<R>>,
  ) => QueryResult<R>;

  /** TODO: Docs */
  readonly useQuerySubscription: <R extends Row>(
    query: Query<R>,
  ) => QueryResult<R>;

  /** TODO: Docs */
  readonly useQuery: <R extends Row>(query: Query<R>) => QueryResult<R>;

  /** TODO: Docs */
  readonly useQueryOnce: <R extends Row>(query: Query<R>) => QueryResult<R>;

  /** TODO: Docs */
  readonly useQueries: <
    R extends Row,
    Q1 extends Queries<R>,
    Q2 extends Queries<R>,
    Q3 extends Queries<R>,
  >(
    queries: [...Q1],
    loadOnlyQueries?: [...Q2],
    subscribeOnlyQueries?: [...Q3],
  ) => [
    ...QueryResultsFromQueries<Q1>,
    ...QueryResultsFromQueries<Q2>,
    ...QueryResultsFromQueries<Q3>,
  ];

  /** TODO: Docs */
  readonly useCreate: () => Evolu<S>["create"];

  /** TODO: Docs */
  readonly useUpdate: () => Evolu<S>["update"];

  /** TODO: Docs */
  readonly useOwner: () => Owner | null;

  /** TODO: Docs */
  readonly useSyncState: () => SyncState;

  /**
   * The default value of EvoluContext is an Evolu instance, so we don't have
   * to use EvoluProvider by default. However, EvoluProvider is helpful for
   * testing, as we can inject memory-only Evolu.
   * Yep, it's OK to use React Context without a provider:
   * https://react.dev/learn/passing-data-deeply-with-context
   */
  readonly EvoluProvider: FC<{
    readonly children?: ReactNode | undefined;
    readonly value: Evolu<S>;
  }>;
}

export const EvoluCommonReact = Context.Tag<EvoluCommonReact>();

export const EvoluCommonReactLive = Layer.effect(
  EvoluCommonReact,
  Effect.gen(function* (_) {
    const platformName = yield* _(PlatformName);
    const evolu = yield* _(Evolu);
    const EvoluContext = createContext<Evolu>(evolu);

    const useEvolu: EvoluCommonReact["useEvolu"] = () =>
      useContext(EvoluContext);

    // TODO: Accept also Promise<ReadonlyArray<QueryResult<R>>>
    const useQueryPromise = <R extends Row>(
      promise: Promise<QueryResult<R>>,
    ): QueryResult<R> =>
      platformName === "server"
        ? queryResultFromRows(emptyRows<R>())
        : use(promise);

    const useQuerySubscription = <R extends Row>(
      query: Query<R>,
    ): QueryResult<R> => {
      const evolu = useEvolu();
      return useSyncExternalStore(
        useMemo(() => evolu.subscribeQuery(query), [evolu, query]),
        useMemo(() => () => evolu.getQuery(query), [evolu, query]),
      );
    };

    return EvoluCommonReact.of({
      evolu,
      useEvolu,

      useEvoluError: () => {
        const evolu = useEvolu();
        return useSyncExternalStore(
          evolu.subscribeError,
          evolu.getError,
          Function.constNull,
        );
      },

      createQuery: evolu.createQuery,
      useQuerySubscription,
      useQueryPromise,

      useQuery: (query) => {
        const evolu = useEvolu();
        useQueryPromise(evolu.loadQuery(query));
        return useQuerySubscription(query);
      },

      useQueryOnce: (query) => {
        const evolu = useEvolu();
        const result = useQueryPromise(evolu.loadQuery(query));
        // Loading promises are released on mutation by default, so loading the same
        // query will be suspended again, which is undesirable if we already have such
        // a query on a page. Luckily, subscribeQuery tracks subscribed queries to be
        // automatically updated on mutation while unsubscribed queries are released.
        useEffect(
          () => evolu.subscribeQuery(query)(Function.constVoid),
          [evolu, query],
        );
        return result;
      },

      useQueries: (_queries, _loadOnlyQueries, _subscribeOnlyQueries) => {
        // const evolu = useEvolu();
        // const promise = evolu.loadQueries(
        //   queries.concat(loadOnlyQueries || []),
        // );
        // const foo = useQueryPromise(promise);
        // TODO: subscribe and results.
        throw "";
      },

      useCreate: () => useContext(EvoluContext).create,
      useUpdate: () => useContext(EvoluContext).update,

      useOwner: () => {
        const evolu = useEvolu();
        return useSyncExternalStore(evolu.subscribeOwner, evolu.getOwner);
      },

      useSyncState: () => {
        const evolu = useEvolu();
        return useSyncExternalStore(
          evolu.subscribeSyncState,
          evolu.getSyncState,
        );
      },

      EvoluProvider: ({ children, value }) => (
        <EvoluContext.Provider value={value}>{children}</EvoluContext.Provider>
      ),
    });
  }),
);

// https://github.com/acdlite/rfcs/blob/first-class-promises/text/0000-first-class-support-for-promises.md
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
