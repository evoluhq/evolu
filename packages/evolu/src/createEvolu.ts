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
import { IO } from "fp-ts/IO";
import {
  constVoid,
  decrement,
  flow,
  increment,
  pipe,
} from "fp-ts/lib/function.js";
import { Option } from "fp-ts/Option";
import { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { ReadonlyRecord } from "fp-ts/ReadonlyRecord";
import { flushSync } from "react-dom";
import { createStore } from "./createStore.js";
import { dbSchemaToTableDefinitions } from "./dbSchemaToTableDefinitions.js";
import { applyPatches } from "./diff.js";
import { cast, createId, CreateId, ID, SqliteDateTime } from "./model.js";
import { reloadAllTabs } from "./reloadAllTabs.js";
import {
  CreateEvolu,
  DbSchema,
  DbWorker,
  DbWorkerOutputOnQuery,
  eqSqlQueryString,
  Evolu,
  EvoluError,
  Mutate,
  NewCrdtMessage,
  OnCompleteId,
  Owner,
  OwnerActions,
  RowsCache,
  SqlQueryString,
  Store,
} from "./types.js";
import { isServer } from "./utils.js";

const createNewCrdtMessages = (
  table: string,
  row: ID<"string">,
  values: ReadonlyRecord<string, unknown>,
  ownerId: ID<"owner">,
  now: SqliteDateTime,
  isInsert: boolean
): ReadonlyNonEmptyArray<NewCrdtMessage> =>
  pipe(
    readonlyRecord.toEntries(values),
    readonlyArray.filter(([, value]) => value !== undefined),
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
  getSubscribedQueries: IO<readonly SqlQueryString[]>;
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
        id as ID<"string">,
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
          io.chainFirst(() => mutateQueueRef.write([])),
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

const createOnQuery =
  (rowsCache: Store<RowsCache>, onCompletes: Map<OnCompleteId, IO<void>>) =>
  ({ queriesPatches, onCompleteIds }: DbWorkerOutputOnQuery): IO<void> =>
  () => {
    pipe(
      queriesPatches,
      readonlyArray.reduce(
        rowsCache.getState(),
        (state, { query, patches }) => ({
          ...state,
          [query]: applyPatches(patches)(state[query]),
        })
      ),
      (state) => {
        if (onCompleteIds.length === 0) {
          rowsCache.setState(state)();
          return;
        }

        // flushSync is required before callOnCompletes
        if (queriesPatches.length > 0)
          flushSync(() => {
            rowsCache.setState(state)();
          });

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

const createSubscribeQuery = (
  rowsCache: Store<RowsCache>,
  subscribedQueries: Map<SqlQueryString, number>,
  queryIfAny: (queries: readonly SqlQueryString[]) => IO<void>
): Evolu<never>["subscribeQuery"] => {
  const snapshot = new ioRef.IORef<readonly SqlQueryString[] | null>(null);

  return (sqlQueryString: SqlQueryString | null) => (listen) => {
    if (sqlQueryString == null) return () => constVoid;

    if (snapshot.read() == null) {
      snapshot.write(Array.from(subscribedQueries.keys()))();
      queueMicrotask(() => {
        const subscribedQueriesSnapshot = snapshot.read();
        if (subscribedQueriesSnapshot == null) return;
        snapshot.write(null)();
        pipe(
          Array.from(subscribedQueries.keys()),
          readonlyArray.difference(eqSqlQueryString)(subscribedQueriesSnapshot),
          queryIfAny
        )();
      });
    }

    subscribedQueries.set(
      sqlQueryString,
      increment(subscribedQueries.get(sqlQueryString) ?? 0)
    );
    const unsubscribe = rowsCache.subscribe(listen);

    return () => {
      const count = subscribedQueries.get(sqlQueryString);
      if (count != null && count > 1)
        subscribedQueries.set(sqlQueryString, decrement(count));
      else subscribedQueries.delete(sqlQueryString);
      unsubscribe();
    };
  };
};

const createOwnerActionRestore =
  (dbWorker: DbWorker): OwnerActions["restore"] =>
  (mnemonic) =>
    pipe(
      taskEither.fromTask(() => import("./mnemonic")),
      taskEither.chainEitherKW(({ parseMnemonic }) => parseMnemonic(mnemonic)),
      taskEither.chainIOK((mnemonic) =>
        dbWorker.post({ type: "restoreOwner", mnemonic })
      )
    );

const initReconnectAndReshow = (
  subscribedQueries: Map<SqlQueryString, number>,
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
    const rowsCache = createStore<RowsCache>({});
    const ownerStore = createStore<Owner | null>(null);
    const onCompletes = new Map<OnCompleteId, IO<void>>();
    const subscribedQueries = new Map<SqlQueryString, number>();

    const onQuery = createOnQuery(rowsCache, onCompletes);

    const queryIfAny: (queries: readonly SqlQueryString[]) => IO<void> = flow(
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

    const subscribeQuery = createSubscribeQuery(
      rowsCache,
      subscribedQueries,
      queryIfAny
    );

    const getQuery: Evolu<never>["getQuery"] = (query) => () =>
      (query && rowsCache.getState()[query]) || null;

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
      subscribeQuery,
      getQuery,
      mutate,
      ownerActions,
    };
  };
