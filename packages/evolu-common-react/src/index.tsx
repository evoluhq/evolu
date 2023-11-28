/// <reference types="react/experimental" />
import * as S from "@effect/schema/Schema";
import {
  Config,
  ConfigLive,
  Evolu,
  EvoluError,
  Owner,
  Queries,
  Query,
  QueryResult,
  QueryResultsFromQueries,
  QueryResultsPromisesFromQueries,
  Row,
  Schema,
  SyncState,
  canUseDom,
  emptyRows,
  queryResultFromRows,
} from "@evolu/common";
import { Context, Effect, Function, GlobalValue, Layer } from "effect";
import ReactExports, {
  FC,
  ReactNode,
  Usable,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

export interface EvoluReact<S extends Schema = Schema> extends Evolu<S> {
  /**
   * A React 19 `use` polyfill.
   *
   * See https://react.dev/reference/react/use.
   */
  readonly use: <T>(usable: Usable<T>) => T;

  /**
   * React Hook returning an instance of {@link Evolu}.
   *
   * ### Example
   *
   * ```ts
   * const { create, update } = useEvolu();
   * ```
   */
  readonly useEvolu: () => Evolu<S>;

  /** Subscribe to {@link EvoluError} changes. */
  readonly useEvoluError: () => EvoluError | null;

  /** Subscribe to {@link Query} {@link QueryResult} changes. */
  readonly useQuerySubscription: <R extends Row>(
    query: Query<R>,
    options?: Partial<{
      readonly once: boolean;
    }>,
  ) => QueryResult<R>;

  /**
   * Load and subscribe to the Query, and return an object with `rows` and `row`
   * properties that are automatically updated when data changes.
   *
   * Note that {@link useQuery} uses React Suspense. It means every usage of
   * {@link useQuery} blocks rendering until loading is completed. To avoid
   * loading waterfall with more queries, use {@link useQueries}.
   *
   * ### Examples
   *
   * ```ts
   * // Get all rows.
   * const { rows } = useQuery(allTodos);
   *
   * // Get the first row (it can be null).
   * const { row } = useQuery(todoById(1));
   *
   * // Get all rows, but without subscribing to changes.
   * const { rows } = useQuery(allTodos, { once: true });
   *
   * // Prefetch all rows
   * const allTodos = evolu.createQuery((db) =>
   *   db.selectFrom("todo").selectAll(),
   * );
   * // Load before usage.
   * const allTodosPromise = evolu.loadQuery(allTodos);
   * // A usage.
   * const { rows } = useQuery(allTodos, { promise: allTodosPromise });
   * ```
   */
  readonly useQuery: <R extends Row>(
    query: Query<R>,
    options?: Partial<{
      /** Without subscribing to changes. */
      readonly once: boolean;

      /** Reuse existing promise instead of loading so query will not suspense. */
      readonly promise: Promise<QueryResult<R>>;
    }>,
  ) => QueryResult<R>;

  /** The same as {@link useQuery}, but for many queries. */
  readonly useQueries: <
    R extends Row,
    Q extends Queries<R>,
    OQ extends Queries<R>,
  >(
    queries: [...Q],
    options?: Partial<{
      /** Queries that should be only loaded, not subscribed to. */
      readonly once: [...OQ];
      /** Reuse existing promises instead of loading so query will not suspense. */
      readonly promises: [
        ...QueryResultsPromisesFromQueries<Q>,
        ...QueryResultsPromisesFromQueries<OQ>,
      ];
      // Do we need default data for SSR?
    }>,
  ) => [...QueryResultsFromQueries<Q>, ...QueryResultsFromQueries<OQ>];

  /** Subscribe to {@link Owner} changes. */
  readonly useOwner: () => Owner | null;

  /** Subscribe to {@link SyncState} changes. */
  readonly useSyncState: () => SyncState;

  /**
   * EvoluProvider is not necessary for using Evolu, but it's helpful for
   * testing, as we can inject memory-only Evolu.
   */
  readonly EvoluProvider: FC<{
    readonly children?: ReactNode | undefined;
    readonly value: Evolu<S>;
  }>;
}

export const EvoluReact = Context.Tag<EvoluReact>();

export const EvoluReactLive = Layer.effect(
  EvoluReact,
  Effect.gen(function* (_) {
    const evolu = yield* _(Evolu);
    const EvoluContext = createContext<Evolu>(evolu);

    const useEvolu: EvoluReact["useEvolu"] = () => useContext(EvoluContext);

    const useQuerySubscription: EvoluReact["useQuerySubscription"] = (
      query,
      options = {},
    ) => {
      const evolu = useEvolu();
      const once = useRef(options).current.once;
      if (once) {
        /* eslint-disable react-hooks/rules-of-hooks */
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
        () => queryResultFromRows(emptyRows()),
        /* eslint-enable react-hooks/rules-of-hooks */
      );
    };

    return EvoluReact.of({
      ...evolu,

      use,
      useEvolu,
      useEvoluError: () => {
        const evolu = useEvolu();
        return useSyncExternalStore(
          evolu.subscribeError,
          evolu.getError,
          Function.constNull,
        );
      },

      useQuerySubscription,

      useQuery: (query, options = {}) => {
        const evolu = useEvolu();
        if (canUseDom) use(options?.promise || evolu.loadQuery(query));
        return useQuerySubscription(query, options);
      },

      useQueries: (queries, options = {}) => {
        const evolu = useEvolu();
        const once = useRef(options).current.once;
        const allQueries = once ? queries.concat(once) : queries;
        if (canUseDom) {
          if (options.promises) options.promises.map(use);
          else evolu.loadQueries(allQueries).map(use);
        }
        return allQueries.map((query, i) =>
          // eslint-disable-next-line react-hooks/rules-of-hooks
          useQuerySubscription(query, { once: i > queries.length - 1 }),
        ) as never;
      },

      useOwner: () => {
        const evolu = useEvolu();
        return useSyncExternalStore(
          evolu.subscribeOwner,
          evolu.getOwner,
          Function.constNull,
        );
      },

      useSyncState: () => {
        const evolu = useEvolu();
        return useSyncExternalStore(
          evolu.subscribeSyncState,
          evolu.getSyncState,
          () => ({ _tag: "SyncStateInitial" }),
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

export const makeCreateEvoluReact =
  (EvoluReactLive: Layer.Layer<Config, never, EvoluReact<Schema>>) =>
  <From, To extends Schema>(
    schema: S.Schema<From, To>,
    config?: Partial<Config>,
  ): EvoluReact<To> => {
    // For https://nextjs.org/docs/architecture/fast-refresh etc.
    const react = GlobalValue.globalValue("@evolu/common-react", () =>
      EvoluReact.pipe(
        Effect.provide(EvoluReactLive),
        Effect.provide(ConfigLive(config)),
        Effect.runSync,
      ),
    );
    react.ensureSchema(schema);
    // The Effect team does not recommend generic services, hence casting.
    return react as unknown as EvoluReact<To>;
  };
