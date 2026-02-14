/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import type { DbWorkerInput } from "@evolu/common/local-first";

self.onmessage = (event: MessageEvent<DbWorkerInput>) => {
  const message = event.data;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (message.type === "init") {
    // TODO: Add parallel stale-leader detection.
    // Heartbeat is emitted by the active DB worker and sent to SharedWorker.
    // SharedWorker tracks last-seen heartbeat per Evolu name and if silent for
    // 10 seconds, it waits for another DB worker to announce itself alive and
    // then routes requests to that worker.
    return;
  }
};
