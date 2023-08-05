import * as S from "@effect/schema/Schema";
import { Context, Effect, Either, Layer, absurd } from "effect";
import * as Kysely from "kysely";
import { Config } from "./Config.js";
import {
  CommonColumns,
  CreateQuery,
  OwnerStore,
  Schema,
  createQuery,
  schemaToTables,
} from "./Db.js";
import { DbWorker } from "./DbWorker.js";
import { ErrorStore } from "./Errors.js";
import { SqliteBoolean, SqliteDate } from "./Model.js";
import { QueryStore } from "./QueryStore.js";
import { StoreListener, StoreUnsubscribe } from "./Store.js";
import { SyncState } from "./SyncState.js";
import { NullableExceptOfId } from "./Utils.js";
import { logDebug } from "./log.js";
import { runSync } from "./run.js";

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

export type Mutate<S extends Schema> = <
  U extends SchemaForMutate<S>,
  T extends keyof U,
>(
  table: T,
  values: Kysely.Simplify<Partial<AllowAutoCasting<U[T]>>>,
  onComplete?: () => void
) => {
  readonly id: U[T]["id"];
};

type SchemaForMutate<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & Pick<CommonColumns, "isDeleted">
  >;
};

export type AllowAutoCasting<T> = {
  readonly [K in keyof T]: T[K] extends SqliteBoolean
    ? boolean | SqliteBoolean
    : T[K] extends null | SqliteBoolean
    ? null | boolean | SqliteBoolean
    : T[K] extends SqliteDate
    ? Date | SqliteDate
    : T[K] extends null | SqliteDate
    ? null | Date | SqliteDate
    : T[K];
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
    mnemonic: string
  ) => Promise<Either.Either<RestoreOwnerError, void>>;
}

export interface RestoreOwnerError {
  readonly _tag: "RestoreOwnerError";
}

const dbWorkerToDbWorkerWithLogDebug = (dbWorker: DbWorker): DbWorker => {
  const postMessage: DbWorker["postMessage"] = (input) => {
    runSync(logDebug("Evolu DbWorker.postMessage", input));
    dbWorker.postMessage(input);
  };
  const onMessage: DbWorker["onMessage"] = (callback) => {
    dbWorker.onMessage((output) => {
      runSync(logDebug("Evolu DbWorker.onMessage", output));
      callback(output);
    });
  };
  return { postMessage, onMessage };
};

export const EvoluLive = <From, To extends Schema>(
  schema: S.Schema<From, To>
): Layer.Layer<
  Config | DbWorker | ErrorStore | OwnerStore | QueryStore,
  never,
  Evolu
> =>
  Layer.effect(
    Evolu,
    Effect.all([
      Config,
      DbWorker.pipe(Effect.map(dbWorkerToDbWorkerWithLogDebug)),
      ErrorStore,
      OwnerStore,
      QueryStore,
    ]).pipe(
      Effect.map(([config, dbWorker, errorStore, ownerStore, queryStore]) => {
        dbWorker.onMessage((output) => {
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
              // reloadAllTabs(config.reloadUrl);
              break;
            case "onSyncState":
              // syncState.setState(message.state);
              break;
            default:
              absurd(output);
          }
        });

        dbWorker.postMessage({
          _tag: "init",
          config,
          tables: schemaToTables(schema),
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

          subscribeSyncState: () => {
            throw "subscribeSyncState";
          },
          getSyncState: () => {
            throw "getSyncState";
          },

          mutate: () => {
            throw "mutate";
          },

          ownerActions: {
            reset: () => {
              throw "reset";
            },
            restore: () => {
              throw "restore";
            },
          },
        });
      })
    )
  );
