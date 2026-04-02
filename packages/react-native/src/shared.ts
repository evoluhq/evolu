import {
  createConsole,
  createConsoleStoreOutput,
  createInMemoryLeaderLock,
  createRandomBytes,
  createRun,
  createWebSocket,
  type ConsoleDep,
  type CreateSqliteDriverDep,
  type ReloadAppDep,
} from "@evolu/common";
import type {
  CreateDbWorker,
  DbWorker,
  DbWorkerInit,
  EvoluDeps,
  SharedWorkerInput,
} from "@evolu/common/local-first";
import {
  createEvoluDeps as createCommonEvoluDeps,
  startDbWorker,
  initSharedWorker,
} from "@evolu/common/local-first";
import {
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
  createWorker,
} from "./Worker.js";

const leaderLock = createInMemoryLeaderLock();

/** Creates Evolu dependencies for React Native. */
export const createEvoluDeps = (
  deps: ReloadAppDep & CreateSqliteDriverDep & Partial<ConsoleDep>,
): EvoluDeps => {
  // Worker-side Run lives as long as the app. When RN supports real workers,
  // this moves to the worker entry point (like web's Worker.worker.ts).
  const createWorkerRun = () => {
    const consoleStoreOutput = createConsoleStoreOutput();
    const workerConsole = createConsole({
      output: consoleStoreOutput,
      ...(deps.console && { level: deps.console.getLevel() }),
    });

    return createRun({
      console: workerConsole,
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createMessagePort,
      createWebSocket,
      createSqliteDriver: deps.createSqliteDriver,
      leaderLock,
      randomBytes: createRandomBytes(),
    });
  };

  const createDbWorker: CreateDbWorker = (): DbWorker =>
    createWorker<DbWorkerInit, never>((self) => {
      const dbWorkerRun = createWorkerRun();
      dbWorkerRun(startDbWorker(self));
    });

  const sharedWorker = createSharedWorker<SharedWorkerInput, never>((self) => {
    const sharedWorkerRun = createWorkerRun();
    sharedWorkerRun(initSharedWorker(self));
  });

  return createCommonEvoluDeps({
    ...deps,
    createDbWorker,
    createMessageChannel,
    reloadApp: deps.reloadApp,
    sharedWorker,
  });
};

// TODO: Reimplement local auth for React Native from scratch.
// export const createSharedLocalAuth = (
//   secureStorage: SecureStorage,
// ): LocalAuth =>
//   createLocalAuth({
//     randomBytes,
//     secureStorage,
//   });

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
