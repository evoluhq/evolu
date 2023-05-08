import { absurd, constVoid, flow, pipe } from "@effect/data/Function";
import * as Number from "@effect/data/Number";
import * as Option from "@effect/data/Option";
import * as Predicate from "@effect/data/Predicate";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import * as S from "@effect/schema/Schema";
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
import { schemaToTablesDefinitions } from "./Schema.js";
import { createStore } from "./Store.js";
import {
  Config,
  CreateDbWorker,
  DbWorker,
  DbWorkerOutput,
  Evolu,
  EvoluError,
  Mutate,
  NewMessage,
  OnCompleteId,
  Owner,
  OwnerActions,
  QueryCallback,
  QueryString,
  RestoreOwnerError,
  Row,
  Rows,
  Schema,
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

const createNoOpServerDbWorker: CreateDbWorker = () => ({
  post: constVoid,
});

// TODO: React Native, Electron.
const createDbWorker: CreateDbWorker = isBrowser
  ? browserFeatures.opfs
    ? createOpfsDbWorker
    : createLocalStorageDbWorker
  : createNoOpServerDbWorker;

type OnComplete = () => void;

export type RowsCache = ReadonlyMap<QueryString, Rows>;

const createOnQuery =
  (rowsCache: Store<RowsCache>, onCompletes: Map<OnCompleteId, OnComplete>) =>
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

    // TODO: pro vsechny queries ukoncit nahravani, jasny

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

export const createSubscribeRows = (
  rowsCache: Store<RowsCache>,
  subscribedQueries: Map<QueryString, number>
): Evolu["subscribeQuery"] => {
  // let snapshot: ReadonlyArray<QueryString> | null = null;

  return (queryString: QueryString | null) => (listen) => {
    if (queryString == null) return constVoid;

    // if (snapshot == null) {
    //   snapshot = Array.from(subscribedQueries.keys());
    //   queueMicrotask(() => {
    //     const subscribedQueriesSnapshot = snapshot;
    //     if (subscribedQueriesSnapshot == null) return;
    //     snapshot = null;

    //     const queries = pipe(
    //       Array.from(subscribedQueries.keys()),
    //       ReadonlyArray.difference(QueryStringEquivalence)(
    //         subscribedQueriesSnapshot
    //       )
    //     );

    //     queryIfAny(queries);
    //   });
    // }

    subscribedQueries.set(
      queryString,
      Number.increment(subscribedQueries.get(queryString) ?? 0)
    );

    const unsubscribe = rowsCache.subscribe(listen);

    // const rowsCacheState = rowsCache.getState();
    // const state = rowsCacheState.get(queryString);
    // if (!state || (state && state.isLoading === false)) {
    //   rowsCache.setState(
    //     new Map([
    //       ...rowsCacheState,
    //       [
    //         queryString,
    //         { rows: state?.rows || ReadonlyArray.empty(), isLoading: true },
    //       ],
    //     ])
    //   );
    // }

    return () => {
      const count = subscribedQueries.get(queryString);
      if (count != null && count > 1)
        subscribedQueries.set(queryString, Number.decrement(count));
      else subscribedQueries.delete(queryString);
      unsubscribe();
    };
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

  const onQuery = createOnQuery(rowsCache, onCompletes);

  const queryIfAny = (queries: ReadonlyArray<QueryString>): void => {
    if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
      dbWorker.post({ _tag: "query", queries });
  };

  const subscribeQuery = createSubscribeRows(rowsCache, subscribedQueries);

  const getQuery: Evolu["getQuery"] = (query) =>
    (query && rowsCache.getState().get(query)) || null;

  const loadQuery: Evolu["loadQuery"] = (query) => {
    throw "";
  };

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

  const compileQueryCallback = (
    _queryCallback: QueryCallback<To, Row>
  ): QueryString => {
    throw "";
  };

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
