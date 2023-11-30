import {
  FetchLive,
  SecretBoxLive,
  SyncWorker,
  SyncWorkerInput,
  SyncWorkerLive,
} from "@evolu/common";
import { Effect, Layer } from "effect";
import { SyncLockLive } from "./PlatformLive.js";

const syncWorker = Effect.provide(
  SyncWorker,
  Layer.provide(
    SyncWorkerLive,
    Layer.mergeAll(SyncLockLive, FetchLive, SecretBoxLive),
  ),
).pipe(Effect.runSync);

syncWorker.onMessage = (output): void => {
  postMessage(output);
};

onmessage = (e: MessageEvent<SyncWorkerInput>): void => {
  syncWorker.postMessage(e.data);
};
