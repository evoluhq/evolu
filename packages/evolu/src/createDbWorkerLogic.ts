import { either, io, ioRef, readerTaskEither, taskEither } from "fp-ts";
import { IO } from "fp-ts/IO";
import { constVoid, flow, pipe } from "fp-ts/lib/function.js";
import { TaskEither } from "fp-ts/TaskEither";
import { createOwnerEnv } from "./createOwnerEnv.js";
import { createSyncWorker } from "./createSyncWorker.js";
import { query } from "./query.js";
import { receive } from "./receive.js";
import { resetOwner } from "./resetOwner.js";
import { restoreOwner } from "./restoreOwner.js";
import { send } from "./send.js";
import { sync } from "./sync.js";
import { transaction } from "./transaction.js";
import {
  ConfigEnv,
  CreateDbWorker,
  DbEnv,
  DbWorkerEnvs,
  DbWorkerInput,
  EvoluError,
  Millis,
  OwnerEnv,
  PostDbWorkerInput,
  PostDbWorkerOutputEnv,
  SyncWorkerOutput,
  UnknownError,
} from "./types.js";
import { updateDbSchema } from "./updateDbSchema.js";

export const createDbWorkerLogic =
  (createDbEnv: TaskEither<UnknownError, DbEnv>): CreateDbWorker =>
  (onMessage) => {
    let skipAllBecauseBrowserIsGoingToBeReloaded = false;

    const postDbWorkerOutput: PostDbWorkerOutputEnv["postDbWorkerOutput"] =
      (output) => () => {
        if (output.type === "onResetOrRestore")
          skipAllBecauseBrowserIsGoingToBeReloaded = true;
        onMessage(output)();
      };

    const handleError = (error: EvoluError["error"]): void => {
      postDbWorkerOutput({ type: "onError", error })();
    };

    const syncWorker = createSyncWorker();

    const createEnvs =
      (envs: DbEnv & OwnerEnv & ConfigEnv): IO<DbWorkerEnvs> =>
      () => ({
        ...envs,
        postSyncWorkerInput: (message) => () => syncWorker.postMessage(message),
        now: () => Date.now() as Millis,
        rowsCache: new ioRef.IORef(Object.create(null)),
        postDbWorkerOutput,
        locks: navigator.locks,
      });

    const createWritableStream =
      (envs: DbWorkerEnvs): IO<WritableStream<DbWorkerInput>> =>
      () =>
        new WritableStream({
          write: flow(
            (input) => {
              if (skipAllBecauseBrowserIsGoingToBeReloaded)
                return readerTaskEither.right(undefined);
              switch (input.type) {
                case "init":
                  throw new Error("init must be called once");
                case "updateDbSchema":
                  return updateDbSchema(input);
                case "send":
                  return send(input);
                case "query":
                  return query(input);
                case "receive":
                  return receive(input);
                case "sync":
                  return sync(input.queries);
                case "resetOwner":
                  return resetOwner;
                case "restoreOwner":
                  return restoreOwner(input.mnemonic);
              }
            },
            (rte) =>
              pipe(rte(envs), transaction(envs.db))().then(
                either.match(handleError, constVoid)
              )
          ),
        });

    const createPostDbWorkerInput = (
      dbOwnerConfigEnvs: DbEnv & OwnerEnv & ConfigEnv
    ): IO<PostDbWorkerInput> =>
      pipe(
        createEnvs(dbOwnerConfigEnvs),
        io.chain(createWritableStream),
        io.map((stream) => (dbWorkerInput) => () => {
          const w = stream.getWriter();
          w.write(dbWorkerInput);
          w.releaseLock();
        })
      );

    const dbAndOwnerEnvs = pipe(
      createDbEnv,
      taskEither.chain((dbEnv) =>
        pipe(
          createOwnerEnv()(dbEnv),
          transaction(dbEnv.db),
          taskEither.map((ownerEnv) => ({ ...dbEnv, ...ownerEnv }))
        )
      )
    )();

    let postDbWorkerInput: PostDbWorkerInput | null = null;

    const post: PostDbWorkerInput = (input) => () => {
      dbAndOwnerEnvs.then(
        either.match(handleError, (dbAndOwnerEnvs) => {
          if (!postDbWorkerInput) {
            if (input.type !== "init")
              throw new Error("init must be called once");
            postDbWorkerInput = createPostDbWorkerInput({
              ...dbAndOwnerEnvs,
              config: input.config,
            })();

            postDbWorkerOutput({
              type: "onOwner",
              owner: dbAndOwnerEnvs.owner,
            })();

            syncWorker.onmessage = flow(
              (e: MessageEvent<SyncWorkerOutput>) => e.data,
              either.map(postDbWorkerInput),
              either.match(handleError, (io) => io())
            );

            postDbWorkerInput({
              type: "updateDbSchema",
              tableDefinitions: input.tableDefinitions,
            })();

            return;
          }

          postDbWorkerInput(input)();
        })
      );
    };

    return { post };
  };
