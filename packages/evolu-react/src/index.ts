import { NanoIdLive } from "@evolu/common";
import { makeReactHooksForPlatform } from "@evolu/common-react";
import {
  AppStateLive,
  Bip39Live,
  DbWorkerLive,
  FlushSyncLive,
  PlatformLive,
} from "@evolu/common-web";
import { Layer } from "effect";

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
  Layer.use(DbWorkerLive, PlatformLive),
  Layer.use(AppStateLive, PlatformLive),
  PlatformLive,
  Bip39Live,
  NanoIdLive,
  FlushSyncLive,
);
