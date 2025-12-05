import {
  createConsole,
  createLocalAuth,
  createRandom,
  createRandomBytes,
  CreateSqliteDriverDep,
  createTime,
  createWebSocket,
  LocalAuth,
  ReloadAppDep,
  SecureStorage,
} from "@evolu/common";
import {
  createDbWorkerForPlatform,
  EvoluDeps,
} from "@evolu/common/local-first";

const console = createConsole();
const randomBytes = createRandomBytes();

export const createSharedEvoluDeps = (
  deps: CreateSqliteDriverDep & ReloadAppDep,
): EvoluDeps => ({
  ...deps,
  console,
  createDbWorker: () =>
    createDbWorkerForPlatform({
      ...deps,
      console,
      createWebSocket,
      random: createRandom(),
      randomBytes,
      time: createTime(),
    }),
  randomBytes,
});

export const createSharedLocalAuth = (
  secureStorage: SecureStorage,
): LocalAuth =>
  createLocalAuth({
    randomBytes,
    secureStorage,
  });
