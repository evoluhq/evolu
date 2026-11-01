/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope | SharedWorkerGlobalScope;

import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();

import {
  createUnknownError,
  createWebSocket,
  ok,
  waitForAbort,
} from "@evolu/common";
import type {
  ConsoleEntryOrError,
  SharedWorkerInput,
  SharedWorkerOutput,
} from "@evolu/common/local-first";
import {
  consoleEntryOrErrorBroadcastChannelName,
  initSharedWorker,
} from "@evolu/common/local-first";
import type { SharedWorkerUnsupported } from "./Evolu.ts";
import { createRun } from "../Task.ts";
import {
  addUncaughtErrorListener,
  createBroadcastChannel,
  createOneTabSharedWorkerSelfPolyfill,
  createSharedWorkerSelf,
  createWorkerDeps,
} from "../Worker.ts";

const errors = createBroadcastChannel<ConsoleEntryOrError>(
  consoleEntryOrErrorBroadcastChannelName,
);
// Each tab logs an uncaught error, including a Run defect, and sets it as its
// evoluError.
addUncaughtErrorListener(self, (error) => {
  errors.postMessage({ type: "Error", error: createUnknownError(error) });
});

const run = createRun({
  ...createWorkerDeps(),
  createWebSocket,
  lockManager: navigator.locks,
});

void run(async (run) => {
  if ("onconnect" in self) {
    using workerSelf = createSharedWorkerSelf<
      SharedWorkerInput,
      SharedWorkerOutput
    >(self);
    // A panic closes the worker right away, so it drops later messages instead
    // of handling them on its disposed Run during cleanup, and tabs that
    // connect later start another worker. Its DbWorkers stop once the closed
    // worker's leader lock is released.
    using _closeOnPanic = run.onAbort(() => {
      workerSelf[Symbol.dispose]();
    });
    await using _ = await run.ok(initSharedWorker(workerSelf));
    return await run(waitForAbort);
  }

  using workerSelf = createOneTabSharedWorkerSelfPolyfill<
    SharedWorkerInput,
    SharedWorkerOutput
  >(self);
  // Like the native SharedWorker above.
  using _closeOnPanic = run.onAbort(() => {
    workerSelf[Symbol.dispose]();
  });

  await navigator.locks.request(
    "evolu-one-tab-sharedworker-polyfill",
    { ifAvailable: true, mode: "exclusive" },
    async (lock) => {
      if (!lock) {
        const message: SharedWorkerUnsupported = {
          type: "SharedWorkerUnsupported",
        };
        self.postMessage(message);
        return;
      }

      await using _ = await run.ok(initSharedWorker(workerSelf));
      await run(waitForAbort);
    },
  );

  return ok();
});
