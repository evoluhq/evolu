/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope | SharedWorkerGlobalScope;

import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();

import {
  createUnknownError,
  createWebSocket,
  ok,
  tryAsync,
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
  // Safari's Private Browsing offers no OPFS; see Storage in the Shared module.
  isPersistentStorageAvailable: async () =>
    (await tryAsync(() => navigator.storage.getDirectory())).ok,
  lockManager: navigator.locks,
});

void run(async (run) => {
  if ("onconnect" in self) {
    await using _ = await run.ok(
      initSharedWorker(createSharedWorkerSelf(self)),
    );
    return await run(waitForAbort);
  }

  using workerSelf = createOneTabSharedWorkerSelfPolyfill<
    SharedWorkerInput,
    SharedWorkerOutput
  >(self);

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
