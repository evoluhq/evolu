import { Effect, Layer } from "effect";
import { Slip21Live } from "./Crypto.js";
import {
  Bip39Live,
  HmacLive,
  NanoIdLive,
  Sha512Live,
} from "./CryptoLive.web.js";
import { DbWorker, DbWorkerLive } from "./DbWorker.js";
import { SqliteLive } from "./SqliteLive.web.js";
import { SyncWorkerLive } from "./SyncWorkerLive.web.js";

export const makeDbWorker = DbWorker.pipe(
  Effect.provideLayer(
    Layer.mergeAll(
      SqliteLive,
      Bip39Live,
      Layer.merge(HmacLive, Sha512Live).pipe(Layer.provide(Slip21Live)),
      NanoIdLive,
      SyncWorkerLive
    ).pipe(Layer.provide(DbWorkerLive))
  )
);
