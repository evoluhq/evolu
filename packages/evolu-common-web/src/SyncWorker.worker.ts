import {
  FetchLive,
  SecretBoxLive,
  SyncWorker,
  SyncWorkerInput,
  SyncWorkerLive,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

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
