import {
  DbWorker,
  DbWorkerLive,
  NanoIdLive,
  SyncWorker,
  SyncWorkerOutput,
} from "@evolu/common";
import { Effect, Function, Layer } from "effect";
import { Bip39Live } from "./PlatformLive.js";
import { SqliteLive } from "./SqliteLive.js";

// It's a separate file because it's imported dynamically and by Web Worker.

const SyncWorkerLive = Layer.effect(
  SyncWorker,
  Effect.sync(() => {
    const worker = new Worker(
      new URL("SyncWorker.worker.js", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent<SyncWorkerOutput>): void => {
      syncWorker.onMessage(e.data);
    };
    const syncWorker: SyncWorker = {
      postMessage: (input) => {
        worker.postMessage(input);
      },
      onMessage: Function.constVoid,
    };
    return syncWorker;
  }),
);

export const dbWorker = Effect.provideLayer(
  DbWorker,
  Layer.use(
    DbWorkerLive,
    Layer.mergeAll(SqliteLive, Bip39Live, NanoIdLive, SyncWorkerLive),
  ),
).pipe(Effect.runSync);
