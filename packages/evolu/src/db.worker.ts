import { apply, either, readerTaskEither, taskEither } from "fp-ts";
import { IORef } from "fp-ts/IORef";
import { constVoid, flow, pipe } from "fp-ts/lib/function.js";
import { Task } from "fp-ts/Task";
import { TaskEither } from "fp-ts/TaskEither";
import { createDbEnv } from "./createDbEnv.js";
import { createOwnerEnv } from "./createOwnerEnv.js";
import { query } from "./query.js";
import { receive } from "./receive.js";
import { resetOwner } from "./resetOwner.js";
import { restoreOwner } from "./restoreOwner.js";
import { send } from "./send.js";
import { sync } from "./sync.js";
import {
  ConfigEnv,
  Database,
  DbEnv,
  DbWorkerInput,
  DbWorkerInit,
  EvoluError,
  LockManagerEnv,
  Millis,
  OwnerEnv,
  PostDbWorkerOutputEnv,
  PostSyncWorkerInputEnv,
  QueriesRowsCacheEnv,
  SyncWorkerOutput,
  TimeEnv,
  UnknownError,
} from "./types.js";
import { updateDbSchema } from "./updateDbSchema.js";

let skipAllBecauseBrowserIsGoingToBeReloaded = false;

const transaction =
  (db: Database) =>
  <E, A>(te: TaskEither<E, A>): TaskEither<E | UnknownError, A> =>
    pipe(
      db.exec("begin"),
      taskEither.chainW(() => te),
      taskEither.chainFirstW(() => db.exec("commit")),
      taskEither.orElse((originalError) =>
        pipe(
          db.exec("rollback"),
          taskEither.chain(() => taskEither.left(originalError))
        )
      )
    );

const postDbWorkerOutput: PostDbWorkerOutputEnv["postDbWorkerOutput"] =
  (message) => () => {
    if (message.type === "reloadAllTabs")
      skipAllBecauseBrowserIsGoingToBeReloaded = true;
    postMessage(message);
  };

const onError: (error: EvoluError["error"]) => void = (error) =>
  postDbWorkerOutput({ type: "onError", error })();

const createEnqueueDbWorkerInput = (
  envs: DbEnv &
    OwnerEnv &
    PostDbWorkerOutputEnv &
    QueriesRowsCacheEnv &
    PostSyncWorkerInputEnv &
    LockManagerEnv &
    TimeEnv &
    ConfigEnv
): ((dbWorkerInput: DbWorkerInput) => void) => {
  const stream = new WritableStream<DbWorkerInput>({
    write: flow(
      (data) => {
        if (skipAllBecauseBrowserIsGoingToBeReloaded)
          return readerTaskEither.right(undefined);
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
      (rte) =>
        pipe(rte(envs), transaction(envs.db))().then(
          either.match(onError, constVoid)
        )
    ),
  });

  return (dbWorkerInput) => {
    const w = stream.getWriter();
    w.write(dbWorkerInput);
    w.releaseLock();
  };
};

const createDbAndOwnerEnvs: TaskEither<UnknownError, DbEnv & OwnerEnv> = pipe(
  createDbEnv,
  taskEither.chainW((dbEnv) =>
    pipe(
      createOwnerEnv()(dbEnv),
      taskEither.map((ownerEnv) => ({ ...dbEnv, ...ownerEnv }))
    )
  )
);

const createConfigEnv: Task<ConfigEnv> = pipe(
  () =>
    new Promise<ConfigEnv>((resolve) => {
      addEventListener(
        "message",
        ({ data }: MessageEvent<DbWorkerInit>) => resolve(data),
        { once: true }
      );
    })
);

apply
  .sequenceT(taskEither.ApplyPar)(
    createDbAndOwnerEnvs,
    taskEither.fromTask(createConfigEnv)
  )()
  .then(
    either.match(onError, ([dbAndOwnerEnvs, configEnv]) => {
      const syncWorker = new Worker(
        new URL("./sync.worker.js", import.meta.url)
      );

      const enqueueDbWorkerInput = createEnqueueDbWorkerInput({
        ...dbAndOwnerEnvs,
        ...configEnv,
        postSyncWorkerInput: (message) => (): void =>
          syncWorker.postMessage(message),
        now: () => Date.now() as Millis,
        queriesRowsCache: new IORef({}),
        postDbWorkerOutput,
        locks: navigator.locks,
      });

      addEventListener("message", (e: MessageEvent<DbWorkerInput>) =>
        enqueueDbWorkerInput(e.data)
      );

      syncWorker.onmessage = ({ data }: MessageEvent<SyncWorkerOutput>): void =>
        pipe(
          data,
          either.match(onError, (props) => {
            enqueueDbWorkerInput({ type: "receive", ...props });
          })
        );

      postDbWorkerOutput({ type: "onInit", owner: dbAndOwnerEnvs.owner })();
    })
  );
