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
import { absurd, flow, pipe } from "fp-ts/lib/function.js";
import { Option } from "fp-ts/Option";
import { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { ReadonlyRecord } from "fp-ts/ReadonlyRecord";
import { Task } from "fp-ts/Task";
import { flushSync } from "react-dom";
import { createStore } from "./createStore.js";
import { dbSchemaToTableDefinitions } from "./dbSchemaToTableDefinitions.js";
import { applyPatches } from "./diff.js";
import {
  cast,
  createId,
  CreateId,
  ID,
  Mnemonic,
  SqliteDateTime,
} from "./model.js";
import { reloadAllTabs } from "./reloadAllTabs.js";
import { safeParseToEither } from "./safeParseToEither.js";
import {
  CreateEvolu,
  DbSchema,
  DbWorker,
  DbWorkerOutputOnQuery,
  Evolu,
  EvoluError,
  Mutate,
  NewCrdtMessage,
  OnCompleteId,
  Owner,
  OwnerActions,
  RestoreOwnerError,
  RowsCache,
  SqlQueryString,
} from "./types.js";

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
  getOwner: Task<Owner>;
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

    getOwner().then((owner) => {
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

// TODO: Replace with new mnemonic lib.
const createRestoreOwner =
  (dbWorker: DbWorker) =>
  (mnemonic: string): Either<RestoreOwnerError, void> =>
    pipe(
      Mnemonic.safeParse(mnemonic.trim().split(/\s+/g).join(" ")),
      safeParseToEither,
      ioEither.fromEither,
      ioEither.mapLeft((): RestoreOwnerError => ({ type: "invalid mnemonic" })),
      ioEither.chainIOK((mnemonic) =>
        dbWorker.post({ type: "restoreOwner", mnemonic })
      )
    )();

export const createEvolu: CreateEvolu =
  (dbSchema) =>
  ({ config, createDbWorker }) => {
    const errorStore = createStore<EvoluError | null>(null);
    const rowsStore = createStore<RowsCache>({});
    const ownerStore = createStore<Owner | null>(null);
    const onCompletes = new Map<OnCompleteId, IO<void>>();
    const subscribedQueries = new Map<SqlQueryString, number>();

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

    const onQuery =
      ({ queriesPatches, onCompleteIds }: DbWorkerOutputOnQuery): IO<void> =>
      () => {
        pipe(
          queriesPatches,
          readonlyArray.reduce(
            rowsStore.getState(),
            (state, { query, patches }) => ({
              ...state,
              [query]: applyPatches(patches)(state[query]),
            })
          ),
          (state) => {
            if (onCompleteIds.length === 0) {
              rowsStore.setState(state)();
              return;
            }
            // flushSync is required before callOnCompletes
            if (queriesPatches.length > 0)
              flushSync(() => {
                rowsStore.setState(state)();
              });
            callOnCompletes(onCompleteIds)();
          }
        );
      };

    const dbWorker = createDbWorker((output) => {
      switch (output.type) {
        case "onError":
          errorStore.setState({
            type: "EvoluError",
            error: output.error,
          })();
          break;
        case "onOwner":
          ownerStore.setState(output.owner)();
          break;
        case "onQuery":
          onQuery(output)();
          break;
        case "onReceive":
          // query({
          //   queries: Array.from(subscribedQueries.keys()),
          //   purgeCache: true,
          // })();
          break;
        case "onResetOrRestore":
          reloadAllTabs(config.reloadUrl)();
          break;
        default:
          absurd(output);
      }
    });

    dbWorker.post({
      type: "init",
      config,
      tableDefinitions: dbSchemaToTableDefinitions(dbSchema),
    })();

    const getRows: Evolu<never>["getRows"] = (query) => () =>
      (query && rowsStore.getState()[query]) || null;

    const subscribeQuery: Evolu<never>["subscribeQuery"] = (
      _sqlQueryString
    ) => {
      return () => {
        //
      };
    };

    const getOwner: Task<Owner> = () =>
      new Promise((resolve) => {
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
      restore: createRestoreOwner(dbWorker),
    };

    const evolu: Evolu<never> = {
      subscribeError: errorStore.subscribe,
      getError: errorStore.getState,
      subscribeOwner: ownerStore.subscribe,
      getOwner: ownerStore.getState,
      subscribeRows: rowsStore.subscribe,
      getRows,
      subscribeQuery,
      mutate,
      ownerActions,
    };

    return evolu;
  };

// const query = ({
//   queries,
//   purgeCache,
// }: {
//   readonly queries: readonly SqlQueryString[];
//   readonly purgeCache?: boolean;
// }): IO<void> =>
//   pipe(
//     queries,
//     readonlyNonEmptyArray.fromReadonlyArray,
//     option.match(
//       () => constVoid,
//       (queries) => dbWorker.post({ type: "query", queries, purgeCache })
//     )
//   );

// let resolveOwnerPromise: (value: Owner) => void = constVoid;

// const ownerPromise = new Promise<Owner>((resolve) => {
//   resolveOwnerPromise = resolve;
// });

// export const getRows = (
//   query: SqlQueryString | null
// ): SqliteRows | null => (query && rowsCacheRef.read()[query]) || null;

// const subscribedQueries = new Map<SqlQueryString, number>();
// const subscribedQueriesSnapshotRef = new ioRef.IORef<
//   readonly SqlQueryString[] | null
// >(null);

// export const subscribeQuery = (sqlQueryString: SqlQueryString): Unsubscribe => {
//   if (subscribedQueriesSnapshotRef.read() == null) {
//     subscribedQueriesSnapshotRef.write(Array.from(subscribedQueries.keys()))();
//     queueMicrotask(() => {
//       const subscribedQueriesSnapshot = subscribedQueriesSnapshotRef.read();
//       if (subscribedQueriesSnapshot == null) return;
//       subscribedQueriesSnapshotRef.write(null)();

//       pipe(
//         Array.from(subscribedQueries.keys()),
//         readonlyArray.difference(eqSqlQueryString)(subscribedQueriesSnapshot),
//         (queries) => query({ queries })
//       )();
//     });
//   }

//   const count = subscribedQueries.get(sqlQueryString);
//   subscribedQueries.set(sqlQueryString, increment(count ?? 0));

//   return () => {
//     const count = subscribedQueries.get(sqlQueryString);
//     if (count && count > 1)
//       subscribedQueries.set(sqlQueryString, decrement(count));
//     else subscribedQueries.delete(sqlQueryString);
//   };
// };

// // if (typeof window !== "undefined") {
// //   const sync = (refreshQueries: boolean): IO<void> =>
// //     pipe(
// //       () =>
// //         refreshQueries
// //           ? readonlyNonEmptyArray.fromArray(
// //               Array.from(subscribedQueries.keys())
// //             )
// //           : option.none,
// //       io.chain((queries) => dbWorker.post({ type: "sync", queries }))
// //     );

// //   const handleReconnect = sync(false);
// //   const handleReshow = sync(true);

// //   window.addEventListener("online", handleReconnect);
// //   window.addEventListener("focus", handleReshow);
// //   document.addEventListener("visibilitychange", () => {
// //     if (document.visibilityState !== "hidden") handleReshow();
// //   });

// //   handleReconnect();
// // }
