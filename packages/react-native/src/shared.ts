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

const console = createConsole();
const randomBytes = createRandomBytes();

export const createSharedEvoluDeps = (
  deps: CreateSqliteDriverDep & ReloadAppDep,
): EvoluDeps => ({
  ...deps,
  console,
  sharedWorker: "TODO" as never,
  // createDbWorker: () =>
  //   createDbWorkerForPlatform({
  //     ...deps,
  //     console,
  //     createWebSocket,
  //     random: createRandom(),
  //     randomBytes,
  //     time: createTime(),
  //   }),
  randomBytes,
});

export const createSharedLocalAuth = (
  secureStorage: SecureStorage,
): LocalAuth =>
  createLocalAuth({
    randomBytes,
    secureStorage,
  });
