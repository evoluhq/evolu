import {
  assertNonNullable,
  createConsole,
  createConsoleStoreOutput,
  createBroadcastChannel,
  createMessageChannel,
  createMessagePort,
  createRandomBytes,
  createSharedWorker,
  createUnknownError,
  createWebSocket,
  createWorker,
  defectToError,
  waitForAbort,
  type ConsoleDep,
  type CreateSqliteDriverDep,
  type MessagePort,
  type ReloadAppDep,
  type SharedWorkerSelf,
  type XChaCha20Poly1305Dep,
} from "@evolu/common";
import type {
  ConsoleEntryOrError,
  CreateDbWorker,
  DbWorker,
  DbWorkerInit,
  EvoluDeps,
  SharedWorker,
  SharedWorkerInput,
  SharedWorkerOutput,
  WaitForDatabaseReleaseDep,
} from "@evolu/common/local-first";
import {
  consoleEntryOrErrorBroadcastChannelName,
  createEvoluDeps as createCommonEvoluDeps,
  initSharedWorker,
  startDbWorker,
} from "@evolu/common/local-first";
import { lockManager } from "./LockManager.ts";
import { createRun } from "./Task.ts";

/**
 * The in-process SharedWorker, one per JS runtime as a web SharedWorker is one
 * per build per origin. It holds the build lock until it panics, so deps
 * created again, for example after Fast Refresh, connect to it instead of
 * starting a worker that would wait for that lock forever.
 */
let sharedWorkerSelf: SharedWorkerSelf<
  SharedWorkerInput,
  SharedWorkerOutput
> | null = null;

/**
 * Creates Evolu dependencies for React Native from the platform's, which
 * `createEvoluDeps.ts` passes. It imports nothing native, so Node.js runs it
 * too.
 */
export const createEvoluDeps = (
  deps: CreateSqliteDriverDep &
    ReloadAppDep &
    Partial<ConsoleDep> &
    Partial<WaitForDatabaseReleaseDep> &
    Partial<XChaCha20Poly1305Dep>,
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
      // Databases are files the app owns.
      getDevicePersistence: () => Promise.resolve("Persisted" as const),
      lockManager,
      randomBytes: createRandomBytes(),
      ...(deps.waitForDatabaseRelease && {
        waitForDatabaseRelease: deps.waitForDatabaseRelease,
      }),
      ...(deps.xChaCha20Poly1305 && {
        xChaCha20Poly1305: deps.xChaCha20Poly1305,
      }),
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
        // Every tab connects through this, so a panicked worker can dispose
        // its tabs' ports and drop their later messages, as a closed web
        // SharedWorker does, instead of handling them on its disposed Run.
        const tabPorts = new Set<
          MessagePort<SharedWorkerOutput, SharedWorkerInput>
        >();
        const workerSelf: SharedWorkerSelf<
          SharedWorkerInput,
          SharedWorkerOutput
        > = {
          onConnect: null,
          [Symbol.dispose]: () => {
            self[Symbol.dispose]();
          },
        };
        self.onConnect = (port) => {
          tabPorts.add(port);
          assertNonNullable(workerSelf.onConnect);
          workerSelf.onConnect(port);
        };
        sharedWorkerSelf = self;
        const sharedWorkerRun = createWorkerRun();
        void sharedWorkerRun(async (run) => {
          // After a panic, deps created again start another worker, which
          // waits for this one's build lock. Each tab sets the panic's defect
          // as its evoluError, as on the web.
          using _onAbort = run.onAbort((abortError) => {
            sharedWorkerSelf = null;
            for (const port of tabPorts) port[Symbol.dispose]();
            using errors = createBroadcastChannel<ConsoleEntryOrError>(
              consoleEntryOrErrorBroadcastChannelName,
            );
            errors.postMessage({
              type: "Error",
              error: createUnknownError(defectToError(abortError)),
            });
          });
          await using _ = await run.ok(initSharedWorker(workerSelf));
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
