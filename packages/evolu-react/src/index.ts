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
// from package.json exports is not working for some reason.
// This doesn't work:
// "./Public": {
//   "types": "./dist/src/Public.d.ts",
//   "import": "./dist/src/Public.js",
//   "browser": "./dist/src/Public.js"
// }
// export * from "@evolu/common/Public";
export {
  Id,
  NonEmptyString1000,
  Owner,
  PositiveInt,
  SqliteBoolean,
  SqliteDate,
  String,
  String1000,
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
