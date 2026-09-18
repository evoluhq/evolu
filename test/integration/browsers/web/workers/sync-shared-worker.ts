/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { createRun, ok, waitForAbort } from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import { initSharedWorker } from "@evolu/common/local-first";
import {
  createSharedWorkerSelf,
  createWorkerDeps,
} from "../../../../../packages/web/src/Worker.ts";

installPolyfills();

const output = new BroadcastChannel(self.name);
const run = createRun({
  ...createWorkerDeps(),
  lockManager: navigator.locks,
  createWebSocket: (url: string) => () => {
    output.postMessage({ type: "Open", url });
    return ok({
      isOpen: () => true,
      getReadyState: () => "open" as const,
      send: (data: unknown) => {
        output.postMessage({ type: "Send", url, data });
        return ok();
      },
      [Symbol.asyncDispose]: () => Promise.resolve(),
    });
  },
});

void run(async (run) => {
  await using _ = await run.ok(initSharedWorker(createSharedWorkerSelf(self)));
  return await run(waitForAbort);
});
