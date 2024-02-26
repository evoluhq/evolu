import {
  DbWorker,
  DbWorkerInput,
  DbWorkerCommonLive,
  NanoIdLive,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Bip39Live } from "./PlatformLive.js";
import { SqliteLive } from "./SqliteLive.js";
import { SyncWorkerLive } from "./SyncWorkerLive.js";

const dbWorker = Effect.provide(
  DbWorker,
  Layer.provide(
    DbWorkerCommonLive,
    Layer.mergeAll(SqliteLive, Bip39Live, NanoIdLive, SyncWorkerLive),
  ),
).pipe(Effect.runSync);

dbWorker.onMessage = (output): void => {
  postMessage(output);
};

onmessage = (e: MessageEvent<DbWorkerInput>): void => {
  dbWorker.postMessage(e.data);
};
