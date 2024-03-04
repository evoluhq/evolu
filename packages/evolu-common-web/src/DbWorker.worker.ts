import {
  ConfigLive,
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

let dbWorker: DbWorker | null = null;

onmessage = (e: MessageEvent<DbWorkerInput>): void => {
  if (dbWorker == null) {
    if (e.data._tag !== "init") throw new Error("init must be called first");
    dbWorker = Effect.provide(
      DbWorker,
      DbWorkerCommonLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            SqliteLive,
            Bip39Live,
            SyncWorkerLive,
            DbWorkerLockLive,
          ),
        ),
        Layer.provide(
          Layer.merge(NanoIdGeneratorLive, ConfigLive(e.data.config)),
        ),
      ),
    ).pipe(Effect.runSync);

    dbWorker.onMessage = (output): void => {
      postMessage(output);
    };
  }

  dbWorker.postMessage(e.data);
};
