import {
  createConsole,
  createLocalAuth,
  createRandomBytes,
  CreateSqliteDriverDep,
  LocalAuth,
  ReloadAppDep,
  SecureStorage,
} from "@evolu/common";
import {
  // createDbWorkerForPlatform,
  EvoluDeps,
} from "@evolu/common/local-first";

const _console = createConsole();
const randomBytes = createRandomBytes();

export const createSharedEvoluDeps = (
  _deps: CreateSqliteDriverDep & ReloadAppDep,
): EvoluDeps => {
  throw new Error("todo");
};

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

export const createSharedLocalAuth = (
  secureStorage: SecureStorage,
): LocalAuth =>
  createLocalAuth({
    randomBytes,
    secureStorage,
  });
