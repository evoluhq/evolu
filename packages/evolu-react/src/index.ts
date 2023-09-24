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

export const create = makeReactHooksForPlatform(
  Layer.use(DbWorkerLive, PlatformLive),
  Layer.use(AppStateLive, PlatformLive),
  PlatformLive,
  Bip39Live,
  NanoIdLive,
  FlushSyncLive,
);
