import {
  createConsole,
  createLocalAuth,
  createRandomBytes,
} from "@evolu/common";
import {
  CreateDbWorker,
  DbWorkerInput,
  DbWorkerOutput,
  EvoluDeps,
} from "@evolu/common/local-first";
import { createSharedWebWorker } from "../SharedWebWorker.js";
import { createWebAuthnStore } from "./LocalAuth.js";
import { reloadApp } from "../Platform.js";

const randomBytes = createRandomBytes();

const createDbWorker: CreateDbWorker = (name) =>
  createSharedWebWorker<DbWorkerInput, DbWorkerOutput>(
    name,
    () =>
      new Worker(new URL("Db.worker.js", import.meta.url), {
        type: "module",
      }),
  );

// TODO: Factory.
export const localAuth = createLocalAuth({
  randomBytes,
  secureStorage: createWebAuthnStore({ randomBytes }),
});

// TODO: Factory.
export const evoluWebDeps: EvoluDeps = {
  console: createConsole(),
  createDbWorker,
  randomBytes: createRandomBytes(),
  reloadApp,
};
