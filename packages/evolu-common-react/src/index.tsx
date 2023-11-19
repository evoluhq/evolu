/// <reference types="react/experimental" />
import {
  Evolu,
  EvoluError,
  Owner,
  PlatformName,
  Query,
  QueryResult,
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

  /**
   * The default value of EvoluContext is an Evolu instance, so we don't have
   * to use EvoluProvider by default. However, EvoluProvider is helpful for
   * testing, as we can inject memory-only Evolu.
   */
  readonly EvoluProvider: FC<{
    readonly children?: ReactNode | undefined;
    readonly value: Evolu<S>;
  }>;

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
  readonly useCreate: () => Evolu<S>["create"];

  /** TODO: Docs */
  readonly useUpdate: () => Evolu<S>["update"];

  readonly useOwner: () => Owner | null;

  readonly useSyncState: () => SyncState;

  // const {  } = useQueries([todos, blas])
  // readonly useQueries:
}

export const EvoluCommonReact = Context.Tag<EvoluCommonReact>();

export const EvoluCommonReactLive = Layer.effect(
  EvoluCommonReact,
  Effect.gen(function* (_) {
    const evolu = yield* _(Evolu);

    const EvoluContext = createContext<Evolu>(evolu);

    const EvoluProvider: EvoluCommonReact["EvoluProvider"] = ({
      children,
      value,
    }) => (
      <EvoluContext.Provider value={value}>{children}</EvoluContext.Provider>
    );

    const useEvolu: EvoluCommonReact["useEvolu"] = () =>
      useContext(EvoluContext);

    const useEvoluError: EvoluCommonReact["useEvoluError"] = () => {
      const evolu = useEvolu();
      return useSyncExternalStore(
        evolu.subscribeError,
        evolu.getError,
        Function.constNull,
      );
    };

    const platformName = yield* _(PlatformName);

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

    const useQuery = <R extends Row>(query: Query<R>): QueryResult<R> => {
      useQueryPromise(useEvolu().loadQuery(query));
      return useQuerySubscription(query);
    };

    const useQueryOnce = <R extends Row>(query: Query<R>): QueryResult<R> => {
      const evolu = useEvolu();
      const result = useQueryPromise(evolu.loadQuery(query));
      // Loading promises are released on mutation by default, so loading the same
      // query will be suspended again, which is undesirable if we already have such
      // a query on a page. Luckily, subscribeQuery tracks subscribed queries to be
      // automatically updated on mutation while unsubscribed queries are released.
      // It's probably how the future React Cache will work.
      useEffect(
        () => evolu.subscribeQuery(query)(Function.constVoid),
        [evolu, query],
      );
      return result;
    };

    const useOwner: EvoluCommonReact["useOwner"] = () => {
      const evolu = useEvolu();
      return useSyncExternalStore(evolu.subscribeOwner, evolu.getOwner);
    };

    const useSyncState: EvoluCommonReact["useSyncState"] = () => {
      const evolu = useEvolu();
      return useSyncExternalStore(evolu.subscribeSyncState, evolu.getSyncState);
    };

    return EvoluCommonReact.of({
      evolu,
      EvoluProvider,
      useEvolu,
      useEvoluError,
      createQuery: evolu.createQuery,
      useQuerySubscription,
      useQueryPromise,
      useQuery,
      useQueryOnce,
      useCreate: () => useEvolu().create,
      useUpdate: () => useEvolu().update,
      useOwner,
      useSyncState,
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
