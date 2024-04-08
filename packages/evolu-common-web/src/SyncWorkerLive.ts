import { SyncWorker, SyncWorkerOutput } from "@evolu/common";
import * as Effect from "effect/Effect";
import { constVoid } from "effect/Function";
import * as Layer from "effect/Layer";

export const SyncWorkerLive = Layer.effect(
  SyncWorker,
  Effect.sync(() => {
    const worker = new Worker(
      new URL("SyncWorker.worker.js", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<SyncWorkerOutput>) => {
      syncWorker.onMessage(e.data);
    };
    const syncWorker: SyncWorker = {
      postMessage: (input) => {
        worker.postMessage(input);
      },
      onMessage: constVoid,
    };
    return syncWorker;
  }),
);
