import {
  createConsole,
  createLocalAuth,
  createRandom,
  createRandomBytes,
  CreateSqliteDriverDep,
  createTime,
  createWebSocket,
  LocalAuth,
  SecureStorage,
} from "@evolu/common";
import {
  createDbWorkerForPlatform,
  EvoluDeps,
  ReloadAppDep,
} from "@evolu/common/local-first";

const console = createConsole();
const randomBytes = createRandomBytes();
const time = createTime();

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
      time,
    }),
  randomBytes,
  time,
});

export const createSharedLocalAuth = (
  secureStorage: SecureStorage,
): LocalAuth =>
  createLocalAuth({
    randomBytes,
    secureStorage,
  });
