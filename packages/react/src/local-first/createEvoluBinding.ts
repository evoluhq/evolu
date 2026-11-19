"use client";

import {
  constVoid,
  assert,
  emptyArray,
  structuralLookup,
  type ReadonlyStore,
} from "@evolu/common";
import {
  isDatabaseDeleted,
  syncStateToOwnerSyncStatus,
  type AppOwnerEntry,
  type AppOwnerEvolu,
  type CurrentAppOwner,
  type DeviceEvolu,
  type createEvolu,
  type createEvoluApp,
  type EmptyEvoluSchema,
  type Evolu,
  type EvoluApp,
  type EvoluSchema,
  type OwnerSyncStatus,
  type Queries,
  type QueriesToQueryRows,
  type Query,
  type QueryRows,
  type Row,
  type SyncState,
  type UseOwnerOptions,
} from "@evolu/common/local-first";
import {
  createContext,
  createElement,
  use,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type FC,
  type ReactNode,
} from "react";
import { useIsSsr } from "./useIsSsr.ts";

/**
 * The context components and hooks {@link createEvoluBinding} returns, typed
 * with the app's schema `S` and its device schema `D`.
 */
export interface ReactBinding<
  S extends EvoluSchema = EvoluSchema,
  D extends EvoluSchema = EmptyEvoluSchema,
> {
  /**
   * Provides {@link Evolu} to React descendants consumed via `useEvolu`. An app
   * of {@link createEvolu} renders it with its instance, such as `<EvoluContext
   * value={use(evoluPromise)}>` under a Suspense boundary, with the promise
   * created once at module scope. An app of {@link createEvoluApp} renders
   * `EvoluAppProvider`, which provides it.
   */
  readonly EvoluContext: FC<{ value: AppOwnerEvolu<S>; children?: ReactNode }>;

  /**
   * Returns the current {@link Evolu} instance from `EvoluContext`, without
   * disposal, because the component doesn't own it.
   */
  readonly useEvolu: () => AppOwnerEvolu<S>;

  /**
   * Load and subscribe to the Query, and return its rows, which update when the
   * data changes.
   *
   * Note that `useQuery` uses React Suspense. It means every usage of
   * `useQuery` blocks rendering until loading is completed. To avoid loading
   * waterfall with more queries, use `useQueries`. A query SQLite fails throws
   * its error to the nearest error boundary; see {@link Evolu.loadQuery}.
   * Resetting the boundary throws the cached error again until a mutation or
   * sync invalidates it.
   *
   * To start loading before rendering, which is rarely needed as local queries
   * are typically fast, call {@link Evolu.loadQuery}. `useQuery` then reuses
   * that load unless a mutation or sync drops it first.
   */
  readonly useQuery: <R extends Row>(
    query: Query<S, R>,
    options?: UseQueryOptions,
  ) => QueryRows<R>;

  /**
   * The same as `useQuery`, but for many queries.
   *
   * The number of queries must remain stable across renders.
   */
  readonly useQueries: <Q extends Queries<S>, OQ extends Queries<S>>(
    queries: [...Q],
    options?: UseQueriesOptions<OQ>,
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

  /**
   * Uses an Owner for sync through {@link Evolu.useOwner} while the component is
   * mounted, and stops when it unmounts or the Evolu instance, owner, or
   * options change. A null owner uses none, for a component that waits for one.
   * {@link Evolu.deleteOwner} of the owner ends its use, and the component uses
   * the owner again only once it remounts or the Evolu instance, owner, or
   * options change. With {@link UseOwnerOptions.deleteWhenUnused}, the owner's
   * rows are deleted once no component or other code uses it.
   *
   * The owner and options are compared by content, so recreating them on each
   * render keeps the same registration.
   */
  readonly useOwner: (
    owner: Parameters<Evolu<S>["useOwner"]>[0] | null,
    options?: UseOwnerOptions,
  ) => void;

  /**
   * Returns the {@link OwnerSyncStatus} of an owner in the database of the
   * {@link Evolu} instance from `EvoluContext`, and re-renders when it changes,
   * not with every snapshot. Without an owner, it is the status of
   * {@link Evolu.appOwner}. Otherwise pass the owner `useOwner` takes; a null
   * owner, for a component that waits for one, gives `NoRelays`. Pass the
   * {@link @evolu/common!"local-first/Evolu".SyncStateDep.syncState | SyncStateDep.syncState}
   * store of the deps the instance was created with, because the context holds
   * only the instance. Before the first snapshot and during server rendering,
   * it returns `NoRelays`. See {@link OwnerSyncStatus} for what to show.
   */
  readonly useOwnerSyncStatus: {
    (syncState: ReadonlyStore<SyncState | null>): OwnerSyncStatus;
    (
      syncState: ReadonlyStore<SyncState | null>,
      owner: Parameters<Evolu<S>["useOwner"]>[0] | null,
    ): OwnerSyncStatus;
  };

  /**
   * Provides an {@link EvoluApp} to React descendants. Its children get the
   * instance of the AppOwner this tab has open through `EvoluContext`, so
   * `useEvolu` and the query hooks read that AppOwner's data, and
   * `useEvolu().appOwner` is that AppOwner. They remount when the tab opens
   * another AppOwner, or the AppOwner again after a removal and restore or its
   * database's deletion. While the tab has no AppOwner open, such as on a
   * device without one or after a removal of the open one, it renders
   * `withoutAppOwner`, such as a choice to open one of `useAppOwners`, create
   * one, or restore one. `withoutAppOwner` can call `useEvoluApp`,
   * `useAppOwners`, and the device hooks, but not `useEvolu`.
   *
   * It suspends while the app or the AppOwner's instance opens, also while
   * another build keeps the app waiting, and throws when the app fails to
   * start, so put it under a Suspense boundary and an error boundary, and
   * render `evoluError` outside both. Pass the same promise on every render,
   * such as one created at module scope or once a passkey unlocks. A query
   * SQLite fails throws, and the queries of a refused database stay suspended,
   * so put the children that read queries under an error boundary and a
   * Suspense boundary of their own, and the account UI, which `useEvoluApp` and
   * `useAppOwners` give to open or remove an AppOwner, outside them, where it
   * stays usable.
   */
  readonly EvoluAppProvider: FC<{
    value: Promise<EvoluApp<S, D>>;
    withoutAppOwner: ReactNode;
    children: ReactNode;
  }>;

  /** Returns the {@link EvoluApp} from `EvoluAppProvider`. */
  readonly useEvoluApp: () => EvoluApp<S, D>;

  /**
   * Returns {@link EvoluApp.appOwners}, the AppOwners the app can open on this
   * device, and re-renders when they change.
   */
  readonly useAppOwners: () => ReadonlyArray<AppOwnerEntry>;

  /**
   * Returns {@link EvoluApp.device}, the instance of the device database with
   * the app's own device tables.
   */
  readonly useDeviceEvolu: () => DeviceEvolu<D>;

  /** The same as `useQuery`, for a query of the app's device tables. */
  readonly useDeviceQuery: <R extends Row>(
    query: Query<D, R>,
    options?: UseQueryOptions,
  ) => QueryRows<R>;

  /** The same as `useQueries`, for queries of the app's device tables. */
  readonly useDeviceQueries: <Q extends Queries<D>, OQ extends Queries<D>>(
    queries: [...Q],
    options?: UseQueriesOptions<OQ>,
  ) => [...QueriesToQueryRows<Q>, ...QueriesToQueryRows<OQ>];
}

/**
 * Options of {@link ReactBinding.useQuery} and
 * {@link ReactBinding.useDeviceQuery}.
 */
export interface UseQueryOptions {
  /** Without subscribing to changes. */
  readonly once?: boolean;
}

/**
 * Options of {@link ReactBinding.useQueries} and
 * {@link ReactBinding.useDeviceQueries}.
 */
export interface UseQueriesOptions<OQ extends Queries> {
  /** Queries that are only loaded, not subscribed to. */
  readonly once?: [...OQ];
}

/**
 * Creates a React binding for a specific {@link EvoluSchema}.
 *
 * The created binding contains the context components and all hooks needed by
 * React components using an {@link Evolu} instance created from that schema. For
 * an app of {@link createEvoluApp}, `EvoluAppProvider` provides the app and the
 * instance of the AppOwner the tab has open, and the device hooks,
 * `useDeviceEvolu`, `useDeviceQuery`, and `useDeviceQueries`, read its device
 * database.
 *
 * The type arguments configure the binding without passing a schema at runtime:
 * `S` is the app's {@link EvoluSchema}, and `D` the schema of its device tables,
 * which the device hooks take, without tables by default.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertType,
 *   createQueryBuilder,
 *   id,
 *   NonEmptyTrimmedString100,
 *   testEvoluSchema,
 *   type AppOwnerEvolu,
 *   type EvoluApp,
 *   type QueryRows,
 *   type TestEvoluSchema,
 * } from "@evolu/common";
 * import { createEvoluBinding } from "@evolu/react";
 *
 * const DeviceSchema = {
 *   setting: { id: id("Setting"), name: NonEmptyTrimmedString100 },
 * };
 *
 * // Create the binding once and share it with components.
 * const {
 *   EvoluContext,
 *   EvoluAppProvider,
 *   useEvolu,
 *   useQuery,
 *   useDeviceQuery,
 * } = createEvoluBinding<typeof testEvoluSchema, typeof DeviceSchema>();
 *
 * const allTodos = createQueryBuilder(testEvoluSchema)((db) =>
 *   db.selectFrom("todo").selectAll(),
 * );
 * const allSettings = createQueryBuilder(DeviceSchema)((db) =>
 *   db.selectFrom("setting").selectAll(),
 * );
 * const useTodos = () => useQuery(allTodos);
 * const useSettings = () => useDeviceQuery(allSettings);
 * // @ts-expect-error A query of the app's tables isn't one of its device tables.
 * const useTodosOfDevice = () => useDeviceQuery(allTodos);
 *
 * assertType<
 *   [
 *     Parameters<typeof EvoluContext>[0]["value"],
 *     Parameters<typeof EvoluAppProvider>[0]["value"],
 *     ReturnType<typeof useEvolu>,
 *     ReturnType<typeof useTodos>,
 *     ReturnType<typeof useSettings>,
 *   ],
 *   [
 *     AppOwnerEvolu<TestEvoluSchema>,
 *     Promise<EvoluApp<TestEvoluSchema, typeof DeviceSchema>>,
 *     AppOwnerEvolu<TestEvoluSchema>,
 *     QueryRows<typeof allTodos.Row>,
 *     QueryRows<typeof allSettings.Row>,
 *   ]
 * >();
 * void useTodosOfDevice;
 * ```
 */
export const createEvoluBinding = <
  S extends EvoluSchema = EvoluSchema,
  D extends EvoluSchema = EmptyEvoluSchema,
>(): ReactBinding<S, D> => {
  const EvoluContext = createContext<AppOwnerEvolu<S> | null>(null);
  const EvoluAppContext = createContext<EvoluApp<S, D> | null>(null);

  // A key per instance `current` holds, which changes when the tab opens
  // another AppOwner or another database of the same one, so no state of the
  // children outlives the database it came from.
  const keysByEvolu = new WeakMap<Promise<unknown>, number>();
  let nextKey = 0;

  const useEvolu = (): AppOwnerEvolu<S> => {
    const evolu = use(EvoluContext);
    assert(evolu, "EvoluContext is missing.");
    // Its methods throw, so wait until the app reloads or provides another.
    // The deletion can also land between a render and its effects, so the
    // effects below check it too. Its subscriptions do nothing after disposal,
    // and React renders again when reading the rows throws, which suspends.
    if (isDatabaseDeleted(evolu)) {
      let suspension = databaseDeletedSuspensionByEvolu.get(evolu);
      if (!suspension) {
        suspension = new Promise<never>(constVoid);
        databaseDeletedSuspensionByEvolu.set(evolu, suspension);
      }
      use(suspension);
    }
    return evolu;
  };

  const { useQuery, useQueries, useQuerySubscription } =
    createQueryHooks<S>(useEvolu);

  const useOwner = (
    owner: Parameters<Evolu<S>["useOwner"]>[0] | null,
    options?: UseOwnerOptions,
  ): void => {
    // An array, the transports argument before the options, would read as
    // options without transports, so a later array wouldn't even reach
    // Evolu's useOwner, which throws for it.
    assert(
      !Array.isArray(options),
      "useOwner takes its transports in the options, such as useOwner(owner, { transports }).",
    );
    const evolu = useEvolu();
    // What identifies a registration: the keys and the options, not other
    // Owner or transport fields, which Evolu doesn't send.
    const key =
      owner &&
      structuralLookup({
        id: owner.id,
        encryptionKey: owner.encryptionKey,
        writeKey: "writeKey" in owner ? owner.writeKey : null,
        transports:
          options?.transports?.map(({ type, url }) => ({ type, url })) ?? null,
        deleteWhenUnused: options?.deleteWhenUnused ?? false,
      });

    useEffect(
      () =>
        owner && !isDatabaseDeleted(evolu)
          ? evolu.useOwner(owner, options)
          : undefined,
      // oxlint-disable-next-line react/exhaustive-deps -- The key stands for the owner and options, which callers usually recreate on each render.
      [evolu, key],
    );
  };

  const useOwnerSyncStatus: ReactBinding<S>["useOwnerSyncStatus"] = (
    syncState: ReadonlyStore<SyncState | null>,
    owner?: Parameters<Evolu<S>["useOwner"]>[0] | null,
  ): OwnerSyncStatus => {
    const evolu = useEvolu();
    const { name } = evolu;
    // Only the overload without an owner leaves it undefined.
    const id =
      owner === undefined
        ? evolu.appOwner.id
        : owner === null
          ? null
          : owner.id;

    const statusOf = (state: SyncState | null): OwnerSyncStatus =>
      id === null
        ? noRelaysSyncStatus
        : syncStateToOwnerSyncStatus(state, name, id);

    // A status keeps its object while it is unchanged, so React re-renders only
    // when it changes. Server rendering has no snapshot, which gives the same
    // NoRelays object that hydration starts from.
    return useSyncExternalStore(
      syncState.subscribe,
      () => statusOf(syncState.get()),
      () => statusOf(null),
    );
  };

  const EvoluAppProvider: ReactBinding<S, D>["EvoluAppProvider"] = ({
    value,
    withoutAppOwner,
    children,
  }) => {
    const app = use(value);
    const current = useSyncExternalStore(
      app.current.subscribe,
      app.current.get,
      app.current.get,
    );
    let key: number | null = null;
    if (current) {
      key = keysByEvolu.get(current.evolu) ?? nextKey++;
      keysByEvolu.set(current.evolu, key);
    }
    return createElement(
      EvoluAppContext,
      { value: app },
      current
        ? createElement(CurrentAppOwnerProvider, { key, current }, children)
        : withoutAppOwner,
    );
  };

  // A child, so a switch remounts the children of EvoluAppProvider, and the
  // AppOwner's instance suspends under the app's Suspense boundary.
  const CurrentAppOwnerProvider: FC<{
    current: CurrentAppOwner<S>;
    children?: ReactNode;
  }> = ({ current, children }) =>
    createElement(EvoluContext, { value: use(current.evolu) }, children);

  const useEvoluApp = (): EvoluApp<S, D> => {
    const app = use(EvoluAppContext);
    assert(app, "EvoluAppProvider is missing.");
    return app;
  };

  const useAppOwners = (): ReadonlyArray<AppOwnerEntry> => {
    const { appOwners } = useEvoluApp();
    return useSyncExternalStore(
      appOwners.subscribe,
      appOwners.get,
      appOwners.get,
    );
  };

  const useDeviceEvolu = (): DeviceEvolu<D> => useEvoluApp().device;

  const { useQuery: useDeviceQuery, useQueries: useDeviceQueries } =
    createQueryHooks<D>(useDeviceEvolu);

  return {
    EvoluContext,
    useEvolu,
    useQuery,
    useQueries,
    useQuerySubscription,
    useOwner,
    useOwnerSyncStatus,
    EvoluAppProvider,
    useEvoluApp,
    useAppOwners,
    useDeviceEvolu,
    useDeviceQuery,
    useDeviceQueries,
  };
};

/**
 * The query hooks over the instance `useInstance` returns, such as an
 * AppOwner's or the device database's.
 */
const createQueryHooks = <X extends EvoluSchema>(
  useInstance: () => DeviceEvolu<X>,
): Pick<
  ReactBinding<X>,
  "useQuery" | "useQueries" | "useQuerySubscription"
> => {
  const useQuerySubscription = <R extends Row>(
    query: Query<X, R>,
    options: Partial<{
      readonly once: boolean;
    }> = {},
  ): QueryRows<R> => {
    const evolu = useInstance();
    const { once } = useRef(options).current;

    if (once) {
      /* oxlint-disable react/rules-of-hooks -- The once branch remains stable for the lifetime of this subscription. */
      useEffect(
        () =>
          isDatabaseDeleted(evolu)
            ? undefined
            : evolu.subscribeQuery(query)(constVoid),
        [evolu, query],
      );
      return evolu.getQueryRows(query);
    }

    return useSyncExternalStore(
      useMemo(() => evolu.subscribeQuery(query), [evolu, query]),
      useMemo(() => () => evolu.getQueryRows(query), [evolu, query]),
      () => emptyArray as QueryRows<R>,
      /* oxlint-enable react/rules-of-hooks */
    );
  };

  const useQuery = <R extends Row>(
    query: Query<X, R>,
    { once = false }: UseQueryOptions = {},
  ): QueryRows<R> => {
    const evolu = useInstance();
    const isSSR = useIsSsr();

    if (isSSR) {
      // A load that fails before the render after hydration reads it would
      // otherwise also be reported as unhandled.
      void evolu.loadQuery(query).then(constVoid, constVoid);
    } else {
      use(evolu.loadQuery(query));
    }

    return useQuerySubscription(query, { once });
  };

  const useQueries = <Q extends Queries<X>, OQ extends Queries<X>>(
    queries: [...Q],
    { once }: UseQueriesOptions<OQ> = {},
  ): [...QueriesToQueryRows<Q>, ...QueriesToQueryRows<OQ>] => {
    const evolu = useInstance();
    const onceQueries = useRef(once).current;
    const allQueries = onceQueries ? queries.concat(onceQueries) : queries;

    const wasSSR = useIsSsr();
    const promises = evolu.loadQueries(allQueries);
    // While server rendering, as in useQuery. Otherwise, use() suspends on the
    // first pending promise, so a later one that fails before React reads it
    // would also be reported as unhandled.
    for (const promise of promises) void promise.then(constVoid, constVoid);
    if (!wasSSR) promises.map(use);

    return allQueries.map((query, index) =>
      // Safe until the number of queries is stable.
      // oxlint-disable-next-line react/rules-of-hooks -- The number and order of queries must remain stable.
      useQuerySubscription(query, { once: index > queries.length - 1 }),
    ) as never;
  };

  return { useQuery, useQueries, useQuerySubscription };
};

const noRelaysSyncStatus: OwnerSyncStatus = { type: "NoRelays" };

// Each never settles, so a component stays suspended on it. React's retry
// listeners on it keep the suspended components, so there is one for each
// deleted instance, which they share and which goes away with it.
const databaseDeletedSuspensionByEvolu = new WeakMap<object, Promise<never>>();
