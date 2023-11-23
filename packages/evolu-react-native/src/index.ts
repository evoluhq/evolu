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

export * from "@evolu/common/public";

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
