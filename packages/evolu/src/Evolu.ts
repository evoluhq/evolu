import { absurd, constVoid, flow, pipe } from "@effect/data/Function";
import * as Number from "@effect/data/Number";
import * as Option from "@effect/data/Option";
import * as Predicate from "@effect/data/Predicate";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import * as S from "@effect/schema/Schema";
import * as Kysely from "kysely";
import { flushSync } from "react-dom";
import {
  browserFeatures,
  browserInit,
  isBrowser,
  reloadAllTabs,
} from "./Browser.js";
import { createConfig } from "./Config.js";
import { applyPatches } from "./Diff.js";
import { createNewMessages } from "./Messages.js";
import { parseMnemonic } from "./Mnemonic.js";
import { Id, cast, createId } from "./Model.js";
import { queryObjectToQuery } from "./Query.js";
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
  QueryObject,
  RestoreOwnerError,
  Row,
  Rows,
  Schema,
  SchemaForQuery,
  Store,
} from "./Types.js";

const createNoOpServerDbWorker: CreateDbWorker = () => ({
  post: constVoid,
});

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
const createDbWorker: CreateDbWorker = isBrowser
  ? browserFeatures.opfs
    ? createOpfsDbWorker
    : createLocalStorageDbWorker
  : createNoOpServerDbWorker;

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

export type RowsCache = ReadonlyMap<Query, Rows>;

type OnComplete = () => void;

const createOnQuery =
  (
    rowsCache: Store<RowsCache>,
    onCompletes: Map<OnCompleteId, OnComplete>,
    resolvePromise: (query: Query, rows: Rows) => void
  ) =>
  ({
    queriesPatches,
    onCompleteIds,
  }: Extract<DbWorkerOutput, { _tag: "onQuery" }>): void => {
    const state = rowsCache.getState();
    const nextState = pipe(
      queriesPatches,
      ReadonlyArray.map(
        ({ query, patches }) =>
          [
            query,
            applyPatches(patches)(state.get(query) || ReadonlyArray.empty()),
          ] as const
      ),
      (a): RowsCache => new Map([...state, ...a])
    );

    // Resolve all Promises belonging to queries.
    queriesPatches.forEach(({ query }) => {
      const rows = nextState.get(query) || ReadonlyArray.empty();
      resolvePromise(query, rows);
    });

    // No mutation is using onComplete, so we don't need flushSync.
    if (onCompleteIds.length === 0) {
      rowsCache.setState(nextState);
      return;
    }

    // Ensure DOM is updated before onComplete (for a focus or anything else).
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
  subscribedQueries: Map<Query, number>
): Evolu["subscribeQuery"] => {
  return (query: Query | null) => (listen) => {
    if (query == null) return constVoid;

    subscribedQueries.set(
      query,
      Number.increment(subscribedQueries.get(query) ?? 0)
    );

    const unsubscribe = rowsCache.subscribe(listen);

    return () => {
      // `as number`, because React mount/unmount are symmetric.
      const count = subscribedQueries.get(query) as number;
      if (count > 1) subscribedQueries.set(query, Number.decrement(count));
      else subscribedQueries.delete(query);
      unsubscribe();
    };
  };
};

const createLoadQuery = (
  queryIfAny: (queries: ReadonlyArray<Query>) => void,
  getPromise: (query: Query) => { promise: Promise<Rows>; isNew: boolean }
): Evolu["loadQuery"] => {
  const queue = new Set<Query>();

  return (query) => {
    const { promise, isNew } = getPromise(query);
    if (isNew) queue.add(query);
    if (queue.size === 1) {
      queueMicrotask(() => {
        const queries = [...queue];
        queue.clear();
        queryIfAny(queries);
      });
    }
    return promise;
  };
};

const createMutate = <S extends Schema>({
  getOwner,
  onCompletes,
  dbWorker,
  getSubscribedQueries,
  releasePromises,
}: {
  getOwner: Promise<Owner>;
  onCompletes: Map<OnCompleteId, OnComplete>;
  dbWorker: DbWorker;
  getSubscribedQueries: () => ReadonlyArray<Query>;
  releasePromises: (queries: ReadonlyArray<Query>) => void;
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
      onCompletes.set(onCompleteId, onComplete);
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

          const queries = getSubscribedQueries();
          releasePromises(queries);

          dbWorker.post({
            _tag: "sendMessages",
            newMessages,
            onCompleteIds,
            queries,
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

  const onCompletes = new Map<OnCompleteId, OnComplete>();

  const subscribedQueries = new Map<Query, number>();

  const getSubscribedQueries = (): ReadonlyArray<Query> =>
    Array.from(subscribedQueries.keys());

  const promises = new Map<
    Query,
    {
      readonly promise: Promise<Rows>;
      readonly resolve: (rows: Rows) => void;
    }
  >();

  const resolvePromise = (query: Query, rows: Rows): void => {
    const item = promises.get(query);
    if (!item) return;
    // It's similar to what React will do.
    Object.assign(item.promise, { rows });
    item.resolve(rows);
  };

  const releasePromises = (ignoreQueries: ReadonlyArray<Query>): void => {
    [...promises.keys()].forEach((query) => {
      if (!ignoreQueries.includes(query)) promises.delete(query);
    });
  };

  const getPromise = (
    query: Query
  ): { readonly promise: Promise<Rows>; readonly isNew: boolean } => {
    const item = promises.get(query);
    if (item) return { promise: item.promise, isNew: false };
    let resolve: (rows: Rows) => void = constVoid;
    const promise = new Promise<Rows>((_resolve) => {
      resolve = _resolve;
    });
    promises.set(query, { promise, resolve });
    return { promise, isNew: true };
  };

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
        queryIfAny(getSubscribedQueries());
        break;
      case "onResetOrRestore":
        reloadAllTabs(config.reloadUrl);
        break;
      default:
        absurd(message);
    }
  });

  const onQuery = createOnQuery(rowsCache, onCompletes, resolvePromise);

  const queryIfAny = (queries: ReadonlyArray<Query>): void => {
    if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
      dbWorker.post({ _tag: "query", queries });
  };

  const subscribeQuery = createSubscribeQuery(rowsCache, subscribedQueries);

  const getQuery: Evolu["getQuery"] = (query) =>
    (query && rowsCache.getState().get(query)) || null;

  const loadQuery = createLoadQuery(queryIfAny, getPromise);

  const getOwner = new Promise<Owner>((resolve) => {
    const unsubscribe = ownerStore.subscribe(() => {
      const owner = ownerStore.getState();
      if (!owner) return;
      unsubscribe();
      resolve(owner);
    });
  });

  const mutate: Evolu["mutate"] = createMutate({
    getOwner,
    onCompletes,
    dbWorker,
    getSubscribedQueries,
    releasePromises,
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

  // TODO: Rename
  const createQuery = (queryCallback: QueryCallback<To, Row>): Query =>
    pipe(queryCallback(kysely).compile() as QueryObject, queryObjectToQuery);

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

    createQuery,
    subscribeQuery,
    getQuery,
    loadQuery,

    mutate,
    ownerActions,
  };
};
