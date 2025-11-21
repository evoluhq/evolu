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
} from "@evolu/common/local-first";
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

export const localAuth = createLocalAuth({
  randomBytes,
  secureStorage: createWebAuthnStore({ randomBytes, symmetricCrypto }),
});

export const evoluWebDeps: EvoluDeps = {
  console: createConsole(),
  createDbWorker,
  randomBytes: createRandomBytes(),
  reloadApp,
  time: createTime(),
};
