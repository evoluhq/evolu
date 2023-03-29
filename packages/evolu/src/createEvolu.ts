import {
  io,
  ioOption,
  ioRef,
  option,
  readonlyArray,
  readonlyNonEmptyArray,
  readonlyRecord,
  taskEither,
} from "fp-ts";
import {
  constVoid,
  decrement,
  flow,
  increment,
  pipe,
} from "fp-ts/lib/function.js";
import { IO } from "fp-ts/lib/IO.js";
import { Option } from "fp-ts/lib/Option.js";
import { ReadonlyNonEmptyArray } from "fp-ts/lib/ReadonlyNonEmptyArray.js";
import { ReadonlyRecord } from "fp-ts/lib/ReadonlyRecord.js";
import { flushSync } from "react-dom";
import { createStore } from "./createStore.js";
import { dbSchemaToTableDefinitions } from "./dbSchemaToTableDefinitions.js";
import { applyPatches } from "./diff.js";
import { cast, createId, Id, Owner, OwnerId, SqliteDate } from "./model.js";
import { reloadAllTabs } from "./reloadAllTabs.js";
import {
  CreateEvolu,
  DbSchema,
  DbWorker,
  DbWorkerOutputOnQuery,
  eqQueryString,
  Evolu,
  EvoluError,
  Mutate,
  NewCrdtMessage,
  OnCompleteId,
  OwnerActions,
  QueryString,
  RowsWithLoadingState,
  Store,
} from "./types.js";
import { isServer } from "./utils.js";

export const createNewCrdtMessages = (
  table: string,
  row: Id,
  values: ReadonlyRecord<string, unknown>,
  ownerId: OwnerId,
  now: SqliteDate,
  isInsert: boolean
): ReadonlyNonEmptyArray<NewCrdtMessage> =>
  pipe(
    readonlyRecord.toEntries(values),
    // Filter out undefined and null for inserts. Null is default in SQLite.
    readonlyArray.filter(
      ([, value]) => value !== undefined && (isInsert ? value != null : true)
    ),
    readonlyArray.map(([key, value]) => [
      key,
      typeof value === "boolean" || value instanceof Date
        ? cast(value as never)
        : value,
    ]),
    isInsert
      ? flow(
          readonlyArray.appendW(["createdAt", now]),
          readonlyArray.appendW(["createdBy", ownerId])
        )
      : readonlyArray.appendW(["updatedAt", now]),
    readonlyNonEmptyArray.map(
      ([column, value]) =>
        ({
          table,
          row,
          column,
          value,
        } as NewCrdtMessage)
    )
  );

type CreateId = typeof createId;

const createMutate = <S extends DbSchema>({
  createId,
  getOwner,
  setOnComplete,
  dbWorker,
  getSubscribedQueries,
}: {
  createId: CreateId;
  getOwner: Promise<Owner>;
  setOnComplete: (id: OnCompleteId, callback: IO<void>) => void;
  dbWorker: DbWorker;
  getSubscribedQueries: IO<readonly QueryString[]>;
}): Mutate<S> => {
  const mutateQueueRef = new ioRef.IORef<
    readonly {
      readonly messages: ReadonlyNonEmptyArray<NewCrdtMessage>;
      readonly onCompleteId: Option<OnCompleteId>;
    }[]
  >(readonlyArray.empty);

  return (table, { id, ...values }, onComplete) => {
    const isInsert = id == null;
    if (isInsert) id = createId() as never;
    const now = cast(new Date());

    getOwner.then((owner) => {
      const messages = createNewCrdtMessages(
        table as string,
        id as Id,
        values,
        owner.id,
        now,
        isInsert
      );

      const onCompleteId = pipe(
        onComplete,
        option.fromNullable,
        option.map((onComplete) => {
          const id: OnCompleteId = createId<"OnComplete">();
          setOnComplete(id, onComplete);
          return id;
        })
      );

      const runQueueMicrotask = mutateQueueRef.read().length === 0;
      mutateQueueRef.modify(readonlyArray.append({ messages, onCompleteId }))();

      if (runQueueMicrotask)
        pipe(
          mutateQueueRef.read,
          io.chainFirst(() => mutateQueueRef.write(readonlyArray.empty)),
          io.map(readonlyNonEmptyArray.fromReadonlyArray),
          ioOption.chainIOK((queue) =>
            dbWorker.post({
              type: "send",
              messages: pipe(
                queue,
                readonlyNonEmptyArray.map((a) => a.messages),
                readonlyNonEmptyArray.flatten
              ),
              onCompleteIds: queue
                .map((a) => a.onCompleteId)
                .filter(option.isSome)
                .map((a) => a.value),
              queries: getSubscribedQueries(),
            })
          ),
          queueMicrotask
        );
    });

    return { id } as never;
  };
};

type RowsCache = ReadonlyMap<QueryString, RowsWithLoadingState>;

const createOnQuery =
  (rowsCache: Store<RowsCache>, onCompletes: Map<OnCompleteId, IO<void>>) =>
  ({ queriesPatches, onCompleteIds }: DbWorkerOutputOnQuery): IO<void> =>
  () => {
    pipe(
      queriesPatches,
      readonlyArray.reduce(
        rowsCache.getState(),
        (state, { query, patches }) => {
          const current = state.get(query);
          const next = {
            isLoading: false,
            rows: applyPatches(patches)(current?.rows || readonlyArray.empty),
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
          rowsCache.setState(state)();
          return;
        }

        // Ensure onComplete can use DOM (for a focus or anything else).
        flushSync(rowsCache.setState(state));

        pipe(
          onCompleteIds,
          readonlyArray.filterMap((id) => {
            const onComplete = onCompletes.get(id);
            onCompletes.delete(id);
            return option.fromNullable(onComplete);
          })
        ).forEach((onComplete) => onComplete());
      }
    );
  };

const createSubscribeRowsWithLoadingState = (
  rowsCache: Store<RowsCache>,
  subscribedQueries: Map<QueryString, number>,
  queryIfAny: (queries: readonly QueryString[]) => IO<void>,
  queueMicrotask: (callback: () => void) => void
): Evolu<never>["subscribeRowsWithLoadingState"] => {
  const snapshot = new ioRef.IORef<readonly QueryString[] | null>(null);

  return (queryString: QueryString | null) => (listen) => {
    if (queryString == null) return constVoid;

    if (snapshot.read() == null) {
      snapshot.write(Array.from(subscribedQueries.keys()))();
      queueMicrotask(() => {
        const subscribedQueriesSnapshot = snapshot.read();
        if (subscribedQueriesSnapshot == null) return;
        snapshot.write(null)();

        const queries = pipe(
          Array.from(subscribedQueries.keys()),
          readonlyArray.difference(eqQueryString)(subscribedQueriesSnapshot)
        );

        pipe(
          queries,
          readonlyArray.reduce(rowsCache.getState(), (state, query) => {
            const current = state.get(query);
            if (!current || current.isLoading) return state;
            return new Map([
              ...state,
              [
                query,
                {
                  rows: (current && current.rows) || readonlyArray.empty,
                  isLoading: true,
                },
              ],
            ]);
          }),
          rowsCache.setState
        );

        queryIfAny(queries)();
      });
    }

    subscribedQueries.set(
      queryString,
      increment(subscribedQueries.get(queryString) ?? 0)
    );
    const unsubscribe = rowsCache.subscribe(listen);

    return () => {
      const count = subscribedQueries.get(queryString);
      if (count != null && count > 1)
        subscribedQueries.set(queryString, decrement(count));
      else subscribedQueries.delete(queryString);
      unsubscribe();
    };
  };
};

const createOwnerActionRestore =
  (dbWorker: DbWorker): OwnerActions["restore"] =>
  (mnemonic) =>
    pipe(
      taskEither.fromTask(() => import("./mnemonic.js")),
      taskEither.chainEitherKW(({ parseMnemonic }) => parseMnemonic(mnemonic)),
      taskEither.chainIOK((mnemonic) =>
        dbWorker.post({ type: "restoreOwner", mnemonic })
      )
    )();

const initReconnectAndReshow = (
  subscribedQueries: Map<QueryString, number>,
  dbWorker: DbWorker
): void => {
  const sync = (refreshQueries: boolean): IO<void> =>
    pipe(
      () =>
        refreshQueries
          ? readonlyNonEmptyArray.fromArray(
              Array.from(subscribedQueries.keys())
            )
          : option.none,
      io.chain((queries) => dbWorker.post({ type: "sync", queries }))
    );

  const handleReconnect = sync(false);
  const handleReshow = sync(true);

  if (!isServer) {
    window.addEventListener("online", handleReconnect);
    window.addEventListener("focus", handleReshow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden") handleReshow();
    });
    handleReconnect();
  }
};

export const createEvolu: CreateEvolu =
  (dbSchema) =>
  ({ config, createDbWorker }) => {
    const errorStore = createStore<EvoluError | null>(null);
    const rowsCache = createStore<RowsCache>(new Map());
    const ownerStore = createStore<Owner | null>(null);
    const onCompletes = new Map<OnCompleteId, IO<void>>();
    const subscribedQueries = new Map<QueryString, number>();

    const onQuery = createOnQuery(rowsCache, onCompletes);

    const queryIfAny: (queries: readonly QueryString[]) => IO<void> = flow(
      readonlyNonEmptyArray.fromReadonlyArray,
      option.match(
        () => io.of(constVoid),
        (queries) => dbWorker.post({ type: "query", queries })
      )
    );

    const dbWorker = createDbWorker((output) => {
      switch (output.type) {
        case "onError":
          return errorStore.setState({
            type: "EvoluError",
            error: output.error,
          });
        case "onOwner":
          return ownerStore.setState(output.owner);
        case "onQuery":
          return onQuery(output);
        case "onReceive":
          return queryIfAny(Array.from(subscribedQueries.keys()));
        case "onResetOrRestore":
          return reloadAllTabs(config.reloadUrl);
      }
    });

    const subscribeRowsWithLoadingState = createSubscribeRowsWithLoadingState(
      rowsCache,
      subscribedQueries,
      queryIfAny,
      queueMicrotask
    );

    const getRowsWithLoadingState: Evolu<never>["getRowsWithLoadingState"] =
      (query) => () =>
        (query && rowsCache.getState().get(query)) || null;

    const getOwner = new Promise<Owner>((resolve) => {
      const unsubscribe = ownerStore.subscribe(() => {
        const o = ownerStore.getState();
        if (!o) return;
        unsubscribe();
        resolve(o);
      });
    });

    const mutate: Evolu<never>["mutate"] = createMutate({
      createId,
      getOwner,
      setOnComplete: (id, callback) => {
        onCompletes.set(id, callback);
      },
      dbWorker,
      getSubscribedQueries: () => Array.from(subscribedQueries.keys()),
    });

    const ownerActions: OwnerActions = {
      reset: dbWorker.post({ type: "resetOwner" }),
      restore: createOwnerActionRestore(dbWorker),
    };

    dbWorker.post({
      type: "init",
      config,
      tableDefinitions: dbSchemaToTableDefinitions(dbSchema),
    })();

    initReconnectAndReshow(subscribedQueries, dbWorker);

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
