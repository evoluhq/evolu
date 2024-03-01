import {
  DbWorker,
  DbWorkerCommonLive,
  DbWorkerInput,
  NanoIdGeneratorLive,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Bip39Live, DbWorkerLockLive } from "./PlatformLive.js";
import { SqliteLive } from "./SqliteLive.js";
import { SyncWorkerLive } from "./SyncWorkerLive.js";

const dbWorker = Effect.provide(
  DbWorker,
  DbWorkerCommonLive.pipe(
    Layer.provide(
      Layer.mergeAll(SqliteLive, Bip39Live, SyncWorkerLive, DbWorkerLockLive),
    ),
    Layer.provide(NanoIdGeneratorLive),
  ),
).pipe(Effect.runSync);

dbWorker.onMessage = (output): void => {
  postMessage(output);
};

onmessage = (e: MessageEvent<DbWorkerInput>): void => {
  dbWorker.postMessage(e.data);
};
