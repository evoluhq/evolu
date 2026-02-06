import {
  createLocalAuth,
  createRandomBytes,
  type LocalAuth,
  type ReloadAppDep,
  type SecureStorage,
} from "@evolu/common";
import type { EvoluDeps } from "@evolu/common/local-first";
import { createEvoluDeps as createCommonEvoluDeps } from "@evolu/common/local-first";

const randomBytes = createRandomBytes();

/** Creates Evolu dependencies for React Native. */
export const createEvoluDeps = (deps: ReloadAppDep): EvoluDeps =>
  createCommonEvoluDeps(deps);

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
