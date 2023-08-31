import { Effect, Function, Layer } from "effect";
import { NanoIdLive } from "./Crypto.js";
import { Bip39Live } from "./CryptoLive.web.js";
import { DbWorker, DbWorkerLive } from "./DbWorker.js";
import { SqliteLive } from "./SqliteLive.web.js";
import { SyncWorker, SyncWorkerOutput } from "./SyncWorker.js";

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
