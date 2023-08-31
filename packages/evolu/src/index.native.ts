import "fast-text-encoding";
import "react-native-get-random-values";

import { Layer } from "effect";
import { NanoIdLive } from "./Crypto.js";
import { Bip39Live } from "./CryptoLive.native.js";
import { DbWorkerLive } from "./DbWorker.js";
import {
  AppStateLive,
  FetchLive,
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
      NanoIdLive,
      Layer.use(SyncWorkerLive, Layer.mergeAll(SyncLockLive, FetchLive)),
    ),
  ),
  Layer.use(AppStateLive, PlatformLive),
  PlatformLive,
  Bip39Live,
  NanoIdLive,
  FlushSyncLive,
);
