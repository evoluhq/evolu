import { Effect, Layer } from "effect";
import { FetchLive, SyncLockLive } from "./Platform.web.js";
import { SyncWorker, SyncWorkerInput, SyncWorkerLive } from "./SyncWorker.js";

const syncWorker = Effect.provideLayer(
  SyncWorker,
  Layer.use(SyncWorkerLive, Layer.mergeAll(SyncLockLive, FetchLive)),
).pipe(Effect.runSync);

syncWorker.onMessage = (output): void => {
  postMessage(output);
};

onmessage = (e: MessageEvent<SyncWorkerInput>): void => {
  syncWorker.postMessage(e.data);
};
