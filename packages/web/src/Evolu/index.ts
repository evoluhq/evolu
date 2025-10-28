import {
  createConsole,
  createLocalAuth,
  createRandomBytes,
  createSymmetricCrypto,
  createTime,
} from "@evolu/common";
import {
  CreateDbWorker,
  DbWorkerInput,
  DbWorkerOutput,
  EvoluDeps,
} from "@evolu/common/evolu";
import { createSharedWebWorker } from "../SharedWebWorker.js";
import { createWebAuthnStore } from "./LocalAuth.js";
import { reloadApp } from "./Platform.js";

const randomBytes = createRandomBytes();
const symmetricCrypto = createSymmetricCrypto({ randomBytes });

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
  localAuth: createLocalAuth({
    randomBytes,
    secureStorage: createWebAuthnStore({ randomBytes, symmetricCrypto }),
  }),
  reloadApp,
  time: createTime(),
};
