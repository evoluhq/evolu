/// <reference lib="webworker" />
declare const self: SharedWorkerGlobalScope;

import { createRun, ok, type WebSocketOptions } from "@evolu/common";
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
  createWebSocket: (url: string, options?: WebSocketOptions) => () => {
    const onMessage = (
      event: MessageEvent<{ type: "Receive"; url: string; data: ArrayBuffer }>,
    ): void => {
      if (event.data.type === "Receive" && event.data.url === url)
        options?.onMessage?.(event.data.data);
    };
    output.addEventListener("message", onMessage);
    output.postMessage({ type: "Open", url });
    return ok({
      isOpen: () => true,
      getReadyState: () => "open" as const,
      send: (data: unknown) => {
        output.postMessage({ type: "Send", url, data });
        return ok();
      },
      reconnect: () => {
        output.postMessage({ type: "Reconnect", url });
      },
      [Symbol.asyncDispose]: () => {
        output.removeEventListener("message", onMessage);
        return Promise.resolve();
      },
    });
  },
});

// Tests share one page, which keeps every SharedWorker it created alive and
// holding the build lock, so each test closes its worker for the next one.
const closed = Promise.withResolvers<void>();
output.addEventListener("message", (event: MessageEvent<{ type: string }>) => {
  if (event.data.type === "Close") closed.resolve();
});

void run(async (run) => {
  {
    await using _ = await run.ok(
      initSharedWorker(createSharedWorkerSelf(self)),
    );
    await closed.promise;
  }
  self.close();
  return ok();
});
