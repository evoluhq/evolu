import { absurd, constVoid, flow, pipe } from "@effect/data/Function";
import * as Number from "@effect/data/Number";
import * as Option from "@effect/data/Option";
import * as Predicate from "@effect/data/Predicate";
import * as ReadonlyArray from "@effect/data/ReadonlyArray";
import * as Effect from "@effect/io/Effect";
import * as S from "@effect/schema/Schema";
import { flushSync } from "react-dom";
import * as Browser from "./Browser.js";
import * as Config from "./Config.js";
import * as Db from "./Db.js";
import * as DbWorker from "./DbWorker.js";
import * as DbWorkerFactory from "./DbWorkerFactory.js";
import * as Diff from "./Diff.js";
import * as Error from "./Error.js";
import * as Message from "./Message.js";
import * as Mnemonic from "./Mnemonic.js";
import * as Model from "./Model.js";
import * as Owner from "./Owner.js";
import * as Schema from "./Schema.js";
import * as Store from "./Store.js";

interface Evolu<S extends Schema.Schema = Schema.Schema> {
  readonly subscribeError: (listener: Store.Listener) => Store.Unsubscribe;
  readonly getError: () => Error.EvoluError | null;

  readonly subscribeOwner: (listener: Store.Listener) => Store.Unsubscribe;
  readonly getOwner: () => Owner.Owner | null;

  readonly subscribeRowsWithLoadingState: (
    queryString: Db.QueryString | null
  ) => (listener: Store.Listener) => Store.Unsubscribe;
  readonly getRowsWithLoadingState: (
    queryString: Db.QueryString | null
  ) => () => Db.RowsWithLoadingState | null;

  readonly mutate: Schema.Mutate<S>;

  readonly ownerActions: Owner.Actions;
}

const createOnQuery =
  (
    rowsCache: Store.Store<Db.RowsCache>,
    onCompletes: Map<DbWorker.OnCompleteId, DbWorker.OnComplete>
  ) =>
  ({
    queriesPatches,
    onCompleteIds,
  }: Extract<DbWorker.Output, { _tag: "onQuery" }>): void => {
    pipe(
      queriesPatches,
      ReadonlyArray.reduce(
        rowsCache.getState(),
        (state, { query, patches }) => {
          const current = state.get(query);
          const next: Db.RowsWithLoadingState = {
            isLoading: false,
            rows: Diff.applyPatches(patches)(
              current?.rows || ReadonlyArray.empty()
            ),
          };
          if (
            current &&
            current.isLoading === next.isLoading &&
            current.rows === next.rows
          )
            return state;
          return new Map([...state, [query, next]]);
        }
      ),
      (state) => {
        if (onCompleteIds.length === 0) {
          rowsCache.setState(state);
          return;
        }

        // Ensure onComplete can use DOM (for a focus or anything else).
        flushSync(() => rowsCache.setState(state));

        pipe(
          onCompleteIds,
          ReadonlyArray.filterMap((id) => {
            const onComplete = onCompletes.get(id);
            onCompletes.delete(id);
            return Option.fromNullable(onComplete);
          })
        ).forEach((onComplete) => onComplete());
      }
    );
  };

const createSubscribeRowsWithLoadingState = (
  rowsCache: Store.Store<Db.RowsCache>,
  subscribedQueries: Map<Db.QueryString, number>,
  queryIfAny: (queries: ReadonlyArray<Db.QueryString>) => void
): Evolu["subscribeRowsWithLoadingState"] => {
  let snapshot: ReadonlyArray<Db.QueryString> | null = null;

  return (queryString: Db.QueryString | null) => (listen) => {
    if (queryString == null) return constVoid;

    if (snapshot == null) {
      snapshot = Array.from(subscribedQueries.keys());
      queueMicrotask(() => {
        const subscribedQueriesSnapshot = snapshot;
        if (subscribedQueriesSnapshot == null) return;
        snapshot = null;

        const queries = pipe(
          Array.from(subscribedQueries.keys()),
          ReadonlyArray.difference(Db.QueryStringEquivalence)(
            subscribedQueriesSnapshot
          )
        );

        pipe(
          queries,
          ReadonlyArray.reduce(rowsCache.getState(), (state, query) => {
            const current = state.get(query);
            if (!current || current.isLoading) return state;
            return new Map([
              ...state,
              [
                query,
                {
                  rows: (current && current.rows) || ReadonlyArray.empty(),
                  isLoading: true,
                },
              ],
            ]);
          }),
          rowsCache.setState
        );

        queryIfAny(queries);
      });
    }

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

const createMutate = <S extends Schema.Schema>({
  createId,
  getOwner,
  setOnComplete,
  dbWorker,
  getSubscribedQueries,
}: {
  createId: typeof Model.createId;
  getOwner: Promise<Owner.Owner>;
  setOnComplete: (
    id: DbWorker.OnCompleteId,
    onComplete: DbWorker.OnComplete
  ) => void;
  dbWorker: DbWorker.DbWorker;
  getSubscribedQueries: () => ReadonlyArray<Db.QueryString>;
}): Schema.Mutate<S> => {
  const queue: Array<
    [
      ReadonlyArray.NonEmptyReadonlyArray<Message.NewMessage>,
      DbWorker.OnCompleteId | null
    ]
  > = [];

  return (table, { id, ...values }, onComplete) => {
    const isInsert = id == null;
    if (isInsert) id = createId() as never;

    const now = Model.cast(new Date());

    let onCompleteId: DbWorker.OnCompleteId | null = null;
    if (onComplete) {
      onCompleteId = createId<"OnComplete">();
      setOnComplete(onCompleteId, onComplete);
    }

    getOwner.then((owner) => {
      const messages = Message.createNewMessages(
        table as string,
        id as Model.Id,
        values as never,
        owner.id,
        now,
        isInsert
      );

      queue.push([messages, onCompleteId]);

      if (queue.length === 1)
        queueMicrotask(() => {
          if (!ReadonlyArray.isNonEmptyReadonlyArray(queue)) return;

          const [messages, onCompleteIds] = pipe(
            queue,
            ReadonlyArray.unzipNonEmpty,
            ([messages, onCompleteIds]) => [
              ReadonlyArray.flattenNonEmpty(messages),
              ReadonlyArray.filter(onCompleteIds, Predicate.isNotNull),
            ]
          );

          queue.length = 0;

          dbWorker.post({
            _tag: "send",
            messages,
            onCompleteIds,
            queries: getSubscribedQueries(),
          });
        });
    });

    return { id } as never;
  };
};

export const createEvolu = <From, To extends Schema.Schema>(
  schema: S.Schema<From, To>,
  optionalConfig?: Partial<Config.Config>
): Evolu<To> => {
  const config = Config.create(optionalConfig);

  const errorStore = Store.create<Error.EvoluError | null>(null);
  const ownerStore = Store.create<Owner.Owner | null>(null);
  const rowsCache = Store.create<Db.RowsCache>(new Map());

  const subscribedQueries = new Map<Db.QueryString, number>();
  const onCompletes = new Map<DbWorker.OnCompleteId, DbWorker.OnComplete>();

  const dbWorker = DbWorkerFactory.createDbWorker((message) => {
    switch (message._tag) {
      case "onError":
        errorStore.setState({ _tag: "EvoluError", error: message.error });
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
        Browser.reloadAllTabs(config.reloadUrl);
        break;
      default:
        absurd(message);
    }
  });

  const onQuery = createOnQuery(rowsCache, onCompletes);

  const queryIfAny = (queries: ReadonlyArray<Db.QueryString>): void => {
    if (ReadonlyArray.isNonEmptyReadonlyArray(queries))
      dbWorker.post({ _tag: "query", queries });
  };

  const subscribeRowsWithLoadingState = createSubscribeRowsWithLoadingState(
    rowsCache,
    subscribedQueries,
    queryIfAny
  );

  const getRowsWithLoadingState: Evolu["getRowsWithLoadingState"] =
    (query) => () =>
      (query && rowsCache.getState().get(query)) || null;

  const getOwner = new Promise<Owner.Owner>((resolve) => {
    const unsubscribe = ownerStore.subscribe(() => {
      const owner = ownerStore.getState();
      if (!owner) return;
      unsubscribe();
      resolve(owner);
    });
  });

  const mutate: Evolu["mutate"] = createMutate({
    createId: Model.createId,
    getOwner,
    setOnComplete: (id, callback) => {
      onCompletes.set(id, callback);
    },
    dbWorker,
    getSubscribedQueries: () => Array.from(subscribedQueries.keys()),
  });

  const ownerActions: Owner.Actions = {
    reset: () => dbWorker.post({ _tag: "resetOwner" }),
    restore: flow(
      Mnemonic.parse,
      Effect.mapBoth(
        (): Owner.RestoreOwnerError => ({ _tag: "RestoreOwnerError" }),
        (mnemonic) => dbWorker.post({ _tag: "restoreOwner", mnemonic })
      ),
      Effect.runPromiseEither
    ),
  };

  dbWorker.post({
    _tag: "init",
    config,
    tableDefinitions: Schema.schemaToTablesDefinitions(schema),
  });

  Browser.init(subscribedQueries, dbWorker);

  return {
    subscribeError: errorStore.subscribe,
    getError: errorStore.getState,

    subscribeOwner: ownerStore.subscribe,
    getOwner: ownerStore.getState,

    subscribeRowsWithLoadingState,
    getRowsWithLoadingState,

    mutate,
    ownerActions,
  };
};
