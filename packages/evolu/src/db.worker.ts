import { apply, either, taskEither } from "fp-ts";
import { IORef } from "fp-ts/IORef";
import { constVoid, flow, pipe } from "fp-ts/lib/function.js";
import { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import { Task } from "fp-ts/Task";
import { TaskEither } from "fp-ts/TaskEither";
import "nested-worker/worker";
import { initDb } from "./initDb.js";
import { initDbModel } from "./initDbModel.js";
import { query } from "./query.js";
import { receive } from "./receive.js";
import { resetOwner } from "./resetOwner.js";
import { restoreOwner } from "./restoreOwner.js";
import { send } from "./send.js";
import { sync } from "./sync.js";
import {
  ConfigEnv,
  createTimeEnv,
  DbEnv,
  DbTransactionEnv,
  DbWorkerInput,
  DbWorkerInputInit,
  EvoluError,
  LockManagerEnv,
  OwnerEnv,
  PostDbWorkerOutputEnv,
  PostSyncWorkerInputEnv,
  QueriesRowsCache,
  QueriesRowsCacheEnv,
  SQLiteError,
  SyncWorkerOutput,
  TimeEnv,
  UnknownError,
} from "./types.js";
import { updateDbSchema } from "./updateDbSchema.js";

const postDbWorkerOutput: PostDbWorkerOutputEnv["postDbWorkerOutput"] =
  (message) => () =>
    postMessage(message);

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
}: Envs & DbTransactionEnv & ConfigEnv): WritableStream<DbWorkerInput> =>
  new WritableStream({
    write: flow(
      (
        data
      ): ReaderTaskEither<
        Envs & TimeEnv & ConfigEnv,
        EvoluError["error"],
        void
      > => {
        switch (data.type) {
          case "updateDbSchema":
            return updateDbSchema(data);
          case "send":
            return send(data);
          case "query":
            return query(data);
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

const createDbEnvs: TaskEither<
  UnknownError | SQLiteError,
  DbEnv & DbTransactionEnv & OwnerEnv
> = pipe(
  initDb,
  taskEither.chainW(({ db, dbTransaction }) =>
    pipe(
      initDbModel()({ db }),
      dbTransaction,
      taskEither.map(({ owner }) => ({ db, dbTransaction, owner }))
    )
  )
);

const createConfigEnv: Task<ConfigEnv> = pipe(
  () =>
    new Promise<ConfigEnv>((resolve) => {
      addEventListener(
        "message",
        ({ data }: MessageEvent<DbWorkerInputInit>) => resolve(data),
        { once: true }
      );
    })
);

apply
  .sequenceT(taskEither.ApplyPar)(
    createDbEnvs,
    taskEither.fromTask(createConfigEnv)
  )()
  .then(
    either.match(onError, ([dbEnvs, configEnv]) => {
      const syncWorker = new Worker(
        new URL("./sync.worker.js", import.meta.url)
      );

      const postSyncWorkerInput: PostSyncWorkerInputEnv["postSyncWorkerInput"] =
        (message) => () => syncWorker.postMessage(message);

      const queriesRowsCache = new IORef<QueriesRowsCache>({});

      const stream = createWritableStream({
        ...dbEnvs,
        ...configEnv,
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

      syncWorker.onmessage = ({ data }: MessageEvent<SyncWorkerOutput>): void =>
        pipe(
          data,
          either.match(onError, (props) => {
            writeToStream({ type: "receive", ...props });
          })
        );

      postDbWorkerOutput({ type: "onInit", owner: dbEnvs.owner })();
    })
  );
