import { apply, io, ioEither } from "fp-ts";
import { Either } from "fp-ts/Either";
import { absurd, pipe } from "fp-ts/lib/function.js";
import { createConfig } from "./createConfig.js";
import { createDbWorker } from "./createDbWorker.js";
import { createStore } from "./createStore.js";
import { dbSchemaToTableDefinitions } from "./dbSchemaToTableDefinitions.js";
import { Mnemonic } from "./model.js";
import { reloadAllTabs } from "./reloadAllTabs.js";
import { safeParseToEither } from "./safeParseToEither.js";
import {
  CreateEvolu,
  DbWorker,
  Evolu,
  EvoluError,
  Owner,
  OwnerActions,
  QueriesRowsCache,
  RestoreOwnerError,
} from "./types.js";

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

export const createEvolu: CreateEvolu = (dbSchema, config) =>
  pipe(
    apply.sequenceS(io.Apply)({
      config: createConfig(config),
      errorStore: createStore<EvoluError | null>(null),
      queriesRowsStore: createStore<QueriesRowsCache>({}),
      ownerStore: createStore<Owner | null>(null),
    }),
    io.map(({ config, errorStore, queriesRowsStore, ownerStore }) => {
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
            // onQuery(output)();
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
      })();

      dbWorker.post({
        type: "init",
        config,
        tableDefinitions: dbSchemaToTableDefinitions(dbSchema),
      })();

      const getSubscribedQueries: Evolu<never>["getSubscribedQueries"] =
        (query) => () =>
          (query && queriesRowsStore.getState()[query]) || null;

      const subscribeQuery: Evolu<never>["subscribeQuery"] = (
        _sqlQueryString
      ) => {
        return () => {
          //
        };
      };

      const mutate: Evolu<never>["mutate"] = () => {
        throw "";
      };

      const ownerActions: OwnerActions = {
        reset: dbWorker.post({ type: "resetOwner" }),
        restore: createRestoreOwner(dbWorker),
      };

      const evolu: Evolu<never> = {
        subscribeError: errorStore.subscribe,
        getError: errorStore.getState,
        subscribeOwner: ownerStore.subscribe,
        getOwner: ownerStore.getState,
        subscribeQueries: queriesRowsStore.subscribe,
        getSubscribedQueries,
        subscribeQuery,
        mutate,
        ownerActions,
      };

      return evolu;
    })
  );

// import {
//   io,
//   ioEither,
//   ioOption,
//   ioRef,
//   option,
//   readonlyArray,
//   readonlyNonEmptyArray,
//   readonlyRecord,
// } from "fp-ts";
// import { Either } from "fp-ts/Either";
// import { IO } from "fp-ts/IO";
// import {
//   absurd,
//   constFalse,
//   constVoid,
//   decrement,
//   flow,
//   increment,
//   pipe,
// } from "fp-ts/lib/function.js";
// import { Task } from "fp-ts/Task";
// import { Option } from "fp-ts/Option";
// import type { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
// import { useSyncExternalStore } from "react";
// import { flushSync } from "react-dom";
// import { defaultConfig } from "./createConfig.js";
// import { createMessages } from "./createMessages.js";
// import { applyPatches } from "./diff.js";
// import { dispatchError } from "./error.js";
// import { cast, createId, ID, Mnemonic } from "./model.js";
// import { reloadAllTabs } from "./reloadAllTabs.js";
// import { safeParseToEither } from "./safeParseToEither.js";
// import {
//   commonColumns,
//   Config,
//   CreateDbWorker,
//   DbSchema,
//   DbWorker,
//   DbWorkerInput,
//   DbWorkerOutput,
//   eqSqlQueryString,
//   Mutate,
//   NewCrdtMessage,
//   OnComplete,
//   OnCompleteId,
//   Owner,
//   QueriesRowsCache,
//   QueryPatches,
//   SqliteRows,
//   SqlQueryString,
//   TableDefinition,
//   Unsubscribe,
// } from "./types.js";

// const onCompletes = new Map<OnCompleteId, OnComplete>();

// const callOnCompletes =
//   (onCompleteIds: readonly OnCompleteId[]): IO<void> =>
//   () =>
//     pipe(
//       onCompleteIds,
//       readonlyArray.filterMap((id) => {
//         const onComplete = onCompletes.get(id);
//         onCompletes.delete(id);
//         return option.fromNullable(onComplete);
//       })
//     ).forEach((onComplete) => onComplete());

// const onQuery = ({
//   queriesPatches,
//   onCompleteIds,
// }: {
//   readonly queriesPatches: readonly QueryPatches[];
//   readonly onCompleteIds?: readonly OnCompleteId[];
// }): IO<void> =>
//   pipe(
//     queriesPatches,
//     io.traverseArray(({ query, patches }) =>
//       queriesRowsCacheRef.modify((a) => ({
//         ...a,
//         [query]: applyPatches(patches)(a[query]),
//       }))
//     ),
//     io.map(() => {
//       if (queriesPatches.length > 0) {
//         if (onCompleteIds && onCompleteIds.length > 0) flushSync(callListeners);
//         else callListeners();
//       }
//       if (onCompleteIds) callOnCompletes(onCompleteIds)();
//     })
//   );

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

// export const getOwner: Task<Owner> = () => ownerPromise;

// const handleWorkerOnMessage = (message: DbWorkerOutput): void => {
//   switch (message.type) {
//     case "onError":
//       dispatchError(message.error)();
//       break;
//     case "onInit":
//       resolveOwnerPromise(message.owner);
//       break;
//     case "onQuery":
//       onQuery(message)();
//       break;
//     case "onReceive":
//       query({
//         queries: Array.from(subscribedQueries.keys()),
//         purgeCache: true,
//       })();
//       break;
//     case "onResetOrRestore":
//       // TODO: Bacha, spatne! Musi brat, co se tam poslalo.
//       reloadAllTabs(defaultConfig.reloadUrl)();
//       break;
//     default:
//       absurd(message);
//   }
// };

// export const init =
//   (dbSchema: DbSchema, config?: Partial<Config>): IO<void> =>
//   () => {
//     dbWorker.post({
//       type: "init",
//       config: { ...defaultConfig, ...config },
//       tableDefinitions: dbSchemaToTableDefinitions(dbSchema),
//     });
//   };

// export const getSubscribedQueries = (
//   query: SqlQueryString | null
// ): SqliteRows | null => (query && queriesRowsCacheRef.read()[query]) || null;

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

// const mutateQueueRef = new ioRef.IORef<
//   readonly {
//     readonly messages: ReadonlyNonEmptyArray<NewCrdtMessage>;
//     readonly onCompleteId: Option<OnCompleteId>;
//   }[]
// >(readonlyArray.empty);

// export const createMutate =
//   <S extends DbSchema>(): Mutate<S> =>
//   (table, { id, ...values }, onComplete) => {
//     const isInsert = id == null;
//     // eslint-disable-next-line no-param-reassign
//     if (isInsert) id = createId() as never;
//     const now = cast(new Date());

//     getOwner().then((owner) => {
//       const messages = createMessages(
//         table as string,
//         id as ID<"string">,
//         values,
//         owner.id,
//         now,
//         isInsert
//       );

//       const onCompleteId = pipe(
//         onComplete,
//         option.fromNullable,
//         option.map((onComplete) => {
//           const id: OnCompleteId = createId<"OnComplete">();
//           onCompletes.set(id, onComplete);
//           return id;
//         })
//       );

//       const runQueueMicrotask = mutateQueueRef.read().length === 0;
//       mutateQueueRef.modify(readonlyArray.append({ messages, onCompleteId }))();

//       if (runQueueMicrotask)
//         pipe(
//           mutateQueueRef.read,
//           io.chainFirst(() => mutateQueueRef.write([])),
//           io.map(readonlyNonEmptyArray.fromReadonlyArray),
//           ioOption.chainIOK((queue) =>
//             dbWorker.post({
//               type: "send",
//               messages: pipe(
//                 queue,
//                 readonlyNonEmptyArray.map((a) => a.messages),
//                 readonlyNonEmptyArray.flatten
//               ),
//               onCompleteIds: queue
//                 .map((a) => a.onCompleteId)
//                 .filter(option.isSome)
//                 .map((a) => a.value),
//               queries: Array.from(subscribedQueries.keys()),
//             })
//           ),
//           queueMicrotask
//         );
//     });

//     return { id } as never;
//   };

// export interface RestoreOwnerError {
//   readonly type: "invalid mnemonic";
// }

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
