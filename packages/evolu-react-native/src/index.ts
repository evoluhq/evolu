import {
  DbWorkerLive,
  FetchLive,
  NanoIdLive,
  SecretBoxLive,
  SyncWorkerLive,
} from "@evolu/common";
import { makeReactHooksForPlatform } from "@evolu/common-react";
import { Layer } from "effect";
import {
  AppStateLive,
  Bip39Live,
  FlushSyncLive,
  PlatformLive,
  SyncLockLive,
} from "./PlatformLive.js";
import { SqliteLive } from "./SqliteLive.js";

// Public API. It must be copy-pasted to all Evolu UI libs because re-exporting
// from @evolu/common/Public is not working for some reason.
export {
  Id,
  NonEmptyString1000,
  Owner,
  PositiveInt,
  SqliteBoolean,
  SqliteDate,
  String,
  String1000,
  canUseDOM,
  cast,
  id,
  jsonArrayFrom,
  jsonObjectFrom,
} from "@evolu/common";
// Re-exporting a type when 'isolatedModules' is enabled requires using 'export type'.
export type { EvoluError, Mnemonic, OwnerId, SyncState } from "@evolu/common";

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
