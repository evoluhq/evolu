import { createConsole, createNanoIdLib, createTime } from "@evolu/common";
import {
  CreateDbWorker,
  DbWorkerInput,
  DbWorkerOutput,
  EvoluDeps,
} from "@evolu/common/evolu";
import { createWebScheduler } from "../Scheduler.js";
import { createSharedWebWorker } from "../SharedWebWorker.js";
import { reloadApp } from "./Platform.js";

const createDbWorker: CreateDbWorker = (name) =>
  createSharedWebWorker<DbWorkerInput, DbWorkerOutput>(
    name,
    () =>
      new Worker(new URL("Db.worker.js", import.meta.url), {
        type: "module",
      }),
  );

export const evoluWebDeps: EvoluDeps = {
  console: createConsole(),
  createDbWorker,
  nanoIdLib: createNanoIdLib(),
  reloadApp,
  scheduler: createWebScheduler(),
  time: createTime(),
};
