import {
  Config,
  DbWorkerLive,
  Evolu,
  EvoluCommonLive,
  FetchLive,
  NanoIdLive,
  Schema,
  SecretBoxLive,
  SyncWorkerLive,
} from "@evolu/common";
import { EvoluCommonReactLive, makeCreate } from "@evolu/common-react";
import { Layer } from "effect";
import {
  AppStateLive,
  Bip39Live,
  FlushSyncLive,
  SyncLockLive,
} from "./PlatformLive.js";
import { SqliteLive } from "./SqliteLive.js";

// It's not working in RN for some reason, so we must manually re-export it.
// export * from "@evolu/common/public";
export {
  Id,
  NonEmptyString1000,
  PositiveInt,
  SqliteBoolean,
  SqliteDate,
  String,
  String1000,
  canUseDom,
  cast,
  id,
} from "@evolu/common";
export type {
  EvoluError,
  Mnemonic,
  Owner,
  OwnerId,
  SyncState,
} from "@evolu/common";
export { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite";

const EvoluCommonNativeLive: Layer.Layer<
  Config,
  never,
  Evolu<Schema>
> = EvoluCommonLive.pipe(
  Layer.use(EvoluCommonLive),
  Layer.use(Layer.mergeAll(FlushSyncLive, AppStateLive, DbWorkerLive)),
  Layer.use(Layer.mergeAll(Bip39Live, NanoIdLive, SqliteLive, SyncWorkerLive)),
  Layer.use(Layer.mergeAll(SecretBoxLive, SyncLockLive, FetchLive)),
);

export const create = EvoluCommonReactLive.pipe(
  Layer.use(EvoluCommonNativeLive),
  makeCreate,
);
