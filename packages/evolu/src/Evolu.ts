import * as S from "@effect/schema/Schema";
import { Context, Effect, Layer, ReadonlyArray, absurd } from "effect";
import { Config } from "./Config.js";
import {
  CreateQuery,
  Owner,
  Schema,
  createQuery,
  schemaToTables,
} from "./Db.js";
import { DbWorker } from "./DbWorker.js";
import { EvoluError } from "./Errors.js";
import { Mutate } from "./Mutate.js";
import { OwnerActions } from "./OwnerActions.js";
import { AppState } from "./Platform.js";
import { QueryStore } from "./QueryStore.js";
import { Query } from "./Sqlite.js";
import { Store, StoreListener, StoreUnsubscribe, makeStore } from "./Store.js";
import { SubscribedQueries } from "./SubscribedQueries.js";
import { SyncState } from "./SyncWorker.js";

export interface Evolu<S extends Schema = Schema> {
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
}

export const Evolu = Context.Tag<Evolu>("evolu/Evolu");

type ErrorStore = Store<EvoluError | null>;
type OwnerStore = Store<Owner | null>;

export const EvoluLive = <From, To extends Schema>(
  schema: S.Schema<From, To>,
): Layer.Layer<
  | AppState
  | Config
  | DbWorker
  | Mutate
  | OwnerActions
  | QueryStore
  | SubscribedQueries,
  never,
  Evolu
> =>
  Layer.effect(
    Evolu,
    Effect.gen(function* (_) {
      const appState = yield* _(AppState);
      const config = yield* _(Config);
      const dbWorker = yield* _(DbWorker);
      const mutate = yield* _(Mutate);
      const ownerActions = yield* _(OwnerActions);
      const queryStore = yield* _(QueryStore);
      const subscribedQueries = yield* _(SubscribedQueries);

      const errorStore = makeStore<EvoluError | null>(null);
      const ownerStore = makeStore<Owner | null>(null);
      const syncStateStore = makeStore<SyncState>({
        _tag: "SyncStateInitial",
      });

      const getSubscribedQueries = (): ReadonlyArray<Query> =>
        Array.from(subscribedQueries.keys());

      dbWorker.onMessage = (output): void => {
        switch (output._tag) {
          case "onError":
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

      dbWorker.postMessage({
        _tag: "init",
        config,
        tables: schemaToTables(schema),
      });

      appState.onFocus(() => {
        // `queries` to refresh subscribed queries when a tab is changed.
        dbWorker.postMessage({ _tag: "sync", queries: getSubscribedQueries() });
      });

      appState.onReconnect(() => {
        dbWorker.postMessage({ _tag: "sync", queries: [] });
      });

      return Evolu.of({
        subscribeError: errorStore.subscribe,
        getError: errorStore.getState,

        subscribeOwner: ownerStore.subscribe,
        getOwner: ownerStore.getState,

        createQuery,
        subscribeQuery: queryStore.subscribe,
        getQuery: queryStore.getState,
        loadQuery: queryStore.loadQuery,

        subscribeSyncState: syncStateStore.subscribe,
        getSyncState: syncStateStore.getState,

        mutate,
        ownerActions,
      });
    }),
  );
