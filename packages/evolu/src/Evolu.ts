import {
  Context,
  Effect,
  Either,
  Function,
  Layer,
  Number,
  Option,
  ReadonlyArray,
  absurd,
  pipe,
} from "effect";
import { Simplify } from "kysely";
import { Config, ConfigLive } from "./Config.js";
import { Bip39, NanoId } from "./Crypto.js";
import {
  CommonColumns,
  CreateQuery,
  NullableExceptOfId,
  Owner,
  Schema,
  Tables,
  makeCreateQuery,
} from "./Db.js";
import {
  DbWorker,
  DbWorkerOutputOnQuery,
  MutateItem,
  OnCompleteId,
  RowsCacheMap,
} from "./DbWorker.js";
import { applyPatches } from "./Diff.js";
import { EvoluError } from "./Errors.js";
import { CastableForMutate, Id, cast } from "./Model.js";
import { AppState, FlushSync } from "./Platform.js";
import { Query, Row } from "./Sqlite.js";
import { Store, StoreListener, StoreUnsubscribe, makeStore } from "./Store.js";
import { SyncState } from "./SyncWorker.js";
import { Time, TimeLive } from "./Timestamp.js";

export interface Evolu<S extends Schema> {
  readonly subscribeError: ErrorStore["subscribe"];
  readonly getError: ErrorStore["getState"];

  readonly subscribeOwner: OwnerStore["subscribe"];
  readonly getOwner: OwnerStore["getState"];

  readonly subscribeQuery: QueryStore["subscribe"];
  readonly getQuery: QueryStore["getState"];
  readonly createQuery: CreateQuery<S>;
  readonly loadQuery: QueryStore["loadQuery"];

  readonly subscribeSyncState: (listener: StoreListener) => StoreUnsubscribe;
  readonly getSyncState: () => SyncState;

  readonly mutate: Mutate<S>;
  readonly ownerActions: OwnerActions;
  readonly ensureSchema: (tables: Tables) => void;
}

export const Evolu = <T extends Schema>(): Context.Tag<Evolu<T>, Evolu<T>> =>
  Context.Tag<Evolu<T>>("evolu/Evolu");

type ErrorStore = Store<EvoluError | null>;

type OwnerStore = Store<Owner | null>;

interface QueryStore {
  readonly subscribe: (
    query: Query | null,
  ) => (listener: StoreListener) => StoreUnsubscribe;
  readonly getState: (query: Query | null) => ReadonlyArray<Row> | null;
  readonly loadQuery: (query: Query) => Promise<ReadonlyArray<Row>>;
  readonly onQuery: (output: DbWorkerOutputOnQuery) => void;
}

const QueryStore = Context.Tag<QueryStore>("evolu/QueryStore");

type Mutate<S extends Schema> = <
  U extends SchemaForMutate<S>,
  T extends keyof U,
>(
  table: T,
  values: Simplify<Partial<CastableForMutate<U[T]>>>,
  onComplete?: () => void,
) => {
  readonly id: U[T]["id"];
};

const Mutate = <T extends Schema>(): Context.Tag<Mutate<T>, Mutate<T>> =>
  Context.Tag<Mutate<T>>("evolu/Mutate");

type SchemaForMutate<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & Pick<CommonColumns, "isDeleted">
  >;
};

export interface OwnerActions {
  /**
   * Use `reset` to delete all local data from the current device.
   * After the deletion, Evolu reloads all browser tabs that use Evolu.
   */
  readonly reset: () => void;

  /**
   * Use `restore` to restore `Owner` with synced data on a different device.
   */
  readonly restore: (
    mnemonic: string,
  ) => Promise<Either.Either<RestoreOwnerError, void>>;
}

const OwnerActions = Context.Tag<OwnerActions>("evolu/OwnerActions");

interface RestoreOwnerError {
  readonly _tag: "RestoreOwnerError";
}

type SubscribedQueries = Map<Query, number>;

const SubscribedQueries = Context.Tag<SubscribedQueries>(
  "evolu/SubscribedQueries",
);

type OnCompletes = Map<OnCompleteId, OnComplete>;

const OnCompletes = Context.Tag<OnCompletes>("evolu/OnCompletes");

type OnComplete = () => void;

interface LoadingPromises {
  readonly getPromise: (query: Query) => {
    readonly promise: Promise<ReadonlyArray<Row>>;
    readonly isNew: boolean;
  };
  readonly resolvePromise: (query: Query, rows: ReadonlyArray<Row>) => void;
  readonly releasePromises: (ignoreQueries: ReadonlyArray<Query>) => void;
}

const LoadingPromises = Context.Tag<LoadingPromises>("evolu/LoadingPromises");

export const loadingPromisesPromiseProp = "rows";

const LoadingPromisesLive = Layer.effect(
  LoadingPromises,
  Effect.sync(() => {
    const promises = new Map<
      Query,
      {
        readonly promise: Promise<ReadonlyArray<Row>>;
        readonly resolve: (rows: ReadonlyArray<Row>) => void;
      }
    >();

    const getPromise: LoadingPromises["getPromise"] = (query) => {
      const item = promises.get(query);
      if (item) return { promise: item.promise, isNew: false };
      let resolve: (rows: ReadonlyArray<Row>) => void = Function.constVoid;
      const promise = new Promise<ReadonlyArray<Row>>((_resolve) => {
        resolve = _resolve;
      });
      promises.set(query, { promise, resolve });
      return { promise, isNew: true };
    };

    const resolvePromise: LoadingPromises["resolvePromise"] = (query, rows) => {
      const item = promises.get(query);
      if (!item) return;
      // It's similar to what React will do.
      void Object.assign(item.promise, { [loadingPromisesPromiseProp]: rows });
      item.resolve(rows);
    };

    const releasePromises: LoadingPromises["releasePromises"] = (
      ignoreQueries,
    ) => {
      [...promises.keys()].forEach((query) => {
        if (!ignoreQueries.includes(query)) promises.delete(query);
      });
    };

    return { getPromise, resolvePromise, releasePromises };
  }),
);

const QueryStoreLive = Layer.effect(
  QueryStore,
  Effect.gen(function* (_) {
    const subscribedQueries = yield* _(SubscribedQueries);
    const loadingPromises = yield* _(LoadingPromises);
    const dbWorker = yield* _(DbWorker);
    const flushSync = yield* _(FlushSync);
    const onCompletes = yield* _(OnCompletes);

    const rowsCacheStore = makeStore<RowsCacheMap>(new Map());
    const queue = new Set<Query>();

    const subscribe: QueryStore["subscribe"] = (query) => (listen) => {
      if (query == null) return Function.constVoid;
      subscribedQueries.set(
        query,
        Number.increment(subscribedQueries.get(query) ?? 0),
      );
      const unsubscribe = rowsCacheStore.subscribe(listen);
      return () => {
        // `as number`, because React mount/unmount are symmetric.
        const count = subscribedQueries.get(query) as number;
        if (count > 1) subscribedQueries.set(query, Number.decrement(count));
        else subscribedQueries.delete(query);
        unsubscribe();
      };
    };

    const getState: QueryStore["getState"] = (query) =>
      (query && rowsCacheStore.getState().get(query)) || null;

    const loadQuery: QueryStore["loadQuery"] = (query) => {
      const { promise, isNew } = loadingPromises.getPromise(query);
      if (isNew) queue.add(query);
      if (queue.size === 1) {
        queueMicrotask(() => {
          const queries = [...queue];
          queue.clear();
          if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
            dbWorker.postMessage({ _tag: "query", queries });
        });
      }
      return promise;
    };

    const onQuery: QueryStore["onQuery"] = ({
      queriesPatches,
      onCompleteIds,
    }) => {
      const state = rowsCacheStore.getState();
      const nextState = pipe(
        queriesPatches,
        ReadonlyArray.map(
          ({ query, patches }) =>
            [query, applyPatches(patches)(state.get(query) || [])] as const,
        ),
        (a): RowsCacheMap => new Map([...state, ...a]),
      );
      // Resolve all Promises belonging to queries.
      queriesPatches.forEach(({ query }) => {
        const rows = nextState.get(query) || [];
        loadingPromises.resolvePromise(query, rows);
      });
      // No mutation is using onComplete, so we don't need flushSync.
      if (onCompleteIds.length === 0) {
        rowsCacheStore.setState(nextState);
        return;
      }
      flushSync(() => rowsCacheStore.setState(nextState));
      ReadonlyArray.filterMap(onCompleteIds, (id) => {
        const onComplete = onCompletes.get(id);
        onCompletes.delete(id);
        return Option.fromNullable(onComplete);
      }).forEach((onComplete) => onComplete());
    };

    return { subscribe, getState, loadQuery, onQuery };
  }),
);

const MutateLive = <T extends Schema>(): Layer.Layer<
  NanoId | OnCompletes | Time | SubscribedQueries | LoadingPromises | DbWorker,
  never,
  Mutate<T>
> =>
  Layer.effect(
    Mutate<T>(),
    Effect.gen(function* (_) {
      const nanoid = yield* _(NanoId);
      const onCompletes = yield* _(OnCompletes);
      const time = yield* _(Time);
      const subscribedQueries = yield* _(SubscribedQueries);
      const loadingPromises = yield* _(LoadingPromises);
      const dbWorker = yield* _(DbWorker);

      const queue: Array<MutateItem> = [];

      return Mutate<T>().of((table, { id, ...values }, onComplete) => {
        const isInsert = id == null;
        if (isInsert) id = Effect.runSync(nanoid.nanoid) as never;

        let onCompleteId = null;
        if (onComplete) {
          onCompleteId = Effect.runSync(nanoid.nanoid) as OnCompleteId;
          onCompletes.set(onCompleteId, onComplete);
        }

        queue.push({
          table: table as string,
          id: id as Id,
          values: values as MutateItem["values"],
          isInsert,
          now: cast(new Date(Effect.runSync(time.now))),
          onCompleteId,
        });

        if (queue.length === 1)
          queueMicrotask(() => {
            const items = [...queue];
            queue.length = 0;

            const queries = Array.from(subscribedQueries.keys());
            // Just wipe-out LoadingPromises unused queries.
            loadingPromises.releasePromises(queries);

            if (ReadonlyArray.isNonEmptyReadonlyArray(items))
              dbWorker.postMessage({ _tag: "mutate", items, queries });
          });

        return { id: id as never };
      });
    }),
  );

const OwnerActionsLive = Layer.effect(
  OwnerActions,
  Effect.gen(function* (_) {
    const dbWorker = yield* _(DbWorker);
    const bip39 = yield* _(Bip39);

    const reset: OwnerActions["reset"] = () => {
      dbWorker.postMessage({ _tag: "reset" });
    };

    const restore: OwnerActions["restore"] = (mnemonic) =>
      bip39.parse(mnemonic).pipe(
        Effect.flatMap((mnemonic) =>
          Effect.sync(() => {
            dbWorker.postMessage({ _tag: "reset", mnemonic });
            return Either.right(undefined);
          }),
        ),
        Effect.catchTag("InvalidMnemonicError", () =>
          Effect.succeed(
            Either.left<RestoreOwnerError>({ _tag: "RestoreOwnerError" }),
          ),
        ),
        Effect.runPromise,
      );

    return { reset, restore };
  }),
);

export const EvoluLive = <T extends Schema>(
  tables: Tables,
): Layer.Layer<
  DbWorker | Bip39 | Config | FlushSync | NanoId | Time | AppState,
  never,
  Evolu<T>
> =>
  Layer.effect(
    Evolu<T>(),
    Effect.gen(function* (_) {
      const dbWorker = yield* _(DbWorker);
      const appState = yield* _(AppState);
      const config = yield* _(Config);

      const subscribedQueries: SubscribedQueries = new Map();
      const onCompletes: OnCompletes = new Map();
      const loadingPromises = Effect.provideLayer(
        LoadingPromises,
        LoadingPromisesLive,
      ).pipe(Effect.runSync);

      const errorStore = makeStore<EvoluError | null>(null);
      const ownerStore = makeStore<Owner | null>(null);
      const syncStateStore = makeStore<SyncState>({
        _tag: "SyncStateInitial",
      });

      const Layers = Layer.mergeAll(
        Layer.succeed(DbWorker, dbWorker),
        Layer.succeed(SubscribedQueries, subscribedQueries),
        Layer.succeed(OnCompletes, onCompletes),
        Layer.succeed(LoadingPromises, loadingPromises),
        Layer.succeed(FlushSync, yield* _(FlushSync)),
        Layer.succeed(NanoId, yield* _(NanoId)),
        Layer.succeed(Time, yield* _(Time)),
        Layer.succeed(Bip39, yield* _(Bip39)),
      );

      const queryStore = Effect.provideLayer(
        QueryStore,
        Layer.use(QueryStoreLive, Layers),
      ).pipe(Effect.runSync);

      const mutate = Effect.provideLayer(
        Mutate<T>(),
        Layer.use(MutateLive<T>(), Layers),
      ).pipe(Effect.runSync);

      const ownerActions = Effect.provideLayer(
        OwnerActions,
        Layer.use(OwnerActionsLive, Layers),
      ).pipe(Effect.runSync);

      const ensureSchema: Evolu<T>["ensureSchema"] = (tables) => {
        dbWorker.postMessage({ _tag: "ensureSchema", tables });
      };

      const getSubscribedQueries = (): ReadonlyArray<Query> =>
        Array.from(subscribedQueries.keys());

      dbWorker.onMessage = (output): void => {
        // console.log(output);
        switch (output._tag) {
          case "onError":
            if (process.env.NODE_ENV === "development")
              // JSON.stringify, because Expo console needs strings.
              // eslint-disable-next-line no-console
              console.warn(JSON.stringify(output.error, null, 2));
            errorStore.setState(output.error);
            break;
          case "onOwner":
            ownerStore.setState(output.owner);
            break;
          case "onQuery":
            queryStore.onQuery(output);
            break;
          case "onReceive": {
            const queries = getSubscribedQueries();
            if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
              dbWorker.postMessage({ _tag: "query", queries });
            break;
          }
          case "onResetOrRestore":
            Effect.runSync(appState.reset);
            break;
          case "onSyncState":
            syncStateStore.setState(output.state);
            break;
          default:
            absurd(output);
        }
      };

      dbWorker.postMessage({ _tag: "init", config, tables });

      appState.onFocus(() => {
        // `queries` to refresh subscribed queries when a tab is changed.
        dbWorker.postMessage({ _tag: "sync", queries: getSubscribedQueries() });
      });

      const sync = (): void =>
        dbWorker.postMessage({ _tag: "sync", queries: [] });
      appState.onReconnect(sync);
      sync();

      return Evolu<T>().of({
        subscribeError: errorStore.subscribe,
        getError: errorStore.getState,

        subscribeOwner: ownerStore.subscribe,
        getOwner: ownerStore.getState,

        createQuery: makeCreateQuery<T>(),
        subscribeQuery: queryStore.subscribe,
        getQuery: queryStore.getState,
        loadQuery: queryStore.loadQuery,

        subscribeSyncState: syncStateStore.subscribe,
        getSyncState: syncStateStore.getState,

        mutate,
        ownerActions,
        ensureSchema,
      });
    }),
  );

export const makeEvoluForPlatform = <T extends Schema>(
  PlatformLayer: Layer.Layer<
    never,
    never,
    DbWorker | Bip39 | NanoId | FlushSync | AppState
  >,
  tables: Tables,
  config?: Partial<Config>,
): Evolu<T> =>
  Effect.provideLayer(
    Evolu<T>(),
    Layer.use(
      EvoluLive<T>(tables),
      Layer.mergeAll(PlatformLayer, ConfigLive(config), TimeLive),
    ),
  ).pipe(Effect.runSync);
