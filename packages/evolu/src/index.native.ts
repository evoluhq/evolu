import "fast-text-encoding";
import "react-native-get-random-values";

import { Layer } from "effect";
import { NanoIdLive, SecretBoxLive } from "./Crypto.js";
import { DbWorkerLive } from "./DbWorker.js";
import {
  AppStateLive,
  Bip39Live,
  FetchLive,
  FlushSyncLive,
  PlatformLive,
  SyncLockLive,
} from "./PlatformLive.native.js";
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
      Layer.use(
        SyncWorkerLive,
        Layer.mergeAll(SyncLockLive, FetchLive, SecretBoxLive),
      ),
    ),
  ),
  Layer.use(AppStateLive, PlatformLive),
  PlatformLive,
  Bip39Live,
  NanoIdLive,
  FlushSyncLive,
);
