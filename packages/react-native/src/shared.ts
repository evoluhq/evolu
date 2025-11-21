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

/**
 * Polyfills `Promise.withResolvers`.
 *
 * @see https://github.com/facebook/hermes/pull/1452
 */
if (typeof Promise.withResolvers === "undefined") {
  // @ts-expect-error This is OK.
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

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
