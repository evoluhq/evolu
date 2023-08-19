import { Layer } from "effect";
import { Slip21Live } from "./Crypto.js";
import {
  Bip39Live,
  HmacLive,
  NanoIdLive,
  Sha512Live,
} from "./CryptoLive.web.js";
import { DbWorkerLive } from "./DbWorker.js";
import { SqliteLive } from "./SqliteLive.web.js";
import { SyncWorkerLive } from "./SyncWorkerLive.web.js";

// It's a separate file because it's imported dynamically or by WebWorker.
export const dbWorkerLive = Layer.mergeAll(
  SqliteLive,
  Bip39Live,
  Layer.merge(HmacLive, Sha512Live).pipe(Layer.provide(Slip21Live)),
  NanoIdLive,
  SyncWorkerLive,
).pipe(Layer.provide(DbWorkerLive));
