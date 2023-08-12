import { Effect, Layer } from "effect";
import { SyncWorker, SyncWorkerInput, SyncWorkerLive } from "./SyncWorker.js";
import { SyncLockLive } from "./Platform.web.js";

Effect.gen(function* (_) {
  const syncWorker = yield* _(SyncWorker);
  syncWorker.onMessage = (output): void => {
    postMessage(output);
  };
  onmessage = (e: MessageEvent<SyncWorkerInput>): void => {
    syncWorker.postMessage(e.data);
  };
}).pipe(
  Effect.provideLayer(SyncLockLive.pipe(Layer.provide(SyncWorkerLive))),
  Effect.runSync
);
