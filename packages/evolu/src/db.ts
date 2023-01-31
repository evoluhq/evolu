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
import { IO } from "fp-ts/IO";
import {
  absurd,
  constFalse,
  constVoid,
  decrement,
  flow,
  increment,
  pipe,
} from "fp-ts/lib/function.js";
import { Option } from "fp-ts/Option";
import type { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { Task } from "fp-ts/Task";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { config } from "./config.js";
import { createMessages } from "./createMessages.js";
import { applyPatches } from "./diff.js";
import { dispatchError } from "./error.js";
import { cast, createId, ID, Mnemonic } from "./model.js";
import { reloadAllTabs } from "./reloadAllTabs.js";
import { safeParseToEither } from "./safeParseToEither.js";
import {
  commonColumns,
  DbSchema,
  DbWorkerInput,
  DbWorkerInit,
  DbWorkerOutput,
  eqSqlQueryString,
  Mutate,
  NewCrdtMessage,
  OnComplete,
  OnCompleteId,
  Owner,
  QueriesRowsCache,
  QueryPatches,
  SqliteRows,
  SqlQueryString,
  TableDefinition,
  Unsubscribe,
} from "./types.js";

const queriesRowsCacheRef = new ioRef.IORef<QueriesRowsCache>({});

const listeners = new Set<IO<void>>();

export const listen = (listener: IO<void>): IO<void> => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const callListeners: IO<void> = () => {
  listeners.forEach((listener) => listener());
};

const onCompletes = new Map<OnCompleteId, OnComplete>();

const callOnCompletes =
  (onCompleteIds: readonly OnCompleteId[]): IO<void> =>
  () =>
    pipe(
      onCompleteIds,
      readonlyArray.filterMap((id) => {
        const onComplete = onCompletes.get(id);
        onCompletes.delete(id);
        return option.fromNullable(onComplete);
      })
    ).forEach((onComplete) => onComplete());

/**
 * React Hook returning `true` if any data are loaded.
 * It's helpful to prevent screen flickering as data are loading.
 * React Suspense would be better, but we are not there yet.
 */
export const useEvoluFirstDataAreLoaded = (): boolean =>
  useSyncExternalStore(
    listen,
    () => !readonlyRecord.isEmpty(queriesRowsCacheRef.read()),
    constFalse
  );

const onQuery = ({
  queriesPatches,
  onCompleteIds,
}: {
  readonly queriesPatches: readonly QueryPatches[];
  readonly onCompleteIds?: readonly OnCompleteId[];
}): IO<void> =>
  pipe(
    queriesPatches,
    io.traverseArray(({ query, patches }) =>
      queriesRowsCacheRef.modify((a) => ({
        ...a,
        [query]: applyPatches(patches)(a[query]),
      }))
    ),
    io.map(() => {
      if (queriesPatches.length > 0) {
        if (onCompleteIds && onCompleteIds.length > 0) flushSync(callListeners);
        else callListeners();
      }
      if (onCompleteIds) callOnCompletes(onCompleteIds)();
    })
  );

const query = ({
  queries,
  purgeCache,
}: {
  readonly queries: readonly SqlQueryString[];
  readonly purgeCache?: boolean;
}): IO<void> =>
  pipe(
    queries,
    readonlyNonEmptyArray.fromReadonlyArray,
    option.match(
      () => constVoid,
      (queries) => postDbWorkerInput({ type: "query", queries, purgeCache })
    )
  );

const isServer = typeof window === "undefined" || "Deno" in window;

const isChromeWithOPFS: boolean =
  !isServer &&
  navigator.userAgentData != null &&
  navigator.userAgentData.brands.find(
    ({ brand, version }) =>
      // Chrome or Chromium
      brand.includes("Chrom") && Number(version) >= 109
  ) != null;

// const mapDbWorkerOutputToFunction = ({
//   data,
// }: MessageEvent<DbWorkerOutput>) => {
//   switch (data.type) {
//     case "onError":
//       dispatchError(data.error)();
//       return;

//     case "onInit":
//       resolve({ postDbWorkerInput, owner: data.owner });
//       return;

//     case "onQuery":
//       onQuery(data)();
//       break;

//     case "onReceive":
//       query({
//         queries: Array.from(subscribedQueries.keys()),
//         purgeCache: true,
//       })();
//       break;

//     case "reloadAllTabs":
//       reloadAllTabs(config.reloadUrl)();
//       break;

//     default:
//       absurd(data);
//   }
// };

const createWorker: Task<{
  postDbWorkerInput: (message: DbWorkerInput) => IO<void>;
  owner: Owner;
}> = () =>
  new Promise((resolve) => {
    const dbWorker = new Worker(new URL("./db.worker.js", import.meta.url));

    const postDbWorkerInput =
      (message: DbWorkerInit | DbWorkerInput): IO<void> =>
      () =>
        dbWorker.postMessage(message);

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
            onQuery(data)();
            break;

          case "onReceive":
            query({
              queries: Array.from(subscribedQueries.keys()),
              purgeCache: true,
            })();
            break;

          case "reloadAllTabs":
            reloadAllTabs(config.reloadUrl)();
            break;

          default:
            absurd(data);
        }
      }
    );

    // setTimeout is for the Evolu config to have time to be overridden.
    setTimeout(postDbWorkerInput({ type: "init", config }));
  });

const {
  postDbWorkerInput,
  owner,
}: {
  readonly postDbWorkerInput: (message: DbWorkerInput) => IO<void>;
  readonly owner: Task<Owner>;
} = isServer
  ? {
      // Do nothing on the server.
      postDbWorkerInput: () => constVoid,
      owner: () => new Promise(constVoid),
    }
  : isChromeWithOPFS
  ? pipe(createWorker(), (promise) => ({
      postDbWorkerInput: (message) => () => {
        promise.then(({ postDbWorkerInput }) => postDbWorkerInput(message)());
      },
      owner: () => promise.then(({ owner }) => owner),
    }))
  : {
      // TODO:
      postDbWorkerInput: () => constVoid,
      owner: () => new Promise(constVoid),
    };

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
    // Zod is not transferable. new fp-ts/schema will be
    tableDefinitions: dbSchemaToTableDefinitions(dbSchema),
  });

export const getSubscribedQueryRows = (
  query: SqlQueryString | null
): SqliteRows | null => (query && queriesRowsCacheRef.read()[query]) || null;

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
        (queries) => query({ queries })
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

const mutateQueueRef = new ioRef.IORef<
  readonly {
    readonly messages: ReadonlyNonEmptyArray<NewCrdtMessage>;
    readonly onCompleteId: Option<OnCompleteId>;
  }[]
>(readonlyArray.empty);

export const createMutate =
  <S extends DbSchema>(): Mutate<S> =>
  (table, { id, ...values }, onComplete) => {
    const isInsert = id == null;
    // eslint-disable-next-line no-param-reassign
    if (isInsert) id = createId() as never;
    const now = cast(new Date());

    owner().then((owner) => {
      const messages = createMessages(
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
          onCompletes.set(id, onComplete);
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
            postDbWorkerInput({
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
              queries: Array.from(subscribedQueries.keys()),
            })
          ),
          queueMicrotask
        );
    });

    return { id } as never;
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

  // Wait for updateDbSchema.
  setTimeout(handleReconnect);
}
