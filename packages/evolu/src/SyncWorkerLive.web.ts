import { Effect, Layer } from "effect";
import { SyncWorker, SyncWorkerOutput } from "./SyncWorker.js";
import { throwNotImplemented } from "./Utils.js";

export const SyncWorkerLive = Layer.effect(
  SyncWorker,
  Effect.sync(() => {
    const worker = new Worker(
      new URL("SyncWorkerLive.web.worker.js", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (e: MessageEvent<SyncWorkerOutput>): void => {
      syncWorker.onMessage(e.data);
    };

    const syncWorker: SyncWorker = {
      postMessage: (input) => {
        worker.postMessage(input);
      },
      onMessage: throwNotImplemented,
    };

    return syncWorker;
  })
);
