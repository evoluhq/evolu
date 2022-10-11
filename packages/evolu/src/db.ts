import {
  io,
  ioEither,
  ioOption,
  ioRef,
  option,
  readonlyArray,
  readonlyNonEmptyArray,
  readonlyRecord,
} from "fp-ts";
import { Either } from "fp-ts/Either";
import {
  absurd,
  constVoid,
  decrement,
  flow,
  increment,
  pipe,
} from "fp-ts/lib/function.js";
import { IO } from "fp-ts/IO";
import type { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { Task } from "fp-ts/Task";
import type { JSONArray } from "immutable-json-patch";
import { immutableJSONPatch } from "immutable-json-patch";
import { config } from "./config.js";
import { dispatchError } from "./error.js";
import { cast, createId, ID, Mnemonic, SqliteDateTime } from "./model.js";
import { reloadAllTabs } from "./reloadAllTabs.js";
import { safeParseToEither } from "./safeParseToEither.js";
import {
  commonColumns,
  DbSchema,
  eqSqlQueryString,
  Mutate,
  NewCrdtMessage,
  Owner,
  QueriesRowsCache,
  QueryPatches,
  SQLiteRowRecord,
  SqlQueryString,
  TableDefinition,
  Unsubscribe,
} from "./types.js";
import {
  DbWorkerInput,
  DbWorkerInputInit,
  DbWorkerOutput,
  SyncWorkerInputInit,
} from "./typesBrowser.js";
import type { ReadonlyRecord } from "fp-ts/ReadonlyRecord";

const queriesRowsCacheRef = new ioRef.IORef<QueriesRowsCache>({});

const listeners = new Set<IO<void>>();

export const listen = (listener: IO<void>): IO<void> => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notifyListeners: IO<void> = () => {
  listeners.forEach((listener) => listener());
};

const onQuery = (
  queriesPatches: ReadonlyNonEmptyArray<QueryPatches>
): IO<void> =>
  pipe(
    queriesPatches,
    io.traverseArray(({ query, patches }) =>
      queriesRowsCacheRef.modify((a) => ({
        ...a,
        [query]: immutableJSONPatch((a[query] as JSONArray) || [], patches),
      }))
    ),
    io.chain(() => notifyListeners)
  );

const query = (queries: readonly SqlQueryString[]): IO<void> =>
  pipe(
    queries,
    readonlyNonEmptyArray.fromReadonlyArray,
    option.match(
      () => constVoid,
      (queries) => postDbWorkerInput({ type: "query", queries })
    )
  );

const { postDbWorkerInput, owner } = pipe(
  new Promise<{
    readonly postDbWorkerInput: (message: DbWorkerInput) => IO<void>;
    readonly owner: Owner;
  }>((resolve) => {
    if (typeof window === "undefined") return;

    // Because Safari does not support nested Web Workers.
    // Otherwise, the sync worker would be created within the db worker.
    const channel = new MessageChannel();

    const dbWorker = new Worker(new URL("./db.worker.js", import.meta.url));
    const syncWorker = new Worker(new URL("./sync.worker.js", import.meta.url));

    const postDbWorkerInput: (
      message: DbWorkerInputInit | DbWorkerInput,
      port?: MessagePort
    ) => IO<void> = (message, port) => () =>
      port
        ? dbWorker.postMessage(message, [port])
        : dbWorker.postMessage(message);

    const postSyncWorkerInputInit: IO<void> = () => {
      const message: SyncWorkerInputInit = {
        type: "init",
        config,
        syncPort: channel.port2,
      };
      syncWorker.postMessage(message, [channel.port2]);
    };

    dbWorker.addEventListener(
      "message",
      ({ data }: MessageEvent<DbWorkerOutput>) => {
        switch (data.type) {
          case "onError":
            dispatchError(data.error)();
            return;

          case "onInit":
            resolve({ postDbWorkerInput, owner: data.owner });
            return;

          case "onQuery":
            onQuery(data.queriesPatches)();
            break;

          case "onReceive":
            query(Array.from(subscribedQueries.keys()))();
            break;

          case "reloadAllTabs":
            reloadAllTabs();
            break;

          default:
            absurd(data);
        }
      }
    );

    pipe(
      postDbWorkerInput(
        { type: "init", syncPort: channel.port1, config },
        channel.port1
      ),
      io.chain(() => postSyncWorkerInputInit),
      // For Evolu config to have time to be overridden.
      setTimeout
    );
  }),
  (
    promise
  ): {
    readonly postDbWorkerInput: (message: DbWorkerInput) => IO<void>;
    readonly owner: Task<Owner>;
  } => ({
    postDbWorkerInput: (message) => () =>
      promise.then(({ postDbWorkerInput }) => postDbWorkerInput(message)()),
    owner: () => promise.then(({ owner }) => owner),
  })
);

const dbSchemaToTableDefinitions: (
  dbSchema: DbSchema
) => readonly TableDefinition[] = flow(
  readonlyRecord.toEntries,
  readonlyArray.map(
    ([name, columns]): TableDefinition => ({
      name,
      columns: Object.keys(columns)
        .filter((c) => c !== "id")
        .concat(commonColumns),
    })
  )
);

export const updateDbSchema = (dbSchema: DbSchema): IO<void> =>
  postDbWorkerInput({
    type: "updateDbSchema",
    // Zod is not transferable.
    tableDefinitions: dbSchemaToTableDefinitions(dbSchema),
  });

export const getSubscribedQueryRows = (
  query: SqlQueryString | null
): readonly SQLiteRowRecord[] | null =>
  (query && queriesRowsCacheRef.read()[query]) || null;

const subscribedQueries = new Map<SqlQueryString, number>();
const subscribedQueriesSnapshotRef = new ioRef.IORef<
  readonly SqlQueryString[] | null
>(null);

export const subscribeQuery = (sqlQueryString: SqlQueryString): Unsubscribe => {
  if (subscribedQueriesSnapshotRef.read() == null) {
    subscribedQueriesSnapshotRef.write(Array.from(subscribedQueries.keys()))();
    queueMicrotask(() => {
      const subscribedQueriesSnapshot = subscribedQueriesSnapshotRef.read();
      if (subscribedQueriesSnapshot == null) return;
      subscribedQueriesSnapshotRef.write(null)();

      pipe(
        Array.from(subscribedQueries.keys()),
        readonlyArray.difference(eqSqlQueryString)(subscribedQueriesSnapshot),
        query
      )();
    });
  }

  const count = subscribedQueries.get(sqlQueryString);
  subscribedQueries.set(sqlQueryString, increment(count ?? 0));

  return () => {
    const count = subscribedQueries.get(sqlQueryString);
    if (count && count > 1)
      subscribedQueries.set(sqlQueryString, decrement(count));
    else subscribedQueries.delete(sqlQueryString);
  };
};

const createNewCrdtMessages = (
  table: string,
  row: ID<"string">,
  values: ReadonlyRecord<string, unknown>,
  ownerId: ID<"owner">,
  now: SqliteDateTime,
  isInsert: boolean
): readonly NewCrdtMessage[] =>
  pipe(
    readonlyRecord.toEntries(values),
    readonlyArray.filter(([, value]) => value !== undefined),
    readonlyArray.map(([key, value]) => [
      key,
      typeof value === "boolean" || value instanceof Date
        ? cast(value as never)
        : value,
    ]),
    readonlyArray.concatW(
      isInsert
        ? [
            ["createdAt", now],
            ["createdBy", ownerId],
          ]
        : [["updatedAt", now]]
    ),
    readonlyArray.map(
      ([column, value]) =>
        ({
          table,
          row,
          column,
          value,
        } as NewCrdtMessage)
    )
  );

export const createMutate = <S extends DbSchema>(): Mutate<S> => {
  const messageQueueRef = new ioRef.IORef<readonly NewCrdtMessage[]>([]);

  return (table, { id, ...values }) => {
    const isInsert = id == null;
    // eslint-disable-next-line no-param-reassign
    if (isInsert) id = createId() as never;
    const now = cast(new Date());

    owner().then((owner) => {
      const messages = createNewCrdtMessages(
        table as string,
        id as ID<"string">,
        values,
        owner.id,
        now,
        isInsert
      );

      const runQueueMicrotask = messageQueueRef.read().length === 0;
      messageQueueRef.modify((a) => [...a, ...messages])();

      if (!runQueueMicrotask) return;
      pipe(
        messageQueueRef.read,
        io.chainFirst(() => messageQueueRef.write([])),
        io.map(readonlyNonEmptyArray.fromReadonlyArray),
        ioOption.chainIOK((messages) =>
          postDbWorkerInput({
            type: "send",
            messages,
            queries: Array.from(subscribedQueries.keys()),
          })
        ),
        queueMicrotask
      );
    });

    return { id } as never;
  };
};

export const getOwner: Task<Owner> = owner;

export const resetOwner: IO<void> = postDbWorkerInput({
  type: "resetOwner",
});

export interface RestoreOwnerError {
  readonly type: "invalid mnemonic";
}

export const restoreOwner = (
  mnemonic: string
): Either<RestoreOwnerError, void> =>
  pipe(
    Mnemonic.safeParse(mnemonic.trim().split(/\s+/g).join(" ")),
    safeParseToEither,
    ioEither.fromEither,
    ioEither.mapLeft((): RestoreOwnerError => ({ type: "invalid mnemonic" })),
    ioEither.chainIOK((mnemonic) =>
      postDbWorkerInput({ type: "restoreOwner", mnemonic })
    )
  )();

if (typeof window !== "undefined") {
  const sync = (refreshQueries: boolean): IO<void> =>
    pipe(
      () =>
        refreshQueries
          ? readonlyNonEmptyArray.fromArray(
              Array.from(subscribedQueries.keys())
            )
          : option.none,
      io.chain((queries) => postDbWorkerInput({ type: "sync", queries }))
    );

  const handleReconnect = sync(false);
  const handleReshow = sync(true);

  window.addEventListener("online", handleReconnect);
  window.addEventListener("focus", handleReshow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") handleReshow();
  });

  handleReconnect();
}
