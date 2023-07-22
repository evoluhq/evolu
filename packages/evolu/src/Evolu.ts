import * as S from "@effect/schema/Schema";
import {
  Context,
  Effect,
  Either,
  Function,
  Layer,
  ReadonlyArray,
} from "effect";
import * as Kysely from "kysely";
import { Config } from "./Config.js";
import { Query, QueryObject, Row, queryObjectToQuery } from "./Db.js";
import { DbWorker } from "./DbWorker.js";
import { EvoluError } from "./EvoluError.js";
import { Owner } from "./Owner.js";
import {
  Mutate,
  QueryCallback,
  Schema,
  SchemaForQuery,
  schemaToTables,
} from "./Schema.js";
import { StoreListener, StoreUnsubscribe, makeStore } from "./Store.js";
import { SyncState } from "./SyncState.js";
import { logDebug, runSync } from "./utils.js";

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

export const Evolu = Context.Tag<Evolu>();

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

const makeEvoluLive = <From, To extends Schema>(
  schema: S.Schema<From, To>
): Effect.Effect<DbWorker | Config, never, Evolu<Schema>> =>
  Effect.all([
    Config,
    DbWorker.pipe(Effect.map(dbWorkerToDbWorkerWithLogDebug)),
  ]).pipe(
    Effect.map(([config, dbWorker]) => {
      const errorStore = makeStore<EvoluError | null>(null);
      const ownerStore = makeStore<Owner | null>(null);

      const createQuery = makeCreateQuery();

      const loadQuery = makeLoadQuery(dbWorker.postMessage);

      dbWorker.onMessage((output) => {
        // eslint-disable-next-line no-console
        console.log(output);
      });

      dbWorker.postMessage({
        _tag: "init",
        config,
        tableDefinitions: schemaToTables(schema),
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
  );

export const EvoluLive = <From, To extends Schema>(
  schema: S.Schema<From, To>
): Layer.Layer<Config | DbWorker, never, Evolu> =>
  Layer.effect(Evolu, makeEvoluLive<From, To>(schema));
