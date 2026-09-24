import {
  assertNonNullable,
  createConsole,
  createConsoleStoreOutput,
  createBroadcastChannel,
  createMessageChannel,
  createMessagePort,
  createRandomBytes,
  createRun,
  createSharedWorker,
  createWebSocket,
  createWorker,
  waitForAbort,
  type ConsoleDep,
  type CreateSqliteDriverDep,
  type ReloadAppDep,
  type SharedWorkerSelf,
} from "@evolu/common";
import type {
  CreateDbWorker,
  DbWorker,
  DbWorkerInit,
  EvoluDeps,
  SharedWorker,
  SharedWorkerInput,
  SharedWorkerOutput,
} from "@evolu/common/local-first";
import {
  createEvoluDeps as createCommonEvoluDeps,
  initSharedWorker,
  startDbWorker,
} from "@evolu/common/local-first";
import { lockManager } from "./LockManager.ts";

/**
 * The in-process SharedWorker, one per JS runtime as a web SharedWorker is one
 * per build per origin. It holds the build lock for the app's lifetime, so deps
 * created again, for example after Fast Refresh, connect to it instead of
 * starting a worker that would wait for that lock forever.
 */
let sharedWorkerSelf: SharedWorkerSelf<
  SharedWorkerInput,
  SharedWorkerOutput
> | null = null;

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
      createBroadcastChannel,
      createMessageChannel,
      createMessagePort,
      createWebSocket,
      createSqliteDriver: deps.createSqliteDriver,
      lockManager,
      randomBytes: createRandomBytes(),
    });
  };

  const createDbWorker: CreateDbWorker = (): DbWorker =>
    createWorker<DbWorkerInit>((self) => {
      const dbWorkerRun = createWorkerRun();
      void dbWorkerRun(startDbWorker(self));
    });

  let sharedWorker: SharedWorker;
  if (sharedWorkerSelf) {
    const channel = createMessageChannel<
      SharedWorkerInput,
      SharedWorkerOutput
    >();
    assertNonNullable(sharedWorkerSelf.onConnect);
    sharedWorkerSelf.onConnect(channel.port2);
    sharedWorker = {
      port: channel.port1,
      [Symbol.dispose]: () => {
        channel[Symbol.dispose]();
      },
    };
  } else {
    sharedWorker = createSharedWorker<SharedWorkerInput, SharedWorkerOutput>(
      (self) => {
        sharedWorkerSelf = self;
        const sharedWorkerRun = createWorkerRun();
        void sharedWorkerRun(async (run) => {
          await using _ = await run.ok(initSharedWorker(self));
          return await run(waitForAbort);
        });
      },
    );
  }

  return createCommonEvoluDeps({
    ...deps,
    createDbWorker,
    createBroadcastChannel,
    createMessageChannel,
    lockManager,
    reloadApp: deps.reloadApp,
    sharedWorker,
  });
};
