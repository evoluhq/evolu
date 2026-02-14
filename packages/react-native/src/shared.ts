import {
  createConsoleStoreOutput,
  createLocalAuth,
  createRandomBytes,
  createRun,
  type ConsoleDep,
  type LocalAuth,
  type ReloadAppDep,
  type SecureStorage,
} from "@evolu/common";
import type {
  CreateDbWorker,
  DbWorker,
  DbWorkerInput,
  EvoluDeps,
  SharedWorkerInput,
} from "@evolu/common/local-first";
import {
  createEvoluDeps as createCommonEvoluDeps,
  initDbWorker,
  initSharedWorker,
} from "@evolu/common/local-first";
import { leaderLock } from "./Platform.js";
import {
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
  createWorker,
} from "./Worker.js";

const randomBytes = createRandomBytes();

/** Creates Evolu dependencies for React Native. */
export const createEvoluDeps = (
  deps: ReloadAppDep & Partial<ConsoleDep>,
): EvoluDeps => {
  const consoleStoreOutput = createConsoleStoreOutput();

  // Worker-side Run lives as long as the app. When RN supports real workers,
  // this moves to the worker entry point (like web's Worker.worker.ts).
  const workerRun = createRun({
    consoleStoreOutputEntry: consoleStoreOutput.entry,
    createMessagePort,
    leaderLock,
  });

  const createDbWorker: CreateDbWorker = (): DbWorker =>
    createWorker<DbWorkerInput, never>((self) => {
      workerRun(initDbWorker(self));
    });

  const sharedWorker = createSharedWorker<SharedWorkerInput, never>((self) => {
    workerRun(initSharedWorker(self));
  });

  return createCommonEvoluDeps({
    ...deps,
    createDbWorker,
    createMessageChannel,
    reloadApp: deps.reloadApp,
    sharedWorker,
  });
};

export const createSharedLocalAuth = (
  secureStorage: SecureStorage,
): LocalAuth =>
  createLocalAuth({
    randomBytes,
    secureStorage,
  });

// import {
//   createConsole,
//   createLocalAuth,
//   createRandomBytes,
//   type CreateSqliteDriverDep,
//   type LocalAuth,
//   type ReloadAppDep,
//   type SecureStorage,
// } from "@evolu/common";
// import type {
//   // createDbWorkerForPlatform,
//   // createDbWorkerForPlatform,
//   EvoluDeps,
// } from "@evolu/common/local-first";
//
// const _console = createConsole();
// const randomBytes = createRandomBytes();
//
// export const createSharedEvoluDeps = (
//   _deps: CreateSqliteDriverDep & ReloadAppDep,
// ): EvoluDeps => {
//   throw new Error("todo");
// };
//
//   ({
//   ...deps,
//   console,
//   sharedWorker: "TODO" as never,
//   // createDbWorker: () =>
//   //   createDbWorkerForPlatform({
//   //     ...deps,
//   //     console,
//   //     createWebSocket,
//   //     random: createRandom(),
//   //     randomBytes,
//   //     time: createTime(),
//   //   }),
//   randomBytes,
// });
