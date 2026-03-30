"use client";

import { assert, emptyArray, lazyVoid } from "@evolu/common";
import type {
  Evolu,
  EvoluSchema,
  Queries,
  QueriesToQueryRows,
  QueriesToQueryRowsPromises,
  Query,
  QueryRows,
  Row,
} from "@evolu/common/local-first";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useIsSsr } from "./useIsSsr.js";

export interface ReactBinding<S extends EvoluSchema = EvoluSchema> {
  /** Provides {@link Evolu} to React descendants consumed via `useEvolu`. */
  readonly EvoluContext: React.FC<{
    readonly value: Evolu<S>;
    readonly children?: ReactNode;
  }>;

  /** Returns the current {@link Evolu} instance from `EvoluContext`. */
  readonly useEvolu: () => Evolu<S>;

  /**
   * Load and subscribe to the Query, and return an object with `rows` and `row`
   * properties that are automatically updated when data changes.
   *
   * Note that `useQuery` uses React Suspense. It means every usage of
   * `useQuery` blocks rendering until loading is completed. To avoid loading
   * waterfall with more queries, use `useQueries`.
   *
   * The `promise` option allows preloading queries before rendering, which can
   * be useful for complex queries that might take noticeable time even with
   * local data. However, this is rarely needed as local queries are typically
   * fast.
   */
  readonly useQuery: <R extends Row>(
    query: Query<S, R>,
    options?: Partial<{
      /** Without subscribing to changes. */
      readonly once: boolean;

      /** Reuse existing promise instead of loading so query will not suspense. */
      readonly promise: Promise<QueryRows<R>>;
    }>,
  ) => QueryRows<R>;

  /**
   * The same as `useQuery`, but for many queries.
   *
   * The number of queries must remain stable across renders.
   */
  readonly useQueries: <Q extends Queries<S>, OQ extends Queries<S>>(
    queries: [...Q],
    options?: Partial<{
      /** Queries that should be only loaded, not subscribed to. */
      readonly once: [...OQ];

      /** Reuse existing promises instead of loading so query will not suspense. */
      readonly promises: [
        ...QueriesToQueryRowsPromises<Q>,
        ...QueriesToQueryRowsPromises<OQ>,
      ];
    }>,
  ) => [...QueriesToQueryRows<Q>, ...QueriesToQueryRows<OQ>];

  /** Subscribe to {@link Query} {@link QueryRows} changes. */
  readonly useQuerySubscription: <R extends Row>(
    query: Query<S, R>,
    options?: Partial<{
      /**
       * Only subscribe and get the current value once. Subscribed query will
       * not invoke React Suspense after a mutation.
       */
      readonly once: boolean;
    }>,
  ) => QueryRows<R>;

  /** Calls {@link Evolu.useOwner} on the current {@link Evolu} instance. */
  readonly useOwner: (
    owner: Parameters<Evolu<S>["useOwner"]>[0],
    transports?: Parameters<Evolu<S>["useOwner"]>[1],
  ) => ReturnType<Evolu<S>["useOwner"]>;
}

/**
 * Creates a React binding for a specific {@link EvoluSchema}.
 *
 * The created binding contains the context component and all hooks needed by
 * React components using an {@link Evolu} instance created from that schema.
 *
 * TODO: Example from playground example.
 */
export const createEvoluBinding = <S extends EvoluSchema>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  schema: S,
): ReactBinding<S> => {
  const EvoluContext = createContext<Evolu<S> | null>(null);

  const useEvolu = (): Evolu<S> => {
    const evolu = use(EvoluContext);
    assert(evolu, "EvoluContext is missing.");
    return evolu;
  };

  const useQuerySubscription = <R extends Row>(
    query: Query<S, R>,
    options: Partial<{
      readonly once: boolean;
    }> = {},
  ): QueryRows<R> => {
    const evolu = useEvolu();
    const { once } = useRef(options).current;

    if (once) {
      /* eslint-disable react-hooks/rules-of-hooks */
      useEffect(() => evolu.subscribeQuery(query)(lazyVoid), [evolu, query]);
      return evolu.getQueryRows(query);
    }

    return useSyncExternalStore(
      useMemo(() => evolu.subscribeQuery(query), [evolu, query]),
      useMemo(() => () => evolu.getQueryRows(query), [evolu, query]),
      () => emptyArray as QueryRows<R>,
      /* eslint-enable react-hooks/rules-of-hooks */
    );
  };

  const useQuery = <R extends Row>(
    query: Query<S, R>,
    options: Partial<{
      readonly once: boolean;
      readonly promise: Promise<QueryRows<R>>;
    }> = {},
  ): QueryRows<R> => {
    const evolu = useEvolu();
    const isSSR = useIsSsr();

    if (isSSR) {
      if (!options.promise) void evolu.loadQuery(query);
    } else {
      use(options.promise ?? evolu.loadQuery(query));
    }

    return useQuerySubscription(query, options);
  };

  const useQueries = <Q extends Queries<S>, OQ extends Queries<S>>(
    queries: [...Q],
    options: Partial<{
      readonly once: [...OQ];
      readonly promises: [
        ...QueriesToQueryRowsPromises<Q>,
        ...QueriesToQueryRowsPromises<OQ>,
      ];
    }> = {},
  ): [...QueriesToQueryRows<Q>, ...QueriesToQueryRows<OQ>] => {
    const evolu = useEvolu();
    const once = useRef(options).current.once;
    const allQueries = once ? queries.concat(once) : queries;

    const wasSSR = useIsSsr();
    if (wasSSR) {
      if (!options.promises) void evolu.loadQueries(allQueries);
    } else {
      if (options.promises) options.promises.map(use);
      else evolu.loadQueries(allQueries).map(use);
    }

    return allQueries.map((query, index) =>
      // Safe until the number of queries is stable.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useQuerySubscription(query, { once: index > queries.length - 1 }),
    ) as never;
  };

  const useOwner = (
    owner: Parameters<Evolu<S>["useOwner"]>[0],
    transports?: Parameters<Evolu<S>["useOwner"]>[1],
  ): ReturnType<Evolu<S>["useOwner"]> => {
    const evolu = useEvolu();

    return evolu.useOwner(owner, transports);
  };

  return {
    EvoluContext,
    useEvolu,
    useQuery,
    useQueries,
    useQuerySubscription,
    useOwner,
  };
};
