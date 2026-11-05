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

// An unnamed dedicated worker is the one-tab SharedWorker polyfill for stored
// databases. Only this exact static name selects an instance-owned worker.
const isMemoryInstance =
  !("onconnect" in self) && self.name === "evolu-memory-instance";
const errors = isMemoryInstance
  ? null
  : createBroadcastChannel<ConsoleEntryOrError>(
      consoleEntryOrErrorBroadcastChannelName,
    );
// A stored worker broadcasts an uncaught error, including a Run defect, on the
// global channel, which a tab listens to once its own stored worker starts,
// after its storage check. Each such tab logs the error and sets it as its
// evoluError. A memory worker posts it on its own
// port, so only its instance's tab reports it.
addUncaughtErrorListener(self, (error) => {
  const unknownError = createUnknownError(error);
  if (errors) errors.postMessage({ type: "Error", error: unknownError });
  else
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "Error",
      error: unknownError,
    } satisfies SharedWorkerOutput);
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

  if (isMemoryInstance) {
    // Private workers coexist with the stored one-tab polyfill and every
    // build: neither origin-wide lock protects a database they can share.
    await using _ = await run.ok(
      initSharedWorker(workerSelf, { mode: "memory-instance" }),
    );
    return await run(waitForAbort);
  }

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
