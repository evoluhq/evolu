/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope | SharedWorkerGlobalScope;

import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();

import { createWebSocket, ok, waitForAbort } from "@evolu/common";
import type {
  SharedWorkerInput,
  SharedWorkerOutput,
} from "@evolu/common/local-first";
import { initSharedWorker } from "@evolu/common/local-first";
import type { SharedWorkerUnsupported } from "./Evolu.ts";
import { createRun } from "../Task.ts";
import {
  createOneTabSharedWorkerSelfPolyfill,
  createSharedWorkerSelf,
  createWorkerDeps,
} from "../Worker.ts";

const run = createRun({
  ...createWorkerDeps(),
  createWebSocket,
  lockManager: globalThis.navigator.locks,
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

      await using _ = await run.ok(initSharedWorker(workerSelf));
      await run(waitForAbort);
    },
  );

  return ok();
});
