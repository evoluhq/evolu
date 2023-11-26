import { EvoluCommonLive } from "@evolu/common";
import { Layer } from "effect";
import { DbWorkerLive } from "./DbWorkerLive.js";
import {
  AppStateLive,
  Bip39Live,
  FlushSyncLive,
  PlatformNameLive,
} from "./PlatformLive.js";

/** Evolu for web platform. */
export const EvoluWebLive = EvoluCommonLive.pipe(
  Layer.use(Layer.mergeAll(DbWorkerLive, AppStateLive)),
  Layer.use(Layer.mergeAll(PlatformNameLive, Bip39Live, FlushSyncLive)),
);
