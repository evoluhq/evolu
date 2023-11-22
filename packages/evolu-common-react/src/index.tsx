/// <reference types="react/experimental" />
import {
  Evolu,
  EvoluError,
  Owner,
  Queries,
  Query,
  QueryResult,
  QueryResultsFromQueries,
  Row,
  Schema,
  SyncState,
} from "@evolu/common";
import { Context, Effect, Function, Layer } from "effect";
import ReactExports, {
  FC,
  ReactNode,
  Usable,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

export interface EvoluCommonReact<S extends Schema = Schema> {
  /** TODO: Docs */
  readonly evolu: Evolu<S>;

  /** A React 19 `use` polyfill. */
  readonly use: <T>(usable: Usable<T>) => T;

  /** TODO: Docs */
  readonly useEvolu: () => Evolu<S>;

  /** TODO: Docs */
  readonly useEvoluError: () => EvoluError | null;

  /** TODO: Docs */
  readonly createQuery: Evolu<S>["createQuery"];

  /**
   * TODO: Docs
   * Loading promises are released on mutation by default, so loading the same
   * query will be suspended again, which is undesirable if we already have such
   * a query on a page. Luckily, subscribeQuery tracks subscribed queries to be
   * automatically updated on mutation while unsubscribed queries are released.
   */
  readonly useQuerySubscription: <R extends Row>(
    query: Query<R>,
    options?: Partial<{
      readonly once: boolean;
    }>,
  ) => QueryResult<R>;

  /** TODO: Docs */
  readonly useQuery: <R extends Row>(
    query: Query<R>,
    options?: Partial<{
      readonly once: boolean;
    }>,
  ) => QueryResult<R>;

  /**
   * TODO: Docs
   * For more than one query, always use useQueries Hook to avoid loading waterfalls
   * and to cache loading promises.
   * This is possible of course:
   * const foo = use(useEvolu().loadQuery(todos))
   * but it will not cache loading promise nor subscribe updates.
   * That's why we have useQuery and useQueries.
   */
  readonly useQueries: <
    R extends Row,
    Q extends Queries<R>,
    OQ extends Queries<R>,
  >(
    queries: [...Q],
    options?: Partial<{
      readonly once: [...OQ];
    }>,
  ) => [...QueryResultsFromQueries<Q>, ...QueryResultsFromQueries<OQ>];

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
    const evolu = yield* _(Evolu);
    const EvoluContext = createContext<Evolu>(evolu);

    const useEvolu: EvoluCommonReact["useEvolu"] = () =>
      useContext(EvoluContext);

    const useQuerySubscription: EvoluCommonReact["useQuerySubscription"] = (
      query,
      options = {},
    ) => {
      const evolu = useEvolu();
      /* eslint-disable react-hooks/rules-of-hooks */
      if (options.once) {
        useEffect(
          // No useSyncExternalStore, no unnecessary updates.
          () => evolu.subscribeQuery(query)(Function.constVoid),
          [evolu, query],
        );
        return evolu.getQuery(query);
      }
      return useSyncExternalStore(
        useMemo(() => evolu.subscribeQuery(query), [evolu, query]),
        useMemo(() => () => evolu.getQuery(query), [evolu, query]),
      );
      /* eslint-enable react-hooks/rules-of-hooks */
    };

    return EvoluCommonReact.of({
      evolu,
      use,
      useEvolu,

      useEvoluError: () => {
        const evolu = useEvolu();
        return useSyncExternalStore(evolu.subscribeError, evolu.getError);
      },

      createQuery: evolu.createQuery,
      useQuerySubscription,

      useQuery: (query, options) => {
        const evolu = useEvolu();
        use(evolu.loadQuery(query));
        return useQuerySubscription(query, options);
      },

      useQueries: (queries, options = {}) => {
        const evolu = useEvolu();
        const allQueries = queries.concat(options.once || []);
        evolu.loadQueries(allQueries).map(use);
        return allQueries.map((query, i) =>
          // eslint-disable-next-line react-hooks/rules-of-hooks
          useQuerySubscription(query, { once: i > queries.length - 1 }),
        ) as never;
      },

      useCreate: () => useEvolu().create,
      useUpdate: () => useEvolu().update,

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
