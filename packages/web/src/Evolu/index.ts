import { createConsole, createNanoIdLib, createTime } from "@evolu/common";
import {
  CreateDbWorker,
  DbWorkerInput,
  DbWorkerOutput,
  EvoluDeps,
} from "@evolu/common/evolu";
import { createSharedWebWorker } from "../SharedWebWorker.js";
import { createAppState } from "./AppState.js";

const createDbWorker: CreateDbWorker = (name) =>
  createSharedWebWorker<DbWorkerInput, DbWorkerOutput>(
    name,
    () =>
      new Worker(new URL("Db.worker.js", import.meta.url), {
        type: "module",
      }),
  );

export const evoluWebDeps: EvoluDeps = {
  time: createTime(),
  console: createConsole(),
  nanoIdLib: createNanoIdLib(),
  createAppState,
  createDbWorker,
};
