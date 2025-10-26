import {
  createAuthProvider,
  createConsole,
  createRandomBytes,
  createTime,
} from "@evolu/common";
import {
  CreateDbWorker,
  DbWorkerInput,
  DbWorkerOutput,
  EvoluDeps,
} from "@evolu/common/evolu";
import { createSharedWebWorker } from "../SharedWebWorker.js";
import * as webAuthnStore from "../WebAuthnStore/index.js";
import { reloadApp } from "./Platform.js";

const randomBytes = createRandomBytes();
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
  randomBytes: createRandomBytes(),
  authProvider: createAuthProvider(webAuthnStore, randomBytes),
  reloadApp,
  time: createTime(),
};
