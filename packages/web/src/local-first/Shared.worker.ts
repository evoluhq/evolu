/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope | SharedWorkerGlobalScope;

import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();

import { createWebSocket, ok } from "@evolu/common";
import type {
  SharedWorkerInput,
  SharedWorkerOutput,
} from "@evolu/common/local-first";
import { initSharedWorker } from "@evolu/common/local-first";
import type { SharedWorkerUnsupported } from "./Evolu.js";
import { createRun } from "../Task.js";
import {
  createOneTabSharedWorkerSelfPolyfill,
  createSharedWorkerSelf,
  createWorkerDeps,
} from "../Worker.js";

// No disposal (`await using`) is needed — a SharedWorker lives forever.
const run = createRun({
  ...createWorkerDeps(),
  createWebSocket,
  lockManager: globalThis.navigator.locks,
});

void run(async (run) => {
  if ("onconnect" in self) {
    void run(initSharedWorker(createSharedWorkerSelf(self)));
    return ok();
  }

  using workerSelf = createOneTabSharedWorkerSelfPolyfill<
    SharedWorkerInput,
    SharedWorkerOutput
  >(self);

  await globalThis.navigator.locks.request(
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

      void run(initSharedWorker(workerSelf));

      await Promise.withResolvers<never>().promise;
    },
  );

  return ok();
});
