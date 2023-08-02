import * as S from "@effect/schema/Schema";
import {
  Context,
  Effect,
  Either,
  Function,
  Layer,
  ReadonlyArray,
  absurd,
} from "effect";
import * as Kysely from "kysely";
import { Config } from "./Config.js";
import {
  CommonColumns,
  Owner,
  Query,
  QueryObject,
  Row,
  Schema,
  queryObjectToQuery,
  schemaToTables,
} from "./Db.js";
import { DbWorker } from "./DbWorker.js";
import { EvoluError } from "./Errors.js";
import { SqliteBoolean, SqliteDate } from "./Model.js";
import { StoreListener, StoreUnsubscribe, makeStore } from "./Store.js";
import { SyncState } from "./SyncState.js";
import { logDebug } from "./log.js";
import { runSync } from "./run.js";

export interface Evolu<S extends Schema = Schema> {
  readonly subscribeError: (listener: StoreListener) => StoreUnsubscribe;
  readonly getError: () => EvoluError | null;

  readonly subscribeOwner: (listener: StoreListener) => StoreUnsubscribe;
  readonly getOwner: () => Owner | null;

  readonly createQuery: (queryCallback: QueryCallback<S, Row>) => Query;
  readonly subscribeQuery: (
    query: Query | null
  ) => (listener: StoreListener) => StoreUnsubscribe;
  readonly getQuery: (query: Query | null) => ReadonlyArray<Row> | null;
  readonly loadQuery: (query: Query) => Promise<ReadonlyArray<Row>>;

  readonly subscribeSyncState: (listener: StoreListener) => StoreUnsubscribe;
  readonly getSyncState: () => SyncState;

  readonly mutate: Mutate<S>;
  readonly ownerActions: OwnerActions;
}

export const Evolu = Context.Tag<Evolu>("evolu/Evolu");

export type QueryCallback<S extends Schema, QueryRow> = (
  db: KyselyWithoutMutation<SchemaForQuery<S>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Kysely.SelectQueryBuilder<any, any, QueryRow>;

export type KyselyWithoutMutation<DB> = Pick<
  Kysely.Kysely<DB>,
  "selectFrom" | "fn"
>;

export type SchemaForQuery<S extends Schema> = {
  readonly [Table in keyof S]: NullableExceptOfId<
    {
      readonly [Column in keyof S[Table]]: S[Table][Column];
    } & CommonColumns
  >;
};

type NullableExceptOfId<T> = {
  readonly [K in keyof T]: K extends "id" ? T[K] : T[K] | null;
};

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

const makeCreateQuery = (): Evolu["createQuery"] => {
  const kysely: Kysely.Kysely<SchemaForQuery<Schema>> = new Kysely.Kysely({
    dialect: {
      createAdapter: () => new Kysely.SqliteAdapter(),
      createDriver: () => new Kysely.DummyDriver(),
      createIntrospector(): Kysely.DatabaseIntrospector {
        throw "Not implemeneted";
      },
      createQueryCompiler: () => new Kysely.SqliteQueryCompiler(),
    },
  });
  return (queryCallback) =>
    queryObjectToQuery(queryCallback(kysely).compile() as QueryObject);
};

const makeLoadQuery = (
  dbWorkerPost: DbWorker["postMessage"]
): Evolu["loadQuery"] => {
  const promises = new Map<
    Query,
    {
      readonly promise: Promise<ReadonlyArray<Row>>;
      readonly resolve: (_rows: ReadonlyArray<Row>) => void;
    }
  >();

  const getPromise = (
    query: Query
  ): {
    readonly promise: Promise<ReadonlyArray<Row>>;
    readonly isNew: boolean;
  } => {
    const item = promises.get(query);
    if (item) return { promise: item.promise, isNew: false };
    let resolve: (rows: ReadonlyArray<Row>) => void = Function.constVoid;
    const promise = new Promise<ReadonlyArray<Row>>((_resolve) => {
      resolve = _resolve;
    });
    promises.set(query, { promise, resolve });
    return { promise, isNew: true };
  };

  const queue = new Set<Query>();

  return (query) => {
    const { promise, isNew } = getPromise(query);
    if (isNew) queue.add(query);
    if (queue.size === 1) {
      queueMicrotask(() => {
        const queries = [...queue];
        queue.clear();
        if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
          dbWorkerPost({ _tag: "query", queries });
      });
    }
    return promise;
  };
};

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
): Layer.Layer<DbWorker | Config, never, Evolu> =>
  Layer.effect(
    Evolu,
    Effect.all([
      Config,
      DbWorker.pipe(Effect.map(dbWorkerToDbWorkerWithLogDebug)),
    ]).pipe(
      Effect.map(([config, dbWorker]) => {
        const errorStore = makeStore<EvoluError | null>(null);
        const ownerStore = makeStore<Owner | null>(null);

        const createQuery = makeCreateQuery();
        const loadQuery = makeLoadQuery(dbWorker.postMessage);
        // const onQuery = makeOnQuery

        dbWorker.onMessage((output) => {
          switch (output._tag) {
            case "onError":
              errorStore.setState(output.error);
              break;
            case "onOwner":
              ownerStore.setState(output.owner);
              break;
            case "onQuery":
              // onQuery(message);
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
          loadQuery,
          subscribeQuery: () => {
            throw "subscribeQuery";
          },
          getQuery: () => {
            throw "getQuery";
          },

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
