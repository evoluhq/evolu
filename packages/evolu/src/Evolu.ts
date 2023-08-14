import * as S from "@effect/schema/Schema";
import { Context, Effect, Either, Layer, absurd } from "effect";
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
import { AppState } from "./Platform.js";
import { QueryStore } from "./QueryStore.js";
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
    mnemonic: string
  ) => Promise<Either.Either<RestoreOwnerError, void>>;
}

export interface RestoreOwnerError {
  readonly _tag: "RestoreOwnerError";
}

export const EvoluLive = <From, To extends Schema>(
  schema: S.Schema<From, To>
): Layer.Layer<
  Config | DbWorker | QueryStore | Mutate | AppState | SubscribedQueries,
  never,
  Evolu
> =>
  Layer.effect(
    Evolu,
    Effect.gen(function* (_) {
      const dbWorker = yield* _(DbWorker);
      const errorStore = makeStore<EvoluError | null>(null);
      const ownerStore = makeStore<Owner | null>(null);
      const queryStore = yield* _(QueryStore);
      const appState = yield* _(AppState);
      const syncStateStore = makeStore<SyncState>({
        _tag: "SyncStateInitial",
      });

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
          case "onReceive":
            // queryIfAny(getSubscribedQueries());
            break;
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

      const config = yield* _(Config);
      dbWorker.postMessage({
        _tag: "init",
        config,
        tables: schemaToTables(schema),
      });

      const subscribedQueries = yield* _(SubscribedQueries);
      appState.onFocus(() => {
        // `queries` to refresh subscribed queries when a tab is changed.
        const queries = Array.from(subscribedQueries.keys());
        dbWorker.postMessage({ _tag: "sync", queries });
      });

      appState.onReconnect(() => {
        dbWorker.postMessage({ _tag: "sync", queries: [] });
      });

      const mutate = yield* _(Mutate);

      return Evolu.of({
        subscribeError: errorStore.subscribe,
        getError: errorStore.getState,

        subscribeOwner: ownerStore.subscribe,
        getOwner: ownerStore.getState,

        createQuery,
        subscribeQuery: queryStore.subscribe,
        getQuery: queryStore.getState,
        loadQuery: queryStore.loadQuery,

        subscribeSyncState: () => {
          throw "subscribeSyncState";
        },
        getSyncState: () => {
          throw "getSyncState";
        },

        mutate,

        ownerActions: {
          reset: () => {
            throw "reset";
          },
          restore: () => {
            throw "restore";
          },
        },
      });

      throw "";
    })
  );
