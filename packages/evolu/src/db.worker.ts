import { apply, either, taskEither } from "fp-ts";
import { Either } from "fp-ts/Either";
import { constVoid, flow, pipe } from "fp-ts/lib/function.js";
import { IORef } from "fp-ts/IORef";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { setConfig } from "./config.js";
import { initDb } from "./initDb.js";
import { initDbModel } from "./initDbModel.js";
import { query } from "./query.js";
import { receive } from "./receive.js";
import { resetOwner } from "./resetOwner.js";
import { restoreOwner } from "./restoreOwner.js";
import { send } from "./send.js";
import { sync } from "./sync.js";
import {
  createTimeEnv,
  DbEnv,
  DbTransactionEnv,
  EvoluError,
  LockManagerEnv,
  OwnerEnv,
  QueriesRowsCache,
  QueriesRowsCacheEnv,
  TimeEnv,
} from "./types.js";
import {
  DbWorkerInput,
  DbWorkerInputInit,
  PostDbWorkerOutputEnv,
  PostSyncWorkerInputEnv,
  SyncWorkerOutput,
} from "./typesBrowser.js";
import { updateDbSchema } from "./updateDbSchema.js";

const postDbWorkerOutput: PostDbWorkerOutputEnv["postDbWorkerOutput"] =
  (message) => () =>
    self.postMessage(message);

const onError: (error: EvoluError["error"]) => void = (error) =>
  postDbWorkerOutput({ type: "onError", error })();

type Envs = DbEnv &
  OwnerEnv &
  PostDbWorkerOutputEnv &
  QueriesRowsCacheEnv &
  PostSyncWorkerInputEnv &
  LockManagerEnv;

const createWritableStream = ({
  dbTransaction,
  ...envs
}: Envs & DbTransactionEnv): WritableStream<DbWorkerInput> =>
  new WritableStream({
    write: flow(
      (data): ReaderTaskEither<Envs & TimeEnv, EvoluError["error"], void> => {
        switch (data.type) {
          case "updateDbSchema":
            return updateDbSchema(data);
          case "send":
            return send(data);
          case "query":
            return query(data.queries);
          case "receive":
            return receive(data);
          case "sync":
            return sync(data.queries);
          case "resetOwner":
            return resetOwner;
          case "restoreOwner":
            return restoreOwner(data.mnemonic);
        }
      },
      (rte) => rte({ ...envs, ...createTimeEnv() }),
      dbTransaction,
      (te) => te().then(either.match(onError, constVoid))
    ),
  });

apply
  .sequenceT(taskEither.ApplyPar)(
    pipe(
      initDb,
      taskEither.chainW(({ db, dbTransaction }) =>
        pipe(
          initDbModel()({ db }),
          dbTransaction,
          taskEither.map(({ owner }) => ({ db, dbTransaction, owner }))
        )
      )
    ),
    pipe(
      () =>
        new Promise<Either<never, DbWorkerInputInit>>((resolve) => {
          addEventListener(
            "message",
            ({ data }: MessageEvent<DbWorkerInputInit>) =>
              resolve(either.right(data)),
            { once: true }
          );
        })
    )
  )()
  .then(
    either.match(onError, ([envs, { config, syncPort }]) => {
      setConfig(config);

      const postSyncWorkerInput: PostSyncWorkerInputEnv["postSyncWorkerInput"] =
        (message) => () => syncPort.postMessage(message);

      const queriesRowsCache = new IORef<QueriesRowsCache>({});

      const stream = createWritableStream({
        ...envs,
        postDbWorkerOutput,
        postSyncWorkerInput,
        queriesRowsCache,
        locks: navigator.locks,
      });

      const writeToStream = (chunk: DbWorkerInput): void => {
        const w = stream.getWriter();
        w.write(chunk);
        w.releaseLock();
      };

      addEventListener("message", (e: MessageEvent<DbWorkerInput>) =>
        writeToStream(e.data)
      );

      // eslint-disable-next-line functional/immutable-data
      syncPort.onmessage = ({ data }: MessageEvent<SyncWorkerOutput>): void =>
        pipe(
          data,
          either.match(onError, (props) => {
            writeToStream({ type: "receive", ...props });
          })
        );

      postDbWorkerOutput({ type: "onInit", owner: envs.owner })();
    })
  );
