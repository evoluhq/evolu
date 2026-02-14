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
  initSharedWorker,
} from "@evolu/common/local-first";
import {
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
} from "./Worker.js";

const randomBytes = createRandomBytes();

/** Creates Evolu dependencies for React Native. */
export const createEvoluDeps = (
  deps: ReloadAppDep & Partial<ConsoleDep>,
): EvoluDeps => {
  const consoleStoreOutput = createConsoleStoreOutput();

  const createDbWorker: CreateDbWorker = () => {
    const channel = createMessageChannel<DbWorkerInput>();
    const worker: DbWorker = {
      postMessage: channel.port1.postMessage,
      get onMessage() {
        return channel.port1.onMessage;
      },
      set onMessage(value) {
        channel.port1.onMessage = value;
      },
      native: channel.port1.native,
      [Symbol.dispose]: () => {
        channel[Symbol.dispose]();
      },
    };

    return worker;
  };

  // Worker-side Run lives as long as the app. When RN supports real workers,
  // this moves to the worker entry point (like web's Worker.worker.ts).
  const workerRun = createRun({
    consoleStoreOutputEntry: consoleStoreOutput.entry,
    createMessagePort,
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
