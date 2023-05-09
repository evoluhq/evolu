import { absurd, constVoid, flow, pipe } from "@effect/data/Function";
import * as Number from "@effect/data/Number";
import * as Option from "@effect/data/Option";
import * as Predicate from "@effect/data/Predicate";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import * as S from "@effect/schema/Schema";
import * as Kysely from "kysely";
import { flushSync } from "react-dom";
import { browserFeatures, browserInit, reloadAllTabs } from "./Browser.js";
import { createConfig } from "./Config.js";
import { applyPatches } from "./Diff.js";
import { createNewMessages } from "./Messages.js";
import { parseMnemonic } from "./Mnemonic.js";
import { Id, cast, createId } from "./Model.js";
import { queryToString } from "./Query.js";
import { schemaToTablesDefinitions } from "./Schema.js";
import { createStore } from "./Store.js";
import {
  Config,
  CreateDbWorker,
  DbWorker,
  DbWorkerOutput,
  Evolu,
  EvoluError,
  KyselySelectFrom,
  Mutate,
  NewMessage,
  OnCompleteId,
  Owner,
  OwnerActions,
  Query,
  QueryCallback,
  QueryString,
  RestoreOwnerError,
  Row,
  Rows,
  Schema,
  SchemaForQuery,
  Store,
} from "./Types.js";

const createOpfsDbWorker: CreateDbWorker = (onMessage) => {
  const dbWorker = new Worker(new URL("./DbWorker.worker.js", import.meta.url));

  dbWorker.onmessage = (e: MessageEvent<DbWorkerOutput>): void => {
    onMessage(e.data);
  };

  return {
    post: (message): void => {
      dbWorker.postMessage(message);
    },
  };
};

const createLocalStorageDbWorker: CreateDbWorker = (onMessage) => {
  const worker = import("./DbWorker.window.js");

  let dbWorker: DbWorker | null = null;

  return {
    post: (message): void => {
      worker.then(({ createDbWorker }) => {
        if (dbWorker == null) dbWorker = createDbWorker(onMessage);
        dbWorker.post(message);
      });
    },
  };
};

// TODO: React Native, Electron.
const createDbWorker: CreateDbWorker = browserFeatures.opfs
  ? createOpfsDbWorker
  : createLocalStorageDbWorker;

const createKysely = <S extends Schema>(): KyselySelectFrom<
  SchemaForQuery<S>
> =>
  new Kysely.Kysely({
    dialect: {
      createAdapter(): Kysely.SqliteAdapter {
        return new Kysely.SqliteAdapter();
      },
      createDriver(): Kysely.Driver {
        return new Kysely.DummyDriver();
      },
      createIntrospector(db: Kysely.Kysely<S>): Kysely.DatabaseIntrospector {
        return new Kysely.SqliteIntrospector(db);
      },
      createQueryCompiler(): Kysely.QueryCompiler {
        return new Kysely.SqliteQueryCompiler();
      },
    },
  });

interface PromiseCache {
  readonly get: (queryString: QueryString) => Promise<Rows>;
  readonly has: Predicate.Predicate<QueryString>;
  readonly resolve: (queryString: QueryString, rows: Rows) => void;
  readonly release: (queryString: QueryString) => boolean;
}

const createPromiseCache = (): PromiseCache => {
  const cache = new Map<
    QueryString,
    {
      readonly promise: Promise<Rows>;
      readonly resolve: (rows: Rows) => void;
    }
  >();

  const promiseCache: PromiseCache = {
    get: (queryString) => {
      const item = cache.get(queryString);
      if (item) return item.promise;
      let resolve: null | ((rows: Rows) => void) = null;
      const promise = new Promise<Rows>((_resolve) => {
        resolve = _resolve;
      });
      // `if (resolve)` to make TS happy. This is OK.
      if (resolve) cache.set(queryString, { promise, resolve });
      return promise;
    },
    has: (queryToString) => cache.has(queryToString),
    resolve: (queryString, rows) => {
      const item = cache.get(queryString);
      if (!item) return;
      // It's similar to what React will do.
      Object.assign(item.promise, { rows });
      item.resolve(rows);
    },
    // TODO: releasePromise, releaseQuery?
    release: (queryString) => cache.delete(queryString),
  };

  return promiseCache;
};

type OnComplete = () => void;

export type RowsCache = ReadonlyMap<QueryString, Rows>;

const createOnQuery =
  (
    rowsCache: Store<RowsCache>,
    onCompletes: Map<OnCompleteId, OnComplete>,
    promiseCache: PromiseCache
  ) =>
  ({
    queriesPatches,
    onCompleteIds,
  }: Extract<DbWorkerOutput, { _tag: "onQuery" }>): void => {
    const state = rowsCache.getState();
    const nextState = pipe(
      queriesPatches,
      ReadonlyArray.filter((a) => a.patches.length > 0),
      ReadonlyArray.map(
        ({ query, patches }) =>
          [
            query,
            applyPatches(patches)(state.get(query) || ReadonlyArray.empty()),
          ] as const
      ),
      (a): RowsCache => new Map([...state, ...a])
    );

    queriesPatches.forEach(({ query }) => {
      const rows = nextState.get(query) || ReadonlyArray.empty();
      promiseCache.resolve(query, rows);
    });

    if (onCompleteIds.length === 0) {
      rowsCache.setState(nextState);
      return;
    }

    // Ensure onComplete can use DOM (for a focus or anything else).
    flushSync(() => rowsCache.setState(nextState));

    pipe(
      onCompleteIds,
      ReadonlyArray.filterMap((id) => {
        const onComplete = onCompletes.get(id);
        onCompletes.delete(id);
        return Option.fromNullable(onComplete);
      })
    ).forEach((onComplete) => {
      onComplete();
    });
  };

export const createSubscribeQuery = (
  rowsCache: Store<RowsCache>,
  subscribedQueries: Map<QueryString, number>
): Evolu["subscribeQuery"] => {
  return (queryString: QueryString | null) => (listen) => {
    if (queryString == null) return constVoid;

    subscribedQueries.set(
      queryString,
      Number.increment(subscribedQueries.get(queryString) ?? 0)
    );

    const unsubscribe = rowsCache.subscribe(listen);

    return () => {
      const count = subscribedQueries.get(queryString);
      if (count != null && count > 1)
        subscribedQueries.set(queryString, Number.decrement(count));
      else subscribedQueries.delete(queryString);
      unsubscribe();
    };
  };
};

const createLoadQuery = (
  queryIfAny: (queries: ReadonlyArray<QueryString>) => void,
  promiseCache: PromiseCache
): Evolu["loadQuery"] => {
  const queue = new Set<QueryString>();

  return (queryString) => {
    if (!promiseCache.has(queryString)) queue.add(queryString);

    queue.add(queryString);
    if (queue.size === 1) {
      queueMicrotask(() => {
        const queries = [...queue];
        queue.clear();
        queryIfAny(queries);
      });
    }

    return promiseCache.get(queryString);
  };
};

type CreateId = typeof createId;

const createMutate = <S extends Schema>({
  createId,
  getOwner,
  setOnComplete,
  dbWorker,
  getSubscribedQueries,
}: {
  createId: CreateId;
  getOwner: Promise<Owner>;
  setOnComplete: (id: OnCompleteId, onComplete: OnComplete) => void;
  dbWorker: DbWorker;
  getSubscribedQueries: () => ReadonlyArray<QueryString>;
}): Mutate<S> => {
  const queue: Array<
    [ReadonlyArray.NonEmptyReadonlyArray<NewMessage>, OnCompleteId | null]
  > = [];

  return (table, { id, ...values }, onComplete) => {
    const isInsert = id == null;
    if (isInsert) id = createId() as never;

    const now = cast(new Date());

    let onCompleteId: OnCompleteId | null = null;
    if (onComplete) {
      onCompleteId = createId<"OnComplete">();
      setOnComplete(onCompleteId, onComplete);
    }

    getOwner.then((owner) => {
      queue.push([
        createNewMessages(
          table.toString(),
          id as Id,
          values,
          owner.id,
          now,
          isInsert
        ),
        onCompleteId,
      ]);

      if (queue.length === 1)
        queueMicrotask(() => {
          if (!ReadonlyArray.isNonEmptyReadonlyArray(queue)) return;

          const [newMessages, onCompleteIds] = pipe(
            queue,
            ReadonlyArray.unzipNonEmpty,
            ([messages, onCompleteIds]) => [
              ReadonlyArray.flattenNonEmpty(messages),
              ReadonlyArray.filter(onCompleteIds, Predicate.isNotNull),
            ]
          );

          queue.length = 0;

          dbWorker.post({
            _tag: "sendMessages",
            newMessages,
            onCompleteIds,
            queries: getSubscribedQueries(),
          });
        });
    });

    return { id } as never;
  };
};

export const createEvolu = <From, To extends Schema>(
  schema: S.Schema<From, To>,
  optionalConfig?: Partial<Config>
): Evolu<To> => {
  const config = createConfig(optionalConfig);

  const errorStore = createStore<EvoluError | null>(null);
  const ownerStore = createStore<Owner | null>(null);
  const rowsCache = createStore<RowsCache>(new Map());

  const subscribedQueries = new Map<QueryString, number>();
  const onCompletes = new Map<OnCompleteId, OnComplete>();
  const promiseCache = createPromiseCache();

  const dbWorker = createDbWorker((message) => {
    switch (message._tag) {
      case "onError":
        errorStore.setState(message.error);
        break;
      case "onOwner":
        ownerStore.setState(message.owner);
        break;
      case "onQuery":
        onQuery(message);
        break;
      case "onReceive":
        queryIfAny(Array.from(subscribedQueries.keys()));
        break;
      case "onResetOrRestore":
        reloadAllTabs(config.reloadUrl);
        break;
      default:
        absurd(message);
    }
  });

  const onQuery = createOnQuery(rowsCache, onCompletes, promiseCache);

  const queryIfAny = (queries: ReadonlyArray<QueryString>): void => {
    if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
      dbWorker.post({ _tag: "query", queries });
  };

  const subscribeQuery = createSubscribeQuery(rowsCache, subscribedQueries);

  const getQuery: Evolu["getQuery"] = (query) =>
    (query && rowsCache.getState().get(query)) || null;

  const loadQuery = createLoadQuery(queryIfAny, promiseCache);

  const getOwner = new Promise<Owner>((resolve) => {
    const unsubscribe = ownerStore.subscribe(() => {
      const owner = ownerStore.getState();
      if (!owner) return;
      unsubscribe();
      resolve(owner);
    });
  });

  const mutate: Evolu["mutate"] = createMutate({
    createId: createId,
    getOwner,
    setOnComplete: (id, callback) => {
      onCompletes.set(id, callback);
    },
    dbWorker,
    getSubscribedQueries: () => Array.from(subscribedQueries.keys()),
  });

  const ownerActions: OwnerActions = {
    reset: () => dbWorker.post({ _tag: "reset" }),
    restore: flow(
      parseMnemonic,
      Effect.mapBoth(
        (): RestoreOwnerError => ({ _tag: "RestoreOwnerError" }),
        (mnemonic) => dbWorker.post({ _tag: "reset", mnemonic })
      ),
      Effect.runPromiseEither
    ),
  };

  const kysely = createKysely<To>();

  const compileQueryCallback = (
    queryCallback: QueryCallback<To, Row>
  ): QueryString =>
    pipe(queryCallback(kysely).compile() as Query, queryToString);

  dbWorker.post({
    _tag: "init",
    config,
    tableDefinitions: schemaToTablesDefinitions(schema),
  });

  browserInit(subscribedQueries, dbWorker);

  return {
    subscribeError: errorStore.subscribe,
    getError: errorStore.getState,

    subscribeOwner: ownerStore.subscribe,
    getOwner: ownerStore.getState,

    subscribeQuery,
    getQuery,
    loadQuery,

    mutate,
    ownerActions,

    compileQueryCallback,
  };
};
