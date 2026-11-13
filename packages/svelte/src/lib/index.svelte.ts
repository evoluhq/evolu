/**
 * This file needs to be named .svelte.ts to be recognized by the Svelte
 * compiler in the app itself.
 */

import {
  constVoid,
  emptyArray,
  structuralLookup,
  type NonEmptyReadonlyArray,
  type ReadonlyStore,
  type UnknownError,
} from "@evolu/common";
import {
  isDatabaseDeleted,
  subscribeAppOwnerState,
  syncStateToOwnerSyncStatus,
  type AppOwnerEntry,
  type AppOwnerEvolu,
  type AppOwnerState,
  type DeviceEvolu,
  type EmptyEvoluSchema,
  type Evolu,
  type EvoluApp,
  type EvoluErrorDep,
  type EvoluSchema,
  type Owner,
  type OwnerSyncStatus,
  type OwnerTransport,
  type Query,
  type QueryRows,
  type ReadonlyOwner,
  type Row,
  type SyncState,
  type SyncStateDep,
} from "@evolu/common/local-first";
import { createEvoluDeps } from "@evolu/web";
import { untrack } from "svelte";

export const evoluSvelteDeps = /*#__PURE__*/ createEvoluDeps();

/**
 * Loads and subscribes to the query that `observedQuery` returns, and returns a
 * {@link QueryState}, whose `rows` update when the data changes and whose
 * `loaded` is the current query's first load. A component renders `{#await
 * todos.loaded}`, what shows while the query loads, `{:then}`, the rows of
 * `todos.rows`, `{:catch error}`, the failure, `{/await}`, so it tells a
 * loading query from an empty one and shows a failure. See
 * {@link Evolu.loadQuery}. It takes any instance, such as an AppOwner's from
 * {@link evoluAppState} or the device database's, {@link EvoluApp.device}.
 *
 * It creates an `$effect`, so call it where Svelte allows one, such as during
 * component initialization or inside `$effect.root`. The subscription ends when
 * that component or root is destroyed. When `observedQuery` reads reactive
 * state, such as a `$derived` query, `queryState` loads the new query whenever
 * it changes. Derive values from `rows` with `$derived`.
 *
 * ### Example
 *
 * Runes such as `$state` work only in Svelte components and `.svelte.ts` or
 * `.svelte.js` modules. A component calls `todoTitlesState` during its
 * initialization.
 *
 * ```ts
 * import {
 *   assertType,
 *   createQueryBuilder,
 *   sqliteTrue,
 *   testEvoluSchema,
 *   type Evolu,
 *   type NonEmptyTrimmedString100,
 *   type TestEvoluSchema,
 * } from "@evolu/common";
 * import { queryState } from "@evolu/svelte";
 *
 * const createQuery = createQueryBuilder(testEvoluSchema);
 *
 * const todoTitlesState = (evolu: Evolu<TestEvoluSchema>) => {
 *   let showCompleted = $state(false);
 *
 *   const todosQuery = $derived(
 *     createQuery((db) =>
 *       db
 *         .selectFrom("todo")
 *         .select(["id", "title"])
 *         .where("isDeleted", "is not", sqliteTrue)
 *         .$if(!showCompleted, (qb) =>
 *           qb.where("isCompleted", "is not", sqliteTrue),
 *         ),
 *     ),
 *   );
 *   const todos = queryState(evolu, () => todosQuery);
 *   const titles = $derived(todos.rows.map((todo) => todo.title));
 *
 *   return {
 *     titles: () => titles,
 *     // For `{#await}`, which shows the query loading or its failure.
 *     loaded: () => todos.loaded,
 *     toggleCompleted: () => {
 *       showCompleted = !showCompleted;
 *     },
 *   };
 * };
 *
 * assertType<
 *   ReturnType<ReturnType<typeof todoTitlesState>["titles"]>,
 *   Array<NonEmptyTrimmedString100 | null>
 * >();
 * assertType<
 *   Awaited<
 *     ReturnType<ReturnType<typeof todoTitlesState>["loaded"]>
 *   >[number]["title"],
 *   NonEmptyTrimmedString100 | null
 * >();
 * ```
 */
export const queryState = <R extends Row, Schema extends EvoluSchema>(
  evolu: DeviceEvolu<Schema>,
  observedQuery: () => Query<Schema, R> | undefined,
): QueryState<R> => {
  // Evolu replaces rows and never mutates them, so raw state keeps them
  // unproxied. Proxies would cost work and the identity of unchanged rows.
  let writableState: QueryRows<R> = $state.raw(emptyArray);
  // Pending until the effect starts the first load. Server rendering runs no
  // effect, so a hydrating component's first render matches the server's.
  let loaded: Promise<QueryRows<R>> = $state.raw(new Promise(constVoid));

  $effect(() => {
    const query = observedQuery();

    if (!query) {
      writableState = emptyArray;
      loaded = noRowsLoaded;
      return;
    }

    // The deletion of its database, or the removal of its AppOwner, disposed
    // the instance, whose methods throw, so a component the app hasn't
    // replaced yet shows no rows, and its load stays pending, as React's
    // useQuery stays suspended until the app replaces the instance. The
    // effect can run again after that, as for a query that depends on rows a
    // deletion emptied.
    if (isDatabaseDeleted(evolu)) {
      writableState = emptyArray;
      loaded = new Promise(constVoid);
      return;
    }

    const updateRows = (): void => {
      writableState = evolu.getQueryRows(query);
    };

    // Rows come only from the store, never from a load result, because a
    // load of a previous query can resolve after the current query's rows.
    // The load stores the rows and notifies the subscription. Nothing here
    // handles its failure, so one that the app doesn't await through
    // `loaded` is reported as an unhandled rejection, and one it awaits is
    // not.
    loaded = evolu.loadQuery(query);
    updateRows();

    return evolu.subscribeQuery(query)(updateRows);
  });

  return {
    // Each read of `rows` reads the state, so templates and effects track it.
    // A plain property would hold only the initial rows. A getter rather than
    // a function follows how Svelte exposes reactive state.
    get rows() {
      return writableState;
    },
    get loaded() {
      return loaded;
    },
  };
};

/**
 * What {@link queryState} returns, whose properties update when the query or its
 * rows change.
 */
export interface QueryState<R extends Row> {
  /**
   * The rows of the current query: empty until the query loads and while there
   * is no query. When SQLite fails the query, they keep the rows the query last
   * loaded, if any.
   */
  readonly rows: QueryRows<R>;

  /**
   * The first load of the current query, which resolves with its rows or
   * rejects with the {@link UnknownError} of SQLite failing it. When the query
   * changes, also before this load settles, it's the new query's first load. A
   * later refresh, also one SQLite fails, leaves it as it is, and `rows` keeps
   * the rows. A failure the app awaits reaches only the app, and one that
   * nothing awaits is reported as an unhandled rejection.
   *
   * Without a query, it has resolved with no rows. It's pending until the
   * effect starts the load, so also during server rendering. It stays pending
   * for an instance whose database's deletion, or its AppOwner's removal,
   * disposed it, as React's `useQuery` stays suspended until the app replaces
   * the instance, and while a refused database answers no load, until the
   * instance's disposal resolves it with no rows. Observe
   * {@link EvoluErrorDep.evoluError} to show the refusal.
   */
  readonly loaded: Promise<QueryRows<R>>;
}

const noRowsLoaded: Promise<QueryRows<never>> =
  /*#__PURE__*/ Promise.resolve(emptyArray);

/**
 * What {@link evoluAppState} returns, whose properties update when the app
 * changes. It has no device schema, because the device database's instance is
 * {@link EvoluApp.device}.
 */
export interface EvoluAppState<S extends EvoluSchema> {
  /** The AppOwner this tab has open. */
  readonly state: AppOwnerState<S>;
  /** The AppOwners the app can open on this device. */
  readonly appOwners: ReadonlyArray<AppOwnerEntry>;
}

/**
 * Follows an {@link EvoluApp} and returns an object whose properties update when
 * it changes: `state`, the AppOwner this tab has open as an
 * {@link AppOwnerState}, and `appOwners`, the AppOwners the app can open on this
 * device. While `state` is `Open`, its `evolu` is the AppOwner's instance; it
 * changes when the tab opens another AppOwner, or the AppOwner again after a
 * removal and restore or its database's deletion, so key the children that use
 * it with it, which remounts them, and pass it to {@link queryState}. While
 * `state` is `None`, show a choice such as to open one of `appOwners`, create
 * one, or restore one. The device database's instance is
 * {@link EvoluApp.device}.
 *
 * It creates an `$effect`, so call it where Svelte allows one, such as during
 * component initialization or inside `$effect.root`. It stops following the app
 * when that component or root is destroyed.
 *
 * ### Example
 *
 * Runes such as `$state` work only in Svelte components and `.svelte.ts` or
 * `.svelte.js` modules. A component calls `evoluAppState` during its
 * initialization and renders `{#if appState.state.type === "Open"}`, the
 * AppOwner's UI in `{#key appState.state.evolu}`, `{:else if
 * appState.state.type === "None"}`, the choice, `{:else}`, what shows while the
 * AppOwner's instance opens, `{/if}`.
 *
 * ```ts
 * import {
 *   assertType,
 *   type AppOwnerState,
 *   type EvoluApp,
 *   type Name,
 *   type TestEvoluSchema,
 * } from "@evolu/common";
 * import { evoluAppState } from "@evolu/svelte";
 *
 * const todoAppState = (app: EvoluApp<TestEvoluSchema>) => {
 *   const appState = evoluAppState(app);
 *   // The open AppOwner's database, or null while none is open or it opens.
 *   const openName = $derived(
 *     appState.state.type === "Open" ? appState.state.evolu.name : null,
 *   );
 *
 *   return {
 *     state: () => appState.state,
 *     openName: () => openName,
 *   };
 * };
 *
 * assertType<
 *   ReturnType<ReturnType<typeof todoAppState>["state"]>,
 *   AppOwnerState<TestEvoluSchema>
 * >();
 * assertType<
 *   ReturnType<ReturnType<typeof todoAppState>["openName"]>,
 *   Name | null
 * >();
 * ```
 */
export const evoluAppState = <
  S extends EvoluSchema,
  D extends EvoluSchema = EmptyEvoluSchema,
>(
  app: EvoluApp<S, D>,
): EvoluAppState<S> => {
  // The stores replace their values and never mutate them, so raw state keeps
  // them unproxied. The first render shows the current AppOwner, whose open
  // only the effect waits for, so a root destroyed before it ran waits for
  // nothing.
  const initialCurrent = app.current.get();
  let state: AppOwnerState<S> = $state.raw(
    initialCurrent
      ? { type: "Opening", current: initialCurrent }
      : { type: "None" },
  );
  let appOwners: ReadonlyArray<AppOwnerEntry> = $state.raw(app.appOwners.get());

  $effect(() => {
    // Both read the stores anew, which can change between initialization and
    // this effect. An app.open in a caller's effect sets the state
    // synchronously, which only writes it, so that effect doesn't track it.
    const unsubscribeState = subscribeAppOwnerState(app.current, (next) => {
      state = next;
    });
    appOwners = app.appOwners.get();
    const unsubscribeAppOwners = app.appOwners.subscribe(() => {
      appOwners = app.appOwners.get();
    });
    return () => {
      unsubscribeState();
      unsubscribeAppOwners();
    };
  });

  return {
    // Getters, as `queryState`'s `rows`, so each read tracks the state.
    get state() {
      return state;
    },
    get appOwners() {
      return appOwners;
    },
  };
};

/**
 * Uses an owner for sync through {@link Evolu.useOwner} while the component or
 * root that calls it lives, and stops when it's destroyed or when the owner
 * that `observedOwner` returns, or the transports that `observedTransports`
 * returns, change. Without transports, the owner syncs with the transports of
 * the instance's config. A null owner uses none, for a component that waits for
 * one. The owner and transports are compared by content, so recreating them,
 * such as in a `$derived`, keeps the same registration.
 * {@link Evolu.deleteOwner} of the owner ends its use, and it uses the owner
 * again only once the component mounts again or the owner or transports change.
 * An instance whose database was deleted uses none.
 *
 * It creates an `$effect`, so call it where Svelte allows one, such as during
 * component initialization or inside `$effect.root`. Server rendering runs no
 * effect, so it uses none there.
 *
 * ### Example
 *
 * Runes such as `$state` work only in Svelte components and `.svelte.ts` or
 * `.svelte.js` modules. A component calls `projectSync` during its
 * initialization.
 *
 * ```ts
 * import {
 *   type AppOwnerEvolu,
 *   type ShardOwner,
 *   type TestEvoluSchema,
 * } from "@evolu/common";
 * import { ownerSync } from "@evolu/svelte";
 *
 * // Syncs the open project's owner, and none while no project is open.
 * const projectSync = (evolu: AppOwnerEvolu<TestEvoluSchema>) => {
 *   let project: ShardOwner | null = $state.raw(null);
 *   ownerSync(evolu, () => project);
 *
 *   return {
 *     open: (owner: ShardOwner | null) => {
 *       project = owner;
 *     },
 *   };
 * };
 *
 * void projectSync;
 * ```
 */
export const ownerSync = <S extends EvoluSchema>(
  evolu: AppOwnerEvolu<S>,
  observedOwner: () => ReadonlyOwner | Owner | null,
  observedTransports?: () => NonEmptyReadonlyArray<OwnerTransport> | undefined,
): void => {
  // What identifies a registration: the keys, not other Owner fields. A
  // string, so a recreated owner with the same content derives the same key.
  const key = $derived.by(() => {
    const owner = observedOwner();
    return (
      owner &&
      structuralLookup({
        id: owner.id,
        encryptionKey: owner.encryptionKey,
        writeKey: "writeKey" in owner ? owner.writeKey : null,
        transports: observedTransports?.() ?? null,
      })
    );
  });

  $effect(() => {
    // The deletion of its database disposed the instance, whose methods throw.
    if (key === null || isDatabaseDeleted(evolu)) return;
    // The key stands for the owner and transports, so the effect tracks only
    // it.
    return untrack(() => {
      const owner = observedOwner();
      return owner ? evolu.useOwner(owner, observedTransports?.()) : undefined;
    });
  });
};

/**
 * Follows the {@link OwnerSyncStatus} of an owner in the database of `evolu`,
 * read from `syncState`, the {@link SyncStateDep.syncState} store of the deps
 * the instance was created with, such as {@link evoluSvelteDeps}, and returns an
 * object whose `status` updates when the status changes, not with every
 * snapshot. Without `observedOwner`, it is the status of {@link Evolu.appOwner}.
 * Otherwise `observedOwner` returns the owner {@link ownerSync} takes; a null
 * owner, for a component that waits for one, gives `NoRelays`. Before the first
 * snapshot, during server rendering, and until its effect runs, the status is
 * `NoRelays`. A status keeps its object while it is unchanged. See
 * {@link OwnerSyncStatus} for what to show.
 *
 * It creates an `$effect`, so call it where Svelte allows one, such as during
 * component initialization or inside `$effect.root`. It stops following the
 * store when that component or root is destroyed.
 *
 * ### Example
 *
 * Runes such as `$state` work only in Svelte components and `.svelte.ts` or
 * `.svelte.js` modules. A component calls `syncLabelState` during its
 * initialization.
 *
 * ```ts
 * import {
 *   assertType,
 *   type AppOwnerEvolu,
 *   type OwnerSyncStatus,
 *   type ReadonlyStore,
 *   type SyncState,
 *   type TestEvoluSchema,
 * } from "@evolu/common";
 * import { ownerSyncStatusState } from "@evolu/svelte";
 *
 * const syncLabelState = (
 *   evolu: AppOwnerEvolu<TestEvoluSchema>,
 *   syncState: ReadonlyStore<SyncState | null>,
 * ) => {
 *   const sync = ownerSyncStatusState(evolu, syncState);
 *   const label = $derived(sync.status.type);
 *   return { label: () => label };
 * };
 *
 * assertType<
 *   ReturnType<ReturnType<typeof syncLabelState>["label"]>,
 *   OwnerSyncStatus["type"]
 * >();
 * ```
 */
export function ownerSyncStatusState<S extends EvoluSchema>(
  evolu: AppOwnerEvolu<S>,
  syncState: ReadonlyStore<SyncState | null>,
): { readonly status: OwnerSyncStatus };
/** For the owner `ownerSync` takes, or null while there is none. */
export function ownerSyncStatusState<S extends EvoluSchema>(
  evolu: DeviceEvolu<S>,
  syncState: ReadonlyStore<SyncState | null>,
  observedOwner: () => ReadonlyOwner | Owner | null,
): { readonly status: OwnerSyncStatus };
export function ownerSyncStatusState<S extends EvoluSchema>(
  evolu: AppOwnerEvolu<S> | DeviceEvolu<S>,
  syncState: ReadonlyStore<SyncState | null>,
  observedOwner?: () => ReadonlyOwner | Owner | null,
): { readonly status: OwnerSyncStatus } {
  const { name } = evolu;
  // Only the overload without an owner leaves it undefined, and it takes an
  // AppOwner's instance.
  const id = $derived(
    observedOwner === undefined
      ? (evolu as AppOwnerEvolu<S>).appOwner.id
      : (observedOwner()?.id ?? null),
  );

  // Server rendering runs no effect, and a hydrating component renders what
  // the server rendered, so the status starts as before the first snapshot: the
  // same NoRelays object the store gives then, so the effect changes nothing
  // without a snapshot.
  const initialId = id;
  let status: OwnerSyncStatus = $state.raw(
    initialId === null
      ? noRelaysSyncStatus
      : syncStateToOwnerSyncStatus(null, name, initialId),
  );

  $effect(() => {
    // Reading the owner's ID tracks it, so another owner follows anew.
    const ownerId = id;
    if (ownerId === null) {
      status = noRelaysSyncStatus;
      return;
    }
    // Raw state ignores an assignment of the object it already holds.
    const read = (): void => {
      status = syncStateToOwnerSyncStatus(syncState.get(), name, ownerId);
    };
    read();
    return syncState.subscribe(read);
  });

  return {
    // A getter, as `queryState`'s `rows`, so each read tracks the state.
    get status() {
      return status;
    },
  };
}

/**
 * Follows an Evolu {@link ReadonlyStore}, such as `evoluError` or `syncState` of
 * {@link evoluSvelteDeps}, and returns an object whose `current` is the store's
 * value and updates when it changes. It's what React's `useSyncExternalStore`
 * does for a store, and `current` follows Svelte's `fromStore`. The first
 * render and server rendering read the store once; the effect reads it again
 * once subscribed, so a change since then shows. A store replaces its value
 * rather than mutating it, so `current` changes only when the value does.
 *
 * It creates an `$effect`, so call it where Svelte allows one, such as during
 * component initialization or inside `$effect.root`. It stops following the
 * store when that component or root is destroyed.
 *
 * ### Example
 *
 * Runes such as `$state` work only in Svelte components and `.svelte.ts` or
 * `.svelte.js` modules. A component calls `evoluErrorState` during its
 * initialization.
 *
 * ```ts
 * import {
 *   assertType,
 *   type EvoluError,
 *   type ReadonlyStore,
 * } from "@evolu/common";
 * import { storeState } from "@evolu/svelte";
 *
 * const evoluErrorState = (
 *   evoluError: ReadonlyStore<EvoluError | null>,
 * ) => {
 *   const error = storeState(evoluError);
 *   const message = $derived(error.current ? error.current.type : null);
 *   return { message: () => message };
 * };
 *
 * assertType<
 *   ReturnType<ReturnType<typeof evoluErrorState>["message"]>,
 *   EvoluError["type"] | null
 * >();
 * ```
 */
export const storeState = <T>(
  store: ReadonlyStore<T>,
): { readonly current: T } => {
  // Raw state keeps the store's values unproxied, as queryState keeps rows.
  let current: T = $state.raw(store.get());

  $effect(() => {
    const update = (): void => {
      current = store.get();
    };
    const unsubscribe = store.subscribe(update);
    // Read again once subscribed, as the store can change between the first
    // render and this effect, and while it subscribes.
    update();
    return unsubscribe;
  });

  return {
    // A getter, as `queryState`'s `rows`, so each read tracks the state.
    get current() {
      return current;
    },
  };
};

const noRelaysSyncStatus: OwnerSyncStatus = { type: "NoRelays" };
