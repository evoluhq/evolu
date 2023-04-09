import { createDbWorkerLogic } from "./createDbWorkerLogic.js";
import { createWebDbEnv } from "./createWebDbEnv.js";
import { CreateDbWorker } from "./types.js";

export const createLocalStorageDbWorker: CreateDbWorker = createDbWorkerLogic(
  createWebDbEnv("localStorage")
);
