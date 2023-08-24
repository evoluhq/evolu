import { Layer } from "effect";
import { Slip21Live } from "./Crypto.js";
import {
  Bip39Live,
  HmacLive,
  NanoIdLive,
  Sha512Live,
} from "./CryptoLive.native.js";
import { DbWorkerLive } from "./DbWorker.js";
import {
  AppStateLive,
  FlushSyncLive,
  PlatformLive,
  SyncLockLive,
} from "./Platform.native.js";
import { makeReactHooksForPlatform } from "./React.js";
import { SqliteLive } from "./SqliteLive.native.js";
import { SyncWorkerLive } from "./SyncWorker.js";
export * from "./exports.js";

export const create = makeReactHooksForPlatform(
  Layer.use(
    DbWorkerLive,
    Layer.mergeAll(
      SqliteLive,
      Bip39Live,
      Layer.use(Slip21Live, Layer.merge(HmacLive, Sha512Live)),
      NanoIdLive,
      Layer.use(SyncWorkerLive, SyncLockLive),
    ),
  ),
  Layer.use(AppStateLive, PlatformLive),
  PlatformLive,
  Bip39Live,
  NanoIdLive,
  FlushSyncLive,
);
